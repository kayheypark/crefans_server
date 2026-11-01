require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),express=require('express'),{ConfigService}=require('@nestjs/config');
// Compile only owned sources; the operations collaborator is a contract double, not a Telegram sender.
function loadTs(name){
 const filename=path.resolve(__dirname,`../src/platform/${name}.ts`),mod=new Module(filename,module);
 mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const original=mod.require.bind(mod);
 mod.require=id=>id==='./media-edge-protocol'?loadTs('media-edge-protocol'):id==='./audit'?loadTs('audit'):id==='./operations.service'?{PlatformOperationsService:class PlatformOperationsService{}}:id==='./request-context'?contextModule:id==='../prisma/prisma.service'?{PrismaService:class PrismaService{}}:id==='./http'?{fail:(message,code)=>({success:false,data:null,errorMessage:message,errorCode:code})}:original(id);
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,filename);
 return mod.exports;
}
const contextModule=loadTs('request-context'),{requestContext}=contextModule,{PlatformSecurityService}=loadTs('security.service');
const clone=value=>structuredClone(value);
function memoryDb(){
 const rows=new Map(),outbox=new Map();let queue=Promise.resolve(),now=new Date('2026-10-21T16:00:00Z'),fail=false,failUpdate=false,failOutbox=false;
 const api={rows,outbox,platformAuditLog:{create:async({data})=>data,upsert:async({create})=>create},platformOperationalEvent:{async upsert({where,create}){if(failOutbox)throw Error('outbox unavailable');if(!outbox.has(where.dedupe_key))outbox.set(where.dedupe_key,clone(create));return clone(outbox.get(where.dedupe_key));}},setNow:value=>{now=new Date(value);},break:value=>{fail=value;},breakUpdate:value=>{failUpdate=value;},breakOutbox:value=>{failOutbox=value;},
  async $queryRaw(strings,...values){
   if(fail)throw Error('private-db-error');
   const sql=strings.join('?');
   if(sql.includes('CURRENT_TIMESTAMP'))return [{now:new Date(now)}];
   if(sql.includes('platform_security_ips'))return rows.has(values[0])?[clone(rows.get(values[0]))]:[];
   throw Error('Unexpected SQL');
  },
  async $executeRaw(strings,...values){
   if(fail)throw Error('private-db-error');
   const sql=strings.join('?');
   if(sql.startsWith('INSERT')){if(!rows.has(values[0]))rows.set(values[0],{ip:values[0],blocked_until:null,window_start:new Date(now),count:0,detected_at:null});}
   else if(sql.startsWith('UPDATE')){if(failUpdate)throw Error('transaction update failed');const [blocked_until,window_start,count,detected_at,ip]=values;rows.set(ip,{ip,blocked_until,window_start,count,detected_at});}
   else throw Error('Unexpected SQL');
   assert.ok(rows.size<=100,'bounded fake');return 1;
  },
  $transaction(fn){const operation=queue.then(async()=>{const before=clone(rows),eventsBefore=clone(outbox);try{return await fn(api);}catch(error){rows.clear();for(const [key,value] of before)rows.set(key,value);outbox.clear();for(const [key,value] of eventsBefore)outbox.set(key,value);throw error;}});queue=operation.catch(()=>{});return operation;}
 };return api;
}
function setup(db=memoryDb(),trusted=''){
 const events=[],ops={async record(type,data,key){events.push({type,data,key,context:requestContext.getStore()});}};
 return {db,events,service:new PlatformSecurityService(db,new ConfigService({TRUSTED_PROXY_IPS:trusted}),ops)};
}
async function request(service,{ip='198.51.100.9',url='/api/v1/items?id=1',headers={},body={}}={},next=async()=>{}){
 const req={socket:{remoteAddress:ip},headers,url,originalUrl:url,body},res=Object.assign(new (require('node:events').EventEmitter)(),{setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}});
 let passed=false;
 await service.middleware(req,res,async()=>{passed=true;await next(req);});
 return {req,res,passed};
}
const attack='/api/v1/items?id=1%20OR%201%3D1--';
test('direct socket ignores spoofed IP headers; trusted literals alone accept the private header',async()=>{
 for(const trusted of['','   ']){
  const {service}=setup(undefined,trusted),r=await request(service,{headers:{'x-crefans-client-ip':'1.1.1.1','x-forwarded-for':'2.2.2.2','cf-connecting-ip':'3.3.3.3'}});
  assert.equal(r.req.requestContext.ip,'198.51.100.9');
 }
 const {service}=setup(undefined,'10.0.0.2,2001:db8::2');
 for(const header of['198.51.100.7','2001:0db8:0:0::7','::ffff:198.51.100.7']){
  const r=await request(service,{ip:'::ffff:10.0.0.2',headers:{'x-crefans-client-ip':header}});
  assert.equal(r.req.requestContext.peerIp,'10.0.0.2');assert.equal(r.req.requestContext.ip,header.includes('db8')?'2001:db8::7':'198.51.100.7');
 }
 for(const header of['1.1.1.1, 2.2.2.2',['1.1.1.1'],'unknown','[::1]','fe80::1%eth0']){
  const r=await request(service,{ip:'2001:db8::2',headers:{'x-crefans-client-ip':header}});assert.equal(r.req.requestContext.ip,'2001:db8::2');
 }
});
test('nonempty invalid proxy configuration fails startup without echoing configuration',()=>{
 for(const trusted of['10.0.0.0/8','*','private','proxy.example','127.0.0.1,','127.0.0.1, bad','fe80::1%eth0','[::1]'])assert.throws(()=>setup(undefined,trusted),{message:'TRUSTED_PROXY_IPS must contain only literal IP addresses'});
});
test('async next retains isolated context and optional request property; inbound request IDs are ignored',async()=>{
 const {service}=setup();
 await Promise.all(Array.from({length:20},(_,i)=>request(service,{ip:`198.51.100.${i}`,headers:{'x-request-id':'credential'}},async req=>{
  await new Promise(resolve=>setImmediate(resolve));assert.equal(requestContext.getStore(),req.requestContext);assert.match(req.requestContext.requestId,/^[0-9a-f-]{36}$/);assert.notEqual(req.requestContext.requestId,'credential');
 })));
 assert.equal(requestContext.getStore(),undefined);
});
test('real Express HTTP request carries trusted IP across downstream await and ignores XFF',async()=>{
 const {service}=setup(undefined,'127.0.0.1'),app=express();app.use((req,res,next)=>service.middleware(req,res,next).catch(next));
 app.get('/api/v1/context',async(req,res)=>{await new Promise(resolve=>setImmediate(resolve));res.json({stored:requestContext.getStore(),property:req.requestContext});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/context`,{headers:{'X-Crefans-Client-IP':'2001:db8::9','X-Forwarded-For':'1.1.1.1'}}),body=await response.json();assert.equal(body.stored.ip,'2001:db8::9');assert.deepEqual(body.stored,body.property);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('high confidence SQL patterns deny the first request and repeat encoding up to three layers',async()=>{
 for(const value of['1 OR 1=1--',"x' OR 'a'='a'--","' OR '1'='1",'UNION SELECT password','union/**/all/**/select 1','1; DROP TABLE members','sleep(10)','benchmark(100,1)']){
  for(let depth=1;depth<=3;depth++){const {service,events}=setup();let encoded=value;for(let i=0;i<depth;i++)encoded=encodeURIComponent(encoded);const r=await request(service,{url:`/api/v1/items?creatorId=${encoded}`});assert.equal(r.res.code,403,value);assert.equal(r.res.body.errorCode,'INJECTION_DETECTED');assert.equal(events[0].data.action,'detected');}
 }
});
test('ordinary desc, IDs, prose/free q, bodies and webhook payloads pass without security rows',async()=>{
 const {service,db,events}=setup();
 for(const url of['/api/v1/items?sort=desc&status=active&page=1&limit=10&offset=0','/api/v1/items?id=ab12-cd34','/api/v1/items?sort=createdAt:desc','/api/v1/items?q=union%20select%201','/api/v1/items?status=desc','/api/v1/payments/webhook']){
  assert.equal((await request(service,{url,body:{id:'1 OR 1=1',password:'private'}})).passed,true,url);
 }
 assert.equal(db.rows.size,0);assert.equal(events.length,0);
});
test('scanner bounds field count, query size and structured value length without autobanning',async()=>{
 const {service,db,events}=setup();
 for(const query of[Array(102).fill('id=1').join('&'),'q='+('a'.repeat(16384)),'id='+('a'.repeat(2049))])assert.equal((await request(service,{url:'/api/v1/items?'+query})).res.code,400);
 assert.equal(db.rows.size,0);assert.equal(events.length,0);
});
test('two detections persist across service instances and concurrent requests block exactly once',async()=>{
 const a=setup(),b=setup(a.db);
 const results=await Promise.all(Array.from({length:12},(_,i)=>request(i%2?a.service:b.service,{url:attack})));
 assert.ok(results.every(r=>r.res.code===403));assert.equal(a.db.rows.get('198.51.100.9').count,2);
 const events=[...a.events,...b.events];assert.equal(events.filter(e=>e.type==='security.injection_detected').length,1);assert.equal(events.filter(e=>e.type==='security.ip_blocked').length,1);
 assert.equal((await request(setup(a.db).service)).res.body.errorCode,'IP_BLOCKED');
 for(const e of events){assert.deepEqual(Object.keys(e.data).sort(),['action','blockedUntil','count','ip','rule']);assert.equal(e.context.ip,e.data.ip);assert.ok(!JSON.stringify(e).includes('OR%20'));}
});
test('expired detection window resets count and rate-limits detected events for ten minutes',async()=>{
 const {service,db,events}=setup();await request(service,{url:attack});db.setNow('2026-10-21T16:10:00Z');await request(service,{url:attack});
 assert.equal(db.rows.get('198.51.100.9').count,1);assert.equal(events.filter(e=>e.type==='security.injection_detected').length,2);
});
test('first request after 24h releases once under concurrency and starts a fresh detection cycle',async()=>{
 const {service,db,events}=setup();await request(service,{url:attack});await request(service,{url:attack});db.setNow('2026-10-22T16:00:00Z');
 const results=await Promise.all(Array.from({length:8},()=>request(service)));assert.ok(results.every(r=>r.passed));assert.equal(events.filter(e=>e.type==='security.ip_released').length,1);
 assert.equal(db.rows.get('198.51.100.9').count,0);assert.equal((await request(service,{url:attack})).res.body.errorCode,'INJECTION_DETECTED');assert.equal(db.rows.get('198.51.100.9').count,1);
});
test('loopback IPv4 /8, IPv6 and mapped representations never autoban',async()=>{
 for(const ip of['127.0.0.1','127.9.8.7','::1','0:0:0:0:0:0:0:1','::ffff:127.0.0.1','::ffff:7f00:1']){
  const {service,db,events}=setup();for(let i=0;i<3;i++)assert.equal((await request(service,{ip,url:attack})).res.body.errorCode,'INJECTION_DETECTED');
  assert.ok([...db.rows.values()].every(row=>row.blocked_until===null));assert.equal(events.length,1);assert.equal((await request(service,{ip})).passed,true);
 }
});
test('DB failure denies suspicious requests and emits no false block or release success',async()=>{
 const {service,db,events}=setup();db.break(true);
 assert.equal((await request(service,{url:attack})).res.code,403);assert.equal(events.length,0);assert.equal((await request(service)).res.code,503);
});
test('reporting errors cannot admit attacks or undo a committed API ban',async()=>{
 const db=memoryDb(),service=new PlatformSecurityService(db,new ConfigService(),{record:async()=>{throw Error('telegram unavailable');}});
 assert.equal((await request(service,{url:attack})).res.code,403);assert.equal((await request(service,{url:attack})).res.body.errorCode,'IP_BLOCKED');assert.equal((await request(service)).res.code,403);assert.equal(db.outbox.size,2);
});
test('transaction update failure rolls back threshold and emits no block success',async()=>{
 const {service,db,events}=setup();await request(service,{url:attack});db.breakUpdate(true);
 assert.equal((await request(service,{url:attack})).res.body.errorCode,'INJECTION_DETECTED');assert.equal(db.rows.get('198.51.100.9').count,1);assert.equal(db.rows.get('198.51.100.9').blocked_until,null);assert.equal(events.length,1);
 db.breakUpdate(false);assert.equal((await request(service,{url:attack})).res.body.errorCode,'IP_BLOCKED');assert.equal(events.filter(e=>e.type==='security.ip_blocked').length,1);
});
test('outbox failure rolls back the ban and failed release; committed alerts retain safe context',async()=>{
 const {service,db,events}=setup();db.breakOutbox(true);assert.equal((await request(service,{url:attack})).res.code,403);assert.equal(db.rows.size,0);assert.equal(db.outbox.size,0);db.breakOutbox(false);await request(service,{url:attack});db.breakOutbox(true);
 assert.equal((await request(service,{url:attack})).res.body.errorCode,'INJECTION_DETECTED');assert.equal(db.rows.get('198.51.100.9').count,1);assert.equal(db.rows.get('198.51.100.9').blocked_until,null);assert.equal(db.outbox.size,1);assert.equal(events.length,1);
 db.breakOutbox(false);await request(service,{url:attack});assert.equal(db.outbox.size,2);
 const blocked=db.rows.get('198.51.100.9').blocked_until;db.setNow('2026-10-22T16:00:00Z');db.breakOutbox(true);
 assert.equal((await request(service)).res.code,503);assert.deepEqual(db.rows.get('198.51.100.9').blocked_until,blocked);assert.equal(db.outbox.size,2);
 db.breakOutbox(false);assert.equal((await request(service)).passed,true);assert.equal(db.outbox.size,3);
 for(const row of db.outbox.values()){assert.deepEqual(Object.keys(row.data).sort(),['action','blockedUntil','count','ip','rule']);assert.equal(row.ip,'198.51.100.9');assert.equal(row.peer_ip,row.ip);assert.match(row.request_id,/^[0-9a-f-]{36}$/);}
});
test('equivalent IPv6 spellings and IPv4-mapped IPv6 share persistent thresholds',async()=>{
 for(const aliases of[['2001:db8::5','2001:0db8:0:0:0:0:0:5'],['198.51.100.5','::ffff:c633:6405']]){
  const {service,db}=setup();await request(service,{ip:aliases[0],url:attack});assert.equal((await request(service,{ip:aliases[1],url:attack})).res.body.errorCode,'IP_BLOCKED');assert.equal(db.rows.size,1);
 }
});
test('trusted loopback peer does not exempt a remote attacker; unknown peer cannot trust headers',async()=>{
 const {service}=setup(undefined,'127.0.0.1');const remote={ip:'127.0.0.1',headers:{'x-crefans-client-ip':'198.51.100.99'},url:attack};
 await request(service,remote);assert.equal((await request(service,remote)).res.body.errorCode,'IP_BLOCKED');
 // Empty socket addresses are represented as unknown rather than trusting inbound headers.
 const empty=await request(service,{ip:'',headers:{'x-crefans-client-ip':'127.0.0.1'}});assert.equal(empty.req.requestContext.ip,'unknown');
});
test('non-API requests are outside this firewall',async()=>{
 const {service,db}=setup();db.break(true);assert.equal((await request(service,{url:'/preview?id=1%20OR%201=1'})).passed,true);
});
test('optional real MySQL: row lock, persistence across clients, and single release after expiry',{skip:!process.env.SECURITY_TEST_DATABASE_URL},async()=>{
 const connection=new URL(process.env.SECURITY_TEST_DATABASE_URL);
 assert.equal(connection.hostname,'127.0.0.1');assert.equal(connection.port,'3307');assert.ok(connection.pathname==='/crefans_platform_e2e'||/^\/crefans_[a-z_]*test$/.test(connection.pathname));
 const {PrismaClient}=require('@prisma/client'),a=new PrismaClient({datasourceUrl:connection.href}),b=new PrismaClient({datasourceUrl:connection.href});
 const ip=`198.18.${process.pid%256}.${1+process.pid%253}`;
 try{
  const operationalTables=await a.$queryRaw`SHOW TABLES LIKE 'platform_operational_events'`;
  if(!operationalTables.length)await a.$executeRawUnsafe(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261021161000_operational_events/migration.sql'),'utf8'));
  const tables=await a.$queryRaw`SHOW TABLES LIKE 'platform_security_ips'`;
  if(!tables.length)await a.$executeRawUnsafe(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261021160000_platform_security_ip/migration.sql'),'utf8'));
  const sa=setup(a),sb=setup(b);
  await request(sa.service,{ip,url:attack});
  const failedDb={$queryRaw:a.$queryRaw.bind(a),$transaction:fn=>a.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='platformOperationalEvent')return{upsert:async()=>{throw Error('injected outbox failure');}};return Reflect.get(target,key);}})))};
  assert.equal((await request(setup(failedDb).service,{ip,url:attack})).res.body.errorCode,'INJECTION_DETECTED');
  const [rolledBack]=await a.$queryRaw`SELECT * FROM platform_security_ips WHERE ip=${ip}`;assert.equal(rolledBack.count,1);assert.equal(rolledBack.blocked_until,null);assert.equal(await a.platformOperationalEvent.count({where:{ip}}),1);
  await Promise.all(Array.from({length:10},(_,i)=>request(i%2?sa.service:sb.service,{ip,url:attack})));
  const [row]=await a.$queryRaw`SELECT * FROM platform_security_ips WHERE ip=${ip}`;assert.equal(row.count,2);assert.ok(row.blocked_until>new Date());
  const events=[...sa.events,...sb.events];assert.equal(events.filter(e=>e.type==='security.ip_blocked').length,1);assert.equal(events.filter(e=>e.type==='security.injection_detected').length,1);
  assert.equal((await request(setup(b).service,{ip})).res.body.errorCode,'IP_BLOCKED');
  await a.$executeRaw`UPDATE platform_security_ips SET blocked_until=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE ip=${ip}`;
  await Promise.all(Array.from({length:6},(_,i)=>request(i%2?sa.service:sb.service,{ip})));
  assert.equal([...sa.events,...sb.events].filter(e=>e.type==='security.ip_released').length,1);
  assert.equal((await request(sa.service,{ip,url:attack})).res.body.errorCode,'INJECTION_DETECTED');
  const persisted=await a.platformOperationalEvent.findMany({where:{ip}});assert.equal(persisted.length,4);assert.equal(persisted.filter(e=>e.type==='security.ip_blocked').length,1);assert.equal(persisted.filter(e=>e.type==='security.ip_released').length,1);assert.ok(persisted.every(e=>e.request_id&&e.peer_ip===ip));
 }finally{await a.platformAuditLog.deleteMany({where:{ip}});await a.platformOperationalEvent.deleteMany({where:{ip}});await a.$executeRaw`DELETE FROM platform_security_ips WHERE ip=${ip}`;await Promise.all([a.$disconnect(),b.$disconnect()]);}
});
