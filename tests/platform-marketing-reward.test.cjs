require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-18: promotion beans 10 for a member's first ever advertising consent (signup or settings), once per account, only while
// the bean ledger is on. Isolated crefans_platform_e2e DB on the loopback dev server; mail is a stub (no SMTP).
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents'),{publishedCatalog}=require('./legal-fixture.cjs');
const {PlatformService}=require('../dist/src/platform/service'),{BeansService}=require('../dist/src/platform/beans.service'),{PlatformAuthService}=require('../dist/src/platform/auth.service'),{LocalMemberService}=require('../dist/src/auth/local/local-member.service');
const {recordMarketingChoice}=require('../dist/src/platform/marketing.service'),{marketingRewardKey,MARKETING_REWARD_ACTOR}=require('../dist/src/platform/marketing-reward');
const db=new PrismaClient(),legal=new LegalDocumentsService();legal.catalog=publishedCatalog;
const config=new ConfigService({BEAN_LEDGER_ENABLED:'true',AUTH_PROVIDER:'local',LOCAL_AUTH_SECRET:'marketing-reward-'.repeat(5),SIGNUP_IDENTITY_MODE:'email-only',SMTP_HOST:'localhost',PUBLIC_API_ORIGIN:'https://crefans.com'});
const codes=[],mail={sendCode:async(email,value)=>codes.push({email,code:value})};
const local=new LocalMemberService(db,config,mail),auth=new PlatformAuthService(db,local,mail,config,legal),service=new PlatformService(db,legal,config),beans=new BeansService(service,null,null,null,config);
const members=[],emails=[];let release,stockBaseline;
const version=()=>legal.signup().versions.marketing;
const toggle=(member,on)=>service.settings(member,{section:'notifications',contentAlert:true,messageAlert:true,marketingAlert:on,marketingVersion:version()});
const grants=member=>db.beanPromotion.count({where:{member_id:member,actor_id:MARKETING_REWARD_ACTOR}});
const spendable=async member=>(await beans.wallet(member)).spendableBeans;
async function signup(marketing){const email=`mkt-${randomUUID()}@example.invalid`;emails.push(email);await auth.requestCode(email);const {proof}=await auth.verifyCode({email,code:codes.find(m=>m.email===email).code});
 await auth.signup({email,emailProof:proof,password:'Marketing-test-123!',nickname:'혜택',terms:true,privacy:true,marketing,ageAcknowledged:true,policyVersions:legal.signup().versions});
 const m=await db.member.findUniqueOrThrow({where:{email}});members.push(m.id);return m.id;}
async function fixture(){const id=randomUUID();await db.member.create({data:{id,email:id+'@example.invalid',name:'Reward fixture',nickname:'Reward fixture',preferred_username:id.slice(0,20),email_verified:true}});members.push(id);return id;}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);stockBaseline=(await db.beanAccount.findUniqueOrThrow({where:{id:'bean-stock'}})).balance;});
after(async()=>{try{
 const grantRows=await db.beanPromotion.findMany({where:{member_id:{in:members}}}),lots=await db.beanLot.findMany({where:{member_id:{in:members}}}),moves=await db.beanMovement.findMany({where:{reference_id:{in:[...grantRows.map(g=>g.id),...lots.map(l=>l.id)]}}});
 const wallets=await db.beanWallet.findMany({where:{owner_key:{in:members.map(m=>`member:${m}`)}}}),accounts=await db.beanAccount.findMany({where:{wallet_id:{in:wallets.map(w=>w.id)}}});
 await db.$transaction(async tx=>{await tx.beanEntry.deleteMany({where:{movement_id:{in:moves.map(m=>m.id)}}});await tx.beanMovement.deleteMany({where:{id:{in:moves.map(m=>m.id)}}});await tx.beanLot.deleteMany({where:{member_id:{in:members}}});await tx.beanPromotion.deleteMany({where:{member_id:{in:members}}});await tx.beanEntry.deleteMany({where:{account_id:{in:accounts.map(a=>a.id)}}});await tx.beanAccount.deleteMany({where:{id:{in:accounts.map(a=>a.id)}}});await tx.beanWallet.deleteMany({where:{id:{in:wallets.map(w=>w.id)}}});await tx.beanAccount.update({where:{id:'bean-stock'},data:{balance:stockBaseline}});});
 await db.memberNotice.deleteMany({where:{member_id:{in:members}}});await db.memberNotification.deleteMany({where:{member_id:{in:members}}});await db.marketingDelivery.deleteMany({where:{member_id:{in:members}}});await db.memberConsent.deleteMany({where:{member_id:{in:members}}});await db.accountPreference.deleteMany({where:{member_id:{in:members}}});await db.memberSession.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.signupChallenge.deleteMany({where:{email:{in:emails}}});
}finally{await db.$disconnect();if(release)await release();}});

