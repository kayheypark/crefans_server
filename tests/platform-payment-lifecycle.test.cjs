require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL,url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();let release,originalPolicy;
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);originalPolicy=await db.financialPolicy.findUniqueOrThrow({where:{id:'platform'}});await db.financialPolicy.update({where:{id:'platform'},data:{platform_fee_bps:1000,settlement_hold_days:0}});});
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
 const order=await finance.createOrder(fan,{planId:plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'});
 return{creator,fan,plan,card,provider,finance,order,approved,calls};
}
async function due(f){const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});const past=new Date(Date.now()-60000);return db.subscription.update({where:{id:sub.id},data:{ended_at:past,next_billing_date:past}});}
after(async()=>{
 await db.memberNotice.deleteMany({where:{member_id:{in:members}}});await db.platformAuditLog.deleteMany({where:{action:'admin.subscription.refunded'}});
 await db.billingNotice.deleteMany({where:{member_id:{in:members}}});await db.savedPost.deleteMany({where:{member_id:{in:members}}});await db.posting.deleteMany({where:{user_sub:{in:creators}}});
 await db.revenueEntry.deleteMany({where:{creator_id:{in:creators}}});await db.checkoutOrder.deleteMany({where:{member_id:{in:members}}});await db.subscription.deleteMany({where:{subscriber_id:{in:members}}});await db.membershipItem.deleteMany({where:{creator_id:{in:creators}}});await db.billingMethod.deleteMany({where:{member_id:{in:members}}});await db.memberNotification.deleteMany({where:{member_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:creators}}});await db.member.deleteMany({where:{id:{in:members}}});if(originalPolicy)await db.financialPolicy.update({where:{id:'platform'},data:originalPolicy});await db.$disconnect();await release?.();
});
test('processing response from Toss does not turn an uncertain successful payment into failed',async()=>{
 const axios=require('axios'),original=axios.request,client=new PaymentProvider(new ConfigService({TOSS_CLIENT_KEY:'test-only',TOSS_SECRET_KEY:'test-only'}));
 try{axios.request=async()=>{throw{response:{status:409,data:{code:'IDEMPOTENT_REQUEST_PROCESSING'}}};};await assert.rejects(client.charge('test','test',{id:randomUUID(),amount:10000,snapshot:{name:'검증'}}),code('PAYMENT_UNCERTAIN'));}finally{axios.request=original;}
});
test('refund of a previous cycle preserves the independently paid current cycle',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f);await f.finance.renew(sub.id);const current=await db.subscription.findUniqueOrThrow({where:{id:sub.id}});await f.finance.refund(f.fan,f.order.id);const after=await db.subscription.findUniqueOrThrow({where:{id:sub.id}});assert.equal(after.ended_at.getTime(),current.ended_at.getTime());assert.equal(after.status,current.status);const audit=await db.platformAuditLog.findMany({where:{entity_id:f.order.id,action:{in:['refund.requested','refund.completed']}}});assert.equal(audit.filter(r=>r.action==='refund.completed').length,1);assert.equal(audit.find(r=>r.action==='refund.completed').metadata.amount,f.order.amount);
});
test('cancellation is idempotent and clears future billing without ending prepaid access',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const before=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});await f.finance.cancelSubscription(f.fan,f.creator);await f.finance.cancelSubscription(f.fan,f.creator);const sub=await db.subscription.findUniqueOrThrow({where:{id:before.id}});assert.equal(sub.next_billing_date,null);assert.equal(sub.ended_at.getTime(),before.ended_at.getTime());assert.equal(sub.auto_renew,false);
});
test('unavailable renewal card follows bounded retry policy instead of looping forever',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f);await db.billingMethod.update({where:{id:f.card.id},data:{deleted_at:new Date()}});
 await f.finance.renew(sub.id);const expired=new Date(Date.now()-4*3600000);await db.subscription.update({where:{id:sub.id},data:{next_billing_date:expired}});
 await f.finance.renew(sub.id);const after=await db.subscription.findUniqueOrThrow({where:{id:sub.id}});assert.equal(after.status,'EXPIRED');assert.equal(after.auto_renew,false);assert.equal(f.calls.length,1);
});
test('malformed cancellation response cannot change the order or ledger',async()=>{
 const f=await fixture({cancel:async()=>({status:'CANCELED',orderId:'other',paymentKey:'other',totalAmount:1,balanceAmount:0})});await f.finance.pay(f.fan,f.order.id);await assert.rejects(f.finance.refund(f.fan,f.order.id),code('REFUND_UNCERTAIN'));assert.equal((await db.revenueEntry.findUniqueOrThrow({where:{order_id:f.order.id}})).reversals,0);assert.equal(await db.platformAuditLog.count({where:{entity_id:f.order.id,action:'refund.completed'}}),0);
});
test('background billing retries surface provider failures for worker health',async()=>{
 const retryDb={billingRegistration:{findMany:async()=>[{id:'test'}],updateMany:async()=>({count:0})},billingMethod:{findMany:async()=>[]}};
 const finance=new PlatformFinanceService({db:retryDb},{},new ConfigService({}),{});finance.finishRegistration=async()=>reject(503,'PAYMENT_UNCERTAIN','검증');await assert.rejects(finance.retryBilling());
});
const gate=()=>{let release,enter;const entered=new Promise(resolve=>{enter=resolve;}),wait=new Promise(resolve=>{release=resolve;});return{entered,release,enter,wait};};
test('simultaneous same-order payments call the provider once and create one entitlement and ledger',async()=>{
 const f=await fixture(),g=gate(),original=f.provider.charge;f.provider.charge=async(...args)=>{g.enter();await g.wait;return original(...args);};const first=f.finance.pay(f.fan,f.order.id);await g.entered;
 try{await assert.rejects(f.finance.pay(f.fan,f.order.id),code('PAYMENT_IN_PROGRESS'));}finally{g.release();}await first;await f.finance.pay(f.fan,f.order.id);
 assert.equal(f.calls.length,1);assert.equal(await db.subscription.count({where:{subscriber_id:f.fan}}),1);assert.equal(await db.revenueEntry.count({where:{order_id:f.order.id}}),1);
});
test('different orders for the same creator cannot produce two subscription charges',async()=>{
 const f=await fixture(),second=await f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'}),g=gate(),original=f.provider.charge;f.provider.charge=async(...args)=>{g.enter();await g.wait;return original(...args);};const first=f.finance.pay(f.fan,f.order.id);await g.entered;
 try{await assert.rejects(f.finance.pay(f.fan,second.id),code('PAYMENT_IN_PROGRESS'));}finally{g.release();}await first;await assert.rejects(f.finance.pay(f.fan,second.id),code('ALREADY_SUBSCRIBED'));assert.equal(f.calls.length,1);
});
test('approval followed by a lost response reconciles without another charge',async()=>{
 const f=await fixture(),original=f.provider.charge;f.provider.charge=async(...args)=>{await original(...args);reject(503,'PAYMENT_UNCERTAIN','연결 단절');};
 await assert.rejects(f.finance.pay(f.fan,f.order.id),code('PAYMENT_UNCERTAIN'));assert.equal(await db.subscription.count({where:{subscriber_id:f.fan}}),0);await f.finance.reconcile(f.order.id);await f.finance.reconcile(f.order.id);assert.equal(f.calls.length,1);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');
});
test('DB finalization crash is recovered from provider lookup after lease expiry',async()=>{
 const f=await fixture(),finalize=f.finance.finalize.bind(f.finance);f.finance.finalize=async()=>{throw Error('simulated DB failure');};await assert.rejects(f.finance.pay(f.fan,f.order.id));f.finance.finalize=finalize;await db.checkoutOrder.update({where:{id:f.order.id},data:{locked_until:new Date(0)}});await f.finance.reconcile(f.order.id);assert.equal(f.calls.length,1);assert.equal(await db.revenueEntry.count({where:{order_id:f.order.id}}),1);
});
test('an interrupted attempt with no provider payment retries the same provider order and idempotency key',async()=>{
 const f=await fixture(),original=f.provider.charge;let attempted=0;f.provider.charge=async(...args)=>{attempted++;if(attempted===1)reject(503,'PAYMENT_UNCERTAIN','접속 실패');return original(...args);};await assert.rejects(f.finance.pay(f.fan,f.order.id),code('PAYMENT_UNCERTAIN'));await f.finance.reconcile(f.order.id);assert.equal(attempted,2);assert.equal(f.calls[0].order.attempts,0);assert.equal(f.calls[0].order.id,f.order.id);
});
test('unknown payments beyond provider idempotency retention are never charged again automatically',async()=>{
 const f=await fixture();await db.checkoutOrder.update({where:{id:f.order.id},data:{status:'processing',billing_method_id:f.card.id,processing_started_at:new Date(Date.now()-16*86400000)}});await assert.rejects(f.finance.reconcile(f.order.id),code('PAYMENT_RECONCILIATION_REQUIRED'));assert.equal(f.calls.length,0);
});
test('mismatched amount, order or payment key never grants paid access',async()=>{
 for(const bad of[{totalAmount:1},{orderId:'forged'},{paymentKey:null}]){const f=await fixture();f.provider.charge=async(_k,_c,o)=>({status:'DONE',orderId:o.id,totalAmount:o.amount,paymentKey:'test',...bad});await assert.rejects(f.finance.pay(f.fan,f.order.id),code('PAYMENT_UNCERTAIN'));assert.equal(await db.subscription.count({where:{subscriber_id:f.fan}}),0);assert.equal(await db.revenueEntry.count({where:{order_id:f.order.id}}),0);}
});
test('foreign orders and cards are rejected and client amount does not override a server snapshot',async()=>{
 const f=await fixture();const foreign=await fixture();const copy=await f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1',amount:1});assert.equal(copy.amount,10000);
 await assert.rejects(f.finance.order(foreign.fan,f.order.id),code('ORDER_NOT_FOUND'));await assert.rejects(f.finance.pay(foreign.fan,f.order.id),code('ORDER_NOT_FOUND'));await assert.rejects(f.finance.refund(foreign.fan,f.order.id),code('ORDER_NOT_FOUND'));await assert.rejects(f.finance.pay(f.fan,f.order.id,foreign.card.id),code('PAYMENT_METHOD_REQUIRED'));assert.equal(f.calls.length,0);
});
test('idempotent order keys cannot be repurposed by another account or plan',async()=>{
 const f=await fixture(),key=randomUUID(),a=await f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:key,creatorProvision:'2026-10-30.1'}),b=await f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:key,creatorProvision:'2026-10-30.1'});assert.equal(a.id,b.id);await assert.rejects(f.finance.createOrder(f.creator,{planId:f.plan.id,requestId:key,creatorProvision:'2026-10-30.1'}),code('IDEMPOTENCY_CONFLICT'));
});
test('expired order, self-subscription and unavailable plan are blocked before provider charge',async()=>{
 const f=await fixture();await assert.rejects(f.finance.createOrder(f.creator,{planId:f.plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'}),code('SELF_SUBSCRIPTION'));await db.checkoutOrder.update({where:{id:f.order.id},data:{expires_at:new Date(0)}});await assert.rejects(f.finance.pay(f.fan,f.order.id),code('ORDER_EXPIRED'));await db.membershipItem.update({where:{id:f.plan.id},data:{is_active:false}});await assert.rejects(f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'}),code('PLAN_UNAVAILABLE'));assert.equal(f.calls.length,0);
});
test('renewal preserves agreed price, benefits and fee snapshot despite later plan and fee changes',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f);await db.membershipItem.update({where:{id:f.plan.id},data:{price:20000,benefits:'["새 혜택"]'}});f.finance.config=new ConfigService({...settings,PLATFORM_FEE_BPS:'5000'});await f.finance.renew(sub.id);const renewed=await db.checkoutOrder.findFirstOrThrow({where:{subscription_id:sub.id,NOT:{id:f.order.id}}});assert.equal(renewed.amount,10000);assert.deepEqual(renewed.snapshot.benefits,['혜택']);assert.equal(renewed.snapshot.platformFeeBps,1000);assert.equal((await db.revenueEntry.findUniqueOrThrow({where:{order_id:renewed.id}})).fees,1000);
});
test('renewal failures obey retry delay and limit, each confirmed failed attempt uses a distinct provider order',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f);let failures=0;f.provider.charge=async()=>{failures++;reject(400,'PAYMENT_FAILED','카드 거절');};await f.finance.renew(sub.id);await f.finance.renew(sub.id);assert.equal(failures,1);
 for(let i=0;i<2;i++){await db.checkoutOrder.updateMany({where:{subscription_id:sub.id,status:'failed'},data:{retry_at:new Date(0)}});await f.finance.renew(sub.id);}await f.finance.renew(sub.id);assert.equal(failures,3);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:sub.id}})).status,'EXPIRED');assert.equal(await db.memberNotification.count({where:{member_id:f.fan,text:{startsWith:'결제가 완료되지 않아 자동 갱신이 종료'}}}),1);await f.finance.renew(sub.id);assert.equal(failures,3);
});
test('card replacement is used on a subsequent confirmed renewal retry',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f),charge=f.provider.charge;f.provider.charge=async()=>reject(400,'PAYMENT_FAILED','거절');await f.finance.renew(sub.id);const card=await db.billingMethod.create({data:{member_id:f.fan,customer_key:randomUUID(),billing_key_encrypted:'replacement',label:'새 카드',last_four:'4321'}});await f.finance.method(f.fan,card.id,'default');await db.checkoutOrder.updateMany({where:{subscription_id:sub.id,status:'failed'},data:{retry_at:new Date(0)}});f.provider.charge=charge;await f.finance.renew(sub.id);assert.equal(f.calls[1].key,'replacement');assert.equal(f.calls[1].order.attempts,1);assert.equal(f.calls[1].customer,card.customer_key);
});
test('cancellation while renewal is in flight never re-enables automatic renewal',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f),g=gate(),charge=f.provider.charge;f.provider.charge=async(...args)=>{g.enter();await g.wait;return charge(...args);};const inflight=f.finance.renew(sub.id);await g.entered;try{await f.finance.cancelSubscription(f.fan,f.creator);}finally{g.release();}await inflight;const after=await db.subscription.findUniqueOrThrow({where:{id:sub.id}});assert.equal(after.auto_renew,false);assert.equal(after.next_billing_date,null);assert.equal(after.status,'CANCELLED');await f.finance.renew(sub.id);assert.equal(f.calls.length,2);
});
test('disabled creator, plan or subscriber stops future renewal without charging',async()=>{
 for(const type of['creator','plan','member']){const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f);if(type==='creator')await db.creator.update({where:{user_id:f.creator},data:{is_active:false}});if(type==='plan')await db.membershipItem.update({where:{id:f.plan.id},data:{is_active:false}});if(type==='member')await db.member.update({where:{id:f.fan},data:{enabled:false}});await f.finance.renew(sub.id);assert.equal(f.calls.length,1);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:sub.id}})).auto_renew,false);}
});
test('simultaneous full refunds reverse one ledger only and terminate the current prepaid period',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const cancel=f.provider.cancel,g=gate();let count=0;f.provider.cancel=async(...args)=>{count++;g.enter();await g.wait;return cancel(...args);};const first=f.finance.refund(f.fan,f.order.id);await g.entered;try{await assert.rejects(f.finance.refund(f.fan,f.order.id),code('REFUND_IN_PROGRESS'));}finally{g.release();}await first;await f.finance.refund(f.fan,f.order.id);assert.equal(count,1);const entry=await db.revenueEntry.findUniqueOrThrow({where:{order_id:f.order.id}});assert.equal(entry.reversals,10000);assert.equal(entry.net,0);assert.equal(entry.fees,0);assert.equal((await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}})).status,'EXPIRED');
});
test('cancel succeeded with lost response is reconciled by lookup without recancelling',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const cancel=f.provider.cancel;let calls=0;f.provider.cancel=async(...args)=>{calls++;await cancel(...args);reject(503,'PAYMENT_UNCERTAIN','연결 단절');};await assert.rejects(f.finance.refund(f.fan,f.order.id));await f.finance.refund(f.fan,f.order.id);assert.equal(calls,1);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'refunded');
});
test('legacy contracts without a refund-window snapshot retain their original unused refund terms',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const original=await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}}),snapshot={...original.snapshot};delete snapshot.refundWindowDays;await db.checkoutOrder.update({where:{id:f.order.id},data:{snapshot,paid_at:new Date(Date.now()-31*86400000)}});await f.finance.refund(f.fan,f.order.id);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'refunded');
});
test('uncertain refund reserves balance and cannot fund a new withdrawal',async()=>{
 const f=await fixture({cancel:async()=>reject(503,'PAYMENT_UNCERTAIN','대기')});await f.finance.pay(f.fan,f.order.id);await assert.rejects(f.finance.refund(f.fan,f.order.id));const financial=await f.finance.finance(f.creator);assert.equal(financial.summary.refundReserved,1000);assert.equal(financial.summary.available,-1000);
});
test('renewal anchor survives February clamping, leap years and year rollover',()=>{
 const {nextMonth}=require('../dist/src/platform/finance.service');const anchor=new Date('2023-01-31T14:20:00Z'),feb=nextMonth(anchor),mar=nextMonth(feb,anchor);assert.equal(feb.toISOString(),'2023-02-28T14:20:00.000Z');assert.equal(mar.toISOString(),'2023-03-31T14:20:00.000Z');assert.equal(nextMonth(new Date('2024-01-31T14:20:00Z')).toISOString(),'2024-02-29T14:20:00.000Z');assert.equal(nextMonth(new Date('2023-12-31T14:20:00Z')).toISOString(),'2024-01-31T14:20:00.000Z');
});
test('provider request contract keeps auth private, uses stable keys and separates retry order ids',async()=>{
 const axios=require('axios'),original=axios.request,client=new PaymentProvider(new ConfigService({TOSS_CLIENT_KEY:'test-only',TOSS_SECRET_KEY:'test-only'})),id=randomUUID(),captured=[];
 try{axios.request=async options=>{captured.push(options);return{data:{status:'DONE'}};};const order={id,amount:10000,snapshot:{name:'월 구독'},attempts:0};await client.charge('key/encoded','private-customer',order);await client.charge('key/encoded','private-customer',order);await client.charge('key/encoded','private-customer',{...order,attempts:1});assert.equal(captured[0].headers['Idempotency-Key'],captured[1].headers['Idempotency-Key']);assert.notEqual(captured[0].headers['Idempotency-Key'],captured[2].headers['Idempotency-Key']);assert.equal(captured[2].data.orderId,id+'_1');assert.equal(captured[0].timeout,65000);assert.equal(captured[0].url,'https://api.tosspayments.com/v1/billing/key%2Fencoded');assert.equal(client.configForClient().secretKey,undefined);
  axios.request=async()=>{throw{response:{status:404,data:{code:'NOT_FOUND_PAYMENT'}}};};assert.equal(await client.lookup(id),null);
  axios.request=async()=>{throw{response:{status:401,data:{code:'UNAUTHORIZED_KEY'}}};};await assert.rejects(client.lookup(id),code('PAYMENT_CONFIGURATION_ERROR'));
 }finally{axios.request=original;}
});
test('explicit retry of a definitively failed initial payment changes attempt once and uses the current default card',async()=>{
 const f=await fixture(),charge=f.provider.charge;f.provider.charge=async()=>reject(400,'PAYMENT_FAILED','카드 거절');await assert.rejects(f.finance.pay(f.fan,f.order.id),code('PAYMENT_FAILED'));assert.equal(await db.subscription.count({where:{subscriber_id:f.fan}}),0);
 await Promise.all([f.finance.retryPayment(f.fan,f.order.id),f.finance.retryPayment(f.fan,f.order.id)]);const retried=await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}});assert.equal(retried.attempts,1);assert.equal(retried.status,'pending');f.provider.charge=charge;await f.finance.pay(f.fan,f.order.id);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');assert.equal(f.calls[0].order.attempts,1);assert.equal(await db.subscription.count({where:{subscriber_id:f.fan}}),1);
});
test('refund blocks a queued payout after its revenue has been reversed',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const account=await db.settlementAccount.create({data:{creator_id:f.creator,bank:'테스트',holder_alias:'검증',last_four:'1234',account_encrypted:'test-account',verified:true}}),withdrawal=await db.withdrawalRequest.create({data:{creator_id:f.creator,request_key:randomUUID(),account_id:account.id,account_label:'테스트',amount:9000,created_at:new Date('2026-10-27T00:00:00Z')}});let transfers=0;f.finance.bank={transfer:async()=>{transfers++;return{status:'paid'};}};
 try{await f.finance.refund(f.fan,f.order.id);await assert.rejects(f.finance.payout(withdrawal.id,new Date('2026-10-28T00:00:00Z')),code('PAYOUT_BALANCE_CHANGED'));assert.equal(transfers,0);assert.equal((await db.withdrawalRequest.findUniqueOrThrow({where:{id:withdrawal.id}})).status,'requested');}finally{await db.withdrawalRequest.delete({where:{id:withdrawal.id}});await db.settlementAccount.delete({where:{id:account.id}});}
});

