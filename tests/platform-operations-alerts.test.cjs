require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-18 user decision (중복 제거 + 하루 요약). Runs on the isolated crefans_platform_e2e DB; Telegram is a stub, never called for real.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const source=process.env.DATABASE_URL,url=new URL(source);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3307');assert.equal(url.pathname,'/crefans_platform_dev');
url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
const {PlatformOperationsService,operationsAlertText}=require('../dist/src/platform/operations.service');
const {enqueueOperation}=require('../dist/src/platform/operations-events');
const policy=require('../dist/src/platform/operations-alert-policy');
const db=new PrismaClient(),scope=randomUUID(),ids=new Set(),all=new Set(),jobs=new Set(),gate='gate-'+scope;
// Same isolation as platform-operations.test.cjs: a private send gate and dispatch limited to this test's rows.
const scoped=new Proxy(db,{get(target,key){
 if(key==='platformJob')return new Proxy(target[key],{get(delegate,method){const value=delegate[method];return typeof value==='function'?(args)=>{if(method==='createMany'&&args?.data?.[0]?.id==='operations-telegram')args={...args,data:args.data.map(r=>({...r,id:gate}))};if(args?.where?.id==='operations-telegram')args={...args,where:{...args.where,id:gate}};return value.call(delegate,args);}:value;}});
 if(key==='platformOperationalEvent')return new Proxy(target[key],{get(delegate,method){if(method==='findFirst')return args=>delegate.findFirst({...args,where:{...args.where,id:{in:[...ids]}}});const value=delegate[method];return typeof value==='function'?value.bind(delegate):value;}});
 const value=target[key];return typeof value==='function'?value.bind(target):value;}});
const ops=new PlatformOperationsService(scoped,new ConfigService({TELEGRAM_OPERATIONS_BOT_TOKEN:'test-only',TELEGRAM_OPERATIONS_CHAT_ID:'test-only',APP_ENV:'synthetic'}));
const chat={status:200,ok:true,json:async()=>({ok:true,result:{type:'channel',title:'[crefans] operations'}})},ok={status:200,ok:true,json:async()=>({ok:true,result:{message_id:1}})};
async function drain(){const sent=[];let t=Date.now();for(let i=0;i<500;i++){t+=2000;const r=await ops.flush(new Date(t),async(u,o)=>{if(u.endsWith('/sendMessage'))sent.push(JSON.parse(o.body).text);return u.endsWith('/getChat')?chat:ok;});if(r===undefined&&!await db.platformOperationalEvent.count({where:{id:{in:[...ids]},delivered_at:null}}))break;}return sent;}
const fail=(job,code='SYNTH_FAIL')=>Object.assign(new Error('private message must not leak'),{getResponse:()=>({code})});
const track=row=>{ids.add(row.id);all.add(row.id);return row;};
let release;
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);});
after(async()=>{try{await db.platformOperationalEvent.deleteMany({where:{id:{in:[...all]}}});await db.platformJob.deleteMany({where:{id:{in:[...jobs,gate]}}});}finally{await db.$disconnect();await release?.();}});

test('same error 10x in an hour: one alert, nine stored as suppressed, the next alert reports the repeat count',async()=>{
 const job='synthetic-'+scope,error=fail(job);
 for(let i=0;i<10;i++)track(await ops.error('worker.error',error,{job}));
 const rows=await db.platformOperationalEvent.findMany({where:{id:{in:[...ids]}},orderBy:{created_at:'asc'}});
 assert.equal(rows.length,10);assert.equal(rows.filter(r=>!r.delivered_at).length,1);assert.equal(rows.filter(r=>r.last_error_code==='SUPPRESSED_DUPLICATE').length,9);
 const group=policy.dedupeGroup('worker.error',rows[0].data);jobs.add(group);assert.doesNotMatch(group,new RegExp(scope),'group id is a hash');
 const sent=await drain();assert.equal(sent.length,1,'ten identical errors send one message');assert.doesNotMatch(sent[0],/반복|private message/);
 // An hour later the same error alerts again and carries the suppressed count.
 await db.platformJob.update({where:{id:group},data:{completed_at:new Date(Date.now()-61*60000)}});
 const next=track(await ops.error('worker.error',error,{job}));assert.equal(next.delivered_at,null);assert.match(next.data['반복'],/ 9회 더 발생/);
 const [text]=await drain();assert.match(text,/^반복: 직전 알림\(.+ KST\) 이후 9회 더 발생/m);assert.match(text,new RegExp(`job: ${job}`));
 const again=track(await ops.error('worker.error',error,{job}));assert.equal(again.last_error_code,'SUPPRESSED_DUPLICATE','window restarted at the resend');
});

