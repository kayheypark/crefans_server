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
 await db.creator.create({data:{user_id:member.id}});await assert.rejects(new PlatformFinanceService(service,{},new ConfigService(),{}).setupPin(member.id,'246813'),code('IDENTITY_VERIFICATION_REQUIRED'));
});
test('invite restriction applies to both mail and signup; deferred identity cannot bypass unpublished policies',async()=>{
 const client=auth(),data=await input(client),restricted=auth({SIGNUP_EMAIL_ALLOWLIST:'invited@example.invalid'}),sent=messages.length;
 await assert.rejects(restricted.requestCode(data.email),code('SIGNUP_INVITE_REQUIRED'));assert.equal(messages.length,sent);
 await assert.rejects(restricted.signup(data),code('SIGNUP_INVITE_REQUIRED'));
 const blocked=auth({},Object.assign(new LegalDocumentsService(),{catalog:blockedCatalog}));await assert.rejects(blocked.requestCode(data.email),code('POLICY_NOT_PUBLISHED'));await assert.rejects(blocked.signup(data),code('POLICY_NOT_PUBLISHED'));assert.equal(await db.member.count({where:{email:data.email}}),0);
});

test('SIGNUP_OPEN opens signup during the beta; an explicit allowlist still restricts it (2026-11-15)',async()=>{
 assert.equal(signupPolicy(new ConfigService({BETA_MODE:'true'})).inviteOnly,true);
 assert.equal(signupPolicy(new ConfigService({BETA_MODE:'true',SIGNUP_OPEN:'true'})).inviteOnly,false);
 assert.equal(signupPolicy(new ConfigService({BETA_MODE:'true',SIGNUP_OPEN:'true',SIGNUP_EMAIL_ALLOWLIST:'a@example.invalid'})).inviteOnly,true);
 const closed=auth({BETA_MODE:'true'}),open=auth({BETA_MODE:'true',SIGNUP_OPEN:'true'});
 const email=`open-${randomUUID()}@example.invalid`;emails.push(email);
 await assert.rejects(closed.requestCode(email),code('SIGNUP_INVITE_REQUIRED'));
 await open.requestCode(email);const {proof}=await open.verifyCode({email,code:messages.filter(m=>m.email===email).pop().code});
 await open.signup({email,emailProof:proof,password:'Open-test-123!',nickname:'가입 개방',terms:true,privacy:true,marketing:false,ageAcknowledged:true,policyVersions:legal.signup().versions});
 const member=await db.member.findUniqueOrThrow({where:{email}});members.push(member.id);
});

// 2026-11-15 user decision (open signup, night-work): verification mail is limited per connecting IP (5 an hour, 20 a day) and
// service-wide per day (SIGNUP_MAIL_DAILY_TOTAL), and a failed send gives the 3-minute cooldown back.
test('signup verification mail: 5 per IP an hour, service-wide daily ceiling with an operations alert, cooldown returned on send failure',async()=>{
 const {requestContext}=require('../dist/src/platform/request-context');const {SIGNUP_IP_HOURLY}=require('../dist/src/platform/auth.service');
 const tag=randomUUID().slice(0,8),buckets=new Map();
 const limiter={limit:async(key,max)=>{const n=(buckets.get(key)||0)+1;buckets.set(key,n);if(n>max){const e=new Error('busy');e.getStatus=()=>429;throw e;}}};
 const make=(settings={},sendCode=async(email,value)=>messages.push({email,code:value}))=>new PlatformAuthService(db,limiter,{sendCode},new ConfigService({LOCAL_AUTH_SECRET:'test-only-'.repeat(8),SIGNUP_IDENTITY_MODE:'email-only',SIGNUP_OPEN:'true',...settings}),legal);
 const fresh=()=>{const email=`rate-${tag}-${randomUUID()}@example.invalid`;emails.push(email);return email;};
 const from=(ip,fn)=>requestContext.run({ip,peerIp:ip,requestId:randomUUID()},fn);
 const client=make({SIGNUP_MAIL_DAILY_TOTAL:'1000'});
 assert.equal(SIGNUP_IP_HOURLY,5);
 for(let i=0;i<5;i++)await from('198.51.100.'+(tag.charCodeAt(0)%200+1),()=>client.requestCode(fresh()));
 await assert.rejects(from('198.51.100.'+(tag.charCodeAt(0)%200+1),()=>client.requestCode(fresh())),code('SIGNUP_RATE_LIMITED'),'6th request from the same IP within an hour');
 await from('203.0.113.'+(tag.charCodeAt(1)%200+1),()=>client.requestCode(fresh()));
 // service-wide ceiling: a fresh limiter with a ceiling of 2
 buckets.clear();const capped=make({SIGNUP_MAIL_DAILY_TOTAL:'2'});
 await capped.requestCode(fresh());await capped.requestCode(fresh());
 await assert.rejects(capped.requestCode(fresh()),code('SIGNUP_MAIL_BUSY'));
 const day=new Date().toISOString().slice(0,10);
 assert.ok(await db.platformOperationalEvent.findFirst({where:{type:'auth.signup_mail_closed',dedupe_key:'signup-mail-closed:'+day}}),'operators are alerted once a day');
 await db.platformOperationalEvent.deleteMany({where:{type:'auth.signup_mail_closed',dedupe_key:'signup-mail-closed:'+day}});
 // a failed send does not leave the visitor waiting 3 minutes
 buckets.clear();let fail=true;const flaky=make({},async(email,value)=>{if(fail)throw new Error('smtp down');messages.push({email,code:value});});
 const email=fresh();await assert.rejects(flaky.requestCode(email),code('MAIL_UNAVAILABLE'));
 fail=false;await flaky.requestCode(email);assert.ok(messages.some(m=>m.email===email),'retry right after a failed send is accepted');
});
