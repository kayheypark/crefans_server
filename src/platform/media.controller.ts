import {Controller,Get,Logger,Param,Post,Req,Res,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ConfigService} from '@nestjs/config';
import {mkdir,writeFile,readFile,open,rename,unlink} from 'fs/promises';
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
@Controller('media')
export class PlatformMediaController {
 private readonly logger=new Logger(PlatformMediaController.name);
 constructor(private service:PlatformService,private config:ConfigService,private storage:PlatformMediaStorage){}
 @Post() @UseGuards(PlatformAuthGuard) @UseInterceptors(FileInterceptor('file',{storage:diskStorage({destination:(_req,_file,done)=>{const directory=join(resolve(process.env.MEDIA_ROOT||'.local/media'),'.uploads');mkdirSync(directory,{recursive:true});done(null,directory);},filename:(_req,_file,done)=>done(null,randomUUID())}),limits:{fileSize:300*1024*1024}}))
 async upload(@UploadedFile() file:any,@Req() req:any){
   if(!file)reject(400,'INVALID_MEDIA','파일을 선택해주세요.');
   const root=resolve(this.config.get('MEDIA_ROOT')||'.local/media'),id=randomUUID(),destination=join(root,id);let saved=false,tracked=false;
   try{
    if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.mimetype))reject(400,'INVALID_MEDIA','JPG·PNG·WebP·MP4·WebM 파일만 지원합니다.');
    const type:'IMAGE'|'VIDEO'=file.mimetype.startsWith('image/')?'IMAGE':'VIDEO';let mime=file.mimetype,size=file.size;
    await mkdir(root,{recursive:true});
    if(type==='IMAGE'){
     if(file.size>5*1024*1024)reject(400,'FILE_TOO_LARGE','이미지는 5MB 이하입니다.');
     let bytes:Buffer;try{bytes=await sharp(await readFile(file.path),{limitInputPixels:40000000}).rotate().webp().toBuffer();mime='image/webp';}catch{reject(400,'INVALID_IMAGE','이미지 파일을 확인해주세요.');}
     size=bytes.length;await writeFile(destination,bytes,{mode:0o600});
    }else{
     const handle=await open(file.path,'r'),buffer=Buffer.alloc(12);try{await handle.read(buffer,0,12,0);}finally{await handle.close();}
     const mp4=buffer.subarray(4,8).toString()==='ftyp',webm=buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));if(mime==='video/mp4'?!mp4:!webm)reject(400,'INVALID_VIDEO','동영상 파일을 확인해주세요.');await rename(file.path,destination);
    }
    const remote=this.storage.enabled;
    const row=await this.service.db.media.create({data:{id,user_sub:req.user.sub,type,original_name:file.originalname.slice(0,200),file_name:id,file_size:size,mime_type:mime,original_url:`/api/v1/media/${id}/file`,s3_upload_key:remote?`platform/${id}`:`local/${id}`,processing_status:remote?'UPLOADING':'COMPLETED',processed_at:remote?null:new Date()}});tracked=true;
    if(remote){await this.storage.put(id,destination,mime,size);await this.service.db.media.update({where:{id},data:{processing_status:'COMPLETED',processed_at:new Date()}});}saved=true;
    return{id:row.id,type:type==='IMAGE'?'image':'video',url:row.original_url};
   }catch(error){
    // Retain a failed row for orphan cleanup if the upload or DB completion was interrupted.
    if(tracked&&!saved&&this.storage.enabled){try{await this.service.db.media.update({where:{id},data:{processing_status:'FAILED',is_deleted:true,deleted_at:new Date()}});await this.storage.remove(`platform/${id}`);}catch{this.logger.error('Failed media upload requires orphan cleanup');}}
    throw error;
   }finally{for(const path of[file.path,...(!saved||this.storage.enabled?[destination]:[])]){try{await unlink(path);}catch(e:any){if(e.code!=='ENOENT')throw e;}}}
 }
 private async authorize(id:string,req:any){const m=await this.service.db.media.findUnique({where:{id},include:{postings:{include:{posting:true}}}});if(!m||m.is_deleted||m.processing_status!=='COMPLETED')reject(404,'MEDIA_NOT_FOUND','파일을 찾을 수 없습니다.');let allowed=req.user?.sub===m.user_sub;
   const links=m.postings.filter(link=>!link.is_deleted&&!link.posting.is_deleted);
   // Public references must never weaken a shared file's paid, private or adult restrictions.
   const restricted=links.filter(link=>link.posting.is_membership||link.posting.is_sensitive||!link.posting.is_public);
   if(!allowed){for(const link of restricted){if(!await this.service.access(link.posting,req.user?.sub))reject(403,'MEDIA_ACCESS_DENIED','파일 이용 권한이 없습니다.');}for(const link of links){if(await this.service.access(link.posting,req.user?.sub)){allowed=true;break;}}}
   // Membership versions preserve image references; only images used by publicly active plans are public.
   if(!allowed&&m.type==='IMAGE'){allowed=!!await this.service.db.membershipItem.findFirst({where:{creator_id:m.user_sub,image:m.original_url,is_active:true,is_deleted:false}});}
   if(!allowed)reject(403,'MEDIA_ACCESS_DENIED','파일 이용 권한이 없습니다.');
   for(const link of restricted){if(!await this.service.consumeContent(link.posting,req.user?.sub))reject(403,'MEDIA_ACCESS_DENIED','파일 이용 권한이 없습니다.');}
   return m;
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