test('different errors (job, route or code) are each sent',async()=>{
 const before=[...ids];
 const a=track(await ops.error('worker.error',fail(),{job:'a-'+scope})),b=track(await ops.error('worker.error',fail(),{job:'b-'+scope})),c=track(await ops.error('worker.error',fail('a','OTHER_CODE'),{job:'a-'+scope}));
 const h1=track(await ops.error('http.error',fail(),{status:500,method:'GET',route:'/synthetic/'+scope+'/1'})),h2=track(await ops.error('http.error',fail(),{status:500,method:'GET',route:'/synthetic/'+scope+'/2'}));
 for(const r of[a,b,c,h1,h2]){assert.equal(r.delivered_at,null,r.data.job||r.data.route);jobs.add(policy.dedupeGroup(r.type,r.data));}
 for(const id of before)ids.delete(id);const sent=await drain();assert.equal(sent.length,5);
});

test('money, bank transfer, order, payout, security and AI cost alerts are never suppressed or digested',async()=>{
 const money=['bank_transfer.opened','bank_transfer.deposit_reported','manual_refund.requested','beans.tip','beans.charge_paid','beans.payout_requested','beans.charge_disputed','payment.external_cancel','payment.reconciliation_required','subscription.started','subscription.payment_failed','ai_subscription.charge_uncertain','referral.rewarded'];
 for(const type of money){
  assert.ok(!policy.DIGEST_TYPES.has(type)&&!policy.DEDUPE_TYPES.has(type),type);
  for(let i=0;i<10;i++){const row=track(await db.$transaction(tx=>enqueueOperation(tx,type,{targetId:scope,amount:1000})));assert.equal(row.delivered_at,null,type);assert.equal(row.last_error_code,null,type);}
 }
 for(const type of['security.ip_blocked','guest.ai_closed','guest.ai_usage'])for(let i=0;i<3;i++){const row=track(await ops.record(type,{ip:'198.51.100.1',used:50+i,limit:300}));assert.equal(row.delivered_at,null,type);}
 for(const t of policy.DIGEST_TYPES)assert.doesNotMatch(t,/^(bank_transfer|manual_refund|beans|payment|refund|subscription|security|ai_subscription|referral|guest)\./,t);
 // Control: an informational type is digested (stored, handled, not sent).
 const info=track(await db.$transaction(tx=>enqueueOperation(tx,'content.created',{targetId:scope})));assert.ok(info.delivered_at);assert.equal(info.last_error_code,'DIGESTED');
 const pending=await db.platformOperationalEvent.count({where:{id:{in:[...ids]},delivered_at:null}});assert.equal(pending,money.length*10+9);
 const sent=await drain();assert.equal(sent.length,pending);assert.ok(!sent.some(t=>t.includes('콘텐츠 등록')));
});

