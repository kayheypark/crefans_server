require('reflect-metadata');
require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
const source=process.env.DATABASE_URL,url=new URL(source);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3307');assert.equal(url.pathname,'/crefans_platform_dev');
url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {enqueueOperation}=require('../dist/src/platform/operations-events'),{requestContext}=require('../dist/src/platform/request-context');
const {PlatformService}=require('../dist/src/platform/service'),{PlatformStudioService}=require('../dist/src/platform/studio.service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),{PlatformAuthService}=require('../dist/src/platform/auth.service'),{digest}=require('../dist/src/auth/local/credentials');
const testLegal=require('./legal-fixture.cjs').installTestLegal();
const db=new PrismaClient(),scope=randomUUID(),creator=randomUUID(),fan=randomUUID(),signupEmail=scope+'@example.invalid',rollbackEmail=randomUUID()+'@example.invalid';
const members=[creator,fan],emails=[signupEmail,rollbackEmail],service=new PlatformService(db),studio=new PlatformStudioService(service),finance=new PlatformFinanceService(service,{},new ConfigService({}),{});
const context={ip:'203.0.113.7',peerIp:'172.20.0.2',requestId:randomUUID()},documents=[],proofs=[];
let releaseDatabase,category,plan,post,subscription;
function unavailableOutbox(){return new Proxy(db,{get(target,key){if(key==='$transaction')return fn=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='platformOperationalEvent')return{create:async()=>{throw Error('outbox unavailable');},upsert:async()=>{throw Error('outbox unavailable');}};const value=t[k];return typeof value==='function'?value.bind(t):value;}})));const value=target[key];return typeof value==='function'?value.bind(target):value;}});}
async function events(type,memberId=creator){return db.platformOperationalEvent.findMany({where:{type,data:{path:'$.memberId',equals:memberId}}});}
async function order(extra={}){return db.checkoutOrder.create({data:{member_id:fan,membership_id:plan.id,snapshot:{name:'Synthetic membership',platformFeeBps:1000,settlementHoldDays:0},amount:10000,status:'processing',idempotency_key:randomUUID(),expires_at:new Date(Date.now()+60000),...extra}});}
async function signupInput(email){const emailProof=randomUUID(),identityProof=randomUUID(),expires=new Date(Date.now()+600000);await db.signupChallenge.create({data:{email,code_hash:'0'.repeat(64),proof_hash:digest(emailProof),verified_at:new Date(),sent_at:new Date(),expires_at:expires}});const p=await db.identityProof.create({data:{token_hash:digest(identityProof),provider_reference:randomUUID(),attempt_id:randomUUID(),identity_hash:digest(randomUUID()),verified_name:'Synthetic person',adult_verified:true,purpose:'signup',expires_at:expires}});proofs.push(p.id);return{email,password:'Synthetic-password-123!',nickname:'Synthetic member',terms:true,privacy:true,policyVersions:testLegal.signup().versions,emailProof,identityProof};}
before(async()=>{
 releaseDatabase=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-operations-schema-'));
 try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated E2E migration must succeed');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const id of members)await db.member.create({data:{id,email:id+'@example.invalid',name:'Synthetic',nickname:'Synthetic',preferred_username:id,email_verified:true}});
 category=await db.creatorCategory.create({data:{name:scope}});await db.creator.create({data:{user_id:creator,category_id:category.id}});plan=await db.membershipItem.create({data:{creator_id:creator,name:'Synthetic membership',price:10000,benefits:'[]',billing_unit:'MONTH'}});
 for(const kind of['terms','privacy']){const doc=await db.serviceDocument.create({data:{kind,title:'Synthetic operations test',content:{sections:[]},published:true}});documents.push(doc.id);}
});
after(async()=>{try{
 const signups=await db.member.findMany({where:{email:{in:emails}},select:{id:true}});const ids=[...members,...signups.map(m=>m.id)];
 await db.platformOperationalEvent.deleteMany({where:{OR:[{data:{path:'$.targetId',equals:scope}},...ids.map(id=>({data:{path:'$.memberId',equals:id}}))]}});
 await db.memberConsent.deleteMany({where:{member_id:{in:ids}}});await db.accountPreference.deleteMany({where:{member_id:{in:ids}}});await db.signupChallenge.deleteMany({where:{email:{in:emails}}});await db.identityProof.deleteMany({where:{id:{in:proofs}}});
 await db.memberNotification.deleteMany({where:{member_id:{in:ids}}});await db.revenueEntry.deleteMany({where:{creator_id:creator}});await db.checkoutOrder.deleteMany({where:{member_id:fan}});await db.subscription.deleteMany({where:{subscriber_id:fan}});await db.postingMedia.deleteMany({where:{posting:{user_sub:creator}}});await db.posting.deleteMany({where:{user_sub:creator}});await db.membershipItem.deleteMany({where:{creator_id:creator}});await db.creator.deleteMany({where:{user_id:creator}});if(category)await db.creatorCategory.delete({where:{id:category.id}});await db.userProfile.deleteMany({where:{user_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});await db.serviceDocument.deleteMany({where:{id:{in:documents}}});
 }finally{await db.$disconnect();await releaseDatabase?.();}});
test('outbox defaults, context and metadata allowlist exclude private/nested/log injection data',async()=>{
 const row=await requestContext.run(context,()=>db.$transaction(tx=>enqueueOperation(tx,'test.metadata',{targetId:scope,status:'PUBLISHED',email:'private@example.invalid',body:'private body',memberId:{email:'private'},postId:'x\r\nspoof',planId:'private@example.invalid'})));
 assert.deepEqual(row.data,{targetId:scope,status:'PUBLISHED'});assert.equal(row.ip,context.ip);assert.equal(row.peer_ip,context.peerIp);assert.equal(row.request_id,context.requestId);assert.equal(row.attempts,0);assert.equal(row.locked_until,null);assert.equal(row.delivered_at,null);assert.equal(row.last_error_code,null);assert.ok(row.available_at instanceof Date);
 const noContext=await db.$transaction(tx=>enqueueOperation(tx,'test.context',{targetId:scope}));assert.equal(noContext.ip,null);assert.equal(noContext.peer_ip,null);assert.equal(noContext.request_id,null);
});
test('invalid operation types are rejected before persistence',async()=>{
 for(const type of['bad\r\nlog','A'.repeat(65),'',null])await assert.rejects(db.$transaction(tx=>enqueueOperation(tx,type,{targetId:scope})),/Invalid operation type/);
 assert.equal(await db.platformOperationalEvent.count({where:{type:'bad\r\nlog',data:{path:'$.targetId',equals:scope}}}),0);
});
test('dedupe returns original row without resetting delivery or metadata',async()=>{
 const key='ops-test:'+scope,row=await db.$transaction(tx=>enqueueOperation(tx,'test.dedupe',{targetId:scope},key));await db.platformOperationalEvent.update({where:{id:row.id},data:{attempts:3,delivered_at:new Date(),last_error_code:'TEST'}});
 const replay=await db.$transaction(tx=>enqueueOperation(tx,'test.dedupe',{targetId:scope,status:'changed'},key));assert.equal(replay.id,row.id);assert.equal(replay.attempts,3);assert.ok(replay.delivered_at);assert.deepEqual(replay.data,{targetId:scope});
});
test('concurrent dedupe creates one durable event',async()=>{
 const key='ops-concurrent:'+scope,rows=await Promise.all([0,1].map(()=>db.$transaction(tx=>enqueueOperation(tx,'test.concurrent',{targetId:scope},key))));assert.equal(rows[0].id,rows[1].id);assert.equal(await db.platformOperationalEvent.count({where:{dedupe_key:key}}),1);
});
test('transaction rollback removes event and business update together',async()=>{
 const prior=await db.member.findUniqueOrThrow({where:{id:fan}});await assert.rejects(db.$transaction(async tx=>{await tx.member.update({where:{id:fan},data:{nickname:'rolled back'}});await enqueueOperation(tx,'test.rollback',{targetId:scope});throw Error('rollback control');}),/rollback control/);assert.equal((await db.member.findUniqueOrThrow({where:{id:fan}})).nickname,prior.nickname);assert.equal(await db.platformOperationalEvent.count({where:{type:'test.rollback',data:{path:'$.targetId',equals:scope}}}),0);
});
test('signup emits once with server context and replay cannot duplicate it',async()=>{
 const input=await signupInput(signupEmail),auth=new PlatformAuthService(db,{}, {},new ConfigService({}));await requestContext.run(context,()=>auth.signup(input));const member=await db.member.findUniqueOrThrow({where:{email:signupEmail}});const rows=await events('member.signup',member.id);assert.equal(rows.length,1);assert.deepEqual(rows[0].data,{memberId:member.id});assert.equal(rows[0].ip,context.ip);await assert.rejects(auth.signup(input));assert.equal((await events('member.signup',member.id)).length,1);
});
test('outbox failure rolls signup, consent and proof consumption back',async()=>{
 const input=await signupInput(rollbackEmail),auth=new PlatformAuthService(unavailableOutbox(),{}, {},new ConfigService({}));await assert.rejects(auth.signup(input),/outbox unavailable/);assert.equal(await db.member.count({where:{email:rollbackEmail}}),0);assert.equal((await db.identityProof.findUniqueOrThrow({where:{id:proofs.at(-1)}})).consumed_at,null);assert.equal(await db.signupChallenge.count({where:{email:rollbackEmail}}),1);
});
test('successful subscription and renewal emit once per order; existing ledger arithmetic stays intact',async()=>{
 const first=await order();await finance.finalize(first.id,'synthetic-'+first.id);await finance.finalize(first.id,'synthetic-'+first.id);subscription=(await db.checkoutOrder.findUniqueOrThrow({where:{id:first.id}})).subscription_id;assert.equal((await events('subscription.started',fan)).length,1);const ledger=await db.revenueEntry.findUniqueOrThrow({where:{order_id:first.id}});assert.equal(ledger.gross,10000);assert.equal(ledger.fees,1000);assert.equal(ledger.net,9000);
 const renewal=await order({subscription_id:subscription,period_start:new Date(Date.now()+86400000)});await finance.finalize(renewal.id,'synthetic-'+renewal.id);await finance.finalize(renewal.id,'synthetic-'+renewal.id);const rows=await events('subscription.renewed',fan);assert.equal(rows.length,1);assert.equal(rows[0].data.subscriptionId,subscription);assert.equal(rows[0].data.orderId,renewal.id);
});
test('outbox failure rolls payment finalization, grant and ledger back',async()=>{
 const pending=await order(),failing=new PlatformFinanceService(new PlatformService(unavailableOutbox()),{},new ConfigService({}),{});await assert.rejects(failing.finalize(pending.id,'synthetic-'+pending.id),/outbox unavailable/);const row=await db.checkoutOrder.findUniqueOrThrow({where:{id:pending.id}});assert.equal(row.status,'processing');assert.equal(row.subscription_id,null);assert.equal(await db.revenueEntry.count({where:{order_id:pending.id}}),0);
});
test('concurrent/repeated cancellation emits only when auto renewal changes',async()=>{
 await Promise.all([finance.cancelSubscription(fan,creator),finance.cancelSubscription(fan,creator)]);await finance.cancelSubscription(fan,creator);const rows=await events('subscription.cancelled',fan);assert.equal(rows.length,1);assert.equal(rows[0].data.subscriptionId,subscription);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:subscription}})).auto_renew,false);
});
test('fan and creator profile changes only emit identifier metadata',async()=>{
 await service.profile(fan,{name:'New nickname',bio:'Sensitive biography'});await studio.updateProfile(creator,{name:'Creator name',handle:creator,category:category.name,bio:'Private bio',about:'Private about'});assert.deepEqual((await events('member.profile.updated',fan))[0].data,{memberId:fan});assert.deepEqual((await events('creator.profile.updated'))[0].data,{memberId:creator,creatorId:creator});
});
test('outbox failure rolls both profile writes back',async()=>{
 const beforeFan=await db.member.findUniqueOrThrow({where:{id:fan}}),beforeCreator=await db.creator.findUniqueOrThrow({where:{user_id:creator}}),failing=new PlatformService(unavailableOutbox());await assert.rejects(failing.profile(fan,{name:'Must rollback',bio:'Must rollback'}),/outbox unavailable/);await assert.rejects(new PlatformStudioService(failing).updateProfile(creator,{name:'Must rollback',handle:creator,category:category.name,bio:'Must rollback'}),/outbox unavailable/);assert.equal((await db.member.findUniqueOrThrow({where:{id:fan}})).nickname,beforeFan.nickname);assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:creator}})).display_name,beforeCreator.display_name);
});
test('content create/update/delete emit only committed transitions; repeat delete adds no event',async()=>{
 const input={title:'Private title',body:'Private body',status:'draft',commentsEnabled:true,media:[]};post=(await studio.saveContent(creator,input)).id;await studio.saveContent(creator,{...input,id:post,title:'Edited private title'});await studio.deleteContent(creator,post);await assert.rejects(studio.deleteContent(creator,post));for(const type of['content.created','content.updated','content.deleted']){const rows=await events(type);assert.equal(rows.length,1);assert.equal(rows[0].data.postId,post);assert.equal(JSON.stringify(rows[0].data).includes('Private'),false);}
});
test('outbox failure rolls content create/update/delete back',async()=>{
 const failing=new PlatformStudioService(new PlatformService(unavailableOutbox())),input={title:'Rollback title',body:'Rollback body',status:'draft',commentsEnabled:true,media:[]};const count=await db.posting.count({where:{user_sub:creator}});await assert.rejects(failing.saveContent(creator,input),/outbox unavailable/);assert.equal(await db.posting.count({where:{user_sub:creator}}),count);const id=(await studio.saveContent(creator,input)).id;await assert.rejects(failing.saveContent(creator,{...input,id,title:'Must rollback'}),/outbox unavailable/);assert.equal((await db.posting.findUniqueOrThrow({where:{id}})).title,input.title);await assert.rejects(failing.deleteContent(creator,id),/outbox unavailable/);assert.equal((await db.posting.findUniqueOrThrow({where:{id}})).is_deleted,false);
});
