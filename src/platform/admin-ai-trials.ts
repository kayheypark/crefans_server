import {ConfigService} from '@nestjs/config';
import {PaymentProvider} from './payment-provider';
import {appendAudit} from './audit';
import {can} from './admin-permissions';
import {reject} from './http';
import {GUEST_PREFIX} from './guest-policy';
import {costumeSlug} from './ai-photo-costume-references';
import {landingFrom} from './funnel-stats';

// 2026-11-20 user request: an "AI 체험관리" console view of each signed-out trial — the photos the visitor uploaded (the
// built-in sample shows as the sample), every generation with the presets used and its result, and whether a post followed.
// User decision (same day): no privacy-policy revision; trials from before this view are shown too. Every detail view and
// every photo opened is written to the admin audit log (2 years), and nothing is copied: data disappears with the trial's
// own retention (unused photos 7 days, posts 30 days, request records 30 days).
export const SAMPLE_PHOTO_NAME='crefans-sample-virtual-person.webp';
const PAGE=30;
// PostHog redirects a project-less replay path to the operator's current project (US cloud, same as the service's ui_host).
const REPLAY_URL='https://us.posthog.com/replay/';
const isTrialId=(id:unknown):id is string=>typeof id==='string'&&id.startsWith(GUEST_PREFIX)&&/^guest:[0-9a-f]{40}$/.test(id);
const aiFlag={path:'$.aiGenerated',equals:true};

// 2026-11-22 user request: each signed-in operator can star trials and list only their stars. Stored per admin in
// platform_settings (key admin-fav:ai-trial:<admin id>, newest first, at most FAVORITE_MAX), no schema change.
export const FAVORITE_MAX=1000;
const favoriteKey=(admin:any)=>`admin-fav:ai-trial:${String(admin?.id||'')}`.slice(0,64);
export async function trialFavorites(db:any,admin:any):Promise<string[]>{
 const row=await db.platformSetting.findUnique({where:{key:favoriteKey(admin)}});const ids=(row?.value as any)?.ids;
 return Array.isArray(ids)?ids.filter(isTrialId):[];
}
/** Stars or unstars one trial for this operator; returns the new state. */
export async function setTrialFavorite(db:any,admin:any,id:string,favorite:unknown){
 requireView(admin);
 if(!isTrialId(id))reject(404,'AI_TRIAL_NOT_FOUND','체험을 찾을 수 없어요.');
 if(typeof favorite!=='boolean')reject(400,'AI_TRIAL_FAVORITE_INVALID','즐겨찾기 값을 확인해 주세요.');
 if(favorite&&!await db.platformAuditLog.findFirst({where:{action:'guest.consented',entity_id:id},select:{id:true}}))reject(404,'AI_TRIAL_NOT_FOUND','체험을 찾을 수 없어요.');
 return db.$transaction(async(tx:any)=>{
  const key=favoriteKey(admin);
  await tx.$executeRaw`INSERT IGNORE INTO platform_settings (\`key\`,value,updated_by,updated_at) VALUES (${key},${JSON.stringify({ids:[]})},${admin.id},NOW(3))`;
  await tx.$queryRaw`SELECT \`key\` FROM platform_settings WHERE \`key\`=${key} FOR UPDATE`;
  const rest=(await trialFavorites(tx,admin)).filter(x=>x!==id),ids=(favorite?[id,...rest]:rest).slice(0,FAVORITE_MAX);
  await tx.platformSetting.update({where:{key},data:{value:{ids},updated_by:admin.id}});
  return{id,favorite,count:ids.length};
 });
}

function requireView(admin:any){if(!can(admin,'members','view'))reject(403,'ADMIN_FORBIDDEN','회원 조회 권한이 필요합니다.');}