// 2026-11-18 user decision (revised): signups stay immediate and every AI photo failure is sent, even when identical.
test('ai-photo.failed is never deduped: ten identical failures send ten alerts; member.signup is sent immediately',async()=>{
 const before=[...ids];for(const id of before)ids.delete(id);
 assert.ok(!policy.DEDUPE_TYPES.has('ai-photo.failed')&&!policy.DIGEST_TYPES.has('ai-photo.failed'));assert.ok(!policy.DIGEST_TYPES.has('member.signup')&&!policy.DEDUPE_TYPES.has('member.signup'));
 assert.ok(!policy.DIGEST_TYPES.has('ai-photo.succeeded')&&!policy.DEDUPE_TYPES.has('ai-photo.succeeded'));
 const data={errorCode:'SYNTH_'+scope.slice(0,8).toUpperCase(),status:502,stage:'generation',provider:'seedream',errorType:'none',actor:'member',durationMs:10};
 for(let i=0;i<10;i++){const row=track(await ops.record('ai-photo.failed',data));assert.equal(row.delivered_at,null);assert.equal(row.last_error_code,null);}
 assert.equal(await db.platformJob.count({where:{id:policy.dedupeGroup('ai-photo.failed',data)}}),0,'no dedupe lock row');
 const signup=track(await db.$transaction(tx=>enqueueOperation(tx,'member.signup',{memberId:scope})));assert.equal(signup.delivered_at,null);assert.equal(signup.last_error_code,null);
 const success=track(await ops.record('ai-photo.succeeded',{actor:'guest',mode:'general',style:'photo',kinds:'pose',presets:'없음',references:0,durationMs:5,prompt:'x',email:'a@b.c',memberId:scope},undefined,{omitIp:true}));
 assert.equal(success.delivered_at,null);assert.deepEqual(Object.keys(success.data).sort(),['actor','durationMs','kinds','mode','presets','references','style'],'prompt, email and member id are dropped by the allow-list');
 const sent=await drain();assert.equal(sent.length,12);assert.equal(sent.filter(t=>t.startsWith('[crefans] AI 사진 편집 실패')).length,10);assert.ok(!sent.some(t=>/반복/.test(t)));
 assert.equal(sent.filter(t=>t.startsWith('[crefans] 회원가입')).length,1);assert.doesNotMatch(sent.find(t=>t.startsWith('[crefans] 회원가입')),new RegExp(scope),'member id leaves only as a keyed hash');
});

test('daily digest: one message at 09:00 KST for the previous 24h with correct counts, never twice',async()=>{
 const clock='worker-operations-digest',saved=await db.platformJob.findUnique({where:{id:clock}});
 const slot=new Date('2001-02-03T00:00:00Z'),inside=m=>new Date(+slot-m*60000);// 2001: no other rows in this window
 const add=async(type,data,extra={})=>track(await db.platformOperationalEvent.create({data:{type,data,created_at:extra.at||inside(30),...extra.row}}));
 for(let i=0;i<3;i++)await add('worker.hourly',{runs:60},{row:policy.digestOnly('worker.hourly')});
 for(let i=0;i<2;i++)await add('member.signup',{memberId:randomUUID()},{row:policy.digestOnly('member.signup')});
 await add('bank_transfer.opened',{targetId:scope,amount:5000});
 await add('worker.error',{job:'syn-job',errorCode:'X'});for(let i=0;i<4;i++)await add('worker.error',{job:'syn-job',errorCode:'X'},{row:{delivered_at:new Date(),last_error_code:'SUPPRESSED_DUPLICATE'}});
 await add('member.signup',{memberId:'outside-window'},{at:new Date(+slot-25*3600000)});await add('member.signup',{memberId:'after-slot'},{at:new Date(+slot+60000)});
 for(const [i,note] of[{activity:{renewal:2},failures:{},processed:2},{activity:{renewal:1,'bean-expiry':4},failures:{payout:1},processed:5}].entries()){const id=`worker-run-${scope}-${i}`;jobs.add(id);await db.platformJob.create({data:{id,locked_until:slot,completed_at:inside(10+i),note:JSON.stringify(note)}});}
 try{
  await db.platformJob.upsert({where:{id:clock},create:{id:clock,locked_until:inside(1440),completed_at:inside(1440)},update:{completed_at:inside(1440)}});
  assert.equal(await policy.runDailyDigest(db,inside(1)),undefined,'08:59 KST: not yet');
  const raced=(await Promise.all([0,1].map(()=>policy.runDailyDigest(db,new Date(+slot+30000))))).filter(Boolean);assert.equal(raced.length,1,'two workers at 09:00 create one digest');
  const first=track(raced[0]);assert.equal(first.type,'operations.daily_digest');
  assert.deepEqual(first.data.types,{'worker.hourly':3,'member.signup':2,'worker.error':5,'bank_transfer.opened':1});
  assert.deepEqual(first.data.repeats,{'worker.error syn-job X':4});assert.deepEqual(first.data.worker,{runs:2,failedRuns:1,processed:7,activity:{renewal:3,'bean-expiry':4}});
  assert.equal(await policy.runDailyDigest(db,new Date(+slot+90000)),undefined,'same slot: no second digest');
  assert.equal(await db.platformOperationalEvent.count({where:{type:'operations.daily_digest',dedupe_key:`operations-digest:${slot.toISOString()}`}}),1);
  const text=policy.digestText(first,'synthetic',{'worker.hourly':'배치 1시간 요약','member.signup':'회원가입','worker.error':'배치 오류','bank_transfer.opened':'무통장 입금 대기 주문 접수 (콘솔)','operations.daily_digest':'운영 일일 요약'});
  assert.match(text,/^\[crefans\] 운영 일일 요약/);assert.match(text,/기간: 2001-02-02 09:00 ~ 2001-02-03 09:00 \(KST\)/);assert.match(text,/- 배치 1시간 요약 \*: 3건/);assert.match(text,/- 회원가입: 2건/,'signup is an immediate alert, no digest-only mark');assert.match(text,/- 무통장 입금 대기 주문 접수: 1건/);assert.match(text,/중복으로 생략된 오류 알림 \(총 4건\)/);assert.match(text,/- 배치 오류 syn-job X: 4회/);assert.match(text,/실행 2회 · 실패 포함 1회 · 처리 7건/);assert.doesNotMatch(text,/outside-window|after-slot/);
  for(const id of[...ids])if(id!==first.id)ids.delete(id);const sent=await drain();assert.equal(sent.length,1);assert.match(sent[0],/^\[crefans\] 운영 일일 요약/);
  const next=track(await policy.runDailyDigest(db,new Date(+slot+86400000+5000)));assert.equal(next.dedupe_key,'operations-digest:2001-02-04T00:00:00.000Z','next day sends again');
 }finally{
  await db.platformAuditLog.deleteMany({where:{source_id:{in:[...all]}}}).catch(()=>undefined);
  await db.platformOperationalEvent.deleteMany({where:{created_at:{gte:new Date('2001-01-01'),lt:new Date('2001-03-01')}}});
  if(saved)await db.platformJob.update({where:{id:clock},data:saved});else await db.platformJob.deleteMany({where:{id:clock}});
 }
});

