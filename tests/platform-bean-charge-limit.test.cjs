require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-09 콩 충전 누적 한도(하루·한 달). 격리 crefans_platform_e2e DB, 실제 PG 호출 없음(주문 생성까지만 검사).
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {beanPolicy}=require('../dist/src/platform/bean-policy'),{BeansService,chargeWindowStarts}=require('../dist/src/platform/beans.service'),{PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service');
const db=new PrismaClient(),ids=Array.from({length:5},()=>randomUUID()),[free,daily,monthly,racer,replay]=ids;let release;
const config=new ConfigService({BEAN_LEDGER_ENABLED:'true',BEAN_LIVE_PAYMENTS_APPROVED:'true',BETA_MODE:'false'}),provider={configForClient:()=>({clientKey:'live_ck_synthetic'}),lookup:async()=>null},service=new PlatformService(db,undefined,config),finance=new PlatformFinanceService(service,provider,config,{}),code=c=>e=>e.getResponse?.().code===c;
const limited=(limits)=>{const b=new BeansService(service,finance,provider,{},config);b.chargeLimits=limits;return b;};
const order=(b,member,quantity,requestId=randomUUID())=>b.createCharge(member,{quantity,requestId});
// Seeds an earlier order directly (no ledger movement), as if it were created at `at`.
const seed=(member,amount,status,at,extra={})=>db.beanCharge.create({data:{member_id:member,request_key:'seed:'+randomUUID(),quantity:Math.ceil(amount/110),amount,environment:'live',status,expires_at:new Date(at.getTime()+1800000),created_at:at,...extra}});
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);for(const id of ids)await db.member.create({data:{id,email:id+'@example.invalid',name:'Synthetic',nickname:'Synthetic',preferred_username:id,email_verified:true}});});
after(async()=>{try{
 // createCharge moved company stock into charge-reserved; return it and drop those journal lines so the shared ledger stays balanced.
 const orders=await db.beanCharge.findMany({where:{member_id:{in:ids}}}),movements=await db.beanMovement.findMany({where:{reference_id:{in:orders.map(o=>o.id)}}}),reserved=movements.length?orders.filter(o=>movements.some(m=>m.reference_id===o.id)).reduce((n,o)=>n+o.quantity,0):0;
 await db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${'bean-company'} FOR UPDATE`;if(reserved){await tx.beanAccount.update({where:{id:'bean-stock'},data:{balance:{increment:BigInt(reserved)}}});const ra=await tx.beanAccount.findUniqueOrThrow({where:{wallet_id_bucket:{wallet_id:'bean-company',bucket:'charge-reserved'}}});await tx.beanAccount.update({where:{id:ra.id},data:{balance:{decrement:BigInt(reserved)}}});}await tx.beanEntry.deleteMany({where:{movement_id:{in:movements.map(m=>m.id)}}});await tx.beanMovement.deleteMany({where:{id:{in:movements.map(m=>m.id)}}});});
 const wallets=await db.beanWallet.findMany({where:{owner_key:{in:ids.map(id=>'member:'+id)}}});await db.beanCharge.deleteMany({where:{member_id:{in:ids}}});await db.beanAccount.deleteMany({where:{wallet_id:{in:wallets.map(w=>w.id)}}});await db.beanWallet.deleteMany({where:{id:{in:wallets.map(w=>w.id)}}});await db.member.deleteMany({where:{id:{in:ids}}});
}finally{await db.$disconnect();await release?.();}});

test('KST window starts: the day and month turn at 00:00 Asia/Seoul, not UTC',()=>{
 const at=chargeWindowStarts(new Date('2026-11-30T15:00:00.000Z'));// 2026-12-01 00:00 KST
 assert.equal(at.day.toISOString(),'2026-11-30T15:00:00.000Z');assert.equal(at.month.toISOString(),'2026-11-30T15:00:00.000Z');
 const before=chargeWindowStarts(new Date('2026-11-30T14:59:59.999Z'));// 2026-11-30 23:59:59.999 KST
 assert.equal(before.day.toISOString(),'2026-11-29T15:00:00.000Z');assert.equal(before.month.toISOString(),'2026-10-31T15:00:00.000Z');
 assert.equal(chargeWindowStarts(new Date('2026-11-09T00:30:00.000Z')).day.toISOString(),'2026-11-08T15:00:00.000Z');
});

// 2026-11-14 user decision: daily 200,000 KRW (KB card rule refuses cyber money over 200,000 KRW a day), no monthly limit.
test('policy default is a 200,000 KRW daily limit and no monthly limit',async()=>{
 assert.equal(beanPolicy.dailyChargeLimitKrw,200000);assert.equal(beanPolicy.monthlyChargeLimitKrw,null);
 const beans=new BeansService(service,finance,provider,{},config);assert.deepEqual(beans.chargeLimits,{daily:200000,monthly:null});
 await seed(free,110000,'paid',new Date());
 assert.deepEqual((await beans.wallet(free)).chargeLimits,{dailyLimitKrw:200000,monthlyLimitKrw:null,dailyRemainingKrw:90000,monthlyRemainingKrw:null});
 await assert.rejects(order(beans,free,819),code('BEAN_DAILY_LIMIT'));// 90,090 KRW
 assert.equal((await order(beans,free,818)).amount,89980);
});

test('limits switched off: no check and no remaining amounts are exposed',async()=>{
 const beans=limited({daily:null,monthly:null});
 await seed(free,5000000,'paid',new Date());
 const o=await order(beans,free,900);assert.equal(o.amount,99000);
 assert.equal((await beans.wallet(free)).chargeLimits,null);
 // 0 also means off.
 assert.equal((await order(limited({daily:0,monthly:0}),free,100)).amount,11000);
});

test('daily limit: exactly the limit passes, 1 KRW over is rejected; yesterday (KST), failed, cancelled and expired orders are not counted',async()=>{
 const {day}=chargeWindowStarts(new Date()),now=new Date();
 await seed(daily,900000,'paid',new Date(day.getTime()-1));// 23:59:59.999 KST yesterday
 await seed(daily,900000,'failed',now);await seed(daily,900000,'cancelled',now);
 await seed(daily,900000,'pending',now,{expires_at:new Date(now.getTime()-1000)});
 await seed(daily,1100,'paid',day,{refunded_quantity:10,refunded_amount:1100});// 00:00 KST today, refunded in full: still counted
 await assert.rejects(order(limited({daily:12099,monthly:null}),daily,100),e=>code('BEAN_DAILY_LIMIT')(e)&&e.getStatus()===429&&/하루 충전 한도는 12,099원입니다\. 오늘 더 충전할 수 있는 금액은 10,999원입니다/.test(e.getResponse().message));
 const beans=limited({daily:12100,monthly:null});
 assert.deepEqual((await beans.wallet(daily)).chargeLimits,{dailyLimitKrw:12100,monthlyLimitKrw:null,dailyRemainingKrw:11000,monthlyRemainingKrw:null});
 const o=await order(beans,daily,100);assert.equal(o.amount,11000);
 assert.equal((await beans.wallet(daily)).chargeLimits.dailyRemainingKrw,0);// the new unexpired pending order counts
 await assert.rejects(order(beans,daily,1),code('BEAN_DAILY_LIMIT'));
});

test('monthly limit counts from 00:00 KST on the 1st, including disputed and processing orders',async()=>{
 const {month}=chargeWindowStarts(new Date());
 await seed(monthly,900000,'paid',new Date(month.getTime()-1));
 await seed(monthly,5500,'disputed',month);await seed(monthly,5500,'processing',new Date());
 const beans=limited({daily:null,monthly:22000});
 assert.equal((await beans.wallet(monthly)).chargeLimits.monthlyRemainingKrw,11000);
 await assert.rejects(order(beans,monthly,101),e=>code('BEAN_MONTHLY_LIMIT')(e)&&/이번 달 더 충전할 수 있는 금액은 11,000원/.test(e.getResponse().message));
 await order(beans,monthly,100);await assert.rejects(order(beans,monthly,1),code('BEAN_MONTHLY_LIMIT'));
 // Both enabled: the daily check speaks first when it is the tighter one.
 await assert.rejects(order(limited({daily:110,monthly:1000000}),monthly,2),code('BEAN_DAILY_LIMIT'));
});

test('concurrent orders of one member are summed under the wallet lock: only one fits the remaining amount',async()=>{
 const beans=limited({daily:11000,monthly:null}),results=await Promise.allSettled([order(beans,racer,100),order(beans,racer,100),order(beans,racer,100)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&code('BEAN_DAILY_LIMIT')(r.reason)).length,2);
});

test('retrying the same requestId returns the existing order even after the limit is reached',async()=>{
 const beans=limited({daily:11000,monthly:null}),key=randomUUID(),first=await order(beans,replay,100,key);
 assert.equal((await order(beans,replay,100,key)).id,first.id);await assert.rejects(order(beans,replay,100),code('BEAN_DAILY_LIMIT'));
});
