require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-18 user decision ("방법 1 서버 집계"): AI photo trial funnel counts per KST day and step only.
// Checks: the public endpoint takes only the 3 allow-listed view steps; the table has no person/IP/cookie column; counts increment;
// a server-side hook (guest consent) counts; the console report is zero-filled for 14 days. Uses the isolated e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module');
const funnel=require('../dist/src/platform/funnel-stats'),{kstDay}=require('../dist/src/platform/ai-preset-usage');
const {GuestService,GUEST_CONSENT_VERSION,guestFromRequest}=require('../dist/src/platform/guest');
let app,base;const guests=[];
const count=async step=>(await db.funnelStepDaily.findUnique({where:{day_step:{day:kstDay(),step}}}))?.count||0;
const send=body=>fetch(base+'/api/v1/telemetry/funnel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
before(async()=>{
 globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();try{for(const id of guests)await db.platformAuditLog.deleteMany({where:{entity_id:id}}).catch(()=>{});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('the table stores only day, step, count and updated_at — no member, guest, IP, cookie or user-agent column',async()=>{
 const rows=await db.$queryRaw`SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='funnel_step_daily' ORDER BY ORDINAL_POSITION`;
 assert.deepEqual(rows.map(r=>r.name),['day','step','count','updated_at']);
});
test('unknown steps, server-only steps and extra fields are rejected with 400 and change nothing',async()=>{
 const before=await count('signup_completed'),landing=await count('landing_view');
 for(const body of [{step:'hacked'},{step:'signup_completed'},{step:'ai_succeeded_member'},{},{step:['landing_view']},{step:'landing_view',memberId:'x'}]){const res=await send(body);assert.equal(res.status,400,JSON.stringify(body));}
 assert.equal(await count('signup_completed'),before);assert.equal(await count('landing_view'),landing);
});
test('an allow-listed view step increments today\'s KST count by one per call',async()=>{
 for(const step of ['landing_view','guest_consent_view','signup_view']){const prior=await count(step);const res=await send({step});assert.equal(res.status,201);assert.deepEqual((await res.json()),{recorded:true});assert.equal(await count(step),prior+1,step);}
});
test('the per-IP limit is in memory: 30 per minute, then refused; a new minute starts over',()=>{
 const t=Date.UTC(2030,0,1,0,0,5),ip='203.0.113.'+crypto.randomInt(1,250);
 for(let i=0;i<30;i++)assert.equal(funnel.funnelRateLimit(ip,t),true);assert.equal(funnel.funnelRateLimit(ip,t),false);
 assert.equal(funnel.funnelRateLimit('198.51.100.7',t),true,'another address is independent');assert.equal(funnel.funnelRateLimit(ip,t+60000),true);
});
test('guest consent is counted on the server where it happens',async()=>{
 const guestsService=app.get(GuestService),jar={},prior=await count('guest_consent_agreed');
 await guestsService.start({cookies:jar},{cookie(name,value){jar[name]=value;}},{consent:true,version:GUEST_CONSENT_VERSION});guests.push(guestFromRequest({cookies:jar}));
 assert.equal(await count('guest_consent_agreed'),prior+1);
 await assert.rejects(guestsService.start({cookies:{}},{cookie(){}},{consent:true,version:'old'}));assert.equal(await count('guest_consent_agreed'),prior+1,'a refused consent is not counted');
});
test('recordFunnelStep ignores unknown keys and never throws; the report is 14 KST days, zero-filled, oldest first',async()=>{
 assert.equal(await funnel.recordFunnelStep(db,'nope'),false);
 assert.equal(await funnel.recordFunnelStep({$executeRaw:async()=>{throw Error('db down');}},'landing_view'),false);
 const prior=await count('signup_completed');assert.equal(await funnel.recordFunnelStep(db,'signup_completed'),true);assert.equal(await count('signup_completed'),prior+1);
 const report=await funnel.funnelStats(db);assert.equal(report.dates.length,14);assert.equal(report.dates[13],kstDay().toISOString().slice(0,10));
 assert.equal(report.steps.length,12);const landing=report.steps.find(s=>s.key==='landing_view');assert.equal(landing.source,'browser');assert.equal(landing.daily.length,14);assert.equal(landing.daily[13],await count('landing_view'));assert.equal(landing.total,landing.daily.reduce((a,b)=>a+b,0));
 assert.equal(report.steps.find(s=>s.key==='signup_completed').source,'server');
 assert.equal(kstDay(new Date('2026-11-18T15:30:00Z')).toISOString().slice(0,10),'2026-11-19','after 00:00 KST it is the next day');
});
