require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-18 user decision ("방법 1 서버 집계"): AI photo trial funnel counts per KST day and step only.
// Checks: the public endpoint takes only the 3 allow-listed view steps; the table has no person/IP/cookie column; counts increment;
// a server-side hook (guest consent) counts; the console report is zero-filled for 14 days. Uses the isolated e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TRUSTED_PROXY_IPS:'127.0.0.1',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module');
const funnel=require('../dist/src/platform/funnel-stats'),{kstDay}=require('../dist/src/platform/ai-preset-usage');
const {GuestService,GUEST_CONSENT_VERSION,guestFromRequest}=require('../dist/src/platform/guest');
let app,base;const guests=[],alertIds=[];
const count=async step=>(await db.funnelStepDaily.findUnique({where:{day_step:{day:kstDay(),step}}}))?.count||0;
const send=body=>fetch(base+'/api/v1/telemetry/funnel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
before(async()=>{
 globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 app=await NestFactory.create(PlatformModule,{logger:false});
 // Same request context as main.ts: trusted proxy (loopback here) → X-Crefans-Client-IP becomes the client IP.
 const security=app.get(require('../dist/src/platform/security.service').PlatformSecurityService);app.use((req,res,next)=>{void security.middleware(req,res,next).catch(next);});app.setGlobalPrefix('api/v1');await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();try{for(const id of guests)await db.platformAuditLog.deleteMany({where:{entity_id:id}}).catch(()=>{});
 if(alertIds.length){await db.platformAuditLog.deleteMany({where:{source_id:{in:alertIds}}}).catch(()=>{});await db.platformOperationalEvent.deleteMany({where:{id:{in:alertIds}}});}}finally{await db.$disconnect();await globalThis.__release?.();}});

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

// 2026-11-18 user decision (랜딩 방문 텔레그램 알림): an accepted landing_view queues one immediate 'funnel.landing_view' alert.
// No IP, user agent, cookie or session id; every visit including the same client IP (no per-IP quiet window); 100 per KST day then one cap alert; bots skipped;
// alert failures never change the telemetry response.
const policy=require('../dist/src/platform/operations-alert-policy'),{operationsAlertText,PlatformOperationsService}=require('../dist/src/platform/operations.service'),{requestContext}=require('../dist/src/platform/request-context');
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const landingRows=async since=>{const rows=await db.platformOperationalEvent.findMany({where:{type:{startsWith:'funnel.landing'},created_at:{gte:since}},orderBy:{created_at:'asc'}});for(const r of rows)if(!alertIds.includes(r.id))alertIds.push(r.id);return rows;};
const settle=async(since,n)=>{for(let i=0;i<40;i++){const rows=await landingRows(since);if(rows.length>=n)return rows;await new Promise(r=>setTimeout(r,50));}return landingRows(since);};
const fakeOps=()=>{const calls=[];return{calls,record:async(...args)=>{calls.push(args);return{id:'x'};}};};
const fakeDb=(sent,today=7)=>({platformOperationalEvent:{count:async()=>sent},funnelStepDaily:{findUnique:async()=>({count:today})}});

test('landing alert: an accepted landing_view queues one immediate alert with the client IP but no user agent or full URL; a second landing from the same IP is alerted too',async()=>{
 assert.ok(!policy.DIGEST_TYPES.has('funnel.landing_view')&&!policy.DEDUPE_TYPES.has('funnel.landing_view'),'immediate, not digested or deduped');
 const since=new Date(Date.now()-1000),post=body=>fetch(base+'/api/v1/telemetry/funnel',{method:'POST',headers:{'content-type':'application/json','user-agent':IPHONE,'x-crefans-client-ip':'198.51.100.23'},body:JSON.stringify(body)});
 const res=await post({step:'landing_view',referrerHost:'m.search.naver.com',utmSource:'insta_bio'});assert.equal(res.status,201);assert.deepEqual(await res.json(),{recorded:true});
 const [row]=await settle(since,1);assert.ok(row,'alert queued');assert.equal(row.type,'funnel.landing_view');assert.equal(row.delivered_at,null);assert.equal(row.last_error_code,null);
 assert.equal(row.ip,'198.51.100.23','2026-11-18 user decision: the trusted client IP (X-Crefans-Client-IP from the trusted proxy) is kept for the alert');
 assert.equal(row.data['랜딩'],'AI 사진 랜딩');assert.equal(row.data['유입'],'m.search.naver.com · utm_source=insta_bio');assert.equal(row.data['기기'],'모바일');assert.equal(row.data['오늘 랜딩 방문'],await count('landing_view'));assert.match(row.data['방문 시각(KST)'],/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
 const text=operationsAlertText(row,'test','k'.repeat(32));
 assert.match(text,/^\[crefans\] 랜딩 방문/);assert.ok(text.split('\n').includes(`접속 IP: ${row.ip}`),text);assert.doesNotMatch(text,/보내지 않음|\(집\)|사유:|iPhone|Mozilla|Safari|연결 IP|search\.naver\?|cookie|session/i);
 const again=await post({step:'landing_view'});assert.equal(again.status,201);
 const rows=await settle(since,2);assert.equal(rows.length,2,'same client IP right after: counted and alerted again');assert.equal(rows[1].type,'funnel.landing_view');assert.equal(rows[1].ip,row.ip);assert.equal(rows[1].data['유입'],'직접 방문 또는 알 수 없음');
 assert.equal(funnel.landingAlertAllowed,undefined,'no per-IP throttle');
});
test('landing alert: invalid referrer host / utm are dropped, unknown fields still 400, bots skipped, daily cap sends one cap alert then counts only',async()=>{
 assert.deepEqual(funnel.landingSource({referrerHost:'https://evil.example/path?q=1',utmSource:'a b'}),{referrerHost:undefined,utmSource:undefined,utmMedium:undefined,utmCampaign:undefined,utmContent:undefined});
 assert.deepEqual(funnel.landingSource({referrerHost:'Evil.COM',utmSource:'x'.repeat(41)}),{referrerHost:undefined,utmSource:undefined,utmMedium:undefined,utmCampaign:undefined,utmContent:undefined});
 assert.deepEqual(funnel.landingSource({referrerHost:'l.instagram.com',utmSource:'ig_story-1',utmMedium:undefined,utmCampaign:undefined,utmContent:undefined}),{referrerHost:'l.instagram.com',utmSource:'ig_story-1',utmMedium:undefined,utmCampaign:undefined,utmContent:undefined});
 for(const body of [{step:'landing_view',referrer:'https://x.com'},{step:'signup_view',referrerHost:'x.com'},{step:'landing_view',ip:'1.2.3.4'}]){const res=await send(body);assert.equal(res.status,400,JSON.stringify(body));}
 const prior=await count('landing_view'),res=await send({step:'landing_view',referrerHost:'bad host!'});assert.equal(res.status,201,'an invalid source is dropped, the visit still counts');assert.equal(await count('landing_view'),prior+1);
 let ops=fakeOps();
 assert.equal(await funnel.landingVisitAlert(fakeDb(0),ops,funnel.landingSource({referrerHost:'nope nope'}),IPHONE),'queued');assert.equal(ops.calls[0][1]['유입'],'직접 방문 또는 알 수 없음');
 for(const ua of ['node','Mozilla/5.0 (compatible; Googlebot/2.1)','curl/8.4.0','HeadlessChrome/120','',undefined])assert.equal(await funnel.landingVisitAlert(fakeDb(0),ops,{},ua),'skipped',String(ua));
 assert.equal(ops.calls.length,1,'bots and missing user agents are not alerted');
 ops=fakeOps();assert.equal(await funnel.landingVisitAlert(fakeDb(99),ops,{},'Mozilla/5.0 (Windows NT 10.0)'),'queued');assert.equal(ops.calls[0][0],'funnel.landing_view');assert.equal(ops.calls[0][1]['기기'],'데스크톱');assert.equal(ops.calls[0][3],undefined,'visit alerts keep the client IP');
 ops=fakeOps();assert.equal(await funnel.landingVisitAlert(fakeDb(100),ops,{},IPHONE),'capped');assert.equal(ops.calls[0][0],'funnel.landing_cap');assert.match(ops.calls[0][2],/^funnel\.landing_cap:\d{4}-\d\d-\d\d$/,'one cap alert per KST day (dedupe key)');assert.deepEqual(ops.calls[0][3],{omitIp:true});
 // The cap alert really is stored once per day on the real outbox.
 const real=app.get(PlatformOperationsService),since=new Date(Date.now()-1000),key='funnel.landing_cap:test-'+crypto.randomUUID();
 await real.record('funnel.landing_cap',{limit:100},key,{omitIp:true});await real.record('funnel.landing_cap',{limit:100},key,{omitIp:true});
 const caps=(await landingRows(since)).filter(r=>r.dedupe_key===key);assert.equal(caps.length,1);assert.equal(caps[0].ip,null);assert.match(operationsAlertText(caps[0],'test'),/오늘 랜딩 알림 상한 도달/);
});
// 2026-11-18 당근 캠페인: utm_medium·utm_campaign are accepted, shown in the alert with a readable source name, and dropped when invalid.
test('landing alert: utm_medium and utm_campaign reach the alert; known sources get a readable name',async()=>{
 assert.deepEqual(funnel.landingSource({utmSource:'daangn',utmMedium:'cpc',utmCampaign:'daangn_202611'}),{referrerHost:undefined,utmSource:'daangn',utmMedium:'cpc',utmCampaign:'daangn_202611',utmContent:undefined});
 assert.deepEqual(funnel.landingSource({utmMedium:'c pc',utmCampaign:'a'.repeat(41)}),{referrerHost:undefined,utmSource:undefined,utmMedium:undefined,utmCampaign:undefined,utmContent:undefined});
 assert.equal(funnel.landingFrom({utmSource:'daangn',utmMedium:'cpc',utmCampaign:'daangn_202611'}),'당근 · utm_source=daangn · utm_medium=cpc · utm_campaign=daangn_202611');
 assert.equal(funnel.landingFrom({referrerHost:'t.co',utmSource:'x',utmMedium:'social'}),'X · t.co · utm_source=x · utm_medium=social');
 assert.equal(funnel.landingFrom({utmSource:'insta_bio'}),'utm_source=insta_bio','unknown source: raw value only');
 const since=new Date(Date.now()-1000),res=await fetch(base+'/api/v1/telemetry/funnel',{method:'POST',headers:{'content-type':'application/json','user-agent':IPHONE,'x-crefans-client-ip':'198.51.100.24'},body:JSON.stringify({step:'landing_view',utmSource:'daangn',utmMedium:'cpc',utmCampaign:'daangn_202611'})});
 assert.equal(res.status,201);assert.deepEqual(await res.json(),{recorded:true});
 let row;for(let i=0;i<40&&!row;i++){row=(await landingRows(since)).find(r=>r.ip==='198.51.100.24'&&r.data['유입']?.startsWith('당근'));if(!row)await new Promise(r=>setTimeout(r,50));}assert.ok(row,'alert queued');assert.equal(row.data['유입'],'당근 · utm_source=daangn · utm_medium=cpc · utm_campaign=daangn_202611');
 assert.match(operationsAlertText(row,'test','k'.repeat(32)),/유입: 당근 · utm_source=daangn · utm_medium=cpc · utm_campaign=daangn_202611/);
 assert.deepEqual(funnel.landingSource({utmSource:'daangn',utmContent:'2'}).utmContent,'2');assert.equal(funnel.landingSource({utmContent:'a b'}).utmContent,undefined);
 assert.equal(funnel.landingFrom({utmSource:'daangn',utmMedium:'cpc',utmCampaign:'daangn_202611',utmContent:'2'}),'당근 · utm_source=daangn · utm_medium=cpc · utm_campaign=daangn_202611 · utm_content=2');
 const r2=await fetch(base+'/api/v1/telemetry/funnel',{method:'POST',headers:{'content-type':'application/json','user-agent':IPHONE,'x-crefans-client-ip':'198.51.100.25'},body:JSON.stringify({step:'landing_view',utmSource:'daangn',utmCampaign:'daangn_202611',utmContent:'3'})});assert.equal(r2.status,201);
 let row2;for(let i=0;i<40&&!row2;i++){row2=(await landingRows(since)).find(r=>r.ip==='198.51.100.25');if(!row2)await new Promise(r=>setTimeout(r,50));}assert.equal(row2?.data['유입'],'당근 · utm_source=daangn · utm_campaign=daangn_202611 · utm_content=3');
 for(const body of [{step:'signup_view',utmContent:'1'},{step:'signup_view',utmCampaign:'x'},{step:'landing_view',utmTerm:'x'}]){const r=await send(body);assert.equal(r.status,400,JSON.stringify(body));}
});
test('landing alert: a failing outbox or database never fails the telemetry request',async()=>{
 const throwing={record:async()=>{throw Error('outbox down');}};
 const run=fn=>requestContext.run({ip:'192.0.2.'+crypto.randomInt(1,250),peerIp:'',requestId:'t'},fn);
 const prior=await count('landing_view');
 assert.deepEqual(await run(()=>funnel.reportFunnelStep(db,{step:'landing_view',referrerHost:'x.com'},{operations:throwing,userAgent:IPHONE})),{recorded:true});
 assert.equal(await funnel.landingVisitAlert(db,throwing,{},IPHONE),'failed');
 assert.equal(await funnel.landingVisitAlert({platformOperationalEvent:{count:async()=>{throw Error('db down');}}},fakeOps(),{},IPHONE),'failed');
 assert.equal(await count('landing_view'),prior+1);
});

// 2026-11-18 user decision: 접속 IP in the landing alert, ' (집)' for OWNER_HOME_IPS; utm_source deploy_test* = 배포 후 테스트 (alerted with a
// first 사유 line, not counted in funnel_step_daily, not counted toward the daily alert cap).
test('landing alert text: client IP shown, owner home IP marked (집) only when listed, other alerts unchanged',()=>{
 const row={type:'funnel.landing_view',ip:'121.140.82.62',peer_ip:'172.30.90.2',created_at:new Date(),id:'e1',request_id:'r1',data:{'유입':'직접 방문 또는 알 수 없음'}};
 const lines=homes=>operationsAlertText(row,'test','k'.repeat(32),homes).split('\n');
 assert.ok(lines('').includes('접속 IP: 121.140.82.62'));assert.ok(!lines('').some(l=>l.includes('(집)')||l.startsWith('연결 IP')||l.startsWith('사유')));
 assert.ok(lines('121.140.82.62').includes('접속 IP: 121.140.82.62 (집)'));assert.ok(lines(' 10.0.0.1 , 121.140.82.62 ').includes('접속 IP: 121.140.82.62 (집)'));
 assert.ok(lines('121.140.82.6').includes('접속 IP: 121.140.82.62'),'no prefix match');
 assert.ok(operationsAlertText({...row,ip:null},'test','k',' ').split('\n').includes('접속 IP: 알 수 없음'));
 const other=operationsAlertText({...row,type:'security.ip_blocked',data:{}},'test','k','121.140.82.62').split('\n');
 assert.ok(other.includes('접속 IP: 121.140.82.62')&&other.includes('연결 IP: 172.30.90.2'),'non-landing alerts keep the old format, no (집)');
 assert.ok(operationsAlertText({...row,type:'funnel.landing_cap',data:{limit:100}},'test','k','121.140.82.62').includes('접속 IP: 보내지 않음'));
});
test('deploy_test visit: alerted with 사유 first line and the client IP, not counted in the funnel table or toward the cap; real visits unchanged',async()=>{
 assert.equal(funnel.isDeployTest({utmSource:'deploy_test_ip'}),true);assert.equal(funnel.isDeployTest({utmSource:'DEPLOY_TEST'}),true);
 for(const u of ['deploytest','x_deploy_test','insta_bio',undefined])assert.equal(funnel.isDeployTest({utmSource:u}),false,String(u));
 const since=new Date(),post=body=>fetch(base+'/api/v1/telemetry/funnel',{method:'POST',headers:{'content-type':'application/json','user-agent':IPHONE,'x-crefans-client-ip':'121.140.82.62'},body:JSON.stringify(body)});
 await new Promise(r=>setTimeout(r,1100));const prior=await count('landing_view');
 const res=await post({step:'landing_view',utmSource:'Deploy_Test_ip'});assert.equal(res.status,201);assert.deepEqual(await res.json(),{recorded:false});
 const [row]=await settle(since,1);assert.ok(row);assert.equal(row.type,'funnel.landing_test');assert.equal(row.ip,'121.140.82.62');assert.equal(row.data['사유'],'배포 후 테스트');assert.equal(row.data['오늘 랜딩 방문'],prior);
 assert.equal(await count('landing_view'),prior,'not counted in funnel_step_daily');
 const text=operationsAlertText(row,'test','k'.repeat(32),'121.140.82.62').split('\n');
 assert.equal(text[0],'사유: 배포 후 테스트');assert.equal(text[1],'[crefans] 랜딩 방문');assert.ok(text.includes('접속 IP: 121.140.82.62 (집)'));assert.equal(text.filter(l=>l.startsWith('사유')).length,1);
 const real=await post({step:'landing_view',utmSource:'insta_bio'});assert.deepEqual(await real.json(),{recorded:true});assert.equal(await count('landing_view'),prior+1,'a real visit still counts');
 const rows=await settle(since,2);assert.equal(rows[1].type,'funnel.landing_view');assert.equal(rows[1].data['사유'],undefined);
 // Cap: 100 real alerts today → a real visit is capped, a deploy_test visit is still alerted; the cap query counts only funnel.landing_view.
 let ops=fakeOps(),where;const capDb={platformOperationalEvent:{count:async q=>{where=q.where;return 100;}},funnelStepDaily:{findUnique:async()=>({count:7})}};
 assert.equal(await funnel.landingVisitAlert(capDb,ops,{utmSource:'insta_bio'},IPHONE),'capped');assert.equal(where.type,'funnel.landing_view');
 ops=fakeOps();assert.equal(await funnel.landingVisitAlert(capDb,ops,{utmSource:'deploy_test_ip'},IPHONE),'queued');assert.equal(ops.calls[0][0],'funnel.landing_test');assert.equal(ops.calls[0][1]['사유'],'배포 후 테스트');
});
