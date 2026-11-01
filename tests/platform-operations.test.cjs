require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,after,beforeEach}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
const {PlatformOperationsService}=require('../dist/src/platform/operations.service');
const {requestContext}=require('../dist/src/platform/request-context');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const db=new PrismaClient(),ids=new Set(),scope=randomUUID();
const scoped=new Proxy(db,{get(target,key){if(key==='platformJob')return new Proxy(target[key],{get(delegate,method){const value=delegate[method];return typeof value==='function'?(args)=>{if(method==='createMany'&&args.data?.[0]?.id==='operations-telegram')args={...args,data:args.data.map(row=>({...row,id:'gate-'+scope}))};if(args.where?.id==='operations-telegram')args={...args,where:{...args.where,id:'gate-'+scope},...(args.create?{create:{...args.create,id:'gate-'+scope}}:{})};return value.call(delegate,args);}:value;}});if(key==='platformOperationalEvent')return new Proxy(target[key],{get(delegate,method){if(method==='findFirst')return args=>delegate.findFirst({...args,where:{...args.where,id:{in:[...ids]}}});const value=delegate[method];return typeof value==='function'?value.bind(delegate):value;}});const value=target[key];return typeof value==='function'?value.bind(target):value;}});
const config=new ConfigService({TELEGRAM_OPERATIONS_BOT_TOKEN:'test-only',TELEGRAM_OPERATIONS_CHAT_ID:'test-only',APP_ENV:'synthetic'}),ops=new PlatformOperationsService(scoped,config);
const seed=async()=>{const row=await db.platformOperationalEvent.create({data:{type:'http.error',data:{status:500},ip:'203.0.113.42',dedupe_key:`${scope}:${randomUUID()}`}});ids.add(row.id);return row;};
const chat={status:200,ok:true,json:async()=>({ok:true,result:{type:'channel',title:'[crefans] operations'}})};
const ok={status:200,ok:true,json:async()=>({ok:true,result:{message_id:1}})};
beforeEach(async()=>{await db.platformJob.deleteMany({where:{id:'gate-'+scope}});});
after(async()=>{await db.platformJob.deleteMany({where:{id:'gate-'+scope}});await db.platformOperationalEvent.deleteMany({where:{id:{in:[...ids]}}});await db.$disconnect();});
test('record retains request IP and strips passwords/email/body/query/headers',async()=>{
 const row=await requestContext.run({ip:'203.0.113.42',peerIp:'172.30.90.2',requestId:randomUUID()},()=>ops.record('http.error',{status:500,password:'do-not-record',email:'private@example.test',body:'secret',headers:{authorization:'secret'},route:'/api/v1/test'},`${scope}:record`));ids.add(row.id);
 assert.equal(row.ip,'203.0.113.42');assert.deepEqual(row.data,{status:500,route:'/api/v1/test'});
 await db.platformOperationalEvent.update({where:{id:row.id},data:{delivered_at:new Date()}});
});
test('one atomic claim sends once when two dispatchers race',async()=>{
 const row=await seed(),calls=[];const transport=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return url.endsWith('/getChat')?chat:ok;};
 await Promise.all([ops.flush(new Date(),transport),ops.flush(new Date(),transport)]);
 assert.equal(calls.filter(c=>c.url.endsWith('/sendMessage')).length,1);
 assert.match(calls.find(c=>c.url.endsWith('/sendMessage')).body.text,/203\.0\.113\.42/);
 const saved=await db.platformOperationalEvent.findUnique({where:{id:row.id}});assert.ok(saved.delivered_at);assert.equal(saved.attempts,1);
});
test('wrong channel is rejected and retained without sending',async()=>{
 const row=await seed(),calls=[];await ops.flush(new Date(),async(url)=>{calls.push(url);return{status:200,ok:true,json:async()=>({ok:true,result:{type:'channel',title:'[ncsolution] operations'}})};});
 assert.equal(calls.length,1);const saved=await db.platformOperationalEvent.findUnique({where:{id:row.id}});assert.equal(saved.delivered_at,null);assert.equal(saved.last_error_code,'TELEGRAM_CHANNEL_MISMATCH');
});
test('429 is queued for retry without dropping the event; explicit later success acknowledges it',async()=>{
 const row=await seed(),now=new Date();await ops.flush(now,async(url)=>url.endsWith('/getChat')?chat:{status:429,ok:false,json:async()=>({ok:false,parameters:{retry_after:4}})});
 let saved=await db.platformOperationalEvent.findUnique({where:{id:row.id}});assert.equal(saved.delivered_at,null);assert.ok(saved.available_at.getTime()>=now.getTime()+4000&&saved.available_at.getTime()<now.getTime()+5000);assert.equal(saved.last_error_code,'TELEGRAM_RATE_LIMITED');const another=await seed();let extraCall=false;await ops.flush(new Date(),async()=>{extraCall=true;return ok;});assert.equal(extraCall,false);await db.platformOperationalEvent.update({where:{id:another.id},data:{available_at:new Date(now.getTime()+86400000)}});
 // Restrict the next dispatch to this event, keeping the other failed synthetic event queued.
 const other=[...ids].filter(id=>id!==row.id);for(const id of other)await db.platformOperationalEvent.update({where:{id},data:{available_at:new Date(now.getTime()+86400000)}});
 await ops.flush(new Date(now.getTime()+5000),async(url)=>url.endsWith('/getChat')?chat:ok);
 saved=await db.platformOperationalEvent.findUnique({where:{id:row.id}});assert.ok(saved.delivered_at);assert.equal(saved.attempts,2);
});
test('network exception retains event and logs no provider error text',async()=>{
 const row=await seed();await ops.flush(new Date(),async()=>{throw Error('credential-must-not-be-logged');});
 const saved=await db.platformOperationalEvent.findUnique({where:{id:row.id}});assert.equal(saved.delivered_at,null);assert.equal(saved.last_error_code,'TELEGRAM_UNAVAILABLE');assert.ok(saved.available_at>new Date());
});
test('missing configuration never marks queued records delivered',async()=>{
 const noConfig=new PlatformOperationsService(scoped,new ConfigService({}));let called=false;await noConfig.flush(new Date(),async()=>{called=true;throw Error('unexpected');});assert.equal(called,false);
});

