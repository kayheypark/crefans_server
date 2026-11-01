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
export const sourcePath=(root:string,id:string)=>join(root,`${id}.source`);

/** ffmpeg arguments: longest side at most 1280px, H.264 + AAC, fast start, no metadata, one thread to spare the API. */
export function transcodeArgs(input:string,output:string){
 return['-nostdin','-hide_banner','-loglevel','error','-y','-i',input,'-map','0:v:0','-map','0:a:0?','-map_metadata','-1',
  '-vf',"scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))',format=yuv420p",
  '-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-threads','1','-f','mp4',output];
}

export function runFfmpeg(args:string[],timeoutMs=TRANSCODE_TIMEOUT_MS,binary=process.env.FFMPEG_PATH||'ffmpeg'){
 return new Promise<void>((done,fail)=>{
  const child=spawn('nice',['-n','10',binary,...args],{stdio:['ignore','ignore','pipe']});let error='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  child.stderr.on('data',chunk=>{if(error.length<2000)error+=String(chunk);});
  child.on('error',reason=>{clearTimeout(timer);fail(reason);});
  child.on('close',code=>{clearTimeout(timer);code===0?done():fail(new Error(`ffmpeg exited ${code}: ${error.slice(0,300)}`));});
 });
}

type Storage={enabled:boolean;put(id:string,path:string,mime:string,size:number):Promise<void>};
/**
 * Converts the oldest waiting QuickTime upload. Returns 1 when a video was finished (or failed), 0 when idle.
 * A row is claimed by moving updated_at, so two workers never convert the same file; a claim older than the timeout is retried.
 */
export async function transcodeNextVideo(db:any,storage:Storage,root=resolve(process.env.MEDIA_ROOT||'.local/media'),ffmpeg=runFfmpeg,now=new Date()){
 const row=await db.media.findFirst({where:{type:'VIDEO',mime_type:QUICKTIME_MIME,processing_status:'PROCESSING',is_deleted:false,OR:[{processed_at:null},{processed_at:{lt:new Date(now.getTime()-STALE_MS)}}]},orderBy:{created_at:'asc'}});
 if(!row)return 0;
 const claimed=await db.media.updateMany({where:{id:row.id,processing_status:'PROCESSING',processed_at:row.processed_at},data:{processed_at:now}});
 if(claimed.count!==1)return 0;
 const source=sourcePath(root,row.id),output=join(root,`${row.id}.mp4.tmp`);
 try{
  await ffmpeg(transcodeArgs(source,output));
  const size=(await stat(output)).size;
  if(storage.enabled){await storage.put(row.id,output,'video/mp4',size);await unlink(output);}
  else await rename(output,join(root,row.id));
  await db.media.update({where:{id:row.id},data:{mime_type:'video/mp4',file_size:size,processing_status:'COMPLETED',processed_at:new Date()}});
 }catch(error){
  await unlink(output).catch(()=>{});
  await db.media.update({where:{id:row.id},data:{processing_status:'FAILED'}});
  throw error;
 }finally{
  // The original QuickTime file (with its location metadata) is never kept after a finished attempt.
  if((await db.media.findUnique({where:{id:row.id},select:{processing_status:true}}))?.processing_status!=='PROCESSING')await unlink(source).catch(()=>{});
 }
 return 1;
}