test('signup consent credits 10 promotion beans once: 30-day lot, balanced ledger, audit; withdrawal keeps them, re-consent never grants again',async()=>{
 const member=await signup(true),grant=await db.beanPromotion.findUniqueOrThrow({where:{request_key:marketingRewardKey(member)}});
 assert.equal(grant.quantity,10);assert.equal(grant.actor_id,MARKETING_REWARD_ACTOR);
 const lot=await db.beanLot.findFirstOrThrow({where:{grant_id:grant.id}});assert.equal(lot.bucket,'promotion');assert.equal(lot.available,10);assert.equal(lot.expires_at-lot.release_at,30*86400000);
 assert.equal(await spendable(member),10);assert.equal((await beans.wallet(member)).withdrawableBeans,0);
 assert.equal((await db.beanAccount.findUniqueOrThrow({where:{id:'bean-stock'}})).balance,stockBaseline-10n);
 assert.equal(await db.platformAuditLog.count({where:{action:'beans.marketing_reward_granted',entity_id:grant.id}}),1);
 assert.equal((await db.accountPreference.findUniqueOrThrow({where:{member_id:member}})).marketing_alert,true);
 assert.equal((await service.bootstrap(member)).marketingReward.eligible,false);
 assert.deepEqual(await toggle(member,false),{message:'설정을 저장했습니다.'});
 assert.equal(await spendable(member),10,'withdrawal does not claw back');
 assert.deepEqual(await toggle(member,true),{message:'설정을 저장했습니다.'},'re-enabling does not promise or grant beans');
 assert.equal(await grants(member),1);assert.equal(await spendable(member),10);
});

test('signup without consent grants nothing; first later settings ON grants once with the toast message; off→on again does not',async()=>{
 const member=await signup(false);assert.equal(await grants(member),0);assert.equal(await spendable(member),0);
 assert.deepEqual((await service.bootstrap(member)).marketingReward,{beans:10,validDays:30,eligible:true});
 const result=await toggle(member,true);assert.equal(result.message,'설정을 저장했어요. 프로모션 콩 10개를 넣어드렸어요.');assert.equal(result.marketingReward.beans,10);assert.ok(Date.parse(result.marketingReward.expiresAt)>Date.now()+29*86400000);
 assert.equal(await spendable(member),10);
 await toggle(member,false);const again=await toggle(member,true);assert.equal(again.marketingReward,undefined);assert.equal(await grants(member),1);assert.equal(await spendable(member),10);
});

test('members who consented before the release (earlier consent row) get nothing when they turn it on again',async()=>{
 const member=await fixture();
 // Pre-release consent: recorded without the reward option, as the old code did.
 await db.$transaction(async tx=>{await recordMarketingChoice(tx,member,true,'signup',legal.signup().documents.marketing);});
 assert.equal((await service.bootstrap(member)).marketingReward.eligible,false);
 assert.deepEqual(await toggle(member,true),{message:'설정을 저장했습니다.'},'already on: no change, no grant');
 await toggle(member,false);assert.deepEqual(await toggle(member,true),{message:'설정을 저장했습니다.'});
 assert.equal(await grants(member),0);
});