test('definitive refund rejection releases reserved funds without reversing revenue',async()=>{
 const f=await fixture({cancel:async()=>reject(400,'PAYMENT_FAILED','취소 거절')});await f.finance.pay(f.fan,f.order.id);await assert.rejects(f.finance.refund(f.fan,f.order.id),code('PAYMENT_FAILED'));assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');assert.equal((await f.finance.finance(f.creator)).summary.refundReserved,0);assert.equal((await db.revenueEntry.findUniqueOrThrow({where:{order_id:f.order.id}})).reversals,0);assert.equal(await db.platformAuditLog.count({where:{entity_id:f.order.id,action:'refund.completed'}}),0);
});
test('unmatched provider lookup never sends a cancellation request',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);let calls=0;f.provider.lookup=async()=>({status:'DONE',orderId:'another-order',paymentKey:'another-key',totalAmount:10000});f.provider.cancel=async()=>{calls++;};await assert.rejects(f.finance.refund(f.fan,f.order.id),code('REFUND_UNCERTAIN'));assert.equal(calls,0);assert.equal((await db.revenueEntry.findUniqueOrThrow({where:{order_id:f.order.id}})).reversals,0);assert.equal(await db.platformAuditLog.count({where:{entity_id:f.order.id,action:'refund.completed'}}),0);
});

