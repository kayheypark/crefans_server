import {createHash,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {PlatformRequestContext,requestContext} from './request-context';

export const auditCategories=['request','error','auth','admin','finance','mail','security','business','worker','client'] as const;
export type AuditCategory=typeof auditCategories[number];
export type AuditInput={category:AuditCategory;action:string;level?:'info'|'warning'|'error';entityId?:string;sourceId?:string;status?:number;durationMs?:number;data?:Record<string,unknown>};
const identifier=(v:unknown,max=191)=>typeof v==='string'&&new RegExp(`^[a-zA-Z0-9_.:-]{1,${max}}$`).test(v)?v:null;
const scalarKeys=new Set(['targetId','memberId','creatorId','subscriptionId','postId','orderId','planId','status','previousStatus','method','errorType','errorCode','provider','providerCode','operation','attemptId','outcome','purpose','messageId','fingerprint','rule','action','blockedUntil','job','clientRequestId','surface','changedBy','source']);
const numericKeys=new Set(['amount','attempt','httpStatus','smtpStatus','acceptedCount','rejectedCount','count','runs','failedRuns','processed','durationMs','version','previousVersion','platformFeeBps','settlementHoldDays','queued','skipped']);
const safeStateKeys=new Set(['status','published','pinned','kind','is_active','is_verified','promoted','comments_enabled','show_followers','show_following','allow_comments','is_membership','membership_level','platform_fee_bps','settlement_hold_days','version','contentHash','titleHash','marketing_alert']);
export function safeRoute(v:unknown){return typeof v==='string'&&/^\/[a-zA-Z0-9_/:.*-]{0,180}$/.test(v)?v:'unmatched';}
export function safeAuditData(data:Record<string,unknown>={}){
 const safe:Record<string,any>={};
 for(const [k,v] of Object.entries(data)){
  if(k==='messageId'){if(typeof v==='string'&&/^[a-f0-9-]{36}@mail\.crefans\.com$/.test(v))safe[k]=v;}
  else if(['providerCode','errorCode'].includes(k)){if(typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(v))safe[k]=v;}
  else if(scalarKeys.has(k)){const value=identifier(v,k==='messageId'?160:191);if(value)safe[k]=value;}
  else if(numericKeys.has(k)&&typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)safe[k]=v;
  else if(k==='route')safe.route=safeRoute(v);
  else if(k==='changedFields'&&Array.isArray(v))safe[k]=v.filter(x=>typeof x==='string'&&/^[a-zA-Z_]{1,48}$/.test(x)).slice(0,40);
  else if(k==='frames'&&Array.isArray(v))safe[k]=v.filter(x=>typeof x==='string'&&/^(?:(?:src|dist|node_modules|_next\/static)\/[A-Za-z0-9_./@-]+|node:[A-Za-z0-9_/-]+):\d+:\d+$/.test(x)).slice(0,12);
  else if(['activity','failures'].includes(k)&&v&&typeof v==='object')safe[k]=Object.fromEntries(Object.entries(v).filter(([a,b])=>/^[a-z-]{1,64}$/.test(a)&&typeof b==='number'&&Number.isSafeInteger(b)&&b>=0).slice(0,30));
  else if(['before','after'].includes(k)&&v&&typeof v==='object')safe[k]=Object.fromEntries(Object.entries(v).filter(([a,b])=>safeStateKeys.has(a)&&(typeof b==='boolean'||b===null||typeof b==='number'&&Number.isSafeInteger(b)||typeof b==='string'&&!!identifier(b))));
 }
 return safe;
}
export function auditChange(before:Record<string,any>|null,after:Record<string,any>){
 const keys=Object.keys(after),changedFields=keys.filter(k=>JSON.stringify(before?.[k]??null)!==JSON.stringify(after[k]??null));
 const state=(v:Record<string,any>|null)=>Object.fromEntries(Object.entries(v||{}).filter(([k])=>safeStateKeys.has(k)));
 return{changedFields,before:state(before),after:state(after)};
}
export function contentDigest(value:unknown){return createHash('sha256').update(JSON.stringify(value??null)).digest('hex');}
export function safeError(error:any){
 const errorType=identifier(error?.name,64)||'Error',errorCode=identifier(error?.getResponse?.()?.code||error?.code,64)||'UNCLASSIFIED';
 // Never retain exception messages or arbitrary stack lines (SQL/URLs may contain secrets).
 const frames=String(error?.stack||'').split('\n').slice(1,25).flatMap(line=>{const m=line.match(/((?:src|dist|node_modules|_next\/static)\/[A-Za-z0-9_./@-]+|node:[A-Za-z0-9_/-]+):\d+:\d+(?=\)?$)/);return m?[m[0]]:[];}).slice(0,12);
 return{errorType,errorCode,frames,fingerprint:contentDigest([errorType,errorCode,frames])};
}
export function actorContext(member:any,role?:string){const c=requestContext.getStore();if(c){c.actorId=identifier(member?.sub||member?.id)||undefined;if(role)c.actorRole=identifier(role,32)||undefined;}}
export function auditRow(input:AuditInput,context:PlatformRequestContext|undefined=requestContext.getStore()){
 if(!auditCategories.includes(input.category)||!identifier(input.action,96))throw new Error('Invalid audit event');
 return{id:randomUUID(),category:input.category,action:input.action,level:input.level||'info',actor_id:identifier(context?.actorId),actor_role:identifier(context?.actorRole,32),ip:isIP(context?.ip||'')?context.ip:null,peer_ip:isIP(context?.peerIp||'')?context.peerIp:null,request_id:identifier(context?.requestId,36),job_id:identifier(context?.jobId,64),entity_id:identifier(input.entityId),source_id:identifier(input.sourceId),release:identifier(process.env.APP_RELEASE,96)||'unversioned',environment:identifier(process.env.APP_ENV||process.env.NODE_ENV,32)||'local',status_code:Number.isInteger(input.status)?input.status:null,duration_ms:Number.isFinite(input.durationMs)?Math.min(2147483647,Math.max(0,Math.round(input.durationMs))):null,metadata:safeAuditData(input.data)};
}
// Required within business transactions: audit and mutation commit/roll back together.
export async function appendAudit(db:any,input:AuditInput,context?:PlatformRequestContext){
 const data=auditRow(input,context);if(!data.source_id)return db.platformAuditLog.create({data});
 try{return await db.platformAuditLog.upsert({where:{source_id:data.source_id},create:data,update:{}});}
 catch(error){if(error?.code!=='P2002')throw error;
  // Locking read sees a concurrent winner even inside MySQL's earlier transaction snapshot.
  const rows=await db.$queryRaw`SELECT * FROM platform_audit_logs WHERE source_id=${data.source_id} FOR UPDATE`;
  if(!rows.length)throw error;return rows[0];
 }
}
// Observational failures must not turn a successful provider operation into a retry/double charge.
export async function observeAudit(db:any,input:AuditInput,context:PlatformRequestContext|undefined=requestContext.getStore()){
 const data=auditRow(input,context);console.log(JSON.stringify({event:'audit',at:new Date().toISOString(),...data}));
 if(!db)return;
 try{return await (data.source_id?db.platformAuditLog.upsert({where:{source_id:data.source_id},create:data,update:{}}):db.platformAuditLog.create({data}));}
 catch{console.error(JSON.stringify({event:'audit_persist_failed',id:data.id,category:data.category,action:data.action,requestId:data.request_id}));}
}
export async function auditOperation(db:any,event:any,extra:Record<string,unknown>={}){
 const prefix=event.type.split('.')[0],category:AuditCategory=prefix==='admin'?'admin':prefix==='security'?'security':prefix==='worker'?'worker':['http','process'].includes(prefix)?'error':'business';
 return appendAudit(db,{category,action:event.type,level:category==='error'||event.type==='worker.error'?'error':category==='security'||event.type==='worker.stale'?'warning':'info',status:typeof event.data.status==='number'?event.data.status:undefined,sourceId:event.id,entityId:event.data.orderId||event.data.postId||event.data.targetId||event.data.subscriptionId||event.data.memberId,data:{...event.data,...extra}});
}
