import {observeAudit,safeError,auditOperation} from './audit';
import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PrismaService} from '../prisma/prisma.service';
import {requestContext} from './request-context';
import {randomUUID} from 'crypto';

const labels:Record<string,string>={
 'beans.charge_created':'콩 충전 주문','beans.charge_paid':'콩 충전 완료','beans.tip':'콩 후원','beans.promotion':'프로모션콩 지급','beans.payout_requested':'후원콩 출금 접수','beans.payout_paid':'후원콩 은행 지급 완료','beans.payout_rejected':'후원콩 은행 반려','beans.charge_disputed':'콩 충전 취소·차지백 감지',
 'worker.stale':'배치 실행 지연','operations.test':'운영 알림 연결 확인','member.signup':'회원가입', 'subscription.started':'멤버십 구독', 'subscription.payment_failed':'멤버십 정기결제 실패','subscription.renewed':'멤버십 정기 갱신', 'subscription.cancelled':'멤버십 구독 해지',
 'content.created':'콘텐츠 등록','content.updated':'콘텐츠 수정','content.deleted':'콘텐츠 삭제',
 'member.profile.updated':'회원 프로필 수정','creator.profile.updated':'크리에이터 프로필 수정','http.error':'서버 오류','worker.error':'배치 오류',
 'process.error':'프로세스 치명 오류','worker.completed':'배치 처리 완료','worker.hourly':'배치 1시간 요약',
 'security.injection_detected':'인젝션 시도 감지','security.ip_blocked':'공격 IP 자동 차단','security.ip_released':'IP 차단 만료',
};
const allowed=new Set(['ip','count','blockedUntil','rule','action','status','method','route','errorType','errorCode','job','runs','failedRuns','processed','durationMs','failures','activity','fingerprint','release']);
function metadata(data:Record<string,unknown>){
 const result:Record<string,any>={};
 for(const [key,value] of Object.entries(data)){
  if(!allowed.has(key))continue;
  if(typeof value==='number'&&Number.isFinite(value))result[key]=value;
  else if(typeof value==='string')result[key]=value.replace(/[\r\n\x00-\x1f]/g,' ').slice(0,160);
  else if((key==='failures'||key==='activity')&&value&&typeof value==='object'){
   result[key]=Object.fromEntries(Object.entries(value).filter(([k,v])=>/^[a-z-]{1,64}$/.test(k)&&typeof v==='number'&&Number.isFinite(v)).slice(0,30));
  }
 }
 return result;
}
@Injectable()
export class PlatformOperationsService implements OnModuleInit,OnModuleDestroy {
 installFatalHandlers(){
  let exiting=false;
  const fatal=(error:unknown)=>{
   if(exiting)return;exiting=true;
   // Do not resume a process after an uncaught exception. Bound reporting time.
   const deadline=setTimeout(()=>process.exit(1),6000);
   void this.error('process.error',error).then(event=>event?this.flush(new Date(),fetch,event.id):undefined).catch(()=>console.error('fatal_alert_failed')).finally(()=>{clearTimeout(deadline);process.exit(1);});
  };
  process.once('uncaughtException',fatal);process.once('unhandledRejection',fatal);
 }
 private timer:NodeJS.Timeout;private watchdog:NodeJS.Timeout;private watching=false;private running:Promise<unknown>|undefined;
 constructor(private db:PrismaService,private config:ConfigService){}
 onModuleInit(){if(process.env.CREFANS_E2E==='true')return;this.timer=setInterval(()=>{if(!this.running)this.running=this.flush().catch(()=>console.error('operations_dispatch_failed')).finally(()=>{this.running=undefined;});},1200);this.timer.unref();}
 async onModuleDestroy(){clearInterval(this.timer);clearInterval(this.watchdog);await this.running;}