/** Newest trials first (by first consent), with counts for the list. */
export async function listAiTrials(db:any,admin:any,query:any){
 requireView(admin);
 const page=Math.max(1,Math.min(1000,Number.parseInt(String(query?.page??'1'),10)||1));
 // 2026-11-22 user request: search by the trial id or a PostHog number — a replay session number or the visitor number (distinct_id)
 // the browser reported (guest.replay_session / guest.replay_visitor keep it at the end of source_id).
 const q=String(query?.q??'').trim().toLowerCase();let only:string[]|null=null;
 const favorites=new Set(await trialFavorites(db,admin));
 if(query?.favorites==='1'||query?.favorites===true)only=[...favorites];
 if(q){
  if(isTrialId(q))only=only?only.filter(x=>x===q):[q];
  else if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(q))only=[...new Set<string>((await db.platformAuditLog.findMany({where:{action:{in:['guest.replay_session','guest.replay_visitor']},source_id:{endsWith:':'+q}},select:{entity_id:true},take:50})).map((r:any)=>r.entity_id))].filter(x=>!only||only.includes(x));
  else reject(400,'AI_TRIAL_QUERY_INVALID','체험 번호(guest:…)나 PostHog 세션·방문자 번호를 입력해 주세요.');
 }
 const where={action:'guest.consented',entity_id:only?{in:only}:{startsWith:GUEST_PREFIX}};
 const groups=await db.platformAuditLog.groupBy({by:['entity_id'],where,_min:{occurred_at:true},orderBy:{_min:{occurred_at:'desc'}},skip:(page-1)*PAGE,take:PAGE});
 const rows=groups,ids:string[]=rows.map((g:any)=>g.entity_id);
 const total=only?(await db.platformAuditLog.groupBy({by:['entity_id'],where})).length:Number((await db.$queryRaw`SELECT COUNT(DISTINCT entity_id) AS n FROM platform_audit_logs WHERE action='guest.consented' AND entity_id LIKE 'guest:%'`)[0].n);
 if(!ids.length)return{items:[],total,page,pageSize:PAGE};
 const byUser=(model:'media'|'posting',where:any)=>db[model].groupBy({by:['user_sub'],where:{user_sub:{in:ids},...where},_count:{_all:true}});
 const byActor=(action:string)=>db.platformAuditLog.groupBy({by:['actor_id'],where:{actor_id:{in:ids},action},_count:{_all:true}});
 const [media,ai,samples,ok,failed,posts,last]=await Promise.all([
  byUser('media',{}),byUser('media',{metadata:aiFlag}),byUser('media',{original_name:SAMPLE_PHOTO_NAME}),
  byActor('ai-photo.succeeded'),byActor('ai-photo.failed'),byUser('posting',{is_deleted:false,status:'PUBLISHED'}),
  db.platformAuditLog.groupBy({by:['actor_id'],where:{actor_id:{in:ids}},_max:{occurred_at:true}}),
 ]);
 const counts=(rows:any[],key:string)=>new Map<string,number>(rows.map(r=>[r[key],r._count._all]));
 const [mediaN,aiN,sampleN,okN,failedN,postN]=[counts(media,'user_sub'),counts(ai,'user_sub'),counts(samples,'user_sub'),counts(ok,'actor_id'),counts(failed,'actor_id'),counts(posts,'user_sub')];
 const entries=new Map<string,ReturnType<typeof entryOf>>((await db.platformAuditLog.findMany({where:{action:'guest.entry_source',entity_id:{in:ids}},select:{entity_id:true,metadata:true}})).map((r:any)=>[r.entity_id,entryOf(r.metadata)]));
 const lastAt=new Map(last.map((r:any)=>[r.actor_id,r._max.occurred_at]));
 const claimed=new Set((await db.platformAuditLog.findMany({where:{action:'guest.claimed',OR:ids.map(id=>({metadata:{path:'$.guest',equals:id}}))},select:{metadata:true}})).map((r:any)=>r.metadata?.guest));
 return{total,page,pageSize:PAGE,items:rows.map((g:any)=>{const id=g.entity_id,generated=aiN.get(id)||0,total=mediaN.get(id)||0;return{
  id,startedAt:g._min.occurred_at,lastActivityAt:lastAt.get(id)||g._min.occurred_at,
  uploads:total-generated,sampleUploads:sampleN.get(id)||0,generated,succeeded:okN.get(id)||0,failed:failedN.get(id)||0,posts:postN.get(id)||0,claimed:claimed.has(id),favorite:favorites.has(id),entry:entries.get(id)?.label??null};})};
}