test('one-time checkout rejects foreign orders and tampered amounts, grants one non-renewing month once',async()=>{
 const f=await fixture();f.provider.configForClient=()=>({clientKey:'test-only'});const prepared=await f.finance.paymentWindow(f.fan,f.order.id);
 let confirmations=0;f.provider.confirm=async(key,o)=>{confirmations++;const r={status:'DONE',orderId:o.id,totalAmount:o.amount,paymentKey:key};f.approved.set(o.id,r);return r;};
 const input={orderId:prepared.orderId,amount:prepared.amount,paymentKey:'window-test-'+f.order.id};
 await assert.rejects(f.finance.confirmPayment(f.creator,f.order.id,input),code('ORDER_NOT_FOUND'));
 await assert.rejects(f.finance.confirmPayment(f.fan,f.order.id,{...input,amount:1}),code('PAYMENT_MISMATCH'));
 await assert.rejects(f.finance.confirmPayment(f.fan,f.order.id,{...input,orderId:'forged'}),code('PAYMENT_MISMATCH'));
 await f.finance.confirmPayment(f.fan,f.order.id,input);await f.finance.confirmPayment(f.fan,f.order.id,input);
 assert.equal(confirmations,1);const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});assert.equal(sub.auto_renew,false);assert.equal(sub.next_billing_date,null);assert.equal(sub.billing_method_id,null);assert.equal(await db.revenueEntry.count({where:{order_id:f.order.id}}),1);
 await assert.rejects(f.finance.confirmPayment(f.fan,f.order.id,{...input,paymentKey:'other'}),code('PAYMENT_MISMATCH'));
 await f.finance.refund(f.fan,f.order.id);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'refunded');
});
// 2026-11-02 user decision: closing the one-time window must not lock the order out of the monthly card payment.
test('a closed one-time window returns the order to the monthly card payment under a new order id; a late window approval is refused',async()=>{
 const f=await fixture();const prepared=await f.finance.paymentWindow(f.fan,f.order.id);let confirmations=0;f.provider.confirm=async()=>{confirmations++;throw new Error('must not approve');};
 const paid=await f.finance.pay(f.fan,f.order.id);assert.equal(paid.order.status,'paid');assert.notEqual(paid.order.snapshot.paymentMode,'one-time');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].order.attempts,1,'the card charge uses a new provider order id');assert.notEqual(f.calls[0].order.id+'_'+f.calls[0].order.attempts,prepared.orderId);
 const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});assert.equal(sub.auto_renew,true);assert.ok(sub.next_billing_date);
 await assert.rejects(f.finance.confirmPayment(f.fan,f.order.id,{orderId:prepared.orderId,amount:prepared.amount,paymentKey:'late-window-'+f.order.id}),code('PAYMENT_MISMATCH'));assert.equal(confirmations,0);
 const other=await fixture();await other.finance.paymentWindow(other.fan,other.order.id);await db.billingMethod.update({where:{id:other.card.id},data:{deleted_at:new Date(),is_default:false}});
 await assert.rejects(other.finance.pay(other.fan,other.order.id),code('PAYMENT_METHOD_REQUIRED'));assert.equal(other.calls.length,0);
});
test('one-time approval lost response recovers by lookup without charging a billing card',async()=>{
 const f=await fixture();await f.finance.paymentWindow(f.fan,f.order.id);let calls=0;f.provider.confirm=async(key,o)=>{calls++;f.approved.set(o.id,{status:'DONE',orderId:o.id,totalAmount:o.amount,paymentKey:key});reject(503,'PAYMENT_UNCERTAIN','lost');};
 await assert.rejects(f.finance.confirmPayment(f.fan,f.order.id,{orderId:f.order.id,amount:f.order.amount,paymentKey:'window-'+f.order.id}),code('PAYMENT_UNCERTAIN'));
 await f.finance.reconcile(f.order.id);assert.equal(calls,1);assert.equal(f.calls.length,0);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');
});
async function contentFixture(){const f=await fixture();await f.finance.pay(f.fan,f.order.id);const post=await db.posting.create({data:{user_sub:f.creator,title:'유료',content:'유료 본문',status:'PUBLISHED',is_membership:true,access_plan_id:f.plan.id}});return{...f,post,service:new PlatformService(db)};}
test('paid feed serialization records use and blocks full refunds',async()=>{
 const f=await contentFixture();assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).eligible,true);const page=await f.service.postPage(f.fan,f.creator);assert.equal(page.posts[0].body,'유료 본문');assert.ok((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).content_accessed_at);assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).reason,'CONTENT_ALREADY_ACCESSED');await assert.rejects(f.finance.refund(f.fan,f.order.id),code('CONTENT_ALREADY_ACCESSED'));
});
test('bootstrap, public content, owners and unrelated creators do not consume this purchase',async()=>{
 const f=await contentFixture(),other=await contentFixture();const boot=await f.service.bootstrap(f.fan);assert.equal(boot.data.posts.find(p=>p.id===f.post.id).body,'');await f.service.post({...f.post,is_membership:false,medias:[]},f.fan);await f.service.post({...f.post,medias:[]},f.creator);await other.service.post({...other.post,medias:[]},f.fan);assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).eligible,true);await f.finance.refund(f.fan,f.order.id);assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).reason,'ALREADY_REFUNDED');
});
test('only the requested saved collection exposes paid content; post details also record use',async()=>{
 const f=await contentFixture();await db.savedPost.create({data:{member_id:f.fan,posting_id:f.post.id}});await f.service.bootstrap(f.fan,'liked');assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).eligible,true);const saved=await f.service.bootstrap(f.fan,'saved');assert.equal(saved.data.posts.find(p=>p.id===f.post.id).body,'유료 본문');await assert.rejects(f.finance.refund(f.fan,f.order.id),code('CONTENT_ALREADY_ACCESSED'));const g=await contentFixture();await g.service.postDetail(g.post.id,g.fan);assert.equal((await g.finance.refundEligibility(g.fan,g.order.id)).eligible,false);
});
test('legacy untracked orders fail closed; foreign eligibility does not reveal orders',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);await db.checkoutOrder.update({where:{id:f.order.id},data:{usage_tracking_started_at:null}});assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).reason,'REFUND_USAGE_UNKNOWN');await assert.rejects(f.finance.refund(f.fan,f.order.id),code('REFUND_USAGE_UNKNOWN'));await assert.rejects(f.finance.refundEligibility(f.creator,f.order.id),code('ORDER_NOT_FOUND'));
});
test('refund claim prevents concurrent disclosure, including uncertain cancellation',async()=>{
 const f=await contentFixture(),g=gate(),cancel=f.provider.cancel;f.provider.cancel=async(...args)=>{g.enter();await g.wait;return cancel(...args);};const refund=f.finance.refund(f.fan,f.order.id);await g.entered;try{assert.equal((await f.service.postDetail(f.post.id,f.fan)).post.body,'');assert.equal(await f.service.consumeContent(f.post,f.fan),false);}finally{g.release();}await refund;assert.equal((await f.service.postDetail(f.post.id,f.fan)).post.body,'');const h=await contentFixture();h.provider.cancel=async()=>reject(503,'PAYMENT_UNCERTAIN','단절');await assert.rejects(h.finance.refund(h.fan,h.order.id));assert.equal(await h.service.consumeContent(h.post,h.fan),false);
});
test('renewal starts fresh tracking without erasing the prior cycle',async()=>{
 const f=await contentFixture();await f.service.postDetail(f.post.id,f.fan);const sub=await due(f);await db.checkoutOrder.update({where:{id:f.order.id},data:{period_end:new Date(Date.now()-60000)}});await f.finance.renew(sub.id);const current=await db.checkoutOrder.findFirstOrThrow({where:{subscription_id:sub.id,status:'paid',NOT:{id:f.order.id}}});assert.equal((await f.finance.refundEligibility(f.fan,current.id)).eligible,true);assert.equal((await f.finance.refundEligibility(f.fan,f.order.id)).eligible,false);await f.service.postDetail(f.post.id,f.fan);assert.equal((await f.finance.refundEligibility(f.fan,current.id)).eligible,false);
});
test('FIN-01: provider lookup errors keep the order uncertain and never turn it into a new charge',async()=>{
 const axios=require('axios'),original=axios.request,provider=new PaymentProvider(new ConfigService({TOSS_CLIENT_KEY:'test_ck_x',TOSS_SECRET_KEY:'test_sk_x'}));
 const fail=(status,code)=>{axios.request=async()=>{throw{response:{status,data:{code}}};};};
 try{
  for(const [status,providerCode] of [[403,'FORBIDDEN_CONSECUTIVE_REQUEST'],[401,'UNAUTHORIZED_KEY_X'],[400,'INVALID_REQUEST'],[429,'TOO_MANY_REQUESTS'],[500,'PROVIDER_ERROR']]){fail(status,providerCode);await assert.rejects(provider.lookup('order-1'),code('PAYMENT_UNCERTAIN'),`${status} ${providerCode}`);}
  fail(404,'NOT_FOUND_PAYMENT');assert.equal(await provider.lookup('order-1'),null);
  fail(400,'ALREADY_CANCELED_PAYMENT');await assert.rejects(provider.cancel('pay-1','환불','refund-1'),code('PAYMENT_UNCERTAIN'));
  // Control: a card company refusal on approval is still a confirmed failure.
  fail(400,'REJECT_CARD_COMPANY');await assert.rejects(provider.confirm('pay-1',{id:'o',amount:1000,attempts:0}),code('PAYMENT_FAILED'));
 }finally{axios.request=original;}
 const f=await fixture(),charge=f.provider.charge,lookup=f.provider.lookup;let limited=true;
 f.provider.charge=async(...args)=>{await charge(...args);reject(503,'PAYMENT_UNCERTAIN','연결 단절');};
 f.provider.lookup=async id=>{if(limited)reject(503,'PAYMENT_UNCERTAIN','조회 제한');return lookup(id);};
 await assert.rejects(f.finance.pay(f.fan,f.order.id),code('PAYMENT_UNCERTAIN'));
 await db.checkoutOrder.update({where:{id:f.order.id},data:{locked_until:null}});
 await assert.rejects(f.finance.reconcile(f.order.id),code('PAYMENT_UNCERTAIN'));
 const held=await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}});assert.equal(held.status,'processing');assert.equal(held.attempts,0);
 limited=false;await f.finance.reconcile(f.order.id);
 assert.equal(f.calls.length,1);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');assert.equal(await db.revenueEntry.count({where:{order_id:f.order.id}}),1);
});
test('FIN-04: a paid membership cancelled at the provider is reversed once; partial cancels are escalated',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const external=f.order.id;
 assert.equal(await f.finance.reconcilePaid(f.order.id),0);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');
 const approved=f.approved.get(external);f.approved.set(external,{...approved,status:'CANCELED',balanceAmount:0});
 assert.equal(await f.finance.reconcilePaid(f.order.id),1);assert.equal(await f.finance.reconcilePaid(f.order.id),0);
 const order=await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}}),revenue=await db.revenueEntry.findUniqueOrThrow({where:{order_id:f.order.id}}),sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});
 assert.equal(order.status,'refunded');assert.equal(revenue.reversals,order.amount);assert.equal(revenue.net,0);assert.equal(sub.status,'EXPIRED');
 assert.equal(await db.platformOperationalEvent.count({where:{dedupe_key:'external-cancel:'+f.order.id}}),1);
 const g=await fixture();await g.finance.pay(g.fan,g.order.id);const second=g.approved.get(g.order.id);g.approved.set(g.order.id,{...second,status:'PARTIAL_CANCELED',balanceAmount:5000});
 assert.equal(await g.finance.reconcilePaid(g.order.id),0);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:g.order.id}})).status,'paid');
 assert.equal(await db.platformOperationalEvent.count({where:{dedupe_key:'reconcile-paid:'+g.order.id+':PARTIAL_CANCELED:5000'}}),1);
 await db.platformOperationalEvent.deleteMany({where:{dedupe_key:{in:['external-cancel:'+f.order.id,'reconcile-paid:'+g.order.id+':PARTIAL_CANCELED:5000']}}});
});
test('a new order needs consent to show the subscriber to the creator, and keeps a copy of what was agreed',async()=>{
 const f=await fixture(),before=await db.checkoutOrder.count({where:{member_id:f.fan}});
 for(const creatorProvision of [undefined,'','2026-10-01.0'])await assert.rejects(f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID(),creatorProvision}),code('CREATOR_PROVISION_CONSENT_REQUIRED'));
 assert.equal(await db.checkoutOrder.count({where:{member_id:f.fan}}),before,'no order without consent');
 await db.checkoutOrder.update({where:{id:f.order.id},data:{status:'canceled'}});await db.subscription.deleteMany({where:{subscriber_id:f.fan}});
 const order=await f.finance.createOrder(f.fan,{planId:f.plan.id,requestId:randomUUID(),creatorProvision:'2026-10-30.1'});
 const consent=await db.memberConsent.findFirstOrThrow({where:{member_id:f.fan,kind:'creator-provision',document_snapshot:{path:'$.orderId',equals:order.id}}});
 assert.equal(consent.document_id,'code:creator-provision:2026-10-30.1');assert.equal(consent.document_snapshot.creatorId,f.creator);assert.match(consent.document_snapshot.items,/닉네임/);
});
// 2026-11-02 user decisions: card-only approvals and a fresh idempotency key after a refused refund.
test('a one-time approval paid by a non-card method is held unconfirmed; a card in an easy-pay wallet is accepted',async()=>{
 const f=await fixture();const w=await f.finance.paymentWindow(f.fan,f.order.id);f.provider.confirm=async(key,o)=>({status:'DONE',method:'가상계좌',orderId:w.orderId,totalAmount:o.amount,paymentKey:key});
 await assert.rejects(f.finance.confirmPayment(f.fan,f.order.id,{orderId:w.orderId,amount:w.amount,paymentKey:'window-va-'+f.order.id}),code('PAYMENT_UNCERTAIN'));
 assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'processing','held for the stuck-payment watchdog, not paid');
 const g=await fixture();const v=await g.finance.paymentWindow(g.fan,g.order.id);g.provider.confirm=async(key,o)=>({status:'DONE',method:'간편결제',orderId:v.orderId,totalAmount:o.amount,paymentKey:key});
 await g.finance.confirmPayment(g.fan,g.order.id,{orderId:v.orderId,amount:v.amount,paymentKey:'window-easy-'+g.order.id});assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:g.order.id}})).status,'paid');
});
test('a refused membership refund is retried under a new idempotency key instead of replaying the refusal',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const keys=[],original=f.provider.cancel;
 f.provider.cancel=async(paymentKey,reason,key)=>{keys.push(key);if(keys.length===1)reject(400,'PAYMENT_FAILED','환불이 거절되었습니다.');return original(paymentKey,reason,key);};
 await assert.rejects(f.finance.refund(f.fan,f.order.id),code('PAYMENT_FAILED'));assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid');
 await f.finance.refund(f.fan,f.order.id);assert.deepEqual(keys,[`refund-${f.order.id}`,`refund-${f.order.id}_r1`]);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'refunded');
});
// 2026-11-02 user decision: paying needs the agreement shown right before the payment button; it is kept in member_consents.
test('a payment request without the current payment terms is refused; an agreed request records the consent',async()=>{
 const f=await fixture();const consents=()=>db.memberConsent.findMany({where:{member_id:f.fan,kind:'payment-terms'}});
 await assert.rejects(f.finance.pay(f.fan,f.order.id,undefined,undefined,null),code('PAYMENT_TERMS_REQUIRED'));await assert.rejects(f.finance.pay(f.fan,f.order.id,undefined,undefined,'2026-01-01.1'),code('PAYMENT_TERMS_REQUIRED'));
 assert.equal(f.calls.length,0);assert.equal((await consents()).length,0);
 await f.finance.pay(f.fan,f.order.id,undefined,undefined,'2026-11-02.1');const saved=await consents();assert.equal(saved.length,1);assert.equal(saved[0].document_id,'code:payment-terms:2026-11-02.1');assert.deepEqual([saved[0].document_snapshot.orderId,saved[0].document_snapshot.amount,saved[0].document_snapshot.paymentMode],[f.order.id,f.order.amount,'subscription']);
 const g=await fixture();await assert.rejects(g.finance.paymentWindow(g.fan,g.order.id,null),code('PAYMENT_TERMS_REQUIRED'));await g.finance.paymentWindow(g.fan,g.order.id,'2026-11-02.1');
 assert.equal((await db.memberConsent.findFirstOrThrow({where:{member_id:g.fan,kind:'payment-terms'}})).document_snapshot.paymentMode,'one-time');
});

