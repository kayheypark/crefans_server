// 2026-11-16 user decisions: AI 이용권 구독형 (monthly card billing, KG이니시스) next to 횟수형; no product below 98원 per generation.
require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('crypto'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const {AiSubscriptionService,addMonth,AI_SUBSCRIPTION_RETRIES}=require('../dist/src/platform/ai-subscription');
const {AiShopService,AI_SHOP_TERMS,AI_SHOP_MIN_UNIT_KRW,reservePaidPhoto,paidPhotoCount}=require('../dist/src/platform/ai-shop');
const {AiShopAdminController}=require('../dist/src/platform/ai-shop.controller');
const {InicisBillingProvider,billingHash,refundHash,windowHash}=require('../dist/src/platform/inicis-billing');
const creator=randomUUID(),code=c=>e=>e.getResponse?.().code===c,productIds=[];
const service={db,member:async id=>db.member.findUniqueOrThrow({where:{id}}),requireCreator:async()=>{}};
let charges=[],cancels=[],failNext=0;
const provider={name:'fake',environment:()=>'test',charge:async input=>{if(failNext>0){failNext--;const e=new Error('declined');e.getResponse=()=>({code:'INICIS_CARD_DECLINED'});e.getStatus=()=>402;throw e;}if(uncertainNext>0){uncertainNext--;const e=new Error('timeout');e.code='ETIMEDOUT';throw e;}charges.push(input);return{tid:'tid-'+charges.length,paidAt:new Date()};},cancel:async input=>{cancels.push(input);}};
const subs=new AiSubscriptionService(service,new ConfigService({}));subs.setProvider(provider);
const admin=new AiShopAdminController(service),shop=new AiShopService(service,{configForClient:()=>({clientKey:'test_ck_x'})},{billingConfig:async()=>({customerKey:'c'})},{register:()=>{},requireOpen:async()=>{throw new Error('bank not used');}});
let plan,pack,uncertainNext=0;
before(async()=>{globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 await db.member.create({data:{id:creator,email:creator+'@sub.test.invalid',name:'Synthetic',nickname:'구독검증',preferred_username:creator.slice(0,20),email_verified:true}});await db.creator.create({data:{user_id:creator,is_active:true}});await db.aiPhotoGrant.create({data:{creator_user_id:creator,reason:'구독 테스트'}});
 plan=(await admin.create({kind:'subscription',name:'AI 이용권 구독 라이트',description:'매달 66회',amount:9900,quantity:66,validityDays:30,visible:true,onSale:true}));productIds.push(plan.id);
 pack=(await admin.create({kind:'pack',name:'AI 이용권 10회',description:'10회',amount:1900,quantity:10,validityDays:90,visible:true,onSale:true}));productIds.push(pack.id);
});
after(async()=>{try{const s=await db.aiSubscription.findMany({where:{creator_id:creator}});await db.aiSubscriptionCharge.deleteMany({where:{subscription_id:{in:s.map(x=>x.id)}}});await db.aiSubscription.deleteMany({where:{creator_id:creator}});await db.aiShopUse.deleteMany({where:{creator_id:creator}});await db.aiShopOrder.deleteMany({where:{creator_id:creator}});await db.aiShopProduct.deleteMany({where:{id:{in:productIds}}});await db.aiPhotoGrant.deleteMany({where:{creator_user_id:creator}});await db.creator.deleteMany({where:{user_id:creator}});await db.member.deleteMany({where:{id:creator}});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('loss guard: products under 98원 per generation cannot be saved; kinds are labelled; subscriptions are 30 days',async()=>{
 assert.equal(AI_SHOP_MIN_UNIT_KRW,98);
 await assert.rejects(admin.create({kind:'pack',name:'x',description:'x',amount:970,quantity:10,validityDays:30,visible:false,onSale:false}),code('PRICE_BELOW_COST'));
 await assert.rejects(admin.create({kind:'subscription',name:'x',description:'x',amount:9900,quantity:66,validityDays:31,visible:false,onSale:false}),code('INVALID_PRODUCT'));
 await assert.rejects(admin.create({kind:'weekly',name:'x',description:'x',amount:9900,quantity:66,validityDays:30,visible:false,onSale:false}),code('INVALID_PRODUCT'));
 assert.equal(plan.kind,'subscription');assert.equal(plan.kindLabel,'AI 이용권 구독형');assert.equal(plan.unitPrice,150);assert.equal(pack.kindLabel,'AI 이용권 횟수형');
 await assert.rejects(shop.create(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS,requestId:randomUUID()}),code('SUBSCRIPTION_PRODUCT'));
});

test('first month is charged on activation and grants that month only; renewal charges the same day next month without carry-over',async()=>{
 const started=await subs.start(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS});
 const active=await subs.activate(started.id,'enc-billkey','신한 **** 1234');
 assert.equal(active.status,'active');assert.equal(charges.length,1);assert.equal(charges[0].amount,9900);assert.equal(charges[0].billingKey,'enc-billkey');
 assert.equal(await paidPhotoCount(db,creator),66);
 const row=await db.aiSubscription.findUniqueOrThrow({where:{id:started.id}});assert.equal(row.next_charge_at.getTime(),row.current_period_end.getTime());
 await assert.rejects(subs.start(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS}),code('SUBSCRIPTION_EXISTS'));
 await reservePaidPhoto(db,creator);
 // Move to the renewal time: the old month's leftover uses expire, the new month grants 66 fresh uses.
 const first=await db.aiShopOrder.findFirstOrThrow({where:{creator_id:creator,status:'paid'}});await db.aiShopOrder.update({where:{id:first.id},data:{expires_at:new Date(Date.now()-1000)}});
 await db.aiSubscription.update({where:{id:started.id},data:{next_charge_at:new Date(Date.now()-1000)}});
 assert.equal(await subs.tick(v=>v),1);assert.equal(charges.length,2);assert.equal(await paidPhotoCount(db,creator),66,'no carry-over');
 assert.equal(await subs.tick(v=>v),0,'the same period is never charged twice');
});

test('a failed renewal retries every 24 hours up to 3 times and then ends; cancel keeps uses until the period end',async()=>{
 const s=(await subs.list(creator)).items[0];await db.aiSubscription.update({where:{id:s.id},data:{next_charge_at:new Date(Date.now()-1000)}});
 failNext=AI_SUBSCRIPTION_RETRIES+1;
 for(let i=0;i<=AI_SUBSCRIPTION_RETRIES;i++){await subs.tick(v=>v);const row=await db.aiSubscription.findUniqueOrThrow({where:{id:s.id}});if(i<AI_SUBSCRIPTION_RETRIES){assert.equal(row.status,'past_due');assert.ok(row.next_charge_at>new Date(Date.now()+23*3600000));await db.aiSubscription.update({where:{id:s.id},data:{next_charge_at:new Date(Date.now()-1000)}});}else{assert.equal(row.status,'ended');assert.equal(row.last_failure_code,'INICIS_CARD_DECLINED');}}
 // New subscription, then cancel: no further charge, ends at the period end.
 const again=await subs.start(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS});await subs.activate(again.id,'enc-2','국민 **** 5678');
 const cancelled=await subs.cancel(creator,again.id);assert.equal(cancelled.status,'cancel_scheduled');assert.equal(cancelled.nextChargeAt,null);
 const before=charges.length;await db.aiSubscription.update({where:{id:again.id},data:{current_period_end:new Date(Date.now()-1000),next_charge_at:new Date(Date.now()-1000)}});await subs.tick(v=>v);
 assert.equal(charges.length,before,'a cancelled subscription is not renewed');assert.equal((await db.aiSubscription.findUnique({where:{id:again.id}})).status,'ended');
});