 startWatchdog(){if(this.config.get('OPERATIONS_WATCHDOG_ENABLED')!=='true'||process.env.CREFANS_E2E==='true')return;this.watchdog=setInterval(()=>{if(!this.watching){this.watching=true;void this.checkWorkerHealth().catch(()=>console.error(JSON.stringify({event:'worker_watchdog_failed'}))).finally(()=>{this.watching=false;});}},60000);this.watchdog.unref();}
 async checkWorkerHealth(now=new Date()){
  const row=await this.db.platformJob.findUnique({where:{id:'worker-health'}});
  if(!row?.completed_at||+now-+row.completed_at>300000)return this.record('worker.stale',{job:'worker-heartbeat',status:'stale'},`worker-stale:${Math.floor(+now/3600000)}`);
  // A live worker can still stall on one kind of work; each backlog is reported at most once an hour.
  const hour=Math.floor(+now/3600000),ago=(minutes:number)=>new Date(+now-minutes*60000),access=Number(process.env.ACCESS_LOG_RETENTION_DAYS||7);
  const checks:Array<[string,()=>Promise<number>]>=[
   ['payment.stuck',()=>this.db.checkoutOrder.count({where:{status:'processing',OR:[{processing_started_at:{lt:ago(30)}},{processing_started_at:null,created_at:{lt:ago(30)}}]}})],
   ['refund.stuck',()=>this.db.checkoutOrder.count({where:{status:'refunding',updated_at:{lt:ago(30)}}})],
   ['beans.charge_stuck',()=>this.db.beanCharge.count({where:{status:'processing',created_at:{lt:ago(30)}}})],
   ['marketing.uncertain',()=>this.db.marketingDelivery.count({where:{status:'uncertain'}})],
   ['audit.retention_lagging',()=>Number.isInteger(access)&&access>0?this.db.platformAuditLog.count({where:{category:'request',actor_role:null,occurred_at:{lt:new Date(+now-(access+2)*86400000)}}}):Promise.resolve(0)],
   ...(this.config.get('TELEGRAM_OPERATIONS_BOT_TOKEN')?[['alerts.backlog',()=>this.db.platformOperationalEvent.count({where:{delivered_at:null,created_at:{lt:ago(15)}}})] as [string,()=>Promise<number>]]:[]),
  ];
  for(const [type,count] of checks){const pending=await count();if(pending>0)await this.record(type,{job:'watchdog',status:'backlog',count:pending},`${type}:${hour}`);}
 }
 async record(type:string,data:Record<string,unknown>,dedupeKey?:string){
  const context=requestContext.getStore(),safe=metadata(data);
  console.log(JSON.stringify({event:type,...context,data:safe}));
  try{return await this.db.$transaction(async tx=>{const row={type,data:safe,ip:context?.ip||null,peer_ip:context?.peerIp||null,request_id:context?.requestId||null,dedupe_key:dedupeKey||null};const saved=dedupeKey?await tx.platformOperationalEvent.upsert({where:{dedupe_key:dedupeKey},create:row,update:{}}):await tx.platformOperationalEvent.create({data:row});await auditOperation(tx,saved);return saved;});}
  catch{console.error(JSON.stringify({event:'operations_persist_failed',type,requestId:context?.requestId}));}
 }
 async error(type:string,error:any,data:Record<string,unknown>={}){
  await observeAudit(this.db,{category:'error',action:type,level:'error',status:typeof data.status==='number'?data.status:undefined,data:{...data,...safeError(error)}});
  const code=error?.getResponse?.()?.code;
  return this.record(type,{...data,fingerprint:safeError(error).fingerprint,release:/^[a-zA-Z0-9_.:-]{1,96}$/.test(process.env.APP_RELEASE||'')?process.env.APP_RELEASE:'unversioned',errorType:/^[A-Za-z0-9]{1,80}$/.test(error?.name)?error.name:'Error',...(/^[A-Z0-9_]{1,64}$/.test(code||'')?{errorCode:code}:{})});
 }
 // One message per lease; atomic claim prevents API/worker instances sending concurrently.
 async flush(now=new Date(),fetchImpl:typeof fetch=fetch,eventId?:string){
  const token=this.config.get<string>('TELEGRAM_OPERATIONS_BOT_TOKEN'),chat=this.config.get<string>('TELEGRAM_OPERATIONS_CHAT_ID');
  if(!token||!chat)return;
  const row=await this.db.platformOperationalEvent.findFirst({where:{...(eventId?{id:eventId}:{}),delivered_at:null,available_at:{lte:now},OR:[{locked_until:null},{locked_until:{lt:now}}]},orderBy:{created_at:'asc'}});if(!row)return;
  const gateId='operations-telegram';
  await this.db.platformJob.createMany({data:[{id:gateId,locked_until:new Date(0)}],skipDuplicates:true});
  const gate=await this.db.platformJob.updateMany({where:{id:gateId,locked_until:{lte:now}},data:{locked_until:new Date(now.getTime()+1200)}});if(!gate.count)return;
  const claim=await this.db.platformOperationalEvent.updateMany({where:{id:row.id,delivered_at:null,available_at:{lte:now},OR:[{locked_until:null},{locked_until:{lt:now}}]},data:{locked_until:new Date(now.getTime()+60000),attempts:{increment:1}}});if(!claim.count)return;
  let code='TELEGRAM_UNAVAILABLE',retryMs=Math.min(3600000,30000*2**Math.min(row.attempts,7));
  try{
   // Fail closed on an accidentally configured NC bot/channel destination.
   const endpoint=`https://api.telegram.org/bot${token}`;
   const post=async(method:string,body:unknown)=>{const response=await fetchImpl(`${endpoint}/${method}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,ok:response.ok,payload:await response.json()};};
   const target=await post('getChat',{chat_id:chat});
   if(!target.ok||target.payload.ok!==true){code='TELEGRAM_CHAT_UNAVAILABLE';}
   else if(target.payload.result.type!=='channel'||target.payload.result.title!=='[crefans] operations'){code='TELEGRAM_CHANNEL_MISMATCH';}
   else{
    const lines=[`[crefans] ${labels[row.type]||row.type}`,`환경: ${this.config.get('APP_ENV')||this.config.get('NODE_ENV')||'local'}`,`접속 IP: ${row.ip||'시스템 작업'}`,`연결 IP: ${row.peer_ip||'해당 없음'}`,`시각: ${row.created_at.toISOString()}`,`기록 ID: ${row.id}`,`요청 ID: ${row.request_id||'시스템 작업'}`];
    for(const [key,value] of Object.entries(row.data as Record<string,unknown>))lines.push(`${key}: ${typeof value==='object'?JSON.stringify(value):String(value)}`);
    const sent=await post('sendMessage',{chat_id:chat,text:lines.join('\n').slice(0,3800)});
    if(sent.ok&&sent.payload.ok===true){await this.db.platformOperationalEvent.update({where:{id:row.id},data:{delivered_at:new Date(),locked_until:null,last_error_code:null}});return true;}
    if(sent.status===429){code='TELEGRAM_RATE_LIMITED';const delay=Number(sent.payload.parameters?.retry_after);if(Number.isFinite(delay)&&delay>=0)retryMs=Math.max(1200,Math.min(delay*1000,3600000));}
   }
  }catch{/* Credentials, HTTP URLs and provider payloads never enter logs. */}
  const retryAt=new Date(Math.max(Date.now(),now.getTime())+retryMs);
  if(code==='TELEGRAM_RATE_LIMITED')await this.db.platformJob.updateMany({where:{id:gateId,locked_until:{lt:retryAt}},data:{locked_until:retryAt}});
  await this.db.platformOperationalEvent.update({where:{id:row.id},data:{locked_until:null,last_error_code:code,available_at:retryAt}});
  console.error(JSON.stringify({event:'operations_delivery_failed',id:row.id,code}));return false;
 }
 async reportRun(start:Date,failures:Record<string,number>,activity:Record<string,number>,now=new Date()){
  const processed=Object.values(activity).reduce((a,b)=>a+b,0),data={failures,activity,processed,durationMs:now.getTime()-start.getTime()};
  // Every run is retained independently from notification deduplication.
  const id=`worker-run-${randomUUID()}`;
  await this.db.platformJob.create({data:{id,locked_until:now,completed_at:now,note:JSON.stringify(data)}});
  await observeAudit(this.db,{category:'worker',action:'worker.run',level:Object.keys(failures).length?'error':'info',data});
  console.log(JSON.stringify({event:'worker.run',...data}));
  if(Object.keys(failures).length||processed)await this.record(Object.keys(failures).length?'worker.error':'worker.completed',data);
  const clockId='worker-operations-hourly';
  await this.db.platformJob.upsert({where:{id:clockId},create:{id:clockId,locked_until:now,completed_at:now},update:{}});
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM platform_jobs WHERE id=${clockId} FOR UPDATE`;
   const clock=await tx.platformJob.findUniqueOrThrow({where:{id:clockId}});
   const since=clock.completed_at||now;if(now.getTime()-since.getTime()<3600000)return;
   const runs=await tx.platformJob.findMany({where:{id:{startsWith:'worker-run-'},completed_at:{gt:since,lte:now}},select:{note:true}});
   const data={runs:runs.length,failedRuns:runs.filter(r=>Object.keys(JSON.parse(r.note||'{}').failures||{}).length).length};
   const event=await tx.platformOperationalEvent.create({data:{type:'worker.hourly',data,dedupe_key:`worker-hour-${since.getTime()}`}});await auditOperation(tx,event);
   await tx.platformJob.update({where:{id:clockId},data:{completed_at:now}});
  });
  // Minimize retention of operational IPs/IDs, retaining undelivered alerts.
  const cutoff=new Date(now.getTime()-30*86400000);
  await this.db.platformJob.deleteMany({where:{id:{startsWith:'worker-run-'},completed_at:{lt:cutoff}}});
  await this.db.platformOperationalEvent.deleteMany({where:{delivered_at:{not:null},created_at:{lt:cutoff}}});
  await this.db.platformSecurityIp.deleteMany({where:{window_start:{lt:cutoff},OR:[{blocked_until:null},{blocked_until:{lt:cutoff}}]}});
 }
}