const resumeInput=sub=>({renewAt:require('../dist/src/platform/http').dateOnly(sub.ended_at),price:Number(sub.amount),paymentTerms:'2026-11-02.1'});
async function cancelledFixture(){const f=await fixture();await f.finance.pay(f.fan,f.order.id);await f.finance.cancelSubscription(f.fan,f.creator);f.sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});return f;}
test('resume: concurrent requests restore the original end date once without charging or extending access',async()=>{
 const f=await cancelledFixture(),before=f.sub,input=resumeInput(before);
 await Promise.all([f.finance.resumeSubscription(f.fan,before.id,input),f.finance.resumeSubscription(f.fan,before.id,input)]);
 const sub=await db.subscription.findUniqueOrThrow({where:{id:before.id}});
 assert.equal(sub.auto_renew,true);assert.equal(sub.status,'ONGOING');assert.equal(sub.next_billing_date.getTime(),before.ended_at.getTime());assert.equal(sub.ended_at.getTime(),before.ended_at.getTime());assert.equal(sub.started_at.getTime(),before.started_at.getTime());assert.equal(Number(sub.amount),Number(before.amount));assert.deepEqual(sub.plan_snapshot,before.plan_snapshot);
 assert.equal(f.calls.length,1,'only original purchase charged');assert.equal(await db.checkoutOrder.count({where:{member_id:f.fan}}),1);assert.equal(await db.revenueEntry.count({where:{creator_id:f.creator}}),1);
 const consents=await db.memberConsent.findMany({where:{member_id:f.fan,kind:'payment-terms'}});assert.equal(consents.length,1);assert.equal(consents[0].document_snapshot.purpose,'subscription-resume');assert.equal(consents[0].document_snapshot.nextBillingAt,before.ended_at.toISOString());
 assert.equal(await db.platformOperationalEvent.count({where:{type:'subscription.resumed',data:{path:'$.subscriptionId',equals:sub.id}}}),1);
 await f.finance.renew(sub.id);assert.equal(f.calls.length,1,'worker does not charge before the original end date');
 await due(f);await f.finance.renew(sub.id);await f.finance.renew(sub.id);assert.equal(f.calls.length,2,'one renewal at the scheduled boundary');
});
test('resume: missing or stale consent, wrong owner, and stale displayed terms leave the subscription cancelled',async()=>{
 const f=await cancelledFixture(),input=resumeInput(f.sub);
 for(const paymentTerms of [undefined,null,'old-version'])await assert.rejects(f.finance.resumeSubscription(f.fan,f.sub.id,{...input,paymentTerms}),code('PAYMENT_TERMS_REQUIRED'));
 await assert.rejects(f.finance.resumeSubscription(f.creator,f.sub.id,input),code('SUBSCRIPTION_NOT_FOUND'));
 for(const patch of [{price:1},{renewAt:'2000-01-01'}])await assert.rejects(f.finance.resumeSubscription(f.fan,f.sub.id,{...input,...patch}),code('SUBSCRIPTION_CHANGED'));
 assert.equal((await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}})).auto_renew,false);assert.equal(f.calls.length,1);
});
for(const state of ['expired','refunded','processing','refunding','plan-deleted','creator-disabled','member-disabled','no-snapshot'])test('resume: rejects '+state+' without changing billing',async()=>{
 const f=await cancelledFixture();let error='SUBSCRIPTION_ENDED';
 if(state==='expired')await db.subscription.update({where:{id:f.sub.id},data:{ended_at:new Date(0)}});
 if(state==='refunded')await db.subscription.update({where:{id:f.sub.id},data:{status:'EXPIRED'}});
 if(['processing','refunding'].includes(state)){await db.checkoutOrder.update({where:{id:f.order.id},data:{status:state}});error='PAYMENT_IN_PROGRESS';}
 if(state==='plan-deleted'){await db.membershipItem.update({where:{id:f.plan.id},data:{is_deleted:true}});error='PLAN_UNAVAILABLE';}
 if(state==='creator-disabled'){await db.creator.update({where:{user_id:f.creator},data:{is_active:false}});error='PLAN_UNAVAILABLE';}
 if(state==='member-disabled'){await db.member.update({where:{id:f.fan},data:{enabled:false}});error='MEMBER_UNAVAILABLE';}
 if(state==='no-snapshot'){await db.subscription.update({where:{id:f.sub.id},data:{plan_snapshot:require('@prisma/client').Prisma.DbNull}});error='MISSING_SNAPSHOT';}
 await assert.rejects(f.finance.resumeSubscription(f.fan,f.sub.id,resumeInput(f.sub)),code(error));assert.equal(f.calls.length,1);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}})).auto_renew,false);
});
for(const state of ['deleted','unavailable','revoked','empty-key'])test('resume: rejects '+state+' default card',async()=>{
 const f=await cancelledFixture(),patch=state==='deleted'?{deleted_at:new Date()}:state==='unavailable'?{unavailable_at:new Date()}:state==='revoked'?{revoked_at:new Date()}:{billing_key_encrypted:''};await db.billingMethod.update({where:{id:f.card.id},data:patch});
 await assert.rejects(f.finance.resumeSubscription(f.fan,f.sub.id,resumeInput(f.sub)),code(state==='deleted'?'PAYMENT_METHOD_REQUIRED':'PAYMENT_METHOD_UNAVAILABLE'));assert.equal(f.calls.length,1);
});
test('resume: the current default card is used, original contracted amount survives a catalogue price change',async()=>{
 const f=await cancelledFixture();await db.membershipItem.update({where:{id:f.plan.id},data:{price:20000}});const card=await db.billingMethod.create({data:{member_id:f.fan,customer_key:randomUUID(),billing_key_encrypted:'new-card',label:'새 카드',last_four:'4321'}});await f.finance.method(f.fan,card.id,'default');
 await f.finance.resumeSubscription(f.fan,f.sub.id,resumeInput(f.sub));const sub=await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}});assert.equal(sub.billing_method_id,card.id);assert.equal(Number(sub.amount),10000);assert.equal(f.calls.length,1);
 await f.finance.cancelSubscription(f.fan,f.creator);await f.finance.renew(sub.id);assert.equal(f.calls.length,1);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:sub.id}})).auto_renew,false);
});
test('resume: a one-month purchase requires fresh recurring consent and does not duplicate the paid period',async()=>{
 const f=await cancelledFixture();await db.subscription.update({where:{id:f.sub.id},data:{billing_method_id:null,plan_snapshot:{...f.sub.plan_snapshot,paymentMode:'one-time'}}});
 await f.finance.resumeSubscription(f.fan,f.sub.id,resumeInput(f.sub));assert.equal(f.calls.length,1);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}})).next_billing_date.getTime(),f.sub.ended_at.getTime());
 await due(f);await f.finance.renew(f.sub.id);await f.finance.renew(f.sub.id);assert.equal(f.calls.length,2);assert.equal((await db.subscription.findUniqueOrThrow({where:{id:f.sub.id}})).auto_renew,true);
});