test('refund returns unused uses × unit price by partial cancel and ends the subscription; first-charge failure leaves nothing active',async()=>{
 await db.aiShopOrder.updateMany({where:{creator_id:creator},data:{expires_at:new Date(Date.now()-1000)}});// isolate from earlier periods
 const s=await subs.start(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS});await subs.activate(s.id,'enc-3','하나 **** 0001');
 const use=await reservePaidPhoto(db,creator);await db.aiShopUse.update({where:{id:use.id},data:{status:'consumed'}});
 const order=await db.aiShopOrder.findFirstOrThrow({where:{creator_id:creator,status:'paid',expires_at:{gt:new Date()}}});assert.equal((await shop.orders(creator)).find(o=>o.id===order.id).subscription,true);await assert.rejects(shop.refund(creator,order.id),code('SUBSCRIPTION_ORDER'),'subscription uses are not refunded through the one-time PG path');
 const refunded=await subs.refund(creator,s.id);assert.equal(refunded.status,'refunded');
 const c=cancels.at(-1);assert.equal(c.amount,150*65);assert.equal(c.remainingAmount,9900-150*65);assert.equal(await paidPhotoCount(db,creator),0);
 failNext=1;const f=await subs.start(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS});await assert.rejects(subs.activate(f.id,'enc-4','x'),code('INICIS_CARD_DECLINED'));
 assert.equal((await db.aiSubscription.findUnique({where:{id:f.id}})).status,'ended');
});

