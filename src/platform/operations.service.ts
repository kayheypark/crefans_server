import {observeAudit,safeError,auditOperation} from './audit';
import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PrismaService} from '../prisma/prisma.service';
import {requestContext} from './request-context';
import {costumeEnglishName} from './ai-photo-costume-references';
import {createHmac,randomUUID} from 'crypto';
import {DEDUPE_TYPES,DIGEST_TYPE,digestOnly,digestText,runDailyDigest,throttleError} from './operations-alert-policy';

const labels:Record<string,string>={'creator.partner_requested':'파트너 계약 요청(콘솔 로그에서 크리에이터 확인 후 모두싸인 발송)','guest.ai_usage':'비회원 AI 체험 사용량','ai-photo.failed':'AI 사진 편집 실패','ai-photo.succeeded':'AI 사진 생성 성공','guest.ai_closed':'비회원 AI 체험 오늘 상한 도달','auth.signup_mail_closed':'가입 인증 메일 오늘 상한 도달(SIGNUP_MAIL_DAILY_TOTAL)',
 'ai-photo.provider_cap':'AI 사진 공급사 호출 오늘 상한(900회) 도달 — 한국 시간 자정까지 생성 중단, 차감 없음','ai-photo.cost_warning':'AI 사진 오늘 예상 원가 주의($30 넘음)','ai-photo.cost_critical':'AI 사진 오늘 예상 원가 위험($60 넘음)',
 'creator.partner_ended':'파트너 계약 종료 — 미정산·미수금 통지됨, 기한(dueAt)까지 협의 없으면 확정 미정산 수익 전액 지급(계약 12조②)','beans.hold_review':'분쟁 결제로 크리에이터 콩 출금 보류 — 기한(dueAt)까지 결과 확인 후 해제 또는 미수금 처리, 크리에이터에게 결과 안내',
 'ai_subscription.charge_uncertain':'AI 이용권 구독 결제 결과 불명확 — 이니시스 거래조회로 승인 여부 확인 후 처리(자동 재청구 안 함)','bank_transfer.opened':'무통장 입금 대기 주문 접수 (콘솔 입금 확인에서 은행 내역과 대조)','bank_transfer.deposit_reported':'구매자가 입금했다고 알림 — 은행 내역 확인 후 콘솔에서 입금 확인','bank_transfer.expiring':'무통장 입금 기한 6시간 전 — 아직 입금 확인 안 됨','bank_transfer.expired':'무통장 입금 기한 만료로 자동 취소 (늦게 들어온 입금이 없는지 은행 내역 확인)','manual_refund.requested':'무통장 환불 이체 요청 (기한 안에 이체 후 콘솔에 완료 기록)','beans.charge_created':'콩 충전 주문','beans.charge_paid':'콩 충전 완료','beans.tip':'콩 후원','beans.promotion':'프로모션콩 지급','beans.payout_requested':'후원콩 출금 접수','beans.payout_paid':'후원콩 은행 지급 완료','beans.payout_rejected':'후원콩 은행 반려','beans.charge_disputed':'콩 충전 취소·차지백 감지','beans.ledger_mismatch':'콩 원장 대사 불일치',
 'worker.stale':'배치 실행 지연','operations.test':'운영 알림 연결 확인','member.signup':'회원가입', 'subscription.started':'멤버십 구독', 'subscription.payment_failed':'멤버십 정기결제 실패','subscription.renewed':'멤버십 정기 갱신', 'subscription.cancelled':'멤버십 구독 해지', 'subscription.resumed':'멤버십 자동 갱신 재개',
 'content.created':'콘텐츠 등록','content.updated':'콘텐츠 수정','content.deleted':'콘텐츠 삭제',
 'member.profile.updated':'회원 프로필 수정','creator.profile.updated':'크리에이터 프로필 수정','http.error':'서버 오류','worker.error':'배치 오류',
 'process.error':'프로세스 치명 오류','worker.completed':'배치 처리 완료','worker.hourly':'배치 1시간 요약',
 'disk.warning':'디스크 사용률 경고','disk.critical':'디스크 사용률 위험','disk.recovered':'디스크 사용률 회복',
 'security.injection_detected':'인젝션 시도 감지','security.ip_blocked':'공격 IP 자동 차단','security.ip_released':'IP 차단 만료',
 // 2026-11-18: types that used to show their raw English name.
 'payment.reconciliation_required':'결제 대사 필요 — PG 상태가 결제 완료와 다름(콘솔에서 확인)','payment.external_cancel':'PG에서 결제 취소 감지 — 환불 처리됨','payment.stuck':'결제 승인 처리 30분 넘게 멈춤','refund.stuck':'환불 처리 30분 넘게 멈춤','beans.charge_stuck':'콩 충전 처리 30분 넘게 멈춤','beans.refunded':'콩 충전 환불 완료',
 'referral.rewarded':'친구 초대 보상 지급','referral.clawed_back':'친구 초대 보상 회수','marketing.uncertain':'광고성 정보 발송 결과 불명확',
 'media.watermark_failed':'워터마크 변환 실패 건 남아 있음','media.watermark_stuck':'워터마크 변환 멈춤','media.watermark_skipped':'워터마크 건너뜀(핸들 형식 확인 필요)','media.transcode_stuck':'아이폰 영상 변환 30분 넘게 대기','media.transcode_failed':'아이폰 영상 변환 실패(최근 1시간)',
 'audit.retention_lagging':'요청 감사 로그 보관기한 파기 지연','alerts.backlog':'운영 알림 15분 넘게 미전송','worker.stalled':'배치 15분 넘게 멈춤 — 프로세스 재시작',
 'admin.inquiry_replied':'운영자 문의 답변','admin.report_resolved':'운영자 신고 처리','admin.document_saved':'운영자 공지·FAQ 저장','operations.daily_digest':'운영 일일 요약',
 'funnel.landing_view':'랜딩 방문','share.clicked':'공유 버튼','share.cap':'오늘 공유 알림 상한 도달(200건) — 오늘 남은 공유는 알림 안 보냄','funnel.landing_test':'랜딩 방문','funnel.landing_cap':'오늘 랜딩 알림 상한 도달(100건) — 오늘 남은 방문은 집계만 하고 알림 안 보냄',
};
const allowed=new Set(['limit','calls','estimatedUsd','thresholdUsd','ip','stage','provider','actor','count','blockedUntil','rule','action','status','method','route','errorType','errorCode','job','runs','failedRuns','processed','durationMs','used','mode','style','kinds','presets','costumeIds','references','failures','activity','fingerprint','release','사용률','여유','전체','기준','검사시각','방문 시각(KST)','랜딩','유입','기기','오늘 랜딩 방문','사유','시각(KST)','위치','방식','결과','게시물','오늘 공유']);
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
/** Telegram is outside the service (overseas transfer): member identifiers leave only as a keyed hash (2026-11-02 user decision).
 * Operators find the raw value through 기록 ID in the console log. */