/** The first entry of a trial (guest.entry_source) with a readable label, e.g. '당근 · utm_campaign=…'. */
function entryOf(metadata:any){
 const m=metadata||{},source={referrerHost:m.referrerHost,utmSource:m.utmSource,utmMedium:m.utmMedium,utmCampaign:m.utmCampaign,utmContent:m.utmContent};
 return{...source,landingPath:m.landingPath??null,label:landingFrom(source)};
}
function decrypt(config:ConfigService,row:any){try{return JSON.parse(new PaymentProvider(config).decrypt(row.payload_encrypted));}catch{return null;}}
/** Multipart requests store list fields as JSON strings (e.g. editKinds '["outfit","pose"]'); the console expects arrays. */
function list(value:unknown):string[]{let v=value;if(typeof v==='string'){try{v=JSON.parse(v);}catch{v=v?[v]:[];}}return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];}
function costumes(options:any){let ids:unknown=options?.costumeIds;if(typeof ids==='string'){try{ids=JSON.parse(ids);}catch{ids=[];}}
 return Array.isArray(ids)?ids.filter((id):id is string=>typeof id==='string').map(id=>({id,name:costumeSlug(id)||id})):[];}

/** One trial: uploads, generations (with presets and results) and posts, oldest first. Logged as an admin access. */
export async function aiTrialDetail(db:any,admin:any,id:string,config:ConfigService){
 requireView(admin);
 if(!isTrialId(id))reject(404,'AI_TRIAL_NOT_FOUND','체험을 찾을 수 없어요.');
 const consents=await db.platformAuditLog.findMany({where:{action:'guest.consented',entity_id:id},orderBy:{occurred_at:'asc'},select:{occurred_at:true,metadata:true}});
 if(!consents.length)reject(404,'AI_TRIAL_NOT_FOUND','체험을 찾을 수 없어요.');
 const claim=await db.platformAuditLog.findFirst({where:{action:'guest.claimed',metadata:{path:'$.guest',equals:id}},select:{occurred_at:true,entity_id:true}});
 const owners=[id,...(claim?.entity_id?[claim.entity_id]:[])];
 const media=await db.media.findMany({where:{user_sub:{in:owners},created_at:{gte:consents[0].occurred_at}},orderBy:{created_at:'asc'},select:{id:true,user_sub:true,original_name:true,metadata:true,is_deleted:true,created_at:true,processing_status:true}});
 // After a signup the member's own later photos must not appear here: keep the member's media only when it was this trial's.
 const trialMedia=media.filter((m:any)=>m.user_sub===id||(claim&&m.created_at<=claim.occurred_at));
 const events=await db.platformAuditLog.findMany({where:{actor_id:id,action:{in:['ai-photo.succeeded','ai-photo.failed']}},orderBy:{occurred_at:'asc'},select:{occurred_at:true,action:true,request_id:true,metadata:true}});
 const details=new Map((await db.aiPhotoFailureDetail.findMany({where:{request_id:{in:events.map((e:any)=>e.request_id).filter(Boolean)},expires_at:{gt:new Date()}}})).map((r:any)=>[r.request_id,r]));
 const entryRow=await db.platformAuditLog.findFirst({where:{action:'guest.entry_source',entity_id:id},select:{metadata:true,occurred_at:true}});
 const replays=await db.platformAuditLog.findMany({where:{action:'guest.replay_session',entity_id:id},orderBy:{occurred_at:'asc'},select:{occurred_at:true,source_id:true}});
 const showPrompt=can(admin,'logs','view');
 const resultsBySource=new Map<string,string[]>();
 for(const m of trialMedia){const meta=m.metadata as any;if(meta?.aiGenerated===true&&typeof meta.aiSourceId==='string')resultsBySource.set(meta.aiSourceId,[...(resultsBySource.get(meta.aiSourceId)||[]),m.id]);}
 const generations=events.map((e:any)=>{
  const payload=details.has(e.request_id)?decrypt(config,details.get(e.request_id)):null,options=payload?.options||{};
  return{at:e.occurred_at,outcome:e.action==='ai-photo.succeeded'?'succeeded':'failed',requestId:e.request_id,
   errorCode:e.action==='ai-photo.failed'?(e.metadata?.errorCode||payload?.errorCode||null):null,
   resultId:payload?.targetId||e.metadata?.targetId||null,detail:payload?'available':'expired',
   options:payload?{mode:options.mode??null,kind:options.kind??null,editKinds:list(options.editKinds),targetGender:options.targetGender??null,costumes:costumes(options),backgroundId:options.backgroundId??null,presets:Array.isArray(options.presets)?options.presets:[],aspectRatio:options.aspectRatio??null,generationMethod:options.generationMethod??null}:null,
   prompt:payload&&showPrompt?payload.prompt??null:undefined};
 });
 const posts=await db.posting.findMany({where:{user_sub:{in:owners},created_at:{gte:consents[0].occurred_at,...(claim?{lte:claim.occurred_at}:{})}},orderBy:{created_at:'asc'},select:{id:true,title:true,content:true,status:true,is_public:true,is_deleted:true,published_at:true,created_at:true,hidden_at:true,medias:{select:{media_id:true},orderBy:{sort_order:'asc'}}}});
 await appendAudit(db,{category:'admin',action:'admin.ai_trial_viewed',entityId:id,data:{changedBy:admin.id}});
 return{
  id,favorite:(await trialFavorites(db,admin)).includes(id),startedAt:consents[0].occurred_at,consents:consents.map((c:any)=>({at:c.occurred_at,version:c.metadata?.version??null})),
  claimed:claim?{at:claim.occurred_at}:null,promptVisible:showPrompt,
  entry:entryRow?{...entryOf(entryRow.metadata),at:entryRow.occurred_at}:null,
  // The session UUID lives in source_id (guest-replay:<trial>:<uuid>); audit metadata keeps only allow-listed keys.
  replays:replays.map((r:any)=>{const sessionId=String(r.source_id||'').split(':').pop()||'';return{sessionId,at:r.occurred_at,url:REPLAY_URL+encodeURIComponent(sessionId)};}).filter((r:any)=>/^[0-9a-f-]{36}$/.test(r.sessionId)),
  uploads:trialMedia.filter((m:any)=>(m.metadata as any)?.aiGenerated!==true).map((m:any)=>({id:m.id,at:m.created_at,sample:m.original_name===SAMPLE_PHOTO_NAME,deleted:m.is_deleted,ready:m.processing_status==='COMPLETED',results:resultsBySource.get(m.id)||[]})),
  results:trialMedia.filter((m:any)=>(m.metadata as any)?.aiGenerated===true).map((m:any)=>{const meta=m.metadata as any;return{id:m.id,at:m.created_at,sourceId:meta?.aiSourceId??null,croppedFrom:meta?.croppedFrom??null,deleted:m.is_deleted,ready:m.processing_status==='COMPLETED'};}),
  generations,
  posts:posts.map((p:any)=>({id:p.id,title:p.title,body:p.content,status:p.status,public:p.is_public,deleted:p.is_deleted,hidden:!!p.hidden_at,publishedAt:p.published_at,createdAt:p.created_at,mediaIds:p.medias.map((x:any)=>x.media_id)})),
 };
}

/** Which media an operator may open from the trial view: only that trial's own photos (also after it was linked to an account). */
export async function aiTrialMedia(db:any,admin:any,id:string,mediaId:string){
 requireView(admin);
 if(!isTrialId(id)||typeof mediaId!=='string'||!/^[0-9a-f-]{36}$/.test(mediaId))reject(404,'MEDIA_NOT_FOUND','사진을 찾을 수 없어요.');
 const claim=await db.platformAuditLog.findFirst({where:{action:'guest.claimed',metadata:{path:'$.guest',equals:id}},select:{occurred_at:true,entity_id:true}});
 const m=await db.media.findFirst({where:{id:mediaId,type:'IMAGE',is_deleted:false,OR:[{user_sub:id},...(claim?[{user_sub:claim.entity_id,created_at:{lte:claim.occurred_at}}]:[])]}});
 if(!m)reject(404,'MEDIA_NOT_FOUND','사진을 찾을 수 없어요.');
 await appendAudit(db,{category:'admin',action:'admin.ai_trial_media_viewed',entityId:id,data:{changedBy:admin.id,mediaId}});
 return m;
}
