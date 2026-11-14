// Studio AI photo editor (2026-11-08 user request): outfit (masked), makeup, expression, pose or background edits of the creator's own uploaded photo.
// Order: allow-list → own completed image → text checks → daily limits → input moderation (fail closed) → Seedream image edit
// → output moderation → saved as the creator's private media with metadata.aiGenerated. The original photo is never changed.
import {Body,Controller,Get,Injectable,Logger,Post,Req,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
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
import {requestContext} from './request-context';
import {aiFailureTrace,diagnosticId,recordAiFailure,traceAiEvent,AiFailureTrace} from './ai-photo-failures';
import {aiPhotoAllowed} from './ai-photo-grants';
import {costumeReferenceIds,readCostumeReference} from './ai-photo-costume-references';
import {ticketSummary,useAiPhotoTicket} from './ai-photo-tickets';
import {containsPersonalData,looksLikeInjection} from './guide-advisor';
import {WATERMARK_VERSION,watermarkText} from './media-watermark-render';

export const AI_PHOTO_DAILY_LIMIT=10,AI_PHOTO_IMAGES=1,AI_PHOTO_PROMPT_MAX=2000;
const MODERATION_URL='https://api.openai.com/v1/moderations',MODERATION_MODEL='omni-moderation-latest';
const SEEDREAM_URL='https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
const DAY=86400,MAX_SIDE=1536;
const KINDS:Record<string,string>={camera:'Change only camera angle, framing and viewpoint as requested.',lens:'Recreate the requested photographic focal length, perspective and depth-of-field look; this is a visual simulation, not a real lens capture.',body:'Adjust only the requested adult chest, hip size or apparent height proportions naturally. Keep the person fully clothed and avoid sexualization.',outfit:'Change only the clothing inside the transparent masked area. Keep everything outside the mask unchanged.',makeup:'Change only the makeup colors and finish. Preserve natural skin texture and facial structure.',expression:'Change only the facial expression as requested. Preserve facial structure and identity.',pose:"Change only the person's pose and body position.",background:'Change only the background and surroundings behind the person.'};
const STYLES:Record<string,string>={photo:'a natural, realistic photograph',cosplay:'a realistic cosplay photo shoot with studio-quality lighting',daily:'a casual, realistic everyday snapshot'};
const COMBINED:Record<string,string>={camera:'Camera: adjust viewpoint and framing as requested.',lens:'Lens: simulate the requested focal-length perspective and depth-of-field look.',body:'Body proportions: naturally adjust only the requested adult chest, hip size or apparent height proportions, fully clothed and non-sexualized.',outfit:'Clothing: replace the requested garments in the pink clothing guide area.',makeup:'Makeup: apply the requested makeup while retaining natural skin texture.',expression:'Expression: apply the requested expression without changing identity.',pose:'Pose: adjust body position as requested.',background:'Background: change the requested surroundings.'};
function editKinds(kind:string,value:unknown):string[]{
 if(kind!=='combined')return [kind];
 let list:unknown=value;try{if(typeof list==='string')list=JSON.parse(list);}catch{reject(400,'INVALID_EDIT_KINDS','적용할 편집 항목을 다시 골라 주세요.');}
 if(!Array.isArray(list)||list.length<2||list.length>8||list.some(k=>typeof k!=='string'||!KINDS[k])||new Set(list).size!==list.length)reject(400,'INVALID_EDIT_KINDS','적용할 편집 항목을 다시 골라 주세요.');
 return list as string[];
}

export function aiPhotoConfig(config:ConfigService){
 const int=(v:unknown,d:number)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:d;};
 return{seedreamKey:(config.get('AI_PHOTO_BYTEPLUS_API_KEY')||'').trim(),apiKey:(config.get('AI_PHOTO_OPENAI_API_KEY')||config.get('GUIDE_ADVISOR_OPENAI_API_KEY')||'').trim(),model:'dola-seedream-5-5-261028',
  perDay:int(config.get('AI_PHOTO_PER_DAY'),AI_PHOTO_DAILY_LIMIT),dailyTotal:int(config.get('AI_PHOTO_DAILY_TOTAL'),300),timeoutMs:int(config.get('AI_PHOTO_TIMEOUT_MS'),120000)};
}
/** The prompt sent to the provider: the creator's words are framed by fixed rules (identity kept, no sexual content, no text). */
export function aiPhotoPrompt(kind:string,style:string,request:string,kinds:string[]=[kind],targetGender?:string,referenceCount=0,hasGuide=true){
 const cosplay=kinds.includes('outfit')&&style==='cosplay';
 const completeLook='Cosplay: apply the requested complete costume, including wig hair color, hairstyle, headwear, accessories, props and footwear. The pink guide locates garment edits; explicitly requested wig, hair, headwear and accessory changes may extend beyond it. Keep the face, identity and unrequested details unchanged. Include only items visible in the source framing; do not crop or invent a new pose merely to reveal them unless a framing or pose change is explicitly requested.';
 let instruction=kind==='combined'||targetGender||cosplay?['Apply all requested changes together to image 1. Modify only the listed aspects and keep unrequested details unchanged.',...kinds.map(k=>k==='outfit'&&cosplay?completeLook:COMBINED[k]),...(kinds.includes('outfit')?['Image 2 is a copy with a pink clothing-region guide. Use it only to locate the clothing edits; other requested aspects may change elsewhere. Never reproduce the pink guide in the result.']:[])].join('\n'):KINDS[kind];
 if(!hasGuide)instruction=instruction.replace('Change only the clothing inside the transparent masked area. Keep everything outside the mask unchanged.','Change the requested clothing. Keep unrequested details unchanged.').replace(' in the pink clothing guide area','').replace('The pink guide locates garment edits; explicitly requested wig, hair, headwear and accessory changes may extend beyond it.','Apply explicitly requested wig, hair, headwear and accessory changes.').replace('Image 2 is a copy with a pink clothing-region guide. Use it only to locate the clothing edits; other requested aspects may change elsewhere. Never reproduce the pink guide in the result.','');
 const firstReference=hasGuide?3:2;
 return [`Edit this photo of a real adult person. ${instruction}`,...(referenceCount?[`Images ${firstReference} through ${referenceCount+firstReference-1} are costume references 1 through ${referenceCount}. Transfer their visible clothing design, colors, wig hairstyle, headwear, accessories, props and footwear to the person in image 1. Do not copy the reference mannequin, body, face, pose or background. Apply items only within the source framing. Follow reference order when costume details conflict.`]:[]),`Requested change: ${request}`,'If requests conflict, the later instruction takes precedence.',`Make the result look like ${STYLES[style]}.`,
  targetGender?`Also change the depicted adult person to ${targetGender==='female'?'an adult woman':'an adult man'}. Allow facial features and gender presentation to change as needed. Keep the source recognizable where compatible, and preserve age, skin tone and unrequested details. Never make the person younger.`:kinds.includes('body')?"Preserve the person's facial structure, identity, age and skin tone. Only the requested body proportions may change.":"Keep the person's facial structure, identity, age, body shape and skin tone exactly the same.",'Do not add nudity, sexualized content, minors, text, logos or watermarks.'].join('\n');
}
const sizeFor=(width:number,height:number)=>width>height*1.15?'1536x1024':height>width*1.15?'1024x1536':'1024x1024';