// 2026-11-18 user decision: bank transfer alerts (bank_transfer.*) do not carry the buyer's IP either; the console log keeps it.
// 2026-11-18 랜딩 방문 알림 상한 알림은 IP 없음. 방문 알림 자체는 같은 날 사용자 지시로 접속 IP 포함(아래 LANDING_TYPES).
const NO_IP_TYPES=new Set(['share.cap','ai-photo.succeeded','ai-photo.provider_cap','ai-photo.cost_warning','ai-photo.cost_critical','funnel.landing_cap']),noIp=(type:string)=>NO_IP_TYPES.has(type)||type.startsWith('bank_transfer.');
// 2026-11-18 user decision: landing alerts show only the trusted client IP, marked (집) when it is in OWNER_HOME_IPS (comma-separated).
// 2026-11-18 user decision ("이미지 생성 실패 모두 아이피를 텔레그램으로"): every ai-photo.failed shows the client IP the same way
// (privacy policy 9조: 운영 오류 알림에 접속 IP 포함). Success and cost alerts still carry none.
// 2026-11-19: 공유 버튼 알림도 랜딩 알림처럼 접속 IP만 표시한다(같은 방문자를 랜딩 알림과 맞춰 보기 위해).
const CLIENT_IP_TYPES=new Set(['funnel.landing_view','funnel.landing_test','ai-photo.failed','share.clicked']);
const KIND_LABELS:Record<string,string>={bean:'콩 충전','ai-shop':'AI 이용권',ad:'광고상품'};
function photoAlertData(data:Record<string,unknown>):Record<string,unknown>{
 const {costumeIds,presets,...rest}=data;
 const ids=typeof costumeIds==='string'?costumeIds.split(','):[];
 const otherPresets=typeof presets==='string'?presets.split(', '):[];
 // Older queued success events stored outfits at the beginning of the presets string.
 if(costumeIds===undefined){
  while(otherPresets[0]?.startsWith('outfit:'))ids.push(otherPresets.shift()!.slice('outfit:'.length));
 }
 const names=ids.map(costumeEnglishName).filter(Boolean);
 if(names.length)rest['의상']=names.join(', ');
 const remaining=otherPresets.join(', ');
 if(typeof presets==='string' && (!names.length || (remaining && remaining!=='없음')))rest.presets=remaining||'없음';
 return rest;
}
export function operationsAlertText(row:{type:string;ip:string|null;peer_ip:string|null;created_at:Date;id:string;request_id:string|null;data:unknown},env:string,secret?:string,homeIps=''){
 const hidden=(value:unknown)=>secret?'h:'+createHmac('sha256',secret).update(`operations-alert:${String(value)}`).digest('hex').slice(0,12):'(숨김)';
 const home=!!row.ip&&homeIps.split(',').map(s=>s.trim()).includes(row.ip),data=row.data as Record<string,unknown>,reason=typeof data?.['사유']==='string'?data['사유']:'';
 const ipLines=CLIENT_IP_TYPES.has(row.type)?[`접속 IP: ${row.ip||'알 수 없음'}${home?' (집)':''}`]:noIp(row.type)?['접속 IP: 보내지 않음']:[`접속 IP: ${row.ip||'시스템 작업'}`,`연결 IP: ${row.peer_ip||'해당 없음'}`];
 const lines=[...(reason?[`사유: ${reason}`]:[]),`[crefans] ${labels[row.type]||row.type}`,`환경: ${env}`,...ipLines,`시각: ${row.created_at.toISOString()}`,`기록 ID: ${row.id}`,`요청 ID: ${row.request_id||'시스템 작업'}`];
 const display=row.type==='ai-photo.succeeded'||row.type==='ai-photo.failed'?photoAlertData(data):data;
 for(const [key,value] of Object.entries(display))if(key!=='사유')lines.push(`${key==='productName'?'상품':key}: ${key==='kind'&&typeof value==='string'&&KIND_LABELS[value]?KIND_LABELS[value]:key==='amount'&&typeof value==='number'?`${value.toLocaleString('ko-KR')}원`:['memberId','creatorId'].includes(key)?hidden(value):typeof value==='object'?JSON.stringify(value):String(value)}`);
 return lines.join('\n').slice(0,3800);
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
   // iPhone video conversion (2026-11-01): waiting over 30 minutes, or failed within the last hour.
   ['media.watermark_failed',()=>this.db.mediaWatermarkJob.count({where:{status:'failed'}})],
   ['media.watermark_stuck',()=>this.db.mediaWatermarkJob.count({where:{status:'processing',locked_until:{lt:now}}})],
   ['media.transcode_stuck',()=>this.db.media.count({where:{type:'VIDEO',mime_type:'video/quicktime',processing_status:'PROCESSING',is_deleted:false,created_at:{lt:ago(30)}}})],
   ['media.transcode_failed',()=>this.db.media.count({where:{type:'VIDEO',mime_type:'video/quicktime',processing_status:'FAILED',updated_at:{gte:ago(60)}}})],
   ['audit.retention_lagging',()=>Number.isInteger(access)&&access>0?this.db.platformAuditLog.count({where:{category:'request',actor_role:null,occurred_at:{lt:new Date(+now-(access+2)*86400000)}}}):Promise.resolve(0)],
   ...(this.config.get('TELEGRAM_OPERATIONS_BOT_TOKEN')?[['alerts.backlog',()=>this.db.platformOperationalEvent.count({where:{delivered_at:null,created_at:{lt:ago(15)}}})] as [string,()=>Promise<number>]]:[]),
  ];
  for(const [type,count] of checks){const pending=await count();if(pending>0)await this.record(type,{job:'watchdog',status:'backlog',count:pending},`${type}:${hour}`);}
 }
 // omitIp: the alert leaves the service (Telegram), so events that promise no IP keep it out of the stored row too (2026-11-16 AI photo failures).
 async record(type:string,data:Record<string,unknown>,dedupeKey?:string,options:{omitIp?:boolean}={}){
  const stored=requestContext.getStore(),context=options.omitIp&&stored?{...stored,ip:'',peerIp:''}:stored,safe=metadata(data);
  console.log(JSON.stringify({event:type,...context,data:safe}));
  try{return await this.db.$transaction(async tx=>{let row:any={type,data:safe,ip:context?.ip||null,peer_ip:context?.peerIp||null,request_id:context?.requestId||null,dedupe_key:dedupeKey||null,...digestOnly(type)};if(!dedupeKey&&DEDUPE_TYPES.has(type))row={...row,...await throttleError(tx,type,safe)};const saved=dedupeKey?await tx.platformOperationalEvent.upsert({where:{dedupe_key:dedupeKey},create:row,update:{}}):await tx.platformOperationalEvent.create({data:row});await auditOperation(tx,saved);return saved;});}
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
    const text=row.type===DIGEST_TYPE?digestText(row,this.config.get('APP_ENV')||this.config.get('NODE_ENV')||'local',labels):operationsAlertText(row,this.config.get('APP_ENV')||this.config.get('NODE_ENV')||'local',this.config.get<string>('LOCAL_AUTH_SECRET'),this.config.get<string>('OWNER_HOME_IPS')||'');
    const sent=await post('sendMessage',{chat_id:chat,text});
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
  // 2026-11-05 user decision: routine successful runs are not sent to Telegram; failures go out at once, work totals in the hourly summary.
  if(Object.keys(failures).length)await this.record('worker.error',data);
  const clockId='worker-operations-hourly';
  await this.db.platformJob.upsert({where:{id:clockId},create:{id:clockId,locked_until:now,completed_at:now},update:{}});
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM platform_jobs WHERE id=${clockId} FOR UPDATE`;
   const clock=await tx.platformJob.findUniqueOrThrow({where:{id:clockId}});
   const since=clock.completed_at||now;if(now.getTime()-since.getTime()<3600000)return;
   const runs=await tx.platformJob.findMany({where:{id:{startsWith:'worker-run-'},completed_at:{gt:since,lte:now}},select:{note:true}});
   const notes=runs.map(r=>JSON.parse(r.note||'{}'));
   const data={runs:runs.length,failedRuns:notes.filter(n=>Object.keys(n.failures||{}).length).length,processed:notes.reduce((sum,n)=>sum+(Number(n.processed)||0),0)};
   const event=await tx.platformOperationalEvent.create({data:{type:'worker.hourly',data,dedupe_key:`worker-hour-${since.getTime()}`,...digestOnly('worker.hourly',now)}});await auditOperation(tx,event);
   await tx.platformJob.update({where:{id:clockId},data:{completed_at:now}});
  });
  await runDailyDigest(this.db,now);
  // Minimize retention of operational IPs/IDs, retaining undelivered alerts.
  const cutoff=new Date(now.getTime()-30*86400000);
  await this.db.platformJob.deleteMany({where:{id:{startsWith:'worker-run-'},completed_at:{lt:cutoff}}});
  await this.db.platformJob.deleteMany({where:{id:{startsWith:'alert-dedupe:'},completed_at:{lt:cutoff}}});
  await this.db.platformOperationalEvent.deleteMany({where:{delivered_at:{not:null},created_at:{lt:cutoff}}});
  await this.db.platformSecurityIp.deleteMany({where:{window_start:{lt:cutoff},OR:[{blocked_until:null},{blocked_until:{lt:cutoff}}]}});
 }
}