test('concurrent first consents from two tabs credit exactly one reward',async()=>{
 const member=await fixture();const results=await Promise.allSettled(Array.from({length:6},()=>toggle(member,true)));
 assert.ok(results.every(r=>r.status==='fulfilled'),JSON.stringify(results.filter(r=>r.status==='rejected').map(r=>String(r.reason))));
 assert.equal(results.filter(r=>r.value.marketingReward).length,1);assert.equal(await grants(member),1);assert.equal(await spendable(member),10);
});

test('bean feature off: no promise in bootstrap, no grant at signup or in settings',async()=>{
 config.set('BEAN_LEDGER_ENABLED','false');
 try{assert.equal((await service.bootstrap()).marketingReward,null);const member=await signup(true);const other=await fixture();assert.deepEqual(await toggle(other,true),{message:'설정을 저장했습니다.'});
  assert.equal(await db.beanPromotion.count({where:{member_id:{in:[member,other]}}}),0);assert.equal((await db.accountPreference.findUniqueOrThrow({where:{member_id:member}})).marketing_alert,true,'the consent itself is still recorded');}
 finally{config.set('BEAN_LEDGER_ENABLED','true');}
});

test('a ledger failure (frozen wallet, empty stock) rolls back only the reward; the consent is recorded and audited',async()=>{
 const frozen=await fixture();await beans.wallet(frozen);await db.beanWallet.update({where:{owner_key:`member:${frozen}`},data:{status:'frozen'}});
 assert.deepEqual(await toggle(frozen,true),{message:'설정을 저장했습니다.'});
 assert.equal(await grants(frozen),0);assert.equal(await db.beanMovement.count({where:{actor_id:MARKETING_REWARD_ACTOR,reference_id:{in:(await db.beanPromotion.findMany({where:{member_id:frozen}})).map(g=>g.id)}}}),0);
 const pref=await db.accountPreference.findUniqueOrThrow({where:{member_id:frozen}});assert.equal(pref.marketing_alert,true);assert.ok(pref.marketing_consent_id);
 assert.equal(await db.platformAuditLog.count({where:{action:'beans.marketing_reward_failed',entity_id:frozen}}),1);
 const empty=await fixture(),stock=(await db.beanAccount.findUniqueOrThrow({where:{id:'bean-stock'}})).balance;await db.beanAccount.update({where:{id:'bean-stock'},data:{balance:5n}});
 try{assert.deepEqual(await toggle(empty,true),{message:'설정을 저장했습니다.'});assert.equal(await grants(empty),0);assert.equal((await db.beanAccount.findUniqueOrThrow({where:{id:'bean-stock'}})).balance,5n);assert.equal((await db.accountPreference.findUniqueOrThrow({where:{member_id:empty}})).marketing_alert,true);}
 finally{await db.beanAccount.update({where:{id:'bean-stock'},data:{balance:stock}});}
});

test('the 30-day reward lot gets the 7-day event expiry notice, not one right after the grant',async()=>{
 const member=await fixture();const {marketingReward}=await toggle(member,true),expires=Date.parse(marketingReward.expiresAt),day=86400000;
 const lot=await db.beanLot.findFirstOrThrow({where:{member_id:member,bucket:'promotion'}});
 await beans.expireLots(new Date());await beans.expireLots(new Date(expires-8*day));
 assert.equal(await db.memberNotice.count({where:{dedupe_key:{contains:lot.id}}}),0);
 await beans.expireLots(new Date(expires-7*day+60000));
 assert.equal(await db.memberNotice.count({where:{dedupe_key:'event-bean-expiry:'+lot.id}}),1);assert.equal(await db.memberNotice.count({where:{dedupe_key:'bean-expiry:'+lot.id}}),0);
});
