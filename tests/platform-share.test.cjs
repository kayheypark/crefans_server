require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-19 user request: every share button press is alerted to Telegram (AI 결과 공유, 게시물 공유 창). Uses the isolated e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TRUSTED_PROXY_IPS:'127.0.0.1',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module');
const share=require('../dist/src/platform/share-alert'),policy=require('../dist/src/platform/operations-alert-policy'),{operationsAlertText}=require('../dist/src/platform/operations.service');
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let app,base;const ids=[];
const post=(body,ip='198.51.100.31',ua=IPHONE)=>fetch(base+'/api/v1/telemetry/share',{method:'POST',headers:{'content-type':'application/json','user-agent':ua,'x-crefans-client-ip':ip},body:JSON.stringify(body)});
const rows=async since=>{const r=await db.platformOperationalEvent.findMany({where:{type:{startsWith:'share.'},created_at:{gte:since}},orderBy:{created_at:'asc'}});for(const x of r)if(!ids.includes(x.id))ids.push(x.id);return r;};
before(async()=>{
 globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 app=await NestFactory.create(PlatformModule,{logger:false});
 const security=app.get(require('../dist/src/platform/security.service').PlatformSecurityService);app.use((req,res,next)=>{void security.middleware(req,res,next).catch(next);});app.setGlobalPrefix('api/v1');await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();try{if(ids.length){await db.platformAuditLog.deleteMany({where:{source_id:{in:ids}}}).catch(()=>{});await db.platformOperationalEvent.deleteMany({where:{id:{in:ids}}});}}finally{await db.$disconnect();await globalThis.__release?.();}});

test('a share press queues one immediate Telegram alert with labels and the client IP; AI result and post share are both covered',async()=>{
 assert.ok(!policy.DIGEST_TYPES.has('share.clicked')&&!policy.DEDUPE_TYPES.has('share.clicked'),'immediate, never digested or deduped');
 const since=new Date(Date.now()-1000);
 let res=await post({where:'ai_result',method:'native',outcome:'done'});assert.equal(res.status,201);assert.deepEqual(await res.json(),{recorded:true});
 res=await post({where:'post',method:'kakao',outcome:'done',postId:'f807eb99-1111-2222-3333-444455556666'});assert.deepEqual(await res.json(),{recorded:true});
 res=await post({where:'ai_result',method:'native',outcome:'done'});assert.deepEqual(await res.json(),{recorded:true},'same visitor again is alerted again');
 const r=await rows(since);assert.equal(r.length,3);
 assert.deepEqual([r[0].data['위치'],r[0].data['방식'],r[0].data['결과'],r[0].data['기기']],['AI 사진 결과(게시 전)','기기 공유(카톡 등 앱 고르기)','완료','모바일']);
 assert.deepEqual([r[1].data['위치'],r[1].data['방식'],r[1].data['결과'],r[1].data['게시물']],['게시물 공유 창','카카오톡','완료(카카오톡 공유 창 열림)','f807eb99-1111-2222-3333-444455556666']);
 assert.equal(r[0].ip,'198.51.100.31');assert.equal(r[0].delivered_at,null);
 const text=operationsAlertText(r[1],'prod','k'.repeat(32),'198.51.100.31');
 assert.match(text,/^\[crefans\] 공유 버튼/);assert.ok(text.split('\n').includes('접속 IP: 198.51.100.31 (집)'),text);assert.doesNotMatch(text,/연결 IP|iPhone|Mozilla/);
});
test('only allow-listed labels pass: unknown values, wrong method for the place, extra fields and bad post ids are 400; bots are not alerted',async()=>{
 const before=new Set((await rows(new Date(Date.now()-60000))).map(r=>r.id)),since=new Date(Date.now()-60000);
 for(const body of [{where:'feed',method:'copy',outcome:'done'},{where:'ai_result',method:'kakao',outcome:'done'},{where:'post',method:'native',outcome:'done'},{where:'post',method:'copy',outcome:'opened'},
  {where:'post',method:'copy',outcome:'done',url:'https://x'},{where:'post',method:'copy',outcome:'done',postId:'a b'},{where:'ai_result',method:'native',outcome:'done',postId:'abc'},{}])
  {const res=await post(body);assert.equal(res.status,400,JSON.stringify(body));}
 const bot=await post({where:'post',method:'copy',outcome:'done'},'198.51.100.32','curl/8.4.0');assert.deepEqual(await bot.json(),{recorded:false});
 assert.equal((await rows(since)).filter(r=>!before.has(r.id)).length,0,'no new share alert');
});
test('daily cap: after 200 alerts one cap alert (no IP) per day and nothing more; a failing outbox never fails the request',async()=>{
 const calls=[],ops={record:async(...a)=>{calls.push(a);}},db200={platformOperationalEvent:{count:async()=>200}};
 const run=fn=>require('../dist/src/platform/request-context').requestContext.run({ip:'192.0.2.'+Math.floor(Math.random()*250+1),peerIp:'',requestId:'t'},fn);
 assert.deepEqual(await run(()=>share.reportShare(db200,ops,{where:'post',method:'copy',outcome:'done'},IPHONE)),{recorded:false});
 assert.equal(calls[0][0],'share.cap');assert.match(calls[0][2],/^share\.cap:\d{4}-\d\d-\d\d$/);assert.deepEqual(calls[0][3],{omitIp:true});
 const broken={record:async()=>{throw Error('down');}},db0={platformOperationalEvent:{count:async()=>0}};
 assert.deepEqual(await run(()=>share.reportShare(db0,broken,{where:'post',method:'copy',outcome:'failed'},IPHONE)),{recorded:false});
});
