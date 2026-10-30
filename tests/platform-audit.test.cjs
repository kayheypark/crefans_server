require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config'),axios=require('axios');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {appendAudit,observeAudit,safeAuditData,safeError,auditChange}=require('../dist/src/platform/audit');
const {requestContext}=require('../dist/src/platform/request-context');
const {enqueueOperation}=require('../dist/src/platform/operations-events');
const {adminLogs,adminLogDetail}=require('../dist/src/platform/admin-logs');
const {pruneAuditLogs}=require('../dist/src/platform/audit-retention');
const {reportClientError}=require('../dist/src/platform/client-errors');
const {PaymentProvider}=require('../dist/src/platform/payment-provider');
const {MemberMailService}=require('../dist/src/auth/local/member-mail.service');
const {PlatformOperationsService}=require('../dist/src/platform/operations.service');
const db=new PrismaClient(),scope=randomUUID(),requestId=randomUUID(),admin={role:'ADMIN'};
const context={actorId:scope,actorRole:'ADMIN',ip:'198.51.100.44',peerIp:'172.30.90.2',requestId,jobId:randomUUID()};
const scoped=fn=>requestContext.run({...context},fn);
after(async()=>{await db.platformAuditLog.deleteMany({where:{actor_id:scope}});await db.platformOperationalEvent.deleteMany({where:{dedupe_key:{startsWith:scope}}});await db.$disconnect();});
test('allowlist rejects credentials, personal fields, log injection and raw stack messages',()=>{
 const safe=safeAuditData({password:'SECRET',token:'SECRET',email:'SECRET',cardNumber:'SECRET',account:'SECRET',body:'SECRET',query:'SECRET',headers:{authorization:'SECRET'},providerCode:'X\nSECRET',status:'paid',amount:100,route:'/api/v1/orders/:id',before:{status:'pending',nickname:'SECRET'},changedFields:['nickname','bad\nSECRET']});
 assert.deepEqual(safe,{status:'paid',amount:100,route:'/api/v1/orders/:id',before:{status:'pending'},changedFields:['nickname']});
 const error=new Error('SECRET');error.stack='Error: SECRET\n at f (/app/dist/src/platform/audit.js:12:4)\n at https://example.test/?token=SECRET';
 assert.deepEqual(safeError(error).frames,['dist/src/platform/audit.js:12:4']);assert.doesNotMatch(JSON.stringify(safeError(error)),/SECRET|https/);
 assert.deepEqual(auditChange({nickname:'private-a',status:'pending'},{nickname:'private-b',status:'paid'}),{changedFields:['nickname','status'],before:{status:'pending'},after:{status:'paid'}});
});
test('business change and audit roll back together; deduplication and outbox deletion preserve audit',async()=>{
 const key=scope+':rollback';await assert.rejects(scoped(()=>db.$transaction(async tx=>{await enqueueOperation(tx,'content.updated',{postId:scope},key);throw Error('rollback');})),/rollback/);
 assert.equal(await db.platformOperationalEvent.count({where:{dedupe_key:key}}),0);assert.equal(await db.platformAuditLog.count({where:{actor_id:scope}}),0);
 const event=await scoped(()=>db.$transaction(tx=>enqueueOperation(tx,'content.updated',{postId:scope,password:'SECRET'},scope+':saved')));
 await scoped(()=>db.$transaction(tx=>enqueueOperation(tx,'content.updated',{postId:scope},scope+':saved')));
 assert.equal(await db.platformAuditLog.count({where:{source_id:event.id}}),1);
 await db.platformOperationalEvent.delete({where:{id:event.id}});const row=await db.platformAuditLog.findUnique({where:{source_id:event.id}});
 assert.equal(row.request_id,requestId);assert.equal(row.actor_id,scope);assert.equal(row.ip,context.ip);assert.doesNotMatch(JSON.stringify(row),/SECRET/);
});
test('admin log filtering, stable pagination, linked timeline and invalid/forbidden inputs',async()=>{
 for(let i=0;i<23;i++)await scoped(()=>appendAudit(db,{category:'finance',action:'refund.completed',entityId:scope,data:{amount:100+i,status:'refunded'}}));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()),q={from:today,to:today,actorId:scope,category:'finance'};
 const first=await adminLogs(db,admin,q),second=await adminLogs(db,admin,{...q,page:'2'});assert.equal(first.total,23);assert.equal(first.items.length,20);assert.equal(second.items.length,3);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,23);
 const detail=await adminLogDetail(db,admin,first.items[0].id);assert.equal(detail.timeline.length,24);assert.equal(detail.hasMore,false);assert.equal(detail.event.requestId,requestId);
 await assert.rejects(adminLogs(db,{role:'MODERATOR'},q),e=>e.getStatus()===403);await assert.rejects(adminLogDetail(db,{role:'MODERATOR'},first.items[0].id),e=>e.getStatus()===403);
 for(const bad of[{ip:'1.2.3'},{requestId:"x' OR 1=1"},{category:'secret'},{from:'2026-02-31'},{from:'2020-01-01',to:'2026-01-01'},{actorId:['x','y']}])await assert.rejects(adminLogs(db,admin,{...q,...bad}),e=>e.getStatus()===400);
 await assert.rejects(adminLogDetail(db,admin,randomUUID()),e=>e.getStatus()===404);
 assert.equal((await adminLogs(db,admin,{...q,requestId:randomUUID()})).total,0);
});
test('observational audit outage cannot change a successful provider result; safe errors retained',async()=>{
 const original=axios.request,records=[],broken={platformAuditLog:{create:async()=>{throw Error('SECRET database');}}};
 const log=console.log,err=console.error;console.log=x=>records.push(x);console.error=x=>records.push(x);
 try{
  const provider=new PaymentProvider(new ConfigService({TOSS_CLIENT_KEY:'test_ck_PRIVATE',TOSS_SECRET_KEY:'test_sk_PRIVATE'}),broken);
  axios.request=async()=>({status:200,data:{status:'DONE',paymentKey:'SECRET'}});
  const order={id:scope,amount:500,snapshot:{name:'PRIVATE'}};assert.equal((await scoped(()=>provider.charge('SECRET','SECRET',order))).status,'DONE');
  axios.request=async()=>{throw {code:'ETIMEDOUT',message:'SECRET'};};await assert.rejects(scoped(()=>provider.charge('SECRET','SECRET',order)),e=>e.getResponse().code==='PAYMENT_UNCERTAIN');
  axios.request=async()=>{throw {response:{status:400,data:{code:'REJECT_CARD_PAYMENT',message:'SECRET'}}};};await assert.rejects(scoped(()=>provider.charge('SECRET','SECRET',order)),e=>e.getResponse().code==='PAYMENT_FAILED');
  const logs=records.map(JSON.parse);assert.equal(logs.filter(r=>r.action==='provider.attempt'&&r.event==='audit').length,3);assert.equal(logs.filter(r=>r.action==='provider.result'&&r.event==='audit').length,3);assert.ok(logs.some(r=>r.metadata?.providerCode==='REJECT_CARD_PAYMENT'));assert.ok(logs.some(r=>r.event==='audit_persist_failed'));assert.doesNotMatch(records.join(''),/SECRET|PRIVATE/);
 }finally{axios.request=original;console.log=log;console.error=err;}
});
test('SMTP acceptance and rejection logs contain counts/code, never recipient or verification code',async()=>{
 const mail=new MemberMailService(new ConfigService({MEMBER_MAIL_PROVIDER:'smtp',SMTP_HOST:'mailpit',SMTP_FROM:'sender@private.invalid'}),db);
 mail.transport={sendMail:async msg=>({messageId:msg.messageId,accepted:['recipient@private.invalid'],rejected:[]})};
 await scoped(()=>mail.sendCode('recipient@private.invalid','987654','verify'));
 mail.transport={sendMail:async()=>{throw Object.assign(Error('recipient@private.invalid'),{code:'EENVELOPE',responseCode:550});}};
 await assert.rejects(scoped(()=>mail.sendCode('recipient@private.invalid','987654','reset')));
 const rows=await db.platformAuditLog.findMany({where:{actor_id:scope,category:'mail'}});assert.equal(rows.length,4);assert.ok(rows.some(r=>r.metadata.acceptedCount===1));assert.ok(rows.some(r=>r.metadata.smtpStatus===550));assert.doesNotMatch(JSON.stringify(rows),/private.invalid|987654/);
});
test('retention deletes only expired access rows by default; explicit audit retention is bounded',async()=>{
 const saved={access:process.env.ACCESS_LOG_RETENTION_DAYS,audit:process.env.AUDIT_RETENTION_DAYS};process.env.ACCESS_LOG_RETENTION_DAYS='7';process.env.AUDIT_RETENTION_DAYS='0';let query,deleted;
 const fake={platformAuditLog:{findMany:async q=>{query=q;return[{id:scope}];},deleteMany:async q=>{deleted=q;return{count:1};}}};
 try{const now=new Date('2026-10-22T00:00:00Z');assert.equal(await pruneAuditLogs(fake,now),1);assert.equal(query.where.OR.length,1);assert.equal(query.where.OR[0].category,'request');assert.equal(query.where.OR[0].occurred_at.lt.toISOString(),'2026-10-15T00:00:00.000Z');assert.equal(query.take,1000);assert.deepEqual(deleted.where,{id:{in:[scope]}});
 process.env.AUDIT_RETENTION_DAYS='90';await assert.rejects(pruneAuditLogs(fake,now),/Invalid/);process.env.AUDIT_RETENTION_DAYS='730';await pruneAuditLogs(fake,now);assert.equal(query.where.OR.length,2);assert.deepEqual(query.where.OR[0].OR,[{actor_role:null},{actor_role:{notIn:['SUPER_ADMIN','ADMIN','MODERATOR']}}]);assert.equal(query.where.OR[1].occurred_at.lt.toISOString(),'2024-10-22T00:00:00.000Z');process.env.AUDIT_RETENTION_DAYS='-1';await assert.rejects(pruneAuditLogs(fake),/Invalid/);
 }finally{for(const [k,v]of [['ACCESS_LOG_RETENTION_DAYS',saved.access],['AUDIT_RETENTION_DAYS',saved.audit]])v===undefined?delete process.env[k]:process.env[k]=v;}
});
test('client reports are bounded, untrusted, rate-limited and scrubbed server-side',async()=>{
 const calls=[],limiter={limit:async(...args)=>calls.push(args)};
 const report=await scoped(()=>reportClientError(db,limiter,{errorType:'TypeError',frames:['_next/static/chunks/a.js:1:2','SECRET'],message:'SECRET',email:'SECRET',requestId},'console'));
 const row=await db.platformAuditLog.findFirstOrThrow({where:{entity_id:report.reportId}});assert.equal(row.metadata.outcome,'client_reported');assert.deepEqual(row.metadata.frames,['_next/static/chunks/a.js:1:2']);assert.doesNotMatch(JSON.stringify(row),/SECRET/);assert.equal(calls[0][1],10);assert.equal(calls[0][2],60);
 await assert.rejects(scoped(()=>reportClientError(db,limiter,{errorType:'TypeError',frames:Array(13).fill('a')},'service')),e=>e.getStatus()===400);
 await assert.rejects(scoped(()=>reportClientError(db,{limit:async()=>{throw Error('rate limited');}},{errorType:'Error',frames:[]},'service')),/rate limited/);
});
test('API watchdog detects missing/stale worker but never alerts for fresh heartbeat',async()=>{
 const none={count:async()=>0};let heartbeat=null;const events=[];const ops=new PlatformOperationsService({platformJob:{findUnique:async()=>heartbeat},checkoutOrder:none,beanCharge:none,marketingDelivery:none,platformAuditLog:none,platformOperationalEvent:none},new ConfigService({}));ops.record=async(...args)=>events.push(args);
 const now=new Date();await ops.checkWorkerHealth(now);heartbeat={completed_at:new Date(+now-300001)};await ops.checkWorkerHealth(now);heartbeat={completed_at:now};await ops.checkWorkerHealth(now);assert.equal(events.length,2);assert.equal(events[0][0],'worker.stale');assert.equal(events[0][2],events[1][2]);
});

