// Studio AI photo editor (2026-11-08 user request): outfit (masked), pose or background edits of the creator's own uploaded photo.
// Order: allow-list → own completed image → text checks → daily limits → input moderation (fail closed) → OpenAI image edit
// → output moderation → saved as the creator's private media with metadata.aiGenerated. The original photo is never changed.
import {Body,Controller,Get,Injectable,Post,Req,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ConfigService} from '@nestjs/config';
import {memoryStorage} from 'multer';
import {mkdir,readFile,unlink,writeFile} from 'fs/promises';
import {join,resolve} from 'path';
import {randomUUID} from 'crypto';
import {Readable} from 'stream';
const sharp:typeof import('sharp').default = require('sharp');
import {PlatformService} from './service';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformMediaStorage,managedMediaKey} from './media-storage';
import {LocalMemberService} from '../auth/local/local-member.service';
import {digest} from '../auth/local/credentials';
import {reject} from './http';
import {contentDigest} from './audit';
import {aiPhotoAllowed} from './ai-photo-grants';
import {containsPersonalData,looksLikeInjection} from './guide-advisor';
import {WATERMARK_VERSION,watermarkText} from './media-watermark-render';

export const AI_PHOTO_DAILY_LIMIT=10,AI_PHOTO_IMAGES=2,AI_PHOTO_PROMPT_MAX=300;
const EDIT_URL='https://api.openai.com/v1/images/edits',MODERATION_URL='https://api.openai.com/v1/moderations',MODERATION_MODEL='omni-moderation-latest';
const DAY=86400,MAX_SIDE=1536;
const KINDS:Record<string,string>={outfit:'Change only the clothing inside the transparent masked area. Keep everything outside the mask unchanged.',pose:"Change only the person's pose and body position.",background:'Change only the background and surroundings behind the person.'};
const STYLES:Record<string,string>={photo:'a natural, realistic photograph',cosplay:'a realistic cosplay photo shoot with studio-quality lighting',daily:'a casual, realistic everyday snapshot'};

export function aiPhotoConfig(config:ConfigService){
 const int=(v:unknown,d:number)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:d;};
 return{apiKey:(config.get('AI_PHOTO_OPENAI_API_KEY')||config.get('GUIDE_ADVISOR_OPENAI_API_KEY')||'').trim(),model:(config.get('AI_PHOTO_MODEL')||'gpt-image-2').trim(),
  quality:(config.get('AI_PHOTO_QUALITY')||'medium').trim(),perDay:int(config.get('AI_PHOTO_PER_DAY'),AI_PHOTO_DAILY_LIMIT),dailyTotal:int(config.get('AI_PHOTO_DAILY_TOTAL'),300),timeoutMs:int(config.get('AI_PHOTO_TIMEOUT_MS'),120000)};
}
/** The prompt sent to the provider: the creator's words are framed by fixed rules (identity kept, no sexual content, no text). */
export function aiPhotoPrompt(kind:string,style:string,request:string){
 return [`Edit this photo of a real adult person. ${KINDS[kind]}`,`Requested change: ${request}`,`Make the result look like ${STYLES[style]}.`,
  "Keep the person's face, identity, age, body shape and skin tone exactly the same.",'Do not add nudity, sexualized content, minors, text, logos or watermarks.'].join('\n');
}
const sizeFor=(width:number,height:number)=>width>height*1.15?'1536x1024':height>width*1.15?'1024x1536':'1024x1024';