@Injectable()
export class AiPhotoService{
 private logger=new Logger(AiPhotoService.name);
 private report(stage:string,code:unknown,res?:Response){const value=diagnosticId(res?.headers.get('x-request-id')||res?.headers.get('x-tt-logid')),trace=aiFailureTrace.getStore();if(trace)Object.assign(trace,{stage,providerCode:diagnosticId(code)||'unknown_provider_error',providerRequestId:value,providerStatus:res?.status});this.logger.warn({event:'ai-photo.failure',stage,code:diagnosticId(code)||'unknown_provider_error',requestId:value||null,internalRequestId:trace?.requestId,...(res?{status:res.status}:{})});}
 private async stage(stage:string,provider?:string){const trace=aiFailureTrace.getStore();if(trace){trace.stage=stage;if(provider)trace.provider=provider;delete trace.providerCode;delete trace.providerRequestId;delete trace.providerStatus;await traceAiEvent(this.service.db,'phase.started',{operation:stage,provider:trace.provider});}}


 readonly settings:ReturnType<typeof aiPhotoConfig>;
 fetcher:typeof fetch=fetch;
 constructor(private configService:ConfigService,private service:PlatformService,private storage:PlatformMediaStorage,private limiter:LocalMemberService){this.settings=aiPhotoConfig(configService);}
 private configured(){return !!this.settings.apiKey&&!!this.settings.seedreamKey;}
 private window(){return Math.floor(Date.now()/(DAY*1000));}
 private async used(key:string){const row=await this.service.db.authRateBucket.findUnique({where:{id:digest(`${key}:${this.window()}`)}});return row?.count??0;}
 private async giveBack(key:string){await this.service.db.$executeRaw`UPDATE auth_rate_buckets SET count=GREATEST(count-1,0) WHERE id=${digest(`${key}:${this.window()}`)}`;}
 private creatorKey(sub:string){return 'ai-photo:creator-day:'+sub;}
 async quota(sub:string){
  await this.service.requireCreator(sub);
  const allowed=await aiPhotoAllowed(this.service.db,sub)&&this.configured();
  return{allowed,limit:this.settings.perDay,remaining:allowed?Math.max(0,this.settings.perDay-await this.used(this.creatorKey(sub))):0,typicalSeconds:allowed?await this.typicalSeconds():null,resetTickets:allowed?await ticketSummary(this.service.db,sub):{count:0,nextExpiresAt:null}};
 }
 /** Spend one storable reset ticket (2026-11-13): today's usage back to 0. */
 async useResetTicket(sub:string){
  await this.service.requireCreator(sub);if(!this.configured())reject(503,'AI_PHOTO_UNAVAILABLE','지금은 AI 사진 편집을 사용할 수 없어요.');
  const r=await useAiPhotoTicket(this.service.db,sub);
  return{limit:this.settings.perDay,remaining:Math.max(0,this.settings.perDay-await this.used(this.creatorKey(sub))),resetTickets:r.tickets,message:`리셋권 1장을 사용했어요. 오늘 ${this.settings.perDay}회를 다시 만들 수 있어요.`};
 }
 /** Median whole-request time of the latest real edits (all creators), shown while a new one runs. null until one has finished. */
 async typicalSeconds():Promise<number|null>{
  const rows=await this.service.db.media.findMany({where:{type:'IMAGE',metadata:{path:'$.aiGenerated',equals:true}},orderBy:{created_at:'desc'},take:60,select:{metadata:true}});
  const seen=new Set<string>(),values:number[]=[];
  for(const row of rows){const m:any=row.metadata;const key=String(m?.aiCreatedAt||'');if(typeof m?.aiDurationMs!=='number'||m.aiDurationMs<=0||seen.has(key))continue;seen.add(key);values.push(m.aiDurationMs);if(values.length>=30)break;}
  if(!values.length)return null;values.sort((a,b)=>a-b);const mid=values.length>>1;
  return Math.max(1,Math.round((values.length%2?values[mid]:(values[mid-1]+values[mid])/2)/1000));
 }
 /** One durable begin/end pair per actual provider call, including each reference moderation. */
 private async providerRequest(url:string,init:RequestInit,stage:string,provider:string,model:string,source?:string){
  const trace=aiFailureTrace.getStore(),attempt=(trace?++trace.sequence:1),attemptId=randomUUID(),started=Date.now(),base={attempt,attemptId,operation:stage,provider,model,source};
  await traceAiEvent(this.service.db,'step.started',{...base,outcome:'started'});
  try{
   const res=await this.fetcher(url,init),body=await res.json().catch(()=>null);
   const providerRequestId=diagnosticId(res.headers.get('x-request-id')||res.headers.get('x-tt-logid'));
   const responseModel=diagnosticId(body?.model),verdict=body?.results?.[0]?.flagged;
   const valid=res.ok&&(stage==='generation'?Array.isArray(body?.data)&&body.data.some((d:any)=>typeof d?.b64_json==='string'&&d.b64_json.length>0):typeof verdict==='boolean');
   const blocked=res.ok&&stage!=='generation'&&verdict===true;
   const providerCode=diagnosticId(body?.error?.code)||(!valid?'INVALID_PROVIDER_RESPONSE':blocked?'moderation_blocked':undefined);
   await traceAiEvent(this.service.db,'step.'+(valid&&!blocked?'succeeded':'failed'),{...base,responseModel,providerRequestId,providerCode,httpStatus:res.status,outcome:blocked?'blocked':valid?'succeeded':'failed'},Date.now()-started,res.status);
   return{res,body};
  }catch(error){
   await traceAiEvent(this.service.db,'step.failed',{...base,outcome:'failed',errorType:diagnosticId(error?.name),providerCode:diagnosticId(error?.cause?.code)||diagnosticId(error?.name)||'NETWORK_ERROR'},Date.now()-started);
   throw error;
  }
 }
 /** undefined = no verdict (the caller fails closed). */
 private async flagged(input:unknown[],stage:'input'|'output',source?:string):Promise<boolean|undefined>{
  try{
   const {res,body}=await this.providerRequest(MODERATION_URL,{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.settings.apiKey},body:JSON.stringify({model:MODERATION_MODEL,input})},stage,'openai',MODERATION_MODEL,source);
   const verdict=res.ok?body?.results?.[0]?.flagged:undefined;
   if(typeof verdict!=='boolean'){this.report(stage,body?.error?.code||'MODERATION_UNAVAILABLE',res);return undefined;}
   if(verdict)this.report(stage,'moderation_blocked',res);return verdict;
  }catch(error){this.report(stage,diagnosticId(error?.cause?.code)||diagnosticId(error?.name)||'MODERATION_UNAVAILABLE');return undefined;}
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
  const mode=input?.mode??'general',selectedProvider='seedream';
  const trace:AiFailureTrace={requestId:requestContext.getStore()?.requestId||randomUUID(),actorId:sub,selectedProvider,selectedModel:this.settings.model,sequence:0,stage:'validation',provider:'local'},started=Date.now();
  return aiFailureTrace.run(trace,async()=>{
   await traceAiEvent(this.service.db,'started',{mode:diagnosticId(mode),selectedModel:trace.selectedModel,selectedProvider});
   try{const result=await this.performEdit(sub,input,mask);await traceAiEvent(this.service.db,'succeeded',{selectedModel:trace.selectedModel,selectedProvider,count:result.images.length,targetId:result.images[0]?.id},Date.now()-started,200);return result;}
   catch(error){await recordAiFailure(this.service.db,this.configService,sub,input,error,trace,started);throw error;}
  });
 }
 private async performEdit(sub:string,input:any,mask?:{buffer:Buffer;mimetype:string;size:number}){
  const started=Date.now();await this.service.requireCreator(sub);
  if(!await aiPhotoAllowed(this.service.db,sub))reject(403,'AI_PHOTO_NOT_ALLOWED','AI 사진 편집은 운영팀이 허용한 크리에이터만 쓸 수 있어요.');
  const mode=input?.mode??'general';if(mode!=='general'&&mode!=='cosplay')reject(400,'INVALID_EDIT_MODE','편집 모드를 다시 골라 주세요.');
  const model=this.settings.model;
  if(!this.configured())reject(503,'PROVIDER_NOT_CONFIGURED','AI 사진 편집을 지금 사용할 수 없어요.');
  const kind=String(input?.kind||''),style=String(input?.style||'photo'),prompt=typeof input?.prompt==='string'?input.prompt.trim():'';
  if(kind!=='combined'&&!KINDS[kind])reject(400,'INVALID_KIND','바꿀 것을 골라 주세요.');if(!STYLES[style])reject(400,'INVALID_STYLE','사진 느낌을 골라 주세요.');
  const kinds=editKinds(kind,input?.editKinds),targetGender=input?.targetGender;
  if(targetGender!==undefined&&targetGender!=='female'&&targetGender!=='male')reject(400,'INVALID_TARGET_GENDER','생성 인물의 성별을 다시 골라 주세요.');
  if(input?.consent!==true&&input?.consent!=='true')reject(400,'CONSENT_REQUIRED','사진 속 인물 확인에 동의해 주세요.');
  if(!prompt||prompt.length>AI_PHOTO_PROMPT_MAX)reject(400,'INVALID_PROMPT',`원하는 모습을 1~${AI_PHOTO_PROMPT_MAX}자로 적어 주세요.`);
  if(containsPersonalData(prompt))reject(400,'PERSONAL_DATA','이메일·전화번호 같은 개인정보는 빼고 적어 주세요.');
  if(looksLikeInjection(prompt))reject(400,'OUT_OF_SCOPE','사진을 어떻게 바꿀지만 적어 주세요.');
  if(!kinds.includes('outfit')&&mask)reject(400,'INVALID_MASK','옷을 바꿀 때만 옷 영역을 칠해 주세요.');
  if(mask&&(mask.mimetype!=='image/png'||mask.size>5*1024*1024))reject(400,'INVALID_MASK','칠한 영역을 다시 만들어 주세요.');
  const referenceIds=costumeReferenceIds(input?.costumeIds,kinds,style);
  await this.stage('source');
  const original=await this.source(sub,input?.sourceId);
  const references=await Promise.all(referenceIds.map(readCostumeReference));
  // Provider input: PNG at most 1536px; the mask is resized to the same pixels and keeps its alpha channel.
  let image:Buffer,maskPng:Buffer|undefined,width:number,height:number;
  try{
   const fitted=await sharp(original,{limitInputPixels:40000000}).rotate().resize({width:MAX_SIDE,height:MAX_SIDE,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
   image=fitted.data;width=fitted.info.width;height=fitted.info.height;
   if(mask){const m=await sharp(mask.buffer,{limitInputPixels:40000000}).ensureAlpha().resize(width,height,{fit:'fill'}).png().toBuffer();const stats=await sharp(m).stats();
    if(stats.channels[3].min===255)reject(400,'MASK_REQUIRED','바꿀 옷 부분을 사진 위에 칠해 주세요.');maskPng=m;}
  }catch(error:any){if(error?.getStatus)throw error;reject(400,'INVALID_IMAGE','사진을 처리하지 못했어요. 다시 올려 주세요.');}
  // A clothing-only provider mask would prevent a combined expression/background edit.
  // Supply a marked copy as the second reference instead, keeping the original first.
  let guide:Buffer|undefined;
  if(maskPng){
   const alpha=await sharp(maskPng).extractChannel('alpha').raw().toBuffer(),overlay=Buffer.alloc(width!*height!*4);
   for(let i=0;i<alpha.length;i++){overlay[i*4]=244;overlay[i*4+1]=114;overlay[i*4+2]=182;overlay[i*4+3]=Math.round((255-alpha[i])*.55);}
   guide=await sharp(image!).composite([{input:overlay,raw:{width:width!,height:height!,channels:4}}]).png().toBuffer();
  }
  if(1+(guide?1:0)+references.length>10)reject(400,'INVALID_COSTUME_REFERENCES','의상 참조는 최대 8개까지 선택해 주세요.');
  await this.stage('quota');
  const key=this.creatorKey(sub);
  try{await this.limiter.limit(key,this.settings.perDay,DAY);}catch{reject(429,'DAILY_LIMIT','오늘 만들 수 있는 횟수를 모두 썼어요. 매일 오전 9시에 다시 이용할 수 있어요.');}
  try{await this.limiter.limit('ai-photo:total',this.settings.dailyTotal,DAY);}catch{await this.giveBack(key);reject(429,'SERVICE_BUSY','오늘은 AI 사진 편집 요청이 많아 잠시 쉬고 있어요. 내일 다시 이용해 주세요.');}
  let charged=true;
  try{
   // Moderation accepts one image per request. Every source/reference must pass before generation.
   await this.stage('input','openai');
   for(const [referenceIndex,item] of [{mime:'image/png',bytes:image!},...references.map(bytes=>({mime:'image/webp',bytes}))].entries()){
    const verdict=await this.flagged([{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:${item.mime};base64,`+item.bytes.toString('base64')}}],'input',referenceIndex===0?'original':'costume-reference-'+referenceIndex);
    if(verdict===undefined)reject(503,'MODERATION_UNAVAILABLE','안전 검사를 하지 못했어요. 잠시 후 다시 시도해 주세요.');
    if(verdict){charged=false;reject(400,'UNSAFE_INPUT','안전 기준에 맞지 않는 사진이나 요청이라 만들 수 없어요.');}
   }
    let requestPrompt=aiPhotoPrompt(kind,style,prompt,kinds,targetGender,references.length,Boolean(guide)).replace('transparent masked area','pink clothing-region guide in image 2').replace('outside the mask','outside the pink guide');
    if(guide&&!requestPrompt.includes('Image 2 is a copy'))requestPrompt+='\nImage 2 is a copy with a pink clothing-region guide. Edit clothing only in that region, keep other details unchanged, and never reproduce the pink guide.';
    const data=(bytes:Buffer,mime:string)=>`data:${mime};base64,`+bytes.toString('base64');
    const url=SEEDREAM_URL,headers={Authorization:'Bearer '+this.settings.seedreamKey,'Content-Type':'application/json'};
    const requestBody=JSON.stringify({model,prompt:requestPrompt,image:[data(image!,'image/png'),...(guide?[data(guide,'image/png')]:[]),...references.map(b=>data(b,'image/webp'))],size:sizeFor(width!,height!),output_format:'png',response_format:'b64_json',background:'opaque',watermark:false});
   await this.stage('generation','seedream');
   let res:Response,body:any;try{({res,body}=await this.providerRequest(url,{method:'POST',signal:AbortSignal.timeout(this.settings.timeoutMs),headers,body:requestBody},'generation','seedream',model));}
   catch(error){const timeout=['TimeoutError','AbortError'].includes(error?.name);this.report('generation',diagnosticId(error?.cause?.code)||(timeout?'PROVIDER_TIMEOUT':'PROVIDER_CONNECTION_ERROR'));reject(timeout?504:502,timeout?'PROVIDER_TIMEOUT':'PROVIDER_CONNECTION_ERROR',timeout?'사진을 만드는 데 시간이 너무 오래 걸렸어요. 다시 시도해 주세요.':'AI 제공사에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');}
   const trace=aiFailureTrace.getStore();if(trace){trace.providerRequestId=diagnosticId(res.headers.get('x-request-id')||res.headers.get('x-tt-logid'));trace.providerStatus=res.status;}
   if(!res.ok){const code=body?.error?.code,stage=body?.error?.moderation_details?.moderation_stage;this.report(code==='moderation_blocked'&&['input','output'].includes(stage)?stage:'provider',code,res);
    if(code==='OutputImageSensitiveContentDetected.PolicyViolation'){charged=false;reject(400,'UNSAFE_OUTPUT','생성된 사진이 AI 제공사의 콘텐츠 정책을 통과하지 못했어요. 다른 의상이나 요청을 선택해 주세요.');}
    if(code==='moderation_blocked'){charged=false;if(stage==='output')reject(400,'UNSAFE_OUTPUT','생성된 사진이 AI 제공사의 안전 검사를 통과하지 못했어요. 요청 내용을 확인해 주세요.');reject(400,'UNSAFE_INPUT',stage==='input'?'사진 또는 요청이 AI 제공사의 안전 검사에서 차단됐어요. 사진과 요청 내용을 확인해 주세요.':'AI 제공사의 안전 검사로 만들지 못했어요. 사진과 요청 내용을 확인해 주세요.');}
    if(res.status>=400&&res.status<500&&body?.error?.type==='image_generation_user_error')reject(400,'PROVIDER_INPUT_ERROR','사진 요청을 처리하지 못했어요. 선택한 옵션과 입력 사진을 확인해 주세요.');
    reject(502,'PROVIDER_ERROR','사진을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');}
   const outputs:Buffer[]=(Array.isArray(body?.data)?body.data:[]).map((d:any)=>typeof d?.b64_json==='string'?Buffer.from(d.b64_json,'base64'):null).filter(Boolean).slice(0,AI_PHOTO_IMAGES);
   if(!outputs.length)reject(502,'PROVIDER_ERROR','사진을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
   await this.stage('output','openai');
   const safe:Buffer[]=[];let unchecked=false;
   for(const out of outputs){const v=await this.flagged([{type:'image_url',image_url:{url:'data:image/png;base64,'+out.toString('base64')}}],'output','generated');if(v===false)safe.push(out);else if(v===undefined)unchecked=true;}
   charged=false;// The provider was paid from here on; a blocked or unchecked result still counts.
   if(!safe.length&&unchecked)reject(503,'MODERATION_UNAVAILABLE','만든 사진의 안전 검사를 완료하지 못했어요. 사진은 표시하지 않았어요.');
   if(!safe.length)reject(400,'UNSAFE_OUTPUT','만든 사진이 안전 기준을 통과하지 못했어요. 다른 표현으로 다시 시도해 주세요.');
   const meta={aiGenerated:true,aiSourceId:String(input.sourceId),aiKind:kind,aiEditKinds:kinds,...(targetGender?{aiTargetGender:targetGender}:{}),aiModel:model,aiMode:mode,aiCreatedAt:new Date().toISOString(),aiDurationMs:Date.now()-started};
   await this.stage('storage','local');
   const storageStart=Date.now(),storageId=randomUUID(),storageAttempt=++aiFailureTrace.getStore().sequence;
   await traceAiEvent(this.service.db,'step.started',{operation:'storage',provider:'local',attemptId:storageId,attempt:storageAttempt,outcome:'started'});
   const images=[];try{for(const out of safe)images.push(await this.save(sub,out,meta));await traceAiEvent(this.service.db,'step.succeeded',{operation:'storage',provider:'local',attemptId:storageId,attempt:storageAttempt,outcome:'succeeded',count:images.length,targetId:images[0]?.id},Date.now()-storageStart);}
   catch(error){await traceAiEvent(this.service.db,'step.failed',{operation:'storage',provider:'local',attemptId:storageId,attempt:storageAttempt,outcome:'failed',errorCode:diagnosticId(error?.code)||'STORAGE_ERROR'},Date.now()-storageStart);throw error;}
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
 @Post('reset-ticket') useResetTicket(@Req() req:any){return this.photos.useResetTicket(req.user.sub);}
 @Post('edit') @UseInterceptors(FileInterceptor('mask',{storage:memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}))
 edit(@Req() req:any,@Body() body:any,@UploadedFile() mask:any){return this.photos.edit(req.user.sub,body,mask);}
}
