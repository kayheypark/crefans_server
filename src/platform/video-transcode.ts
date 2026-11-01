import {spawn} from 'child_process';
import {rename,stat,unlink} from 'fs/promises';
import {join,resolve} from 'path';

// iPhone videos arrive as QuickTime (.mov), usually HEVC, which many Chrome/Android/Firefox viewers cannot play
// (user decision 2026-11-01: convert on the server). The upload keeps the original beside the media file and marks
// the row PROCESSING; the worker converts one video at a time to H.264/AAC MP4, strips metadata (location) and
// publishes it under the normal media key. Posts only show COMPLETED media, so nothing plays before conversion.
export const QUICKTIME_MIME='video/quicktime';
export const TRANSCODE_TIMEOUT_MS=20*60000;
const STALE_MS=TRANSCODE_TIMEOUT_MS+5*60000;
// Limits (user decision 2026-11-01): longer than 10 minutes or larger than 4K is refused at upload; three attempts at most.
export const MAX_VIDEO_SECONDS=600,MAX_VIDEO_SIDE=4096,MAX_TRANSCODE_ATTEMPTS=3,RETRY_AFTER_MS=2*60000;
// Attempts live in the otherwise unused legacy column processing_job_id ('transcode-attempt:N') to avoid a migration.
const attemptOf=(job:string|null)=>Number(/^transcode-attempt:(\d+)$/.exec(job||'')?.[1]||0);
/** ffmpeg failures mean the file itself cannot be converted; storage or database failures are retried. */
export class TranscodeInputError extends Error {}
export const sourcePath=(root:string,id:string)=>join(root,`${id}.source`);

/** ffmpeg arguments: longest side at most 1280px, H.264 + AAC, fast start, no metadata, one thread to spare the API. */
export function transcodeArgs(input:string,output:string){
 // Untrusted input: QuickTime demuxer only, local file protocol only, one decoder and filter thread.
 return['-nostdin','-hide_banner','-loglevel','error','-y','-filter_threads','1','-threads','1','-f','mov','-protocol_whitelist','file','-i',input,'-map','0:v:0','-map','0:a:0?','-map_metadata','-1',
  '-vf',"scale='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)',format=yuv420p",
  '-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-threads','1','-f','mp4',output];
}

export function runFfmpeg(args:string[],timeoutMs=TRANSCODE_TIMEOUT_MS,binary=process.env.FFMPEG_PATH||'ffmpeg'){
 return new Promise<void>((done,fail)=>{
  const child=spawn('nice',['-n','10',binary,...args],{stdio:['ignore','ignore','pipe']});let error='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  child.stderr.on('data',chunk=>{if(error.length<2000)error+=String(chunk);});
  child.on('error',reason=>{clearTimeout(timer);fail(reason);});
  child.on('close',code=>{clearTimeout(timer);code===0?done():fail(new TranscodeInputError(`ffmpeg exited ${code}: ${error.slice(0,300)}`));});
 });
}

/** Reads duration and the largest side of an uploaded QuickTime file; refuses what the worker should not convert. */
export function probeVideo(path:string,binary=process.env.FFPROBE_PATH||'ffprobe'){
 return new Promise<{seconds:number;side:number}>((done,fail)=>{
  const child=spawn(binary,['-v','error','-f','mov','-protocol_whitelist','file','-show_entries','format=duration:stream=width,height','-of','json',path],{stdio:['ignore','pipe','ignore']});let out='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  child.stdout.on('data',chunk=>{if(out.length<20000)out+=String(chunk);});
  child.on('error',reason=>{clearTimeout(timer);fail(reason);});
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw new Error('ffprobe failed');const info=JSON.parse(out);const side=Math.max(0,...(info.streams||[]).flatMap((x:any)=>[Number(x.width)||0,Number(x.height)||0]));done({seconds:Number(info.format?.duration)||0,side});}catch(e){fail(e);}});
 });
}

/** Swappable in tests (no ffprobe on developer machines). */
export const videoTools={probe:probeVideo};

type Storage={enabled:boolean;put(id:string,path:string,mime:string,size:number):Promise<void>};
/**
 * Converts the oldest waiting QuickTime upload. Returns 1 when a video was finished (or failed), 0 when idle.
 * A row is claimed by moving updated_at, so two workers never convert the same file; a claim older than the timeout is retried.
 */
export async function transcodeNextVideo(db:any,storage:Storage,root=resolve(process.env.MEDIA_ROOT||'.local/media'),ffmpeg=runFfmpeg,now=new Date()){
 const row=await db.media.findFirst({where:{type:'VIDEO',mime_type:QUICKTIME_MIME,processing_status:'PROCESSING',is_deleted:false,OR:[{processed_at:null},{processed_at:{lt:new Date(now.getTime()-STALE_MS)}}]},orderBy:{created_at:'asc'}});
 if(!row)return 0;
 const attempt=attemptOf(row.processing_job_id)+1;
 const claimed=await db.media.updateMany({where:{id:row.id,processing_status:'PROCESSING',processed_at:row.processed_at},data:{processed_at:now,processing_job_id:`transcode-attempt:${attempt}`}});
 if(claimed.count!==1)return 0;
 const source=sourcePath(root,row.id),output=join(root,`${row.id}.mp4.tmp`);
 const finish=async()=>{await unlink(output).catch(()=>{});await unlink(source).catch(()=>{});};
 // A claim that keeps dying (worker killed mid-conversion) is given up after the attempt limit.
 if(attempt>MAX_TRANSCODE_ATTEMPTS){await db.media.update({where:{id:row.id},data:{processing_status:'FAILED'}});await finish();return 1;}
 try{
  await ffmpeg(transcodeArgs(source,output));
  const size=(await stat(output)).size;
  if(storage.enabled){await storage.put(row.id,output,'video/mp4',size);await unlink(output);}
  else await rename(output,join(root,row.id));
  await db.media.update({where:{id:row.id},data:{mime_type:'video/mp4',file_size:size,processing_status:'COMPLETED',processed_at:new Date()}});
  await unlink(source).catch(()=>{});
 }catch(error){
  await unlink(output).catch(()=>{});
  // The file itself cannot be converted, or attempts are used up: FAILED and the original (with location metadata) is removed.
  if(error instanceof TranscodeInputError||attempt>=MAX_TRANSCODE_ATTEMPTS){await db.media.update({where:{id:row.id},data:{processing_status:'FAILED'}});await unlink(source).catch(()=>{});}
  // Storage or database trouble: keep the original and retry in about two minutes.
  else await db.media.update({where:{id:row.id},data:{processed_at:new Date(now.getTime()-STALE_MS+RETRY_AFTER_MS)}}).catch(()=>{});
  throw error;
 }
 return 1;
}