@Injectable()
export class AiPhotoService{
 readonly settings:ReturnType<typeof aiPhotoConfig>;
 fetcher:typeof fetch=fetch;
 constructor(private configService:ConfigService,private service:PlatformService,private storage:PlatformMediaStorage,private limiter:LocalMemberService){this.settings=aiPhotoConfig(configService);}
 private window(){return Math.floor(Date.now()/(DAY*1000));}
 private async used(key:string){const row=await this.service.db.authRateBucket.findUnique({where:{id:digest(`${key}:${this.window()}`)}});return row?.count??0;}
 private async giveBack(key:string){await this.service.db.$executeRaw`UPDATE auth_rate_buckets SET count=GREATEST(count-1,0) WHERE id=${digest(`${key}:${this.window()}`)}`;}
 private creatorKey(sub:string){return 'ai-photo:creator-day:'+sub;}
 async quota(sub:string){
  await this.service.requireCreator(sub);
  const allowed=await aiPhotoAllowed(this.service.db,sub)&&!!this.settings.apiKey;
  return{allowed,limit:this.settings.perDay,remaining:allowed?Math.max(0,this.settings.perDay-await this.used(this.creatorKey(sub))):0,typicalSeconds:allowed?await this.typicalSeconds():null};
 }
 /** Median whole-request time of the latest real edits (all creators), shown while a new one runs. null until one has finished. */
 async typicalSeconds():Promise<number|null>{
  const rows=await this.service.db.media.findMany({where:{type:'IMAGE',metadata:{path:'$.aiGenerated',equals:true}},orderBy:{created_at:'desc'},take:60,select:{metadata:true}});
  const seen=new Set<string>(),values:number[]=[];
  for(const row of rows){const m:any=row.metadata;const key=String(m?.aiCreatedAt||'');if(typeof m?.aiDurationMs!=='number'||m.aiDurationMs<=0||seen.has(key))continue;seen.add(key);values.push(m.aiDurationMs);if(values.length>=30)break;}
  if(!values.length)return null;values.sort((a,b)=>a-b);const mid=values.length>>1;
  return Math.max(1,Math.round((values.length%2?values[mid]:(values[mid-1]+values[mid])/2)/1000));
 }
 /** undefined = no verdict (the caller fails closed). */
 private async flagged(input:unknown[]):Promise<boolean|undefined>{
  try{
   const res=await this.fetcher(MODERATION_URL,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.settings.apiKey},body:JSON.stringify({model:MODERATION_MODEL,input})});
   const verdict=res.ok?(await res.json().catch(()=>null))?.results?.[0]?.flagged:undefined;
   return typeof verdict==='boolean'?verdict:undefined;
  }catch{return undefined;}
 }
 private async source(sub:string,id:unknown){
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))reject(400,'INVALID_SOURCE','바꿀 사진을 다시 골라 주세요.');
  const m=await this.service.db.media.findFirst({where:{id,user_sub:sub,type:'IMAGE',is_deleted:false,processing_status:'COMPLETED'}});
  if(!m)reject(404,'MEDIA_NOT_FOUND','내가 올린 사진만 바꿀 수 있어요. 사진을 다시 올려 주세요.');
  if(managedMediaKey(m.s3_upload_key)){const object=await this.storage.read(m.s3_upload_key);const chunks:Buffer[]=[];for await(const chunk of object.Body as Readable)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);}
  if(m.s3_upload_key.startsWith('local/'))return readFile(join(resolve(this.configService.get('MEDIA_ROOT')||'.local/media'),m.file_name));
  reject(400,'UNSUPPORTED_SOURCE','이 사진은 바꿀 수 없어요. 사진을 다시 올려 주세요.');
 }
 private async save(sub:string,bytes:Buffer,meta:Record<string,unknown>){
  const root=resolve(this.configService.get('MEDIA_ROOT')||'.local/media'),id=randomUUID(),destination=join(root,id);
  const webp=await sharp(bytes,{limitInputPixels:40000000}).rotate().webp().toBuffer();await mkdir(root,{recursive:true});await writeFile(destination,webp,{mode:0o600});
  const remote=this.storage.enabled;let watermark:any={};
  // Same watermark eligibility as an upload: recorded now, applied when the post is published.
  try{const member=await this.service.member(sub);watermarkText(member.preferred_username);watermark={watermarkEligible:WATERMARK_VERSION,watermarkHandle:member.preferred_username};}catch{}
  try{
   const row=await this.service.db.media.create({data:{id,user_sub:sub,type:'IMAGE',metadata:{...watermark,...meta},original_name:'ai-photo.webp',file_name:id,file_size:webp.length,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:remote?`platform/${id}`:`local/${id}`,processing_status:remote?'UPLOADING':'COMPLETED',processed_at:remote?null:new Date()}});
   if(remote){await this.storage.put(id,destination,'image/webp',webp.length);await this.service.db.media.update({where:{id},data:{processing_status:'COMPLETED',processed_at:new Date()}});}
   return{id:row.id,type:'image' as const,url:row.original_url,aiGenerated:true};
  }finally{if(remote){try{await unlink(destination);}catch{}}}
 }
 async edit(sub:string,input:any,mask?:{buffer:Buffer;mimetype:string;size:number}){
  const started=Date.now();await this.service.requireCreator(sub);
  if(!await aiPhotoAllowed(this.service.db,sub))reject(403,'AI_PHOTO_NOT_ALLOWED','AI 사진 편집은 운영팀이 허용한 크리에이터만 쓸 수 있어요.');
  if(!this.settings.apiKey)reject(503,'PROVIDER_NOT_CONFIGURED','AI 사진 편집을 지금 사용할 수 없어요.');
  const kind=String(input?.kind||''),style=String(input?.style||'photo'),prompt=typeof input?.prompt==='string'?input.prompt.trim():'';
  if(!KINDS[kind])reject(400,'INVALID_KIND','바꿀 것을 골라 주세요.');if(!STYLES[style])reject(400,'INVALID_STYLE','사진 느낌을 골라 주세요.');
  if(input?.consent!==true&&input?.consent!=='true')reject(400,'CONSENT_REQUIRED','사진 속 인물 확인에 동의해 주세요.');
  if(!prompt||prompt.length>AI_PHOTO_PROMPT_MAX)reject(400,'INVALID_PROMPT',`원하는 모습을 1~${AI_PHOTO_PROMPT_MAX}자로 적어 주세요.`);
  if(containsPersonalData(prompt))reject(400,'PERSONAL_DATA','이메일·전화번호 같은 개인정보는 빼고 적어 주세요.');
  if(looksLikeInjection(prompt))reject(400,'OUT_OF_SCOPE','사진을 어떻게 바꿀지만 적어 주세요.');
  if(kind==='outfit'&&!mask)reject(400,'MASK_REQUIRED','바꿀 옷 부분을 사진 위에 칠해 주세요.');
  if(mask&&(mask.mimetype!=='image/png'||mask.size>5*1024*1024))reject(400,'INVALID_MASK','칠한 영역을 다시 만들어 주세요.');
  const original=await this.source(sub,input?.sourceId);
  // Provider input: PNG at most 1536px; the mask is resized to the same pixels and keeps its alpha channel.
  let image:Buffer,maskPng:Buffer|undefined,width:number,height:number;
  try{
   const fitted=await sharp(original,{limitInputPixels:40000000}).rotate().resize({width:MAX_SIDE,height:MAX_SIDE,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   image=fitted.data;width=fitted.info.width;height=fitted.info.height;
   if(mask){const m=await sharp(mask.buffer,{limitInputPixels:40000000}).ensureAlpha().resize(width,height,{fit:'fill'}).png().toBuffer();const stats=await sharp(m).stats();
    if(stats.channels[3].min===255)reject(400,'MASK_REQUIRED','바꿀 옷 부분을 사진 위에 칠해 주세요.');maskPng=m;}
  }catch(error:any){if(error?.getStatus)throw error;reject(400,'INVALID_IMAGE','사진을 처리하지 못했어요. 다시 올려 주세요.');}
  const key=this.creatorKey(sub);
  try{await this.limiter.limit(key,this.settings.perDay,DAY);}catch{reject(429,'DAILY_LIMIT','오늘 만들 수 있는 횟수를 모두 썼어요. 매일 오전 9시에 다시 이용할 수 있어요.');}
  try{await this.limiter.limit('ai-photo:total',this.settings.dailyTotal,DAY);}catch{await this.giveBack(key);reject(429,'SERVICE_BUSY','오늘은 AI 사진 편집 요청이 많아 잠시 쉬고 있어요. 내일 다시 이용해 주세요.');}
  let charged=true;
  try{
   const verdict=await this.flagged([{type:'text',text:prompt},{type:'image_url',image_url:{url:'data:image/png;base64,'+image!.toString('base64')}}]);
   if(verdict===undefined)reject(503,'MODERATION_UNAVAILABLE','안전 검사를 하지 못했어요. 잠시 후 다시 시도해 주세요.');
   if(verdict){charged=false;reject(400,'UNSAFE_INPUT','안전 기준에 맞지 않는 사진이나 요청이라 만들 수 없어요.');}
   const form=new FormData();
   form.append('model',this.settings.model);form.append('prompt',aiPhotoPrompt(kind,style,prompt));form.append('n',String(AI_PHOTO_IMAGES));
   form.append('size',sizeFor(width!,height!));form.append('quality',this.settings.quality);form.append('output_format','png');form.append('moderation','auto');
   form.append('safety_identifier',contentDigest('ai-photo:'+sub).slice(0,64));
   form.append('image',new Blob([image!],{type:'image/png'}),'source.png');if(maskPng)form.append('mask',new Blob([maskPng],{type:'image/png'}),'mask.png');
   let res:Response;try{res=await this.fetcher(EDIT_URL,{method:'POST',signal:AbortSignal.timeout(this.settings.timeoutMs),headers:{Authorization:'Bearer '+this.settings.apiKey},body:form});}
   catch{reject(504,'PROVIDER_TIMEOUT','사진을 만드는 데 시간이 너무 오래 걸렸어요. 다시 시도해 주세요.');}
   const body=await res.json().catch(()=>null);
   if(!res.ok){const code=body?.error?.code;if(code==='moderation_blocked'||body?.error?.type==='image_generation_user_error'){charged=false;reject(400,'UNSAFE_INPUT','안전 기준에 맞지 않는 사진이나 요청이라 만들 수 없어요.');}reject(502,'PROVIDER_ERROR','사진을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');}
   const outputs:Buffer[]=(Array.isArray(body?.data)?body.data:[]).map((d:any)=>typeof d?.b64_json==='string'?Buffer.from(d.b64_json,'base64'):null).filter(Boolean).slice(0,AI_PHOTO_IMAGES);
   if(!outputs.length)reject(502,'PROVIDER_ERROR','사진을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
   const safe:Buffer[]=[];
   for(const out of outputs){const v=await this.flagged([{type:'image_url',image_url:{url:'data:image/png;base64,'+out.toString('base64')}}]);if(v===false)safe.push(out);}
   charged=false;// The provider was paid from here on; a blocked or unchecked result still counts.
   if(!safe.length)reject(400,'UNSAFE_OUTPUT','만든 사진이 안전 기준을 통과하지 못했어요. 다른 표현으로 다시 시도해 주세요.');
   const meta={aiGenerated:true,aiSourceId:String(input.sourceId),aiKind:kind,aiModel:this.settings.model,aiCreatedAt:new Date().toISOString(),aiDurationMs:Date.now()-started};
   const images=[];for(const out of safe)images.push(await this.save(sub,out,meta));
   return{images,remaining:Math.max(0,this.settings.perDay-await this.used(key))};
  }catch(error){
   // Refused without a usable answer (moderation unavailable, provider error/timeout): give the try back.
   // A blocked input or output still counts, so repeated unsafe requests use up the day.
   if(charged){await this.giveBack(key);await this.giveBack('ai-photo:total');}
   throw error;
  }
 }
}

@Controller('studio/ai-photo') @UseGuards(PlatformAuthGuard)
export class AiPhotoController{
 constructor(private photos:AiPhotoService){}
 @Get('quota') quota(@Req() req:any){return this.photos.quota(req.user.sub);}
 @Post('edit') @UseInterceptors(FileInterceptor('mask',{storage:memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}))
 edit(@Req() req:any,@Body() body:any,@UploadedFile() mask:any){return this.photos.edit(req.user.sub,body,mask);}
}
