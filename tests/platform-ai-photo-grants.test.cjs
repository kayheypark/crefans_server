require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'r'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config'),{PlatformModule}=require('../dist/src/platform/module'),{PlatformService}=require('../dist/src/platform/service'),{PlatformAuthService}=require('../dist/src/platform/auth.service'),{LegalDocumentsService}=require('../dist/src/platform/legal-documents'),{publishedCatalog}=require('./legal-fixture.cjs'),{lockHandlePolicy}=require('../dist/src/platform/handles'),{cookieParser,originGuard}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials');
// Studio AI photo editor allow-list (2026-11-08): console grant/revoke with reasons, history and audit; permissions under `members`.
const {aiPhotoAllowed}=require('../dist/src/platform/ai-photo-grants');
const tag=crypto.randomBytes(3).toString('hex'),prefix='ap_'+tag+'_',members=[],admins=[],cookies={},ui='http://127.0.0.1:3003';let app,base,release,creatorA,creatorB,inactive;
async function api(path,body,user='super',method=body?'POST':'GET',withOrigin=true){const r=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(withOrigin?{Origin:path.startsWith('/admin')?ui:'http://127.0.0.1:3011'}:{}),...(cookies[user]?{Cookie:cookies[user]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
async function makeCreator(handle,active=true){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@ai-photo.test.invalid',name:'AI QA',nickname:'AI QA',preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{user_id:id,handle,display_name:'AI 사진 QA '+handle.slice(-1),is_active:active}});return id;}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 creatorA=await makeCreator(prefix+'a');creatorB=await makeCreator(prefix+'b');inactive=await makeCreator(prefix+'x',false);
 for(const [key,role,permissions]of[['super','SUPER_ADMIN',undefined],['viewer','MODERATOR',{members:{view:true}}],['editor','MODERATOR',{members:{view:true,update:true}}],['none','MODERATOR',{}]]){const a=await db.admin.create({data:{user_sub:crypto.randomUUID(),email:crypto.randomUUID()+'@ai-photo.test.invalid',name:'AI 운영 QA '+key,role,...(permissions?{permissions}:{})}});admins.push(a);cookies[key]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use(originGuard(['http://127.0.0.1:3011'],[ui]));app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:crypto.randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();try{await db.aiPhotoGrant.deleteMany({where:{creator_user_id:{in:members}}});await db.aiPhotoGrantChange.deleteMany({where:{creator_user_id:{in:members}}});await db.platformAuditLog.deleteMany({where:{OR:[{actor_id:{in:admins.map(a=>a.user_sub)}},{entity_id:{in:members}}]}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.memberSession.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.admin.deleteMany({where:{id:{in:admins.map(a=>a.id)}}});}finally{await db.$disconnect();await release?.();}});

test('permissions: members.view lists, members.update grants and revokes; others, member sessions and missing Origin are refused',async()=>{
 for(const user of ['anonymous','none'])assert.equal((await api('/admin/ai-photo-grants',undefined,user)).status,user==='none'?403:401);
 assert.equal((await api('/admin/ai-photo-grants',undefined,'viewer')).status,200);
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'a',reason:'권한 없음 QA'},'viewer')).status,403);
 assert.equal((await api('/admin/ai-photo-grants/'+creatorA,{reason:'권한 없음 QA'},'viewer','DELETE')).status,403);
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'a',reason:'Origin 없음 QA'},'editor','POST',false)).status,403);
 assert.equal(await aiPhotoAllowed(db,creatorA),false);
});

test('grant: handle normalized, reason required, inactive/unknown refused, duplicate 409, list shows who and why',async()=>{
 for(const body of [{handle:prefix+'a',reason:''},{handle:prefix+'a',reason:'가'.repeat(501)},{handle:'',reason:'정상 사유'},{handle:'관리자!',reason:'정상 사유'}])assert.equal((await api('/admin/ai-photo-grants',body,'editor')).status,400,JSON.stringify(body));
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'x',reason:'비활성 QA'},'editor')).errorCode,'CREATOR_NOT_FOUND');
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'missing',reason:'없음 QA'},'editor')).errorCode,'CREATOR_NOT_FOUND');
 const ok=await api('/admin/ai-photo-grants',{handle:' @'+(prefix+'a').toUpperCase()+' ',reason:'코스프레 시범 운영'},'editor');assert.equal(ok.status,201,JSON.stringify(ok));assert.equal(ok.data.creatorId,creatorA);
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'a',reason:'중복 QA'},'editor')).errorCode,'ALREADY_GRANTED');
 assert.equal(await aiPhotoAllowed(db,creatorA),true);assert.equal(await aiPhotoAllowed(db,creatorB),false);
 const list=await api('/admin/ai-photo-grants?search='+prefix,undefined,'viewer');assert.equal(list.data.total,1);
 const row=list.data.items[0];assert.equal(row.handle,prefix+'a');assert.equal(row.reason,'코스프레 시범 운영');assert.equal(row.grantedByName,'AI 운영 QA editor');assert.ok(!('email'in row));
 assert.equal((await api('/admin/ai-photo-grants?search='+encodeURIComponent('코스프레 시범'),undefined,'viewer')).data.items.some(r=>r.creatorId===creatorA),true);
});