// 2026-11-06 user decisions: console full refund (SUPER_ADMIN, ends the subscription now) and membership cancel/end/refund notices.
const superAdmin={is_active:true,role:'SUPER_ADMIN',user_sub:'admin-refund-test'};
const notices=(member,kind)=>db.memberNotice.findMany({where:{member_id:member,kind}});
const inbox=(member,type)=>db.memberNotification.findMany({where:{member_id:member,type},orderBy:{created_at:'asc'}});
test('console refund: SUPER_ADMIN only, reason required, ignores the 7-day/unused rule, refunds once and ends access now',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});
 const reasons=[];const cancel=f.provider.cancel;f.provider.cancel=async(key,reason,...rest)=>{reasons.push(reason);return cancel(key,reason,...rest);};
 await assert.rejects(f.finance.adminRefund({is_active:true,role:'ADMIN',user_sub:'x'},sub.id,{reason:'검증'}),code('SUPER_ADMIN_REQUIRED'));
 await assert.rejects(f.finance.adminRefund({...superAdmin,is_active:false},sub.id,{reason:'검증'}),code('SUPER_ADMIN_REQUIRED'));
 await assert.rejects(f.finance.adminRefund(superAdmin,sub.id,{}),e=>e.getStatus?.()===400);
 await assert.rejects(f.finance.adminRefund(superAdmin,randomUUID(),{reason:'검증'}),code('SUBSCRIPTION_NOT_FOUND'));
 // content already used: the member self-refund is refused, the operator refund is not.
 await db.checkoutOrder.update({where:{id:f.order.id},data:{usage_tracking_started_at:new Date(),content_accessed_at:new Date()}});
 await assert.rejects(f.finance.refund(f.fan,f.order.id),code('CONTENT_ALREADY_ACCESSED'));
 assert.equal(reasons.length,0,'refused calls never reach the provider');
 await assert.rejects(f.finance.adminRefund(superAdmin,sub.id,{reason:'검증',confirmation:'1,000원'}),code('CONFIRMATION_REQUIRED'));await assert.rejects(f.finance.adminRefund(superAdmin,sub.id,{reason:'검증'}),code('CONFIRMATION_REQUIRED'));
 assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}})).status,'paid','a wrong amount leaves the order untouched');
 const r=await f.finance.adminRefund(superAdmin,sub.id,{reason:'고객센터 청약철회 요청',confirmation:'10,000원'});
 assert.equal(r.refunded,true);assert.equal(r.amount,10000);assert.equal(r.orderId,f.order.id);assert.equal(r.status,'EXPIRED');
 assert.deepEqual(reasons,['운영자 환불'],'one provider cancel, with a fixed reason instead of operator free text');
 const order=await db.checkoutOrder.findUniqueOrThrow({where:{id:f.order.id}}),entry=await db.revenueEntry.findUniqueOrThrow({where:{order_id:f.order.id}}),after=await db.subscription.findUniqueOrThrow({where:{id:sub.id}});
 assert.equal(order.status,'refunded');assert.equal(entry.reversals,10000);assert.equal(entry.net,0);
 assert.equal(after.status,'EXPIRED');assert.equal(after.auto_renew,false);assert.ok(after.ended_at<=new Date());
 assert.equal(after.cancel_reason,'고객센터 청약철회 요청');assert.equal(after.cancelled_by,'admin-refund-test');
 assert.equal(await db.subscription.count({where:{id:sub.id,status:{in:['ONGOING','CANCELLED']},ended_at:{gt:new Date()}}}),0,'access is cut now');
 const log=await db.platformAuditLog.findFirst({where:{action:'admin.subscription.refunded',entity_id:sub.id}});assert.ok(log);assert.equal(JSON.stringify(log.metadata).includes('청약철회'),false,'free text stays out of audit');
 await assert.rejects(f.finance.adminRefund(superAdmin,sub.id,{reason:'재시도',confirmation:'10,000원'}),code('NO_REFUNDABLE_PAYMENT'));assert.equal(reasons.length,1,'no second cancel');
 // notices: member in-app + queued mail once, creator settlement notice once
 const told=await inbox(f.fan,'subscription');assert.ok(told.some(n=>n.text.includes('10,000원 환불이 완료')),JSON.stringify(told.map(n=>n.text)));
 const mail=await notices(f.fan,'refund-completed');assert.equal(mail.length,1);assert.ok(mail[0].rows.some(([k,v])=>k==='구독'&&v==='즉시 종료'));assert.equal(mail[0].path,'/subscriptions');
 const creator=await inbox(f.creator,'settlement');assert.equal(creator.length,1);assert.match(creator[0].text,/10,000원.*정산에서 제외/);assert.equal(creator[0].path,'/studio/settlements');
});
test('console refund refuses while a payment is processing and refunds the latest paid order only',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await db.subscription.findFirstOrThrow({where:{subscriber_id:f.fan}});
 const busy=await db.checkoutOrder.create({data:{member_id:f.fan,membership_id:f.plan.id,subscription_id:sub.id,amount:10000,status:'processing',snapshot:{},idempotency_key:randomUUID(),expires_at:new Date(Date.now()+60000)}});
 await assert.rejects(f.finance.adminRefund(superAdmin,sub.id,{reason:'검증',confirmation:'10,000원'}),code('PAYMENT_IN_PROGRESS'));
 await db.checkoutOrder.delete({where:{id:busy.id}});
 const empty=await fixture();const none=await db.subscription.create({data:{subscriber_id:empty.fan,membership_item_id:empty.plan.id,status:'ONGOING',amount:10000,auto_renew:true,ended_at:new Date(Date.now()+86400000)}});
 await assert.rejects(empty.finance.adminRefund(superAdmin,none.id,{reason:'검증'}),code('NO_REFUNDABLE_PAYMENT'));
});
test('member cancel tells the member once in the app and by mail; repeating it does not',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);await f.finance.cancelSubscription(f.fan,f.creator);await f.finance.cancelSubscription(f.fan,f.creator);
 const mail=await notices(f.fan,'subscription-cancelled');assert.equal(mail.length,1);assert.equal(mail[0].path,'/subscriptions');
 const told=(await inbox(f.fan,'subscription')).filter(n=>n.text.includes('해지가 예약'));assert.equal(told.length,1);assert.match(told[0].text,/까지 이용할 수 있습니다/);
});
test('member 7-day refund and a provider-side cancel each send one refund notice to the member and the creator',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);await db.checkoutOrder.update({where:{id:f.order.id},data:{usage_tracking_started_at:new Date()}});
 await f.finance.refund(f.fan,f.order.id);await f.finance.refund(f.fan,f.order.id);
 assert.equal((await notices(f.fan,'refund-completed')).length,1);assert.equal((await inbox(f.creator,'settlement')).length,1);
 const g=await fixture();await g.finance.pay(g.fan,g.order.id);const a=g.approved.get(g.order.id);g.approved.set(g.order.id,{...a,status:'CANCELED',balanceAmount:0});
 assert.equal(await g.finance.reconcilePaid(g.order.id),1);
 const told=await inbox(g.fan,'subscription');assert.ok(told.some(n=>n.text.includes('결제사에서 취소')));assert.equal((await notices(g.fan,'refund-completed')).length,1);assert.equal((await inbox(g.creator,'settlement')).length,1);
 await db.platformOperationalEvent.deleteMany({where:{dedupe_key:'external-cancel:'+g.order.id}});
});
test('renewal stopped because the plan stopped selling tells an active member; a disabled member is not told',async()=>{
 const f=await fixture();await f.finance.pay(f.fan,f.order.id);const sub=await due(f);await db.membershipItem.update({where:{id:f.plan.id},data:{is_active:false}});await f.finance.renew(sub.id);
 const mail=await notices(f.fan,'subscription-cancelled');assert.equal(mail.length,1);assert.ok(mail[0].rows.some(([k,v])=>k==='사유'&&v.includes('판매 중지')));
 const told=(await inbox(f.fan,'subscription')).filter(n=>n.text.includes('판매가 중지'));assert.equal(told.length,1);assert.doesNotMatch(told[0].text,/까지 이용할 수 있습니다/,'the period already ended at renewal time');
 const g=await fixture();await g.finance.pay(g.fan,g.order.id);const s2=await due(g);await db.member.update({where:{id:g.fan},data:{enabled:false}});await g.finance.renew(s2.id);
 assert.equal((await notices(g.fan,'subscription-cancelled')).length,0);
});
