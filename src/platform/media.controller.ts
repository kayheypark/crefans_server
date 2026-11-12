import {Controller,Get,Logger,Param,Post,Req,Res,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ConfigService} from '@nestjs/config';
import {mkdir,writeFile,readFile,open,rename,stat,unlink} from 'fs/promises';
import {mkdirSync} from 'fs';
import {diskStorage} from 'multer';
import {join,resolve} from 'path';
import {randomUUID} from 'crypto';
const sharp:typeof import('sharp').default = require('sharp');
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {Readable} from 'stream';
import {pipeline} from 'stream/promises';
import {PlatformService} from './service';
import {PlatformAuthGuard,PlatformOptionalAuthGuard,PlatformMediaEdgeGuard} from './platform-auth.guard';
import {reject} from './http';
import {PlatformMediaStorage,managedMediaKey} from './media-storage';
import {MAX_VIDEO_SECONDS,MAX_VIDEO_SIDE,QUICKTIME_MIME,sourcePath,videoTools} from './video-transcode';
import {WATERMARK_VERSION,watermarkText} from './media-watermark-render';
import {profilePhotoInUse} from './profile-photos';
import {enqueueOperation} from './operations-events';
import {ShareImageRenderer,SHARE_FALLBACK} from './share-image';
// 2026-11-13 user decision: a generous per-photo cap (was 5MB); the front shrinks photos to a 4096px long edge first and
// every image is re-encoded to WebP below, with sharp's 40MP input limit still guarding memory.
export const IMAGE_UPLOAD_MAX_BYTES=50*1024*1024;
@Controller('media')
export class PlatformMediaController {
 private readonly shareImages=new ShareImageRenderer();
 private readonly logger=new Logger(PlatformMediaController.name);
 constructor(private service:PlatformService,private config:ConfigService,private storage:PlatformMediaStorage){}
 @Post() @UseGuards(PlatformAuthGuard) @UseInterceptors(FileInterceptor('file',{storage:diskStorage({destination:(_req,_file,done)=>{const directory=join(resolve(process.env.MEDIA_ROOT||'.local/media'),'.uploads');mkdirSync(directory,{recursive:true});done(null,directory);},filename:(_req,_file,done)=>done(null,randomUUID())}),limits:{fileSize:300*1024*1024}}))
 async upload(@UploadedFile() file:any,@Req() req:any){
   if(!file)reject(400,'INVALID_MEDIA','파일을 선택해주세요.');
   const root=resolve(this.config.get('MEDIA_ROOT')||'.local/media'),id=randomUUID(),destination=join(root,id);let saved=false,tracked=false,source='';
   try{
    // iPhone videos come as QuickTime (.mov); they are converted to MP4 by the worker (video-transcode.ts, 2026-11-01).
    const quicktime=file.mimetype===QUICKTIME_MIME||(file.mimetype==='application/octet-stream'&&/\.mov$/i.test(file.originalname||''));
    if(!quicktime&&!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.mimetype))reject(400,'INVALID_MEDIA','JPG·PNG·WebP 이미지 또는 MP4·WebM·MOV 동영상만 지원합니다.');
    const type:'IMAGE'|'VIDEO'=file.mimetype.startsWith('image/')?'IMAGE':'VIDEO';let mime=quicktime?QUICKTIME_MIME:file.mimetype,size=file.size;
    await mkdir(root,{recursive:true});
    if(type==='IMAGE'){
     if(file.size>IMAGE_UPLOAD_MAX_BYTES)reject(400,'FILE_TOO_LARGE','사진은 한 장에 50MB까지 올릴 수 있습니다.');
     let bytes:Buffer;try{bytes=await sharp(await readFile(file.path),{limitInputPixels:40000000}).rotate().webp().toBuffer();mime='image/webp';}catch{reject(400,'INVALID_IMAGE','이미지 파일을 확인해주세요.');}
     size=bytes.length;await writeFile(destination,bytes,{mode:0o600});
    }else{
     const handle=await open(file.path,'r'),buffer=Buffer.alloc(12);try{await handle.read(buffer,0,12,0);}finally{await handle.close();}
     const atom=buffer.subarray(4,8).toString('latin1'),mp4=atom==='ftyp',webm=buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])),mov=['ftyp','moov','mdat','wide','free','skip','pnot'].includes(atom);
     if(quicktime?!mov:mime==='video/mp4'?!mp4:!webm)reject(400,'INVALID_VIDEO','동영상 파일을 확인해주세요.');
     // Too long or larger than 4K is refused before anything is stored: QuickTime since 2026-11-01, MP4·WebM since 2026-11-02.
     let info:{seconds:number;side:number};try{info=await videoTools.probe(file.path,mime==='video/webm'?'matroska':'mov');}catch{reject(400,'INVALID_VIDEO','동영상 파일을 확인해주세요.');}
     if(info.seconds>MAX_VIDEO_SECONDS)reject(400,'VIDEO_TOO_LONG','동영상은 10분 이하만 올릴 수 있어요.');
     if(info.side>MAX_VIDEO_SIDE)reject(400,'VIDEO_TOO_LARGE','4K보다 큰 동영상은 올릴 수 없어요.');
     if(quicktime){source=sourcePath(root,id);await rename(file.path,source);}
     // MP4·WebM are stored without location or other metadata; QuickTime loses it in the worker conversion.
     else{try{await videoTools.strip(file.path,destination,mime);}catch{reject(400,'INVALID_VIDEO','동영상 파일을 확인해주세요.');}size=(await stat(destination)).size;}
    }
    const remote=this.storage.enabled;
    // Eligibility is recorded at upload, not inferred from a later post edit. Profile/plan references remain untouched.
    const creator=await this.service.db.creator.findUnique({where:{user_id:req.user.sub}});let watermarkMetadata:any=undefined;
    if(creator?.is_active){const member=await this.service.member(req.user.sub);
     // A handle outside the watermark format (older or operator-made accounts) skips the watermark instead of failing every upload;
     // operators hear of it once per member (2026-11-02 user decision: code-only defense, no production query).
     try{watermarkText(member.preferred_username);watermarkMetadata={watermarkEligible:WATERMARK_VERSION,watermarkHandle:member.preferred_username};}
     catch{await enqueueOperation(this.service.db as any,'media.watermark_skipped',{memberId:req.user.sub,status:'invalid_handle'},`watermark-skipped:${req.user.sub}`);}}
    const row=await this.service.db.media.create({data:{id,user_sub:req.user.sub,type,...(watermarkMetadata?{metadata:watermarkMetadata}:{}),original_name:file.originalname.slice(0,200),file_name:id,file_size:size,mime_type:mime,original_url:`/api/v1/media/${id}/file`,s3_upload_key:remote?`platform/${id}`:`local/${id}`,processing_status:quicktime?'PROCESSING':remote?'UPLOADING':'COMPLETED',processed_at:remote||quicktime?null:new Date()}});tracked=true;
    if(quicktime)return{id:row.id,type:'video',url:row.original_url,processing:true};
    if(remote){await this.storage.put(id,destination,mime,size);await this.service.db.media.update({where:{id},data:{processing_status:'COMPLETED',processed_at:new Date()}});}saved=true;
    return{id:row.id,type:type==='IMAGE'?'image':'video',url:row.original_url};
   }catch(error){
    // Retain a failed row for orphan cleanup if the upload or DB completion was interrupted.
    if(tracked&&!saved&&this.storage.enabled){try{await this.service.db.media.update({where:{id},data:{processing_status:'FAILED',is_deleted:true,deleted_at:new Date()}});await this.storage.remove(`platform/${id}`);}catch{this.logger.error('Failed media upload requires orphan cleanup');}}
    throw error;
   }finally{for(const path of[file.path,...(!saved||this.storage.enabled?[destination]:[]),...(source&&!tracked?[source]:[])]){try{await unlink(path);}catch(e:any){if(e.code!=='ENOENT')throw e;}}}
 }
 private async authorize(id:string,req:any){const m=await this.service.db.media.findUnique({where:{id},include:{postings:{include:{posting:true}}}});if(!m||m.is_deleted||m.processing_status!=='COMPLETED')reject(404,'MEDIA_NOT_FOUND','파일을 찾을 수 없습니다.');let allowed=req.user?.sub===m.user_sub;
   const links=m.postings.filter(link=>!link.is_deleted&&!link.posting.is_deleted);
   // Public references must never weaken a shared file's paid, private or adult restrictions.
   const restricted=links.filter(link=>link.posting.is_membership||link.posting.is_sensitive||!link.posting.is_public||link.posting.hidden_at);
   if(!allowed){for(const link of restricted){if(!await this.service.access(link.posting,req.user?.sub))reject(403,'MEDIA_ACCESS_DENIED','파일 이용 권한이 없습니다.');}for(const link of links){if(await this.service.access(link.posting,req.user?.sub)){allowed=true;break;}}}
   // Membership versions preserve image references; only images used by publicly active plans are public.
   if(!allowed&&m.type==='IMAGE'){allowed=!!await this.service.db.membershipItem.findFirst({where:{creator_id:m.user_sub,image:m.original_url,is_active:true,is_deleted:false}})||await profilePhotoInUse(this.service.db,m);}
   if(!allowed)reject(403,'MEDIA_ACCESS_DENIED','파일 이용 권한이 없습니다.');
   for(const link of restricted){if(!await this.service.consumeContent(link.posting,req.user?.sub))reject(403,'MEDIA_ACCESS_DENIED','파일 이용 권한이 없습니다.');}
   return m;
 }
 /** Public sharing deliberately ignores all sender cookies and checks permissions again after rendering. */
 @Get('posts/:id/share-image')
 async shareImage(@Param('id') id:string,@Res() res:any){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const fallback=()=>res.redirect(302,SHARE_FALLBACK);
  if(!/^[0-9a-f-]{36}$/i.test(id))return fallback();
  const select=async()=>{
   const post=await this.service.db.posting.findFirst({where:{id,is_deleted:false,hidden_at:null,status:'PUBLISHED'},include:{medias:{where:{is_deleted:false},include:{media:true},orderBy:{sort_order:'asc'}}}});
   if(!post||post.is_membership||post.is_sensitive||!post.is_public||!await this.service.access(post))return null;
   const first=post.medias[0]?.media;if(!first||first.is_deleted||first.processing_status!=='COMPLETED')return null;
   try{return await this.authorize(first.id,{});}catch(error:any){if([403,404].includes(error.getStatus?.()))return null;throw error;}
  };
  const media=await select();if(!media)return fallback();
  let bytes:Buffer;try{bytes=await this.shareImages.render(media,this.config.get('MEDIA_ROOT')||'.local/media',this.storage);}catch{res.setHeader('Retry-After','30');return fallback();}
  const current=await select();if(!current||current.id!==media.id||current.updated_at.getTime()!==media.updated_at.getTime())return fallback();
  res.setHeader('Content-Type','image/jpeg');return res.send(bytes);
 }
 /** The uploader polls this while an iPhone video is being converted (2026-11-01); other members get 404. */
 @Get(':id/status') @UseGuards(PlatformAuthGuard)
 async status(@Param('id') id:string,@Req() req:any){
   const m=await this.service.db.media.findFirst({where:{id,user_sub:req.user.sub,is_deleted:false},select:{processing_status:true}});
   if(!m)reject(404,'MEDIA_NOT_FOUND','파일을 찾을 수 없습니다.');
   return{status:m.processing_status==='COMPLETED'?'completed':m.processing_status==='FAILED'?'failed':'processing'};
 }
 @Get(':id/edge-authorize') @UseGuards(PlatformMediaEdgeGuard,PlatformOptionalAuthGuard)
 async edgeAuthorize(@Param('id') id:string,@Req() req:any){
   const m=await this.authorize(id,req);
   if(!managedMediaKey(m.s3_upload_key))return{delivery:'api'};
   if(m.s3_upload_key!==`platform/${id}`)reject(503,'STORAGE_KEY_MISMATCH','미디어 경로 확인이 필요합니다.');
   const range=req.headers?.range;
   if(range){const match=/^bytes=(\d{1,16})?-(\d{0,16})$/.exec(range),size=Number(m.file_size);if(!match||(!match[1]&&!match[2])||(match[1]?(Number(match[1])>=size||(match[2]&&Number(match[2])<Number(match[1]))):Number(match[2])===0))reject(416,'INVALID_RANGE','미디어 범위를 확인해주세요.');}
   return{delivery:'s3',key:m.s3_upload_key};
 }
 @Get(':id/origin-file') @UseGuards(PlatformOptionalAuthGuard)
 async originDownload(@Param('id') id:string,@Req() req:any,@Res() res:any){return this.download(id,req,res);}
 @Get(':id/file') @UseGuards(PlatformOptionalAuthGuard)
 async download(@Param('id') id:string,@Req() req:any,@Res() res:any){
   const m=await this.authorize(id,req);
   res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',m.mime_type);res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Vary','Cookie');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
   if(managedMediaKey(m.s3_upload_key)){
    // Safe direct-origin/rollback path. CDN authorization reuses the exact checks above.
    const range=req.headers?.range,abort=new AbortController(),closed=()=>abort.abort();
    if(range&&(typeof range!=='string'||!/^bytes=(?:\d{1,16}-\d{0,16}|-\d{1,16})$/.test(range))){res.setHeader('Content-Range',`bytes */${m.file_size}`);return res.status(416).end();}
    res.once('close',closed);
    try{
     const object=await this.storage.read(m.s3_upload_key,{head:req.method==='HEAD',range,signal:abort.signal});
     res.setHeader('Accept-Ranges','bytes');
     if(object.ContentLength!==undefined)res.setHeader('Content-Length',object.ContentLength);
     if('ContentRange' in object&&object.ContentRange){res.status(206);res.setHeader('Content-Range',object.ContentRange);}
     if(req.method==='HEAD')return res.end();
     await pipeline(object.Body as Readable,res);
    }catch(error:any){
     if(abort.signal.aborted)return;
     if(res.headersSent){res.destroy();return;}
     if(error.$metadata?.httpStatusCode===416){res.setHeader('Content-Range',`bytes */${m.file_size}`);return res.status(416).end();}
     reject(503,'STORAGE_UNAVAILABLE','미디어를 불러오지 못했습니다.');
    }finally{res.off('close',closed);}
    return;
   }
   if(m.s3_upload_key.startsWith('local/'))return res.sendFile(join(resolve(this.config.get('MEDIA_ROOT')||'.local/media'),m.file_name));
   let bucket=this.config.get<string>('S3_UPLOAD_BUCKET'),key=m.s3_upload_key;const versions=m.processed_urls as any,preferred=m.type==='VIDEO'?versions?.['720p']||versions?.['1080p']:versions?.large||versions?.small;if(preferred&&this.config.get('S3_PROCESSED_BUCKET')){let url:URL;try{url=new URL(preferred);}catch{reject(503,'STORAGE_MIGRATION_REQUIRED','기존 미디어 경로 확인이 필요합니다.');}bucket=this.config.get('S3_PROCESSED_BUCKET');key=decodeURIComponent(url.pathname.replace(/^\//,''));res.setHeader('Content-Type',m.type==='VIDEO'?'video/mp4':'image/webp');}else if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(m.mime_type))reject(503,'STORAGE_MIGRATION_REQUIRED','지원 형식으로 미디어 이관이 필요합니다.');const region=this.config.get<string>('AWS_REGION');if(!bucket||!region)reject(503,'STORAGE_NOT_CONFIGURED','기존 미디어 저장소 설정이 필요합니다.');const accessKeyId=this.config.get<string>('AWS_ACCESS_KEY_ID'),secretAccessKey=this.config.get<string>('AWS_SECRET_ACCESS_KEY');const client=new S3Client({region,...(accessKeyId&&secretAccessKey?{credentials:{accessKeyId,secretAccessKey}}:{})});
   try{const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:key,...(req.headers.range?{Range:req.headers.range}:{})}));if(object.ContentRange){res.status(206);res.setHeader('Content-Range',object.ContentRange);}res.setHeader('Accept-Ranges','bytes');if(object.ContentLength!==undefined)res.setHeader('Content-Length',object.ContentLength);const stream=object.Body as Readable;stream.on('error',()=>res.destroy());res.on('close',()=>{stream.destroy();client.destroy();});stream.pipe(res);}catch{client.destroy();reject(503,'STORAGE_UNAVAILABLE','미디어를 불러오지 못했습니다.');}}
}