test('revoke: reason required, unknown 404, row removed, history and audit kept without reason text',async()=>{
 assert.equal((await api('/admin/ai-photo-grants/'+creatorA,{reason:''},'editor','DELETE')).status,400);
 assert.equal((await api('/admin/ai-photo-grants/'+creatorB,{reason:'없는 허용 QA'},'editor','DELETE')).errorCode,'GRANT_NOT_FOUND');
 const r=await api('/admin/ai-photo-grants/'+creatorA,{reason:'시범 종료'},'editor','DELETE');assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(await aiPhotoAllowed(db,creatorA),false);
 const history=await api('/admin/ai-photo-grants/'+creatorA+'/history',undefined,'viewer');
 assert.deepEqual(history.data.items.map(i=>[i.action,i.reason,i.changedByName]),[['revoked','시범 종료','AI 운영 QA editor'],['granted','코스프레 시범 운영','AI 운영 QA editor']]);
 const audits=await db.platformAuditLog.findMany({where:{entity_id:creatorA},orderBy:{occurred_at:'asc'}});
 assert.deepEqual(audits.map(a=>a.action),['admin.ai_photo_granted','admin.ai_photo_revoked']);
 const raw=JSON.stringify(audits);assert.ok(!raw.includes('시범 종료')&&!raw.includes('코스프레 시범'),'reason text must not be in the audit log');assert.match(raw,/"status":"revoked"/);
});

// 2026-11-13 user request: console resets today's AI photo usage per creator and for everyone. The service-wide cap stays.
test('quota reset: list shows today usage, per-creator and all reset need a reason, keep history/audit and leave the total cap alone',async()=>{
 const {LocalMemberService}=require('../dist/src/auth/local/local-member.service'),{AiPhotoService}=require('../dist/src/platform/ai-photo'),{aiPhotoUsageId}=require('../dist/src/platform/ai-photo-grants');
 const limiter=app.get(LocalMemberService),photos=app.get(AiPhotoService),charge=async(id,n)=>{for(let i=0;i<n;i++)await limiter.limit('ai-photo:creator-day:'+id,1000,86400);};
 const used=id=>photos['used']('ai-photo:creator-day:'+id),totalId=digest('ai-photo:total:'+Math.floor(Date.now()/86400000));
 try{
  for(const h of ['a','b'])if(!await aiPhotoAllowed(db,h==='a'?creatorA:creatorB))assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+h,reason:'횟수 초기화 QA'},'editor')).status,201);
  await charge(creatorA,3);await limiter.limit('ai-photo:total',100000,86400);const totalBefore=(await db.authRateBucket.findUnique({where:{id:totalId}})).count;
  assert.equal(aiPhotoUsageId(creatorA),digest('ai-photo:creator-day:'+creatorA+':'+Math.floor(Date.now()/86400000)),'same bucket the service charges');
  const list=(await api('/admin/ai-photo-grants?search='+prefix,undefined,'viewer')).data,rowA=list.items.find(r=>r.creatorId===creatorA),rowB=list.items.find(r=>r.creatorId===creatorB);
  assert.equal(rowA.usedToday,3);assert.equal(rowA.remaining,list.dailyLimit-3);assert.equal(rowB.usedToday,0);
  assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/quota-reset',{reason:'권한 없음'},'viewer')).status,403);
  assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/quota-reset',{reason:''},'editor')).status,400);
  assert.equal((await api('/admin/ai-photo-grants/'+creatorB+'/quota-reset',{reason:'사용 없음 QA'},'editor')).errorCode,'NOTHING_TO_RESET');
  assert.equal((await api('/admin/ai-photo-grants/'+inactive+'/quota-reset',{reason:'미허용 QA'},'editor')).errorCode,'GRANT_NOT_FOUND');
  const one=await api('/admin/ai-photo-grants/'+creatorA+'/quota-reset',{reason:'촬영 일정 추가 사용'},'editor');assert.equal(one.status,201,JSON.stringify(one));
  assert.equal(await used(creatorA),0,'the service sees a fresh day');
  await charge(creatorA,2);await charge(creatorB,1);
  for(const confirm of [undefined,'전체초기화','초기화'])assert.equal((await api('/admin/ai-photo-grants/quota-reset',{reason:'전체 QA',confirm},'editor')).errorCode,'CONFIRMATION_REQUIRED');
  assert.equal(await used(creatorA),2,'a refused reset-all changes nothing');
  assert.equal((await api('/admin/ai-photo-grants/quota-reset',{reason:'권한 없음',confirm:'전체 초기화'},'viewer')).status,403);
  const all=await api('/admin/ai-photo-grants/quota-reset',{reason:'점검 후 전체 복구',confirm:'전체 초기화'},'editor');assert.equal(all.status,201,JSON.stringify(all));assert.ok(all.data.resetCount>=2);
  assert.equal(await used(creatorA),0);assert.equal(await used(creatorB),0);
  assert.equal((await db.authRateBucket.findUnique({where:{id:totalId}})).count,totalBefore,'service-wide daily cap is not reset');
  const history=(await api('/admin/ai-photo-grants/'+creatorA+'/history',undefined,'viewer')).data.items.slice(0,2).map(i=>[i.action,i.reason]);
  assert.deepEqual(history,[['quota_reset_all','점검 후 전체 복구'],['quota_reset','촬영 일정 추가 사용']]);
  const audits=await db.platformAuditLog.findMany({where:{action:{in:['admin.ai_photo_quota_reset','admin.ai_photo_quota_reset_all']},actor_id:{in:admins.map(a=>a.user_sub)}}});
  assert.deepEqual(audits.map(a=>a.action).sort(),['admin.ai_photo_quota_reset','admin.ai_photo_quota_reset_all']);
  const raw=JSON.stringify(audits);assert.ok(!raw.includes('촬영 일정')&&!raw.includes('점검 후'),'reason text must not be in the audit log');
 }finally{await db.authRateBucket.deleteMany({where:{id:{in:[creatorA,creatorB].map(id=>aiPhotoUsageId(id))}}});await db.$executeRaw`UPDATE auth_rate_buckets SET count=GREATEST(count-1,0) WHERE id=${totalId}`;}
});

