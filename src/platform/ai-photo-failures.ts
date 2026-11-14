import {AsyncLocalStorage} from 'node:async_hooks';
import {ConfigService} from '@nestjs/config';
import {auditRow,appendAudit,observeAudit} from './audit';
import {requestContext} from './request-context';
import {PaymentProvider} from './payment-provider';
import {can} from './admin-permissions';

export type AiFailureTrace={requestId:string;actorId?:string;selectedModel?:string;selectedProvider?:string;sequence?:number;stage:string;provider:string;providerCode?:string;providerRequestId?:string;providerStatus?:number};
export const aiFailureTrace=new AsyncLocalStorage<AiFailureTrace>();
export const diagnosticId=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,191}$/.test(v)?v:undefined;
// Do not retain obvious credentials/contact details even in the encrypted diagnostic store.
export function diagnosticPrompt(value:unknown){
 if(typeof value!=='string')return '';
 return value.slice(0,2000).replace(/\b(?:sk-|ark-)[a-zA-Z0-9_-]+/g,'[키 숨김]').replace(/Bearer\s+\S+/gi,'Bearer [숨김]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[이메일 숨김]').replace(/\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g,'[전화번호 숨김]').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
}
export async function recordAiFailure(db:any,config:ConfigService,sub:string,input:any,error:any,trace:AiFailureTrace,started:number){
 const code=diagnosticId(error?.getResponse?.()?.code||error?.code||error?.cause?.code)||'INTERNAL_ERROR',status=error?.getStatus?.()||500;
 const context={...(requestContext.getStore()||{ip:'',peerIp:''}),requestId:trace.requestId,actorId:sub};
 const row=auditRow({category:'error',action:'ai-photo.failed',level:'error',status,durationMs:Date.now()-started,data:{errorCode:code,errorType:diagnosticId(error?.name),provider:trace.provider,selectedModel:trace.selectedModel,selectedProvider:trace.selectedProvider,operation:trace.stage,providerCode:trace.providerCode,providerRequestId:trace.providerRequestId,httpStatus:trace.providerStatus}},context);
 // The general log contains only identifiers/codes; never prompt text or raw provider errors.
 console.warn(JSON.stringify({event:'audit',...row}));
 try{
  const options:Record<string,unknown>={};for(const k of ['mode','style','kind','editKinds','targetGender','costumeIds','libraryIds','backgroundId','aspectRatio']){const v=input?.[k];if(typeof v==='string')options[k]=diagnosticPrompt(v).slice(0,300);else if(Array.isArray(v))options[k]=v.filter(x=>typeof x==='string').map(x=>diagnosticPrompt(x).slice(0,80)).slice(0,14);}
  const payload={...trace,errorCode:code,prompt:diagnosticPrompt(input?.prompt),options};
  const encrypted=new PaymentProvider(config).encrypt(JSON.stringify(payload));
  await db.$transaction(async(tx:any)=>{await tx.platformAuditLog.create({data:row});await tx.aiPhotoFailureDetail.create({data:{request_id:trace.requestId,payload_encrypted:encrypted,expires_at:new Date(Date.now()+30*86400000)}});});
 }catch{
  // Failure logging must not replace the original error or change quota/refund behavior.
  console.error(JSON.stringify({event:'ai-photo.failure_persist_failed',requestId:trace.requestId}));
  try{await db.platformAuditLog.upsert({where:{id:row.id},create:row,update:{}});}catch{}
 }
}
export async function aiFailureDetail(db:any,admin:any,requestId:string,config?:ConfigService){
 if(!can(admin,'logs','view')||!can(admin,'members','view'))return {state:'restricted'};
 const row=await db.aiPhotoFailureDetail.findUnique({where:{request_id:requestId}});
 if(!row||row.expires_at<=new Date())return {state:'expired'};
 if(!config)return {state:'unavailable'};
 const payload=JSON.parse(new PaymentProvider(config).decrypt(row.payload_encrypted));
 await appendAudit(db,{category:'admin',action:'admin.ai_photo_failure_viewed',entityId:requestId,data:{changedBy:admin.id}});
 return{state:'available',expiresAt:row.expires_at,...payload};
}
export async function pruneAiFailureDetails(db:any,now=new Date()){
 const rows=await db.aiPhotoFailureDetail.findMany({where:{expires_at:{lte:now}},select:{request_id:true},take:1000,orderBy:{expires_at:'asc'}});
 return rows.length?(await db.aiPhotoFailureDetail.deleteMany({where:{request_id:{in:rows.map(r=>r.request_id)}}})).count:0;
}

// Metadata-only lifecycle records share the HTTP request ID; prompts remain failure-only.
export async function traceAiEvent(db:any,action:string,data:Record<string,unknown>={},durationMs?:number,status?:number){
 const trace=aiFailureTrace.getStore();if(!trace)return;
 const context={...(requestContext.getStore()||{ip:'',peerIp:''}),requestId:trace.requestId,actorId:trace.actorId};
 await observeAudit(db,{category:'business',action:'ai-photo.'+action,level:action.endsWith('failed')?'error':'info',durationMs,status,data},context);
}
