require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents');
const {publishedCatalog,blockedCatalog}=require('./legal-fixture.cjs');
const {PlatformAuthService}=require('../dist/src/platform/auth.service');
const {PlatformService}=require('../dist/src/platform/service');
const {PlatformFinanceService}=require('../dist/src/platform/finance.service');
const {signupPolicy}=require('../dist/src/platform/signup-policy');
const db=new PrismaClient(),emails=[],members=[],messages=[];
const legal=new LegalDocumentsService();legal.catalog=publishedCatalog;
const code=wanted=>error=>error.getResponse?.().code===wanted;
function auth(settings={},documents=legal){return new PlatformAuthService(db,{limit:async()=>{}},{sendCode:async(email,value)=>messages.push({email,code:value})},new ConfigService({LOCAL_AUTH_SECRET:'test-only-'.repeat(8),SIGNUP_IDENTITY_MODE:'email-only',...settings}),documents);}
async function input(client){const email=`beta-${randomUUID()}@example.invalid`;emails.push(email);await client.requestCode(email);const {proof}=await client.verifyCode({email,code:messages.find(m=>m.email===email).code});return{email,emailProof:proof,password:'Beta-test-123!',nickname:'베타 검증',terms:true,privacy:true,marketing:false,ageAcknowledged:true,policyVersions:legal.signup().versions};}
after(async()=>{await db.creator.deleteMany({where:{user_id:{in:members}}});await db.memberConsent.deleteMany({where:{member_id:{in:members}}});await db.accountPreference.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{email:{in:emails}}});await db.signupChallenge.deleteMany({where:{email:{in:emails}}});await db.$disconnect();});
test('missing or unknown mode requires PASS; invite emails stay server-side and are normalized',()=>{
 for(const value of [undefined,'pass','false','typo'])assert.equal(signupPolicy(new ConfigService({SIGNUP_IDENTITY_MODE:value})).identityRequired,true);
 const p=signupPolicy(new ConfigService({SIGNUP_IDENTITY_MODE:'email-only',SIGNUP_EMAIL_ALLOWLIST:' INVITED@example.invalid, '}));assert.equal(p.identityRequired,false);assert.equal(p.inviteOnly,true);p.assertEmail('invited@example.invalid');assert.throws(()=>p.assertEmail('other@example.invalid'),code('SIGNUP_INVITE_REQUIRED'));
});
test('email-only signup consumes a verified email and records consents without manufacturing identity or adult proof',async()=>{
 const client=auth(),data=await input(client),proofs=await db.identityProof.count();
 await assert.rejects(client.signup({...data,emailProof:'forged'}),code('EMAIL_VERIFICATION_REQUIRED'));
 for(const ageAcknowledged of [undefined,false,'true',1])await assert.rejects(client.signup({...data,ageAcknowledged}),code('AGE_ACKNOWLEDGEMENT_REQUIRED'));
 await assert.rejects(client.signup({...data,policyVersions:{}}),code('POLICY_VERSION_CHANGED'));
 assert.equal(await db.member.count({where:{email:data.email}}),0);
 await client.signup({...data,identityVerified:true,adultVerified:true,identityProof:'ignored-client-claim'});
 const member=await db.member.findUniqueOrThrow({where:{email:data.email}});members.push(member.id);
 assert.equal(member.email_verified,true);assert.equal(member.identity_hash,null);assert.equal(member.name,'');assert.equal(await db.identityProof.count(),proofs);
 assert.equal(await db.memberConsent.count({where:{member_id:member.id}}),2);assert.equal(await db.signupChallenge.count({where:{email:data.email}}),0);
 await assert.rejects(client.signup(data),code('EMAIL_VERIFICATION_REQUIRED'));
 const service=new PlatformService(db);assert.equal(await service.access({user_sub:randomUUID(),is_sensitive:true},member.id),false);
 await db.creator.create({data:{user_id:member.id}});await assert.rejects(new PlatformFinanceService(service,{},new ConfigService(),{}).setupPin(member.id,'123456'),code('IDENTITY_VERIFICATION_REQUIRED'));
});
test('invite restriction applies to both mail and signup; deferred identity cannot bypass unpublished policies',async()=>{
 const client=auth(),data=await input(client),restricted=auth({SIGNUP_EMAIL_ALLOWLIST:'invited@example.invalid'}),sent=messages.length;
 await assert.rejects(restricted.requestCode(data.email),code('SIGNUP_INVITE_REQUIRED'));assert.equal(messages.length,sent);
 await assert.rejects(restricted.signup(data),code('SIGNUP_INVITE_REQUIRED'));
 const blocked=auth({},Object.assign(new LegalDocumentsService(),{catalog:blockedCatalog}));await assert.rejects(blocked.requestCode(data.email),code('POLICY_NOT_PUBLISHED'));await assert.rejects(blocked.signup(data),code('POLICY_NOT_PUBLISHED'));assert.equal(await db.member.count({where:{email:data.email}}),0);
});