test('KG이니시스: hashes follow the official concatenation, and the provider stays unavailable until keys and billkey spec are confirmed',()=>{
 const sha=v=>createHash('sha512').update(v).digest('hex');
 assert.equal(billingHash('KEY',{type:'Billing',paymethod:'Card',timestamp:'20261116120000',clientIp:'1.2.3.4',mid:'MID',moid:'M1',price:9900,billKey:'BK'}),sha('KEYBillingCard202611161200001.2.3.4MIDM19900BK'));
 assert.equal(refundHash('KEY',{type:'PartialRefund',paymethod:'Card',timestamp:'T',clientIp:'IP',mid:'MID',tid:'TID',price:100,confirmPrice:900}),sha('KEYPartialRefundCardTIPMIDTID100900'));
 assert.equal(refundHash('KEY',{type:'Refund',paymethod:'Card',timestamp:'T',clientIp:'IP',mid:'MID',tid:'TID'}),sha('KEYRefundCardTIPMIDTID'));
 assert.equal(windowHash('LITE',{price:9900,mid:'MID',orderId:'O1',timestamp:'T'}),sha('9900MIDO1TLITE'));
 assert.equal(new InicisBillingProvider(new ConfigService({})).environment(),'unavailable');
 assert.equal(new InicisBillingProvider(new ConfigService({INICIS_BILLING_MID:'m',INICIS_INIAPI_KEY:'k',INICIS_INILITE_KEY:'l'})).environment(),'unavailable','billkey decryption must be confirmed first');
 assert.equal(addMonth(new Date('2026-01-31T03:00:00+09:00')).toISOString(),new Date('2026-02-28T03:00:00+09:00').toISOString());
});

test('2026-11-16 night-work #1: an uncertain renewal is never charged again (same moid, no new order), operators are alerted; an uncertain first charge keeps nothing double-charged',async()=>{
 const other=await db.member.findFirstOrThrow({where:{id:creator}});
 const s=await db.aiSubscription.findFirstOrThrow({where:{creator_id:creator,status:{in:['active','cancel_scheduled','past_due']}}}).catch(()=>null);
 let sub=s;if(!sub){const st=await subs.start(creator,{productId:plan.id,version:plan.version,termsVersion:AI_SHOP_TERMS});await subs.activate(st.id,'enc-u','신한 **** 1234');sub=await db.aiSubscription.findUniqueOrThrow({where:{id:st.id}});}
 const due=new Date(Date.now()-1000);await db.aiSubscription.update({where:{id:sub.id},data:{status:'active',next_charge_at:due,retry_count:0}});
 const before=charges.length;uncertainNext=1;await subs.tick(v=>v);
 const row=await db.aiSubscription.findUniqueOrThrow({where:{id:sub.id}});
 assert.equal(row.status,'active','not turned into a failure');assert.equal(row.next_charge_at.getTime(),due.getTime(),'schedule and order number kept');assert.equal(row.last_failure_code,'BILLING_UNCERTAIN');
 const ch=await db.aiSubscriptionCharge.findFirstOrThrow({where:{subscription_id:sub.id},orderBy:{created_at:'desc'}});assert.equal(ch.status,'uncertain');
 assert.equal(await db.platformOperationalEvent.count({where:{type:'ai_subscription.charge_uncertain',dedupe_key:'ai_subscription.charge_uncertain:'+ch.moid}}),1,'operators alerted once');
 await subs.tick(v=>v);await subs.tick(v=>v);assert.equal(charges.length,before,'never charged again automatically');
 assert.equal(await db.aiSubscriptionCharge.count({where:{subscription_id:sub.id,period_start:due}}),1,'no second order number for the period');
 await assert.rejects(shop.create(creator,{productId:pack.id,version:pack.version,termsVersion:AI_SHOP_TERMS,requestId:ch.moid}),code('INVALID_REQUEST'),'clients cannot take a subscription order number');
});
