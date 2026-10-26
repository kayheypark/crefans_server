require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),{PaymentProvider}=require('../dist/src/platform/payment-provider'),{reject}=require('../dist/src/platform/http');
const db=new PrismaClient(),members=[],creators=[];
const code=value=>error=>error.getResponse?.().code===value;
const settings={PLATFORM_FEE_BPS:'1000',SETTLEMENT_HOLD_DAYS:'0',REFUND_WINDOW_DAYS:'30',RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1'};
async function fixture(overrides={}){
 const creator=randomUUID(),fan=randomUUID();members.push(creator,fan);creators.push(creator);
 for(const id of[creator,fan])await db.member.create({data:{id,email:id+'@example.invalid',name:'결제 검증',nickname:'검증',preferred_username:id,email_verified:true}});
 await db.creator.create({data:{user_id:creator}});
 const plan=await db.membershipItem.create({data:{creator_id:creator,name:'월 구독',price:10000,benefits:'["혜택"]',billing_unit:'MONTH'}});
 const card=await db.billingMethod.create({data:{member_id:fan,customer_key:randomUUID(),billing_key_encrypted:'test-billing-key',label:'테스트카드',last_four:'1234',is_default:true}});
 const approved=new Map(),calls=[];
 const provider={configForClient:()=>({clientKey:'test-only'}),encrypt:x=>x,decrypt:x=>x,
  charge:async(key,customer,order)=>{calls.push({key,customer,order});const externalId=order.attempts?order.id+'_'+order.attempts:order.id;const response={status:'DONE',totalAmount:order.amount,orderId:externalId,paymentKey:'test-'+externalId};approved.set(externalId,response);return response;},
  lookup:async id=>approved.get(id),cancel:async key=>{const r=[...approved.values()].find(r=>r.paymentKey===key);const result={...r,status:'CANCELED',balanceAmount:0};approved.set(result.orderId,result);return result;},...overrides};
 const finance=new PlatformFinanceService(new PlatformService(db),provider,new ConfigService(settings),{});
 const order=await finance.createOrder(fan,{planId:plan.id,requestId:randomUUID()});
 return{creator,fan,plan,card,provider,finance,order,approved,calls};
}
async function due(f){const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});const past=new Date(Date.now()-60000);return db.subscription.update({where:{id:sub.id},data:{ended_at:past,next_billing_date:past}});}
after(async()=>{
 await db.billingNotice.deleteMany({where:{member_id:{in:members}}});await db.savedPost.deleteMany({where:{member_id:{in:members}}});await db.posting.deleteMany({where:{user_sub:{in:creators}}});
 await db.revenueEntry.deleteMany({where:{creator_id:{in:creators}}});await db.checkoutOrder.deleteMany({where:{member_id:{in:members}}});await db.subscription.deleteMany({where:{subscriber_id:{in:members}}});await db.membershipItem.deleteMany({where:{creator_id:{in:creators}}});await db.billingMethod.deleteMany({where:{member_id:{in:members}}});await db.memberNotification.deleteMany({where:{member_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:creators}}});await db.member.deleteMany({where:{id:{in:members}}});await db.$disconnect();
});