test('API watchdog reports each stalled queue once an hour and stays quiet when queues are empty',async()=>{
 const now=new Date('2026-10-29T03:10:00Z'),counts={processing:0,refunding:0,beans:0,uncertain:0,lagging:0,backlog:0},events=[];
 const db={platformJob:{findUnique:async()=>({completed_at:now})},checkoutOrder:{count:async q=>q.where.status==='processing'?counts.processing:counts.refunding},beanCharge:{count:async()=>counts.beans},marketingDelivery:{count:async()=>counts.uncertain},platformAuditLog:{count:async()=>counts.lagging},platformOperationalEvent:{count:async()=>counts.backlog}};
 const ops=new PlatformOperationsService(db,new ConfigService({TELEGRAM_OPERATIONS_BOT_TOKEN:'configured'}));ops.record=async(...args)=>events.push(args);
 await ops.checkWorkerHealth(now);assert.equal(events.length,0);
 Object.assign(counts,{processing:2,refunding:1,beans:1,uncertain:3,lagging:5,backlog:4});await ops.checkWorkerHealth(now);
 assert.deepEqual(events.map(e=>e[0]),['payment.stuck','refund.stuck','beans.charge_stuck','marketing.uncertain','audit.retention_lagging','alerts.backlog']);
 assert.equal(events[0][1].count,2);assert.equal(events[0][2],'payment.stuck:'+Math.floor(+now/3600000));
});

test('audit persistence failure aborts the business transaction and outbox insert',async()=>{
 const key=scope+':audit-down';await assert.rejects(scoped(()=>db.$transaction(async tx=>{const broken=new Proxy(tx,{get(target,k){if(k==='platformAuditLog')return{upsert:async()=>{throw Error('audit unavailable');}};return target[k];}});await enqueueOperation(broken,'content.updated',{postId:scope},key);})),/audit unavailable/);assert.equal(await db.platformOperationalEvent.count({where:{dedupe_key:key}}),0);
});
