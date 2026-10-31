require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-01 user decisions (docs/referral-design-20261101.md): the invitee's first live payment qualifies the direct inviter;
// 7 days later, if still unrefunded, the worker credits 100 withdrawable promotional beans (max 10 per KST month).
// A later refund claws it back; rewarded members may withdraw beans like creators.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {BeansService}=require('../dist/src/platform/beans.service'),{PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),referrals=require('../dist/src/platform/referrals');
const db=new PrismaClient(),ids=Array.from({length:6},()=>randomUUID()),[referrer,invitee,stranger,second,busy,third]=ids,pg=new Map();let release;
const settings={BEAN_LEDGER_ENABLED:'true',BEAN_LIVE_PAYMENTS_APPROVED:'true',BETA_MODE:'false'};
// The switch is a console setting (platform_settings referral.enabled); tests turn it on and restore the prior value afterwards.
const setSwitch=value=>db.platformSetting.upsert({where:{key:'referral.enabled'},create:{key:'referral.enabled',value},update:{value}});let priorSwitch;
const stub=key=>({configForClient:()=>({clientKey:key}),decrypt:x=>x,encrypt:x=>x,lookup:async id=>pg.get(id)||null,confirm:async(k,o)=>{const r={status:'DONE',currency:'KRW',totalAmount:o.amount,balanceAmount:o.amount,paymentKey:k,orderId:o.id,approvedAt:new Date().toISOString()};pg.set(o.id,r);return r;},cancel:async()=>({status:'PARTIAL_CANCELED'})});
function make(extra={},key='live_ck_synthetic'){const config=new ConfigService({...settings,...extra}),provider=stub(key),service=new PlatformService(db,undefined,config),finance=new PlatformFinanceService(service,provider,config,{transfer:async()=>({status:'paid'})});return new BeansService(service,finance,provider,{transfer:async()=>({status:'paid'})},config);}
const beans=make(),code=c=>e=>e.getResponse?.().code===c;
const buy=async(service,member,q=100)=>{const o=await service.createCharge(member,{quantity:q,requestId:randomUUID()});await service.confirm(member,o.id,{paymentKey:'synthetic-'+o.id,orderId:o.id,amount:o.amount});return o;};
const signupOf=member=>db.referralSignup.findUniqueOrThrow({where:{member_id:member}});
// Run the worker as if the hold had passed: due times move back instead of the clock moving forward, so lots are withdrawable now.
const grantDue=async()=>{await db.referralSignup.updateMany({where:{reward_status:'qualified'},data:{grant_due_at:new Date(Date.now()-1000)}});return referrals.grantDueReferralRewards(db,new ConfigService(settings),new Date());};
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 priorSwitch=await db.platformSetting.findUnique({where:{key:'referral.enabled'}});await setSwitch(true);
 for(const id of ids)await db.member.create({data:{id,email:id+'@referral.invalid',name:'Referral fixture',nickname:'Referral fixture',preferred_username:id,email_verified:true}});});
after(async()=>{try{if(priorSwitch)await setSwitch(priorSwitch.value);else await db.platformSetting.deleteMany({where:{key:'referral.enabled'}});await db.creatorReceivable.deleteMany({where:{creator_id:{in:ids}}});await db.referralSignup.deleteMany({where:{OR:[{member_id:{in:ids}},{referrer_id:{in:ids}}]}});await db.referral.deleteMany({where:{member_id:{in:ids}}});}finally{await db.$disconnect();await release?.();}});

test('one referral row per member; its id is the code; self and unknown codes do not link',async()=>{
 const a=await referrals.ensureReferral(db,referrer),b=await referrals.ensureReferral(db,referrer);assert.equal(a.id,b.id);
 assert.equal(await referrals.findReferral(db,randomUUID()),null);assert.equal(await referrals.findReferral(db,'not-a-code'),null);
 assert.equal(await db.$transaction(tx=>referrals.linkReferralSignup(tx,a.id,referrer)),null,'self referral');
 const linked=await db.$transaction(tx=>referrals.linkReferralSignup(tx,a.id,invitee));assert.equal(linked.referrer_id,referrer);assert.equal(linked.reward_status,'pending');
 assert.deepEqual(await referrals.myReferral(db,referrer),{code:a.id,invited:1,rewarded:0,rewardBeans:0,rewardPerInvite:100,holdDays:7,monthlyCap:10,qualified:0});
 await setSwitch(false);try{await assert.rejects(referrals.myReferral(db,referrer),code('REFERRAL_DISABLED'));}finally{await setSwitch(true);}
});

test('test-key payments and a disabled switch never mint withdrawable beans',async()=>{
 await setSwitch(false);try{await buy(beans,invitee);}finally{await setSwitch(true);}assert.equal((await signupOf(invitee)).reward_status,'pending','switch off');
 await buy(make({},'test_ck_synthetic'),invitee);assert.equal((await signupOf(invitee)).reward_status,'pending','test payment');
});

test('a refund inside the 7-day hold cancels the qualification and the next live payment qualifies instead',async()=>{
 const refunded=await buy(beans,invitee);assert.equal((await signupOf(invitee)).reward_status,'qualified');
 await beans.refundCharge(invitee,refunded.id,{requestId:randomUUID()});assert.equal((await signupOf(invitee)).reward_status,'pending');
 assert.equal(await db.beanLot.count({where:{member_id:referrer,bucket:'earned-promotion'}}),0,'nothing credited');
});