test('guest AI usage/closed alerts keep the used/limit numbers',async()=>{
 const usage=track(await ops.record('guest.ai_usage',{used:150,limit:300},`guest-ai:${scope}:150`)),closed=track(await ops.record('guest.ai_closed',{used:300,limit:300},`guest-ai-closed:${scope}`));
 assert.deepEqual(usage.data,{used:150,limit:300});assert.deepEqual(closed.data,{used:300,limit:300});
 const text=operationsAlertText({...usage,created_at:new Date()},'synthetic','secret');assert.match(text,/비회원 AI 체험 사용량/);assert.match(text,/^used: 150$/m);assert.match(text,/^limit: 300$/m);
});

test('every alert type raised in src has a Korean label (no raw English type name)',()=>{
 const dir=path.join(__dirname,'../src/platform'),types=new Set(['beans.payout_paid','beans.payout_rejected','disk.warning','disk.critical','disk.recovered','worker.hourly','operations.test','operations.daily_digest']);
 for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.ts'))){const s=fs.readFileSync(path.join(dir,f),'utf8');
  for(const m of s.matchAll(/(enqueueOperation\(\s*[\w.]+(?:\s+as\s+any)?\s*,|\.record\(|operations\??\.error\(|this\.error\(|this\.event\(tx,)([^{]{0,120})/g))for(const t of m[2].matchAll(/'([a-z][a-z0-9_-]*\.[a-z0-9_.]+)'/g))if(!t[1].endsWith('_'))types.add(t[1]);
  for(const t of s.matchAll(/\['([a-z][a-z-]*\.[a-z_]+)',\(\)=>/g))types.add(t[1]);
  for(const t of s.matchAll(/emit\('(security\.[a-z_]+)'/g))types.add(t[1]);}
 assert.ok(types.size>=55,`scanner found ${types.size} types`);
 const raw=[...types].filter(type=>operationsAlertText({id:'x',type,ip:null,peer_ip:null,request_id:null,created_at:new Date(),data:{}},'synthetic').split('\n')[0]===`[crefans] ${type}`);
 assert.deepEqual(raw,[]);
});