test('every run is logged, no-work emits hourly, work/failure emits immediately',async()=>{
 const jobs=new Map(),events=[],start=new Date('2026-10-21T16:00:00Z');
 const fake={platformAuditLog:{create:async({data})=>data,upsert:async({create})=>create},platformSecurityIp:{deleteMany:async()=>({count:0})},platformJob:{
  create:async({data})=>{jobs.set(data.id,data);return data;},
  upsert:async({where,create})=>{if(!jobs.has(where.id))jobs.set(where.id,create);return jobs.get(where.id);},
  findUniqueOrThrow:async({where})=>jobs.get(where.id),
  findMany:async({where})=>[...jobs.values()].filter(r=>r.id.startsWith('worker-run-')&&r.completed_at>where.completed_at.gt&&r.completed_at<=where.completed_at.lte),
  update:async({where,data})=>Object.assign(jobs.get(where.id),data),deleteMany:async()=>({count:0}),
 },platformOperationalEvent:{create:async({data})=>{events.push(data);return data;},deleteMany:async()=>({count:0})},$queryRaw:async()=>[], $transaction:async fn=>fn(fake)};
 const isolated=new PlatformOperationsService(fake,new ConfigService({}));
 await isolated.reportRun(start,{},{},start);
 await isolated.reportRun(new Date(+start+60000),{},{},new Date(+start+60000));
 assert.equal(jobs.size,3);assert.equal(events.length,0);
 await isolated.reportRun(new Date(+start+120000),{},{renewal:1},new Date(+start+120000));
 assert.equal(events[0].type,'worker.completed');assert.equal(events[0].data.processed,1);
 await isolated.reportRun(new Date(+start+180000),{renewal:1},{},new Date(+start+180000));
 assert.equal(events[1].type,'worker.error');
 await isolated.reportRun(new Date(+start+3600000),{},{},new Date(+start+3600000));
 assert.equal(events[2].type,'worker.hourly');assert.equal(events[2].data.runs,4);assert.equal(events[2].data.failedRuns,1);
 await isolated.reportRun(new Date(+start+3660000),{},{},new Date(+start+3660000));
 assert.equal(events.length,3);assert.equal([...jobs.keys()].filter(k=>k.startsWith('worker-run-')).length,6);
});

test('uncaught exceptions are reported without continuing or exposing original error text',()=>{
 const {spawnSync}=require('node:child_process');
 const script=`require('reflect-metadata');const {PlatformOperationsService}=require('./dist/src/platform/operations.service');const ops=new PlatformOperationsService({},{});ops.error=async type=>{console.log(type);return{id:'test-fatal-id'};};ops.flush=async()=>console.log('flushed');ops.installFatalHandlers();setImmediate(()=>{throw Error('private-fatal-text');});`;
 const result=spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);assert.match(result.stdout,/process.error/);assert.match(result.stdout,/flushed/);assert.doesNotMatch(result.stdout+result.stderr,/private-fatal-text/);
});


test('batch errors preserve safe internal code and job name without exception text',async()=>{
 const error=Object.assign(new Error('secret provider response'),{getResponse:()=>({code:'BILLING_RETRY_FAILED',message:'secret body'})});
 const row=await ops.error('worker.error',error,{job:'billing-registration-and-revocation'});ids.add(row.id);
 assert.equal(row.data.job,'billing-registration-and-revocation');assert.equal(row.data.errorCode,'BILLING_RETRY_FAILED');assert.match(row.data.fingerprint,/^[a-f0-9]{64}$/);assert.ok(row.data.release);assert.doesNotMatch(JSON.stringify(row),/secret/);
});