const axios=require('axios');
const {unusableCardCodes,renewalDeadline}=require('../dist/src/platform/billing-failures');
const {BillingNoticesService}=require('../dist/src/platform/billing-notices.service');
const fail=providerCode=>{const e=new (require('@nestjs/common').HttpException)({code:'PAYMENT_METHOD_UNAVAILABLE',message:'카드 변경 필요'},400);e.providerCode=providerCode;throw e;};
async function failedRenewal(providerCode='INVALID_CARD_LOST_OR_STOLEN'){
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);f.sub=await due(f);f.normal=f.provider.charge;f.declines=0;f.provider.charge=async()=>{f.declines++;fail(providerCode);};await f.finance.renew(f.sub.id);f.renewal=await db.checkoutOrder.findFirstOrThrow({where:{subscription_id:f.sub.id,status:'failed'}});return f;
}
async function replacement(f){return db.billingMethod.create({data:{member_id:f.fan,customer_key:randomUUID(),billing_key_encrypted:'replacement',label:'새 카드',last_four:'4321'}});}
async function expireWindow(f){const past=new Date(Date.now()-4*3600000);await db.subscription.update({where:{id:f.sub.id},data:{next_billing_date:past}});await db.checkoutOrder.update({where:{id:f.renewal.id},data:{period_start:past,idempotency_key:`renew-${f.sub.id}-${past.toISOString()}`}});}
for(const value of unusableCardCodes)test('Toss confirmed unusable billing card '+value,async()=>{
 const original=axios.request,provider=new PaymentProvider(new ConfigService({TOSS_CLIENT_KEY:'test-only',TOSS_SECRET_KEY:'test-only'}));
 try{axios.request=async()=>{throw{response:{status:400,data:{code:value}}};};await assert.rejects(provider.charge('private-key','customer',{id:randomUUID(),snapshot:{name:'test'},amount:10000}),e=>code('PAYMENT_METHOD_UNAVAILABLE')(e)&&e.providerCode===value);await assert.rejects(provider.issue('auth','customer','issue'),code('PAYMENT_FAILED'));}finally{axios.request=original;}
});
for(const [status,value,expected] of [[403,'REJECT_CARD_PAYMENT','PAYMENT_FAILED'],[403,'REJECT_ACCOUNT_PAYMENT','PAYMENT_FAILED'],[500,'INVALID_STOPPED_CARD','PAYMENT_UNCERTAIN'],[409,'INVALID_STOPPED_CARD','PAYMENT_UNCERTAIN'],[400,'PROVIDER_ERROR','PAYMENT_UNCERTAIN'],[401,'UNAUTHORIZED_KEY','PAYMENT_CONFIGURATION_ERROR']])test('failure boundary '+status+'/'+value,async()=>{
 const original=axios.request,provider=new PaymentProvider(new ConfigService({TOSS_CLIENT_KEY:'test-only',TOSS_SECRET_KEY:'test-only'}));try{axios.request=async()=>{throw{response:{status,data:{code:value}}};};await assert.rejects(provider.charge('private','customer',{id:randomUUID(),snapshot:{name:'test'},amount:10000}),code(expected));}finally{axios.request=original;}
});
test('lost card blocks further charges across worker ticks and exposes only a safe status',async()=>{
 const f=await failedRenewal();for(let i=0;i<5;i++)await f.finance.renew(f.sub.id);assert.equal(f.declines,1);assert.equal(await db.revenueEntry.count({where:{order_id:f.renewal.id}}),0);
 const card=await db.billingMethod.findUniqueOrThrow({where:{id:f.card.id}});assert.ok(card.unavailable_at);assert.equal(card.unavailable_reason,'INVALID_CARD_LOST_OR_STOLEN');
 const service=new PlatformService(db),common=await service.common(f.fan);assert.equal(common.paymentMethods[0].requiresUpdate,true);assert.ok(!JSON.stringify(common).includes('LOST_OR_STOLEN'));
 const boot=await service.bootstrap(f.fan);assert.equal(boot.subscriptions[0].status,'expired');assert.equal(boot.subscriptions[0].billingIssue,'action_required');assert.equal(boot.subscriptions[0].renewalPending,true);
 await assert.rejects(f.finance.method(f.fan,f.card.id,'default'),code('PAYMENT_METHOD_UNAVAILABLE'));await assert.rejects(f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID()}),code('ALREADY_SUBSCRIBED'));
 assert.equal(await db.billingNotice.count({where:{member_id:f.fan,kind:'payment-failed'}}),1);assert.equal(await db.platformOperationalEvent.count({where:{dedupe_key:`renewal.failed:${f.renewal.id}:0`}}),1);
});
test('new default card recovers one failed renewal and one entitlement, never the old card',async()=>{
 const f=await failedRenewal(),card=await replacement(f);await f.finance.method(f.fan,card.id,'default');f.provider.charge=f.normal;await f.finance.renew(f.sub.id);await f.finance.renew(f.sub.id);
 assert.equal(f.declines,1);assert.equal(f.calls.length,2);assert.equal(f.calls[1].key,'replacement');assert.equal(f.calls[1].order.id,f.renewal.id);assert.equal(f.calls[1].order.attempts,1);
 assert.equal(await db.subscription.count({where:{subscriber_id:f.fan}}),1);assert.equal(await db.revenueEntry.count({where:{order_id:f.renewal.id}}),1);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}})).payment_failure_count,0);
 assert.equal((await new PlatformService(db).bootstrap(f.fan)).subscriptions[0].billingIssue,undefined);
});
test('cancellation followed by card replacement never reactivates billing',async()=>{
 const f=await failedRenewal();await f.finance.cancelSubscription(f.fan,f.creator);const card=await replacement(f);await f.finance.method(f.fan,card.id,'default');f.provider.charge=f.normal;await f.finance.renew(f.sub.id);assert.equal(f.calls.length,1);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}})).auto_renew,false);
});
test('recovery deadline ends renewal once without charging and does not revive on card change',async()=>{
 const f=await failedRenewal();await expireWindow(f);await f.finance.renew(f.sub.id);await f.finance.renew(f.sub.id);const sub=await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}});assert.equal(sub.status,'EXPIRED');assert.equal(sub.auto_renew,false);assert.equal(await db.billingNotice.count({where:{member_id:f.fan,kind:'renewal-stopped'}}),1);
 const card=await replacement(f);await f.finance.method(f.fan,card.id,'default');f.provider.charge=f.normal;await f.finance.renew(f.sub.id);assert.equal(f.calls.length,1);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.renewal.id}})).status,'cancelled');
});
test('stopped card cannot purchase a different plan, foreign member cannot replace the card',async()=>{
 const f=await failedRenewal(),card=await replacement(f);await assert.rejects(f.finance.method(f.creator,card.id,'default'),code('METHOD_NOT_FOUND'));await f.finance.cancelSubscription(f.fan,f.creator);const order=await f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID()});await assert.rejects(f.finance.pay(f.fan,order.id),code('PAYMENT_METHOD_UNAVAILABLE'));assert.equal(f.declines,1);
});
test('unknown approval still reconciles original key after a default card change without double charge',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);f.sub=await due(f);const original=f.provider.charge;f.provider.charge=async(...args)=>{await original(...args);reject(503,'PAYMENT_UNCERTAIN','연결 단절');};await assert.rejects(f.finance.renew(f.sub.id),code('PAYMENT_UNCERTAIN'));
 const pending=await db.checkoutOrder.findFirstOrThrow({where:{subscription_id:f.sub.id,status:'processing'}}),card=await replacement(f);await f.finance.method(f.fan,card.id,'default');await f.finance.renew(f.sub.id);assert.equal(f.calls.length,2);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:pending.id}})).billing_method_id,f.card.id);assert.equal(await db.billingNotice.count({where:{member_id:f.fan}}),0);
});
test('declined renewal cannot extend protected content access, creator still owns content',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const post=await db.posting.create({data:{user_sub:f.creator,title:'권한 검증',content:'유료 내용',is_public:true,is_membership:true,access_plan_id:f.plan.id,status:'PUBLISHED'}}),service=new PlatformService(db);assert.equal(await service.access(post,f.fan),true);const sub=await due(f);f.provider.charge=async()=>fail('INVALID_STOPPED_CARD');await f.finance.renew(sub.id);
 assert.equal(await service.access(post,f.fan),false);assert.equal(await service.access(post,f.creator),true);
});
test('mail outbox retries SMTP failures, concurrent workers claim once and skip recovered notices',async()=>{
 const f=await failedRenewal(),sent=[],config=new ConfigService({SMTP_HOST:'127.0.0.1',PUBLIC_API_ORIGIN:'https://beta.crefans.com',RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1'});
 // Restrict the worker's candidates to this fixture without weakening its real DB claim.
 const scoped={member:db.member,subscription:db.subscription,checkoutOrder:db.checkoutOrder};scoped.billingNotice={...db.billingNotice,findMany:args=>db.billingNotice.findMany({...args,where:{...args.where,member_id:f.fan}})};
 let failMail=true;const mail={sendNotice:async(...args)=>{if(failMail)throw Error('SMTP rejected');sent.push(args);}},worker=new BillingNoticesService(scoped,mail,config);
 await assert.rejects(worker.deliver(),/Billing notice delivery failed/);assert.equal(sent.length,0);let row=await db.billingNotice.findFirstOrThrow({where:{member_id:f.fan}});assert.equal(row.completed_at,null);assert.ok(row.retry_at>new Date());failMail=false;await db.billingNotice.update({where:{id:row.id},data:{retry_at:new Date(0)}});
 await Promise.all([worker.deliver(),worker.deliver()]);assert.equal(sent.length,1);assert.equal(sent[0][1],'payment-failed');assert.match(sent[0][3],/^https:\/\/beta.crefans.com\/service\/payment-methods$/);assert.doesNotMatch(JSON.stringify(sent),/test-billing-key|INVALID_CARD_LOST|\u2014/);
 const g=await failedRenewal(),card=await replacement(g);await g.finance.method(g.fan,card.id,'default');g.provider.charge=g.normal;await g.finance.renew(g.sub.id);const scopedG={member:db.member,subscription:db.subscription,checkoutOrder:db.checkoutOrder};scopedG.billingNotice={...db.billingNotice,findMany:args=>db.billingNotice.findMany({...args,where:{...args.where,member_id:g.fan}})};await new BillingNoticesService(scopedG,mail,config).deliver();assert.equal(sent.length,1);assert.equal((await db.billingNotice.findFirstOrThrow({where:{member_id:g.fan}})).outcome,'skipped');
});
test('recovery never crosses the next monthly period even with a long retry policy',()=>{
 const sub={next_billing_date:new Date('2026-01-31T00:00:00Z'),started_at:new Date('2025-12-31T00:00:00Z')};assert.equal(renewalDeadline(sub,10,168).toISOString(),'2026-02-28T00:00:00.000Z');
});
test('direct pay of an expired pending recovery cannot bypass the renewal deadline',async()=>{
 const f=await failedRenewal();await expireWindow(f);const card=await replacement(f);await f.finance.method(f.fan,card.id,'default');await db.checkoutOrder.update({where:{id:f.renewal.id},data:{status:'pending'}});f.provider.charge=f.normal;await assert.rejects(f.finance.pay(f.fan,f.renewal.id),code('RENEWAL_RECOVERY_ENDED'));assert.equal(f.calls.length,1);
});
test('initial operations policy permits three daily retries within a four-day recovery window',()=>{
 const sub={next_billing_date:new Date('2026-10-22T00:00:00Z'),started_at:new Date('2026-09-22T00:00:00Z')};assert.equal(renewalDeadline(sub,3,24).toISOString(),'2026-10-26T00:00:00.000Z');
});

test('queued failure notice is deferred while a retry is uncertain, then sent after confirmed failure',async()=>{
 const f=await failedRenewal(),sent=[],scoped={member:db.member,subscription:db.subscription,checkoutOrder:db.checkoutOrder,billingNotice:{...db.billingNotice,findMany:args=>db.billingNotice.findMany({...args,where:{...args.where,member_id:f.fan}})}};
 const worker=new BillingNoticesService(scoped,{sendNotice:async(...args)=>sent.push(args)},new ConfigService({SMTP_HOST:'127.0.0.1',PUBLIC_API_ORIGIN:'https://beta.crefans.com',RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1'}));
 await db.checkoutOrder.update({where:{id:f.renewal.id},data:{status:'processing'}});await worker.deliver();let row=await db.billingNotice.findFirstOrThrow({where:{member_id:f.fan}});assert.equal(row.outcome,'deferred');assert.equal(row.completed_at,null);assert.equal(sent.length,0);
 await db.checkoutOrder.update({where:{id:f.renewal.id},data:{status:'failed'}});await db.billingNotice.update({where:{id:row.id},data:{retry_at:new Date(0)}});await worker.deliver();assert.equal(sent.length,1);assert.match(sent[0][4],/사용할 수 없는 카드/);
});
