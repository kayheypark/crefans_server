require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-01 user decisions (docs/referral-design-20261101.md): the direct inviter gets 100 withdrawable promotional beans
// once, on the invitee's first live payment; a refund claws it back; such members may withdraw beans like creators.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {BeansService}=require('../dist/src/platform/beans.service'),{PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),referrals=require('../dist/src/platform/referrals');
const db=new PrismaClient(),ids=Array.from({length:4},()=>randomUUID()),[referrer,invitee,stranger,second]=ids,pg=new Map();let release;
const settings={BEAN_LEDGER_ENABLED:'true',BEAN_LIVE_PAYMENTS_APPROVED:'true',BETA_MODE:'false',REFERRAL_ENABLED:'true'};
const stub=key=>({configForClient:()=>({clientKey:key}),decrypt:x=>x,encrypt:x=>x,lookup:async id=>pg.get(id)||null,confirm:async(k,o)=>{const r={status:'DONE',currency:'KRW',totalAmount:o.amount,balanceAmount:o.amount,paymentKey:k,orderId:o.id,approvedAt:new Date().toISOString()};pg.set(o.id,r);return r;},cancel:async()=>({status:'PARTIAL_CANCELED'})});
function make(extra={},key='live_ck_synthetic'){const config=new ConfigService({...settings,...extra}),provider=stub(key),service=new PlatformService(db,undefined,config),finance=new PlatformFinanceService(service,provider,config,{transfer:async()=>({status:'paid'})});return new BeansService(service,finance,provider,{transfer:async()=>({status:'paid'})},config);}
const beans=make(),code=c=>e=>e.getResponse?.().code===c;
const buy=async(service,member,q=100)=>{const o=await service.createCharge(member,{quantity:q,requestId:randomUUID()});await service.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});return o;};
const signupOf=member=>db.referralSignup.findUniqueOrThrow({where:{member_id:member}});
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 for(const id of ids)await db.member.create({data:{id,email:id+'@referral.invalid',name:'Referral fixture',nickname:'Referral fixture',preferred_username:id,email_verified:true}});});
after(async()=>{try{await db.creatorReceivable.deleteMany({where:{creator_id:{in:ids}}});await db.referralSignup.deleteMany({where:{OR:[{member_id:{in:ids}},{referrer_id:{in:ids}}]}});await db.referral.deleteMany({where:{member_id:{in:ids}}});}finally{await db.$disconnect();await release?.();}});

test('one referral row per member; its id is the code; self and unknown codes do not link',async()=>{
 const a=await referrals.ensureReferral(db,referrer),b=await referrals.ensureReferral(db,referrer);assert.equal(a.id,b.id);
 assert.equal(await referrals.findReferral(db,randomUUID()),null);assert.equal(await referrals.findReferral(db,'not-a-code'),null);
 assert.equal(await db.$transaction(tx=>referrals.linkReferralSignup(tx,a.id,referrer)),null,'self referral');
 const linked=await db.$transaction(tx=>referrals.linkReferralSignup(tx,a.id,invitee));assert.equal(linked.referrer_id,referrer);assert.equal(linked.reward_status,'pending');
 assert.deepEqual(await referrals.myReferral(db,new ConfigService(settings),referrer),{code:a.id,invited:1,rewarded:0,rewardBeans:0,rewardPerInvite:100});
 await assert.rejects(referrals.myReferral(db,new ConfigService({}),referrer),code('REFERRAL_DISABLED'));
});

test('test-key payments and a disabled switch never mint withdrawable beans',async()=>{
 await buy(make({REFERRAL_ENABLED:'false'}),invitee);assert.equal((await signupOf(invitee)).reward_status,'pending','switch off');
 await buy(make({},'test_ck_synthetic'),invitee);assert.equal((await signupOf(invitee)).reward_status,'pending','test payment');
});

test('the first live payment pays the direct inviter 100 withdrawable beans once; the inviter may then use bean payouts',async()=>{
 await assert.rejects(beans.studio(referrer),code('CREATOR_REQUIRED'),'no reward yet');
 const first=await buy(beans,invitee);await buy(beans,invitee);
 const s=await signupOf(invitee);assert.deepEqual([s.reward_status,s.reward_quantity,s.reward_source,s.reward_source_id],['granted',100,'bean_charge',first.id]);
 const lots=await db.beanLot.findMany({where:{member_id:referrer,grant_id:s.id}});assert.equal(lots.length,1,'once');assert.deepEqual([lots[0].bucket,lots[0].available],['earned-promotion',100]);
 assert.equal((await beans.wallet(referrer)).withdrawableBeans,100,'withdrawable at once');
 assert.equal((await beans.studio(referrer)).availableBeans,100,'bean payout screen opens for a rewarded member');
 await assert.rejects(beans.studio(stranger),code('CREATOR_REQUIRED'));
});

test('refunding the rewarding payment claws the reward back',async()=>{
 const s=await signupOf(invitee),charge=await db.beanCharge.findUniqueOrThrow({where:{id:s.reward_source_id}});
 await beans.refundCharge(invitee,charge.id,{requestId:randomUUID()});
 assert.equal((await signupOf(invitee)).reward_status,'clawed_back');const lot=await db.beanLot.findFirstOrThrow({where:{member_id:referrer,grant_id:s.id}});assert.deepEqual([lot.available,lot.frozen],[0,true]);
 assert.equal((await beans.wallet(referrer)).withdrawableBeans,0);
});

test('a reward already paid out becomes an open bean receivable at the net amount',async()=>{
 const code2=(await referrals.ensureReferral(db,stranger)).id;await db.$transaction(tx=>referrals.linkReferralSignup(tx,code2,second));
 const o=await buy(beans,second),s=await signupOf(second),lot=await db.beanLot.findFirstOrThrow({where:{member_id:stranger,grant_id:s.id}});
 await db.beanLot.update({where:{id:lot.id},data:{available:40}});// 60 beans left in an earlier payout
 await db.$transaction(tx=>referrals.clawBackReferralReward(tx,'bean_charge',o.id));
 const r=await db.creatorReceivable.findFirstOrThrow({where:{creator_id:stranger,kind:'beans'}});assert.deepEqual([r.amount,r.status],[4800,'open']);
});

test('a valid referral link admits signup without an operator invite only while the switch is on',async()=>{
 const {PlatformAuthService}=require('../dist/src/platform/auth.service'),auth=extra=>new PlatformAuthService(db,{},{},new ConfigService({BETA_MODE:'true',...extra}));
 const codeOf=(await referrals.ensureReferral(db,referrer)).id,email=randomUUID()+'@referral.invalid';
 assert.equal(await auth({REFERRAL_ENABLED:'true'}).assertInvitedOrReferred(email,codeOf),true);
 await assert.rejects(auth({REFERRAL_ENABLED:'true'}).assertInvitedOrReferred(email,randomUUID()),code('INVALID_REFERRAL'));
 await assert.rejects(auth({}).assertInvitedOrReferred(email,codeOf),code('SIGNUP_INVITE_REQUIRED'),'switch off: the invite rule stands');
 await assert.rejects(auth({REFERRAL_ENABLED:'true'}).assertInvitedOrReferred(email,undefined),code('SIGNUP_INVITE_REQUIRED'),'no code: the invite rule stands');
});
