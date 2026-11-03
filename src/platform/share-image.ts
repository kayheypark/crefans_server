import {mkdtemp,readFile,rm,stat} from 'fs/promises';
import {createWriteStream} from 'fs';
import {join,resolve} from 'path';
import {tmpdir} from 'os';
import {pipeline} from 'stream/promises';
import {Transform} from 'stream';
import {PlatformMediaStorage,managedMediaKey} from './media-storage';
import {runFfmpeg} from './video-transcode';
const sharp:typeof import('sharp').default=require('sharp');

export const SHARE_FALLBACK='/brand/share/default-post-v1.jpg';
export function shareFrameArgs(input:string,output:string,mime:string){return ['-nostdin','-hide_banner','-loglevel','error','-y','-filter_threads','1','-threads','1','-f',mime==='video/webm'?'matroska':'mov','-protocol_whitelist','file','-i',input,'-map','0:v:0','-frames:v','1','-an','-map_metadata','-1','-vf','scale=1200:630:force_original_aspect_ratio=decrease','-threads','1','-f','image2',output];}
/** Only already-authorized records enter here. Cache is bounded and never substitutes for access checks. */
export class ShareImageRenderer {
 private cache=new Map<string,Buffer>();private running=new Map<string,Promise<Buffer>>();
 async render(media:any,root:string,storage:PlatformMediaStorage){
  const key=`${media.id}:${new Date(media.updated_at).getTime()}:${media.file_size}:${media.mime_type}`;
  const cached=this.cache.get(key);if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached;}
  if(this.running.has(key))return this.running.get(key)!;
  if(this.running.size>=2)throw new Error('SHARE_IMAGE_BUSY');
  const work=this.create(media,root,storage).then(bytes=>{this.cache.set(key,bytes);while(this.cache.size>16)this.cache.delete(this.cache.keys().next().value!);return bytes;}).finally(()=>this.running.delete(key));
  this.running.set(key,work);return work;
 }
 private async create(media:any,root:string,storage:PlatformMediaStorage){
  const limit=300*1024*1024;if(media.file_size>limit)throw new Error('SHARE_IMAGE_SIZE');
  const dir=await mkdtemp(join(tmpdir(),'crefans-share-'));
  try{
   let input:string;
   if(managedMediaKey(media.s3_upload_key)){
    if(media.s3_upload_key!==`platform/${media.id}`)throw new Error('SHARE_IMAGE_KEY');
    input=join(dir,'source');const signal=AbortSignal.timeout(20000),object=await storage.read(media.s3_upload_key,{signal});let size=0;
    const bounded=new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>limit?new Error('SHARE_IMAGE_SIZE'):null,chunk);}});
    await pipeline(object.Body as any,bounded,createWriteStream(input,{mode:0o600}),{signal});
   }else if(media.s3_upload_key===`local/${media.id}`&&media.file_name===media.id){input=join(resolve(root),media.id);if((await stat(input)).size>limit)throw new Error('SHARE_IMAGE_SIZE');}
   else throw new Error('SHARE_IMAGE_LEGACY');
   if(media.type==='VIDEO'){const output=join(dir,'frame.jpg');await runFfmpeg(shareFrameArgs(input,output,media.mime_type),15000);input=output;}
   const bytes=await sharp(await readFile(input),{limitInputPixels:40000000}).rotate().resize(1200,630,{fit:'contain',background:'#ffffff'}).jpeg({quality:82}).toBuffer();
   if(bytes.length>2*1024*1024)throw new Error('SHARE_IMAGE_SIZE');return bytes;
  }finally{await rm(dir,{recursive:true,force:true});}
 }
}