// 2026-11-13 user decisions: storable reset tickets — console grants N (30-day expiry), creator spends one any time (no daily cap)
// to clear today's usage; oldest expiry first; expired/revoked batches do not count; total cap untouched.
test('reset tickets: grant/revoke with reasons, creator use clears today, oldest expiry first, expired and revoked excluded',async()=>{
 const {LocalMemberService}=require('../dist/src/auth/local/local-member.service'),{AiPhotoService}=require('../dist/src/platform/ai-photo'),{aiPhotoUsageId}=require('../dist/src/platform/ai-photo-grants'),{useAiPhotoTicket}=require('../dist/src/platform/ai-photo-tickets');
 const limiter=app.get(LocalMemberService),photos=app.get(AiPhotoService),charge=async(id,n)=>{for(let i=0;i<n;i++)await limiter.limit('ai-photo:creator-day:'+id,1000,86400);};
 const used=id=>photos['used']('ai-photo:creator-day:'+id),totalId=digest('ai-photo:total:'+Math.floor(Date.now()/86400000));
 const tickets=id=>api('/admin/ai-photo-grants/'+id+'/tickets',undefined,'viewer');
 try{
  for(const h of ['a','b'])if(!await aiPhotoAllowed(db,h==='a'?creatorA:creatorB))assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+h,reason:'리셋권 QA'},'editor')).status,201);
  assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/tickets',{quantity:2,reason:'권한 없음'},'viewer')).status,403);
  for(const quantity of [0,101,1.5,'x'])assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/tickets',{quantity,reason:'수량 QA'},'editor')).errorCode,'INVALID_QUANTITY',String(quantity));
  assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/tickets',{quantity:2,reason:''},'editor')).status,400);
  assert.equal((await api('/admin/ai-photo-grants/'+inactive+'/tickets',{quantity:2,reason:'미허용 QA'},'editor')).errorCode,'GRANT_NOT_FOUND');
  const g=await api('/admin/ai-photo-grants/'+creatorA+'/tickets',{quantity:2,reason:'화보 촬영 지원'},'editor');assert.equal(g.status,201,JSON.stringify(g));
  const days=(new Date(g.data.expiresAt)-Date.now())/86400000;assert.ok(days>29.9&&days<=30,'expires 30 days after granting');
  // an older batch expiring sooner is used first; an expired batch never counts
  const soon=await db.aiPhotoResetTicket.create({data:{creator_user_id:creatorA,quantity:1,remaining:1,reason:'만료 임박 QA',expires_at:new Date(Date.now()+3600000)}});
  await db.aiPhotoResetTicket.create({data:{creator_user_id:creatorA,quantity:5,remaining:5,reason:'만료 QA',expires_at:new Date(Date.now()-1000)}});
  let t=(await tickets(creatorA)).data;assert.equal(t.summary.count,3);assert.equal(new Date(t.summary.nextExpiresAt).getTime(),soon.expires_at.getTime());
  assert.deepEqual(t.items.map(i=>i.status).sort(),['active','active','expired']);
  const row=(await api('/admin/ai-photo-grants?search='+prefix,undefined,'viewer')).data.items.find(r=>r.creatorId===creatorA);assert.equal(row.resetTickets,3);
  // creator side: nothing used yet -> refused without spending
  await assert.rejects(useAiPhotoTicket(db,creatorA),e=>e.getResponse().code==='NOTHING_TO_RESET');
  await charge(creatorA,10);await limiter.limit('ai-photo:total',100000,86400);const totalBefore=(await db.authRateBucket.findUnique({where:{id:totalId}})).count;
  const r1=await useAiPhotoTicket(db,creatorA);assert.equal(r1.usedBefore,10);assert.equal(r1.tickets.count,2);assert.equal(await used(creatorA),0);
  assert.equal((await db.aiPhotoResetTicket.findUnique({where:{id:soon.id}})).remaining,0,'oldest expiry spent first');
  // no daily cap: use again the same day after more usage; two concurrent taps spend at most what is needed
  await charge(creatorA,3);const both=await Promise.allSettled([useAiPhotoTicket(db,creatorA),useAiPhotoTicket(db,creatorA)]);
  assert.equal(both.filter(x=>x.status==='fulfilled').length,1,'second concurrent tap finds nothing to reset');assert.equal((await ticketCountOf(creatorA)),1);
  assert.equal((await db.authRateBucket.findUnique({where:{id:totalId}})).count,totalBefore,'service-wide cap untouched');
  // revoke the remaining active batch; then nothing left
  const active=(await tickets(creatorA)).data.items.find(i=>i.status==='active');
  assert.equal((await api('/admin/ai-photo-grants/'+creatorB+'/tickets/'+active.id+'/revoke',{reason:'다른 사람'},'editor')).errorCode,'TICKET_NOT_FOUND');
  assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/tickets/'+active.id+'/revoke',{reason:'지원 종료'},'editor')).status,201);
  assert.equal((await api('/admin/ai-photo-grants/'+creatorA+'/tickets/'+active.id+'/revoke',{reason:'두 번'},'editor')).errorCode,'TICKET_NOT_ACTIVE');
  t=(await tickets(creatorA)).data;assert.equal(t.summary.count,0);assert.equal(t.items.find(i=>i.id===active.id).revokeReason,'지원 종료');
  await charge(creatorA,1);await assert.rejects(useAiPhotoTicket(db,creatorA),e=>e.getResponse().code==='NO_TICKET');
  // a creator who is not allow-listed cannot spend
  await assert.rejects(useAiPhotoTicket(db,inactive),e=>e.getResponse().code==='AI_PHOTO_NOT_ALLOWED');
  const history=(await api('/admin/ai-photo-grants/'+creatorA+'/history',undefined,'viewer')).data.items.map(i=>i.action);
  for(const a of ['ticket_granted','ticket_used','ticket_revoked'])assert.ok(history.includes(a),a);
  const audits=await db.platformAuditLog.findMany({where:{entity_id:creatorA,action:{in:['admin.ai_photo_tickets_granted','admin.ai_photo_tickets_revoked','studio.ai_photo_ticket_used']}}});
  assert.deepEqual([...new Set(audits.map(a=>a.action))].sort(),['admin.ai_photo_tickets_granted','admin.ai_photo_tickets_revoked','studio.ai_photo_ticket_used']);
  assert.ok(!JSON.stringify(audits).includes('화보 촬영 지원'),'reason text not in audit');
 }finally{await db.authRateBucket.deleteMany({where:{id:{in:[creatorA,creatorB].map(id=>aiPhotoUsageId(id))}}});await db.$executeRaw`UPDATE auth_rate_buckets SET count=GREATEST(count-1,0) WHERE id=${totalId}`;
  await db.aiPhotoResetTicketUse.deleteMany({where:{creator_user_id:{in:members}}});await db.aiPhotoResetTicket.deleteMany({where:{creator_user_id:{in:members}}});}
 async function ticketCountOf(id){return (await require('../dist/src/platform/ai-photo-tickets').ticketSummary(db,id)).count;}
});
