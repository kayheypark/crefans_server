import {randomUUID} from 'crypto';
import {createWriteStream} from 'fs';
import {Transform} from 'stream';
import {mkdir,mkdtemp,copyFile,stat,rename,rm} from 'fs/promises';
import {join,resolve} from 'path';
import {pipeline} from 'stream/promises';
import {watermarkImage,watermarkVideo,watermarkText,WATERMARK_VERSION} from './media-watermark-render';
import {managedMediaKey,PlatformMediaStorage} from './media-storage';
import {reject} from './http';

export const WATERMARK_PENDING='watermark:v1';
const LEASE_MS=25*60000,MAX_ATTEMPTS=3;
/** Caller locks the source media row. The unique source key makes enqueue/repeated saves idempotent. */
export async function ensureWatermarkedMedia(tx:any,sourceId:string,creatorId:string){
 const source=await tx.media.findUnique({where:{id:sourceId}});
 if(!source||source.is_deleted||source.user_sub!==creatorId)reject(403,'INVALID_MEDIA','미디어 소유자를 확인해주세요.');
 const ownJob=await tx.mediaWatermarkJob.findUnique({where:{target_id:sourceId}});
 if(ownJob)return sourceId;
 // Only files explicitly marked by the new upload handler are eligible; pre-deployment uploads never change.
 if(source.metadata?.watermarkEligible!==WATERMARK_VERSION)return sourceId;
 const handle=source.metadata.watermarkHandle;watermarkText(handle);
 const existing=await tx.mediaWatermarkJob.findUnique({where:{source_id:sourceId}});
 if(existing)return existing.target_id;
 const id=randomUUID(),remote=managedMediaKey(source.s3_upload_key);
 if(!remote&&!source.s3_upload_key.startsWith('local/'))reject(409,'MEDIA_MIGRATION_REQUIRED','이 미디어는 다시 업로드해주세요.');
 await tx.media.create({data:{id,user_sub:creatorId,type:source.type,original_name:source.original_name,file_name:id,file_size:0,mime_type:source.type==='IMAGE'?'image/webp':'video/mp4',original_url:`/api/v1/media/${id}/file`,s3_upload_key:`${remote?'platform':'local'}/${id}`,processing_status:'PROCESSING',processing_job_id:WATERMARK_PENDING,metadata:{watermark:{version:WATERMARK_VERSION,handle,sourceId}}}});
 await tx.mediaWatermarkJob.create({data:{source_id:sourceId,target_id:id,creator_id:creatorId,handle,version:WATERMARK_VERSION}});
 return id;
}
/** Single bounded conversion, separate from billing ticks; only a finished derivative becomes readable. */
export async function watermarkNextMedia(db:any,storage:PlatformMediaStorage,root=resolve(process.env.MEDIA_ROOT||'.local/media'),render={image:watermarkImage,video:watermarkVideo},now=new Date()){
 const job=await db.mediaWatermarkJob.findFirst({where:{OR:[{status:'pending',next_attempt_at:{lte:now}},{status:'processing',locked_until:{lt:now}}]},orderBy:{created_at:'asc'}});if(!job)return 0;
 const source=await db.media.findUnique({where:{id:job.source_id}}),target=await db.media.findUnique({where:{id:job.target_id}});
 if(source?.processing_status==='PROCESSING'){
  await db.mediaWatermarkJob.updateMany({where:{id:job.id,status:job.status,attempts:job.attempts,locked_until:job.locked_until},data:{status:'pending',locked_until:null,next_attempt_at:new Date(now.getTime()+15000)}});return 1;
 }
 const claim=await db.mediaWatermarkJob.updateMany({where:{id:job.id,status:job.status,attempts:job.attempts,locked_until:job.locked_until},data:{status:'processing',attempts:{increment:1},locked_until:new Date(now.getTime()+LEASE_MS)}});if(!claim.count)return 0;
 const attempts=job.attempts+1;let directory:string|undefined;
 try{
  if(attempts>MAX_ATTEMPTS||!source||source.is_deleted||!target||target.is_deleted||source.processing_status!=='COMPLETED'||source.user_sub!==job.creator_id||target.user_sub!==job.creator_id)throw new Error('WATERMARK_SOURCE_UNAVAILABLE');
  await mkdir(join(root,'.watermark'),{recursive:true});directory=await mkdtemp(join(root,'.watermark','job-'));
  const input=join(directory,'input'),output=join(directory,'output');
  if(managedMediaKey(source.s3_upload_key)){
   const abort=AbortSignal.timeout(120000),object=await storage.read(source.s3_upload_key,{signal:abort});let bytes=0;
   const limit=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>300*1024*1024?new Error('WATERMARK_SOURCE_TOO_LARGE'):null,chunk);}});
   await pipeline(object.Body as any,limit,createWriteStream(input,{mode:0o600}),{signal:abort});
  }else if(source.s3_upload_key===`local/${source.id}`&&source.file_name===source.id)await copyFile(join(root,source.id),input);
  else throw new Error('WATERMARK_SOURCE_UNSUPPORTED');
  if((await stat(input)).size>300*1024*1024)throw new Error('WATERMARK_SOURCE_TOO_LARGE');
  if(source.type==='IMAGE')await render.image(input,output,job.handle);else await render.video(input,output,job.handle,source.mime_type);
  const size=(await stat(output)).size,mime=source.type==='IMAGE'?'image/webp':'video/mp4';
  if(managedMediaKey(target.s3_upload_key))await storage.put(target.id,output,mime,size,AbortSignal.timeout(120000));else await rename(output,join(root,target.id));
  await db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM medias WHERE id=${source.id} FOR UPDATE`;
   const current=await tx.media.findUnique({where:{id:target.id}});if(!current||current.is_deleted)throw new Error('WATERMARK_TARGET_DELETED');
   await tx.media.update({where:{id:target.id},data:{file_size:size,mime_type:mime,processing_status:'COMPLETED',processed_at:new Date()}});
   await tx.mediaWatermarkJob.update({where:{id:job.id},data:{status:'completed',completed_at:new Date(),locked_until:null,error_code:null}});
  });
 }catch(error){
  const failed=attempts>=MAX_ATTEMPTS;
  await db.$transaction(async(tx:any)=>{await tx.mediaWatermarkJob.update({where:{id:job.id},data:{status:failed?'failed':'pending',locked_until:null,next_attempt_at:new Date(now.getTime()+120000),error_code:'WATERMARK_CONVERSION_FAILED'}});if(failed&&target&&!target.is_deleted)await tx.media.update({where:{id:target.id},data:{processing_status:'FAILED'}});});
  // No original bytes/handles/provider response in operations logs.
  throw new Error('WATERMARK_CONVERSION_FAILED');
 }finally{if(directory)await rm(directory,{recursive:true,force:true});}
 return 1;
}