test('7 days after the first live payment the direct inviter gets 100 withdrawable beans once; the inviter may then use bean payouts',async()=>{
 await assert.rejects(beans.studio(referrer),code('CREATOR_REQUIRED'),'no reward yet');
 const first=await buy(beans,invitee);await buy(beans,invitee);
 const q=await signupOf(invitee);assert.deepEqual([q.reward_status,q.reward_source_id],['qualified',first.id]);
 assert.equal(await referrals.grantDueReferralRewards(db,new ConfigService(settings),new Date()),0,'not before the hold ends');
 assert.equal(await grantDue(),1);assert.equal(await grantDue(),0,'once');
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
 const o=await buy(beans,second);await grantDue();const s=await signupOf(second),lot=await db.beanLot.findFirstOrThrow({where:{member_id:stranger,grant_id:s.id}});
 await db.beanLot.update({where:{id:lot.id},data:{available:40}});// 60 beans left in an earlier payout
 await db.$transaction(tx=>referrals.clawBackReferralReward(tx,'bean_charge',o.id));
 const r=await db.creatorReceivable.findFirstOrThrow({where:{creator_id:stranger,kind:'beans'}});assert.deepEqual([r.amount,r.status],[4800,'open']);
});

test('a valid referral link admits signup without an operator invite only while the switch is on',async()=>{
 const {PlatformAuthService}=require('../dist/src/platform/auth.service'),auth=new PlatformAuthService(db,{},{},new ConfigService({BETA_MODE:'true'}));
 const codeOf=(await referrals.ensureReferral(db,referrer)).id,email=randomUUID()+'@referral.invalid';
 assert.equal(await auth.assertInvitedOrReferred(email,codeOf),true);
 await assert.rejects(auth.assertInvitedOrReferred(email,randomUUID()),code('INVALID_REFERRAL'));
 await assert.rejects(auth.assertInvitedOrReferred(email,undefined),code('SIGNUP_INVITE_REQUIRED'),'no code: the invite rule stands');
 await setSwitch(false);try{await assert.rejects(auth.assertInvitedOrReferred(email,codeOf),code('SIGNUP_INVITE_REQUIRED'),'switch off: the invite rule stands');}finally{await setSwitch(true);}
});

test('at most 10 rewards per inviter per KST month; the rest are recorded as capped',async()=>{
 const codeOf=(await referrals.ensureReferral(db,busy)).id;
 for(let i=0;i<10;i++)await db.referralSignup.create({data:{referral_id:codeOf,referrer_id:busy,member_id:randomUUID(),reward_status:'granted',reward_quantity:100,rewarded_at:new Date()}});
 await db.$transaction(tx=>referrals.linkReferralSignup(tx,codeOf,third));await buy(beans,third);
 await grantDue();assert.equal((await signupOf(third)).reward_status,'capped');
 assert.equal(await db.beanLot.count({where:{member_id:busy,bucket:'earned-promotion'}}),0);
});

test('console: switch, list, member type filter and a link for any member',async()=>{
 const admin=require('../dist/src/platform/admin-referrals'),{adminMembers}=require('../dist/src/platform/admin-console');
 const operator={id:randomUUID()};await assert.rejects(admin.updateReferralSettings(db,operator,{enabled:'yes'}),code('INVALID_INPUT'));
 assert.equal((await admin.updateReferralSettings(db,operator,{enabled:false})).enabled,false);assert.equal((await admin.adminReferrals(db,{})).enabled,false);
 const log=await db.platformAuditLog.findFirst({where:{action:'admin.referral_settings_updated',entity_id:'referral.enabled'}});assert.ok(log,'audited');
 assert.equal((await admin.updateReferralSettings(db,operator,{enabled:true})).enabled,true);
 const list=await admin.adminReferrals(db,{status:'clawed_back',pageSize:'100'});assert.ok(list.items.every(i=>i.status==='clawed_back'));assert.ok(list.summary.clawed_back.count>=1);assert.ok(list.items.some(i=>i.referrer.id===stranger&&i.member.id===second));
 await assert.rejects(admin.adminReferrals(db,{status:'bogus'}),code('INVALID_QUERY'));
 const link=await admin.adminReferralLink(db,invitee);assert.equal(link.code,(await referrals.ensureReferral(db,invitee)).id);assert.match(link.link,/\/service\/signup\?ref=[0-9a-f-]{36}$/);
 await assert.rejects(admin.adminReferralLink(db,randomUUID()),code('MEMBER_NOT_FOUND'));
 await db.creator.create({data:{user_id:busy}});try{
  const creators=await adminMembers(db,{type:'creator',search:busy}),fans=await adminMembers(db,{type:'fan',search:busy});assert.equal(creators.items.length,1);assert.equal(fans.items.length,0);
  assert.equal((await adminMembers(db,{type:'fan',search:third})).items.length,1);await assert.rejects(adminMembers(db,{type:'admin'}),code('INVALID_QUERY'));
 }finally{await db.creator.deleteMany({where:{user_id:busy}});}
});
