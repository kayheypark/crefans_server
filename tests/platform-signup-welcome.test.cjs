require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
// 2026-11-18: signup auto-login (same login path and cookies) and the once-per-member informational welcome mail.
// Isolated dev DB only; mail is a stub (no SMTP). The notice worker is scoped to this file's members so other queued rows stay untouched.
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {LegalDocumentsService}=require('../dist/src/platform/legal-documents');
const {publishedCatalog}=require('./legal-fixture.cjs');
const {PlatformAuthService}=require('../dist/src/platform/auth.service');
const {PlatformAuthController}=require('../dist/src/platform/auth.controller');
const {LocalMemberService}=require('../dist/src/auth/local/local-member.service');
const {MemberNoticesService,enqueueWelcome,welcomeKey}=require('../dist/src/platform/member-notices');
const db=new PrismaClient(),emails=[],members=[],codes=[],sent=[];
const legal=new LegalDocumentsService();legal.catalog=publishedCatalog;
const code=wanted=>error=>error.getResponse?.().code===wanted;
const settings=extra=>new ConfigService({AUTH_PROVIDER:'local',LOCAL_AUTH_SECRET:'welcome-test-'.repeat(6),SIGNUP_IDENTITY_MODE:'email-only',WELCOME_MAIL_ENABLED:'true',SMTP_HOST:'localhost',PUBLIC_API_ORIGIN:'https://crefans.com',...extra});
// Every mail method throws unless a test swaps it, so signup provably never waits on mail delivery.
const mail={sendCode:async(email,value)=>codes.push({email,code:value}),sendNotice:async()=>{throw Error('unexpected notice');},sendWelcome:async()=>{throw Error('Synthetic SMTP failure');}};
function setup(extra={}){const config=settings(extra),local=new LocalMemberService(db,config,mail),auth=new PlatformAuthService(db,local,mail,config,legal);return{config,local,auth,controller:new PlatformAuthController(auth,local,config)};}
const response=()=>{const res={cookies:{},cookie(name,value,options){res.cookies[name]={value,options};}};return res;};
async function input(auth){const email=`welcome-${randomUUID()}@example.invalid`;emails.push(email);await auth.requestCode(email);const {proof}=await auth.verifyCode({email,code:codes.find(m=>m.email===email).code});return{email,emailProof:proof,password:'Welcome-test-123!',nickname:'<b>환영</b>',terms:true,privacy:true,marketing:false,ageAcknowledged:true,policyVersions:legal.signup().versions};}
const memberOf=async email=>{const m=await db.member.findUniqueOrThrow({where:{email}});if(!members.includes(m.id))members.push(m.id);return m;};
// Worker limited to this file's members (shared dev DB has other queued notices that must not be touched).
function worker(config){const scope=args=>({...args,where:{AND:[args.where,{member_id:{in:[...members]}}]}});const notices=db.memberNotice;
 const scoped=new Proxy(db,{get:(target,key)=>key==='memberNotice'?{findMany:args=>notices.findMany(scope(args)),updateMany:args=>notices.updateMany(args),update:args=>notices.update(args)}:target[key]});
 return new MemberNoticesService(scoped,mail,config);}
after(async()=>{await db.memberNotice.deleteMany({where:{member_id:{in:members}}});await db.memberSession.deleteMany({where:{member_id:{in:members}}});await db.memberConsent.deleteMany({where:{member_id:{in:members}}});await db.accountPreference.deleteMany({where:{member_id:{in:members}}});await db.platformOperationalEvent?.deleteMany({where:{dedupe_key:{in:members.map(id=>`member.signup:${id}`)}}}).catch(()=>undefined);await db.member.deleteMany({where:{id:{in:members}}});await db.signupChallenge.deleteMany({where:{email:{in:emails}}});await db.$disconnect();});

test('signup signs the member in with the login cookies and a valid session; failed and duplicate signups set nothing',async()=>{
 const {auth,local,controller}=setup(),data=await input(auth);
 const bad=response();await assert.rejects(controller.signup({...data,emailProof:'forged'},bad),code('EMAIL_VERIFICATION_REQUIRED'));
 assert.deepEqual(bad.cookies,{});assert.equal(await db.member.count({where:{email:data.email}}),0);
 const res=response(),result=await controller.signup(data,res);
 assert.deepEqual(result,{message:'회원가입이 완료되었습니다.',autoLogin:true});
 const member=await memberOf(data.email);
 for(const name of ['access_token','refresh_token']){assert.equal(res.cookies[name].options.httpOnly,true);assert.equal(res.cookies[name].options.path,'/');assert.ok(['lax','strict'].includes(String(res.cookies[name].options.sameSite).toLowerCase()));}
 assert.equal((await local.validateToken(res.cookies.access_token.value)).sub,member.id);
 assert.equal(await db.memberSession.count({where:{member_id:member.id}}),1);
 const again=response();await assert.rejects(controller.signup(data,again));
 assert.deepEqual(again.cookies,{});assert.equal(await db.memberSession.count({where:{member_id:member.id}}),1);
 assert.equal(await db.memberNotice.count({where:{member_id:member.id,kind:'welcome'}}),1);
});
test('a sign-in failure after signup keeps the account and reports autoLogin=false without cookies',async()=>{
 const {auth,controller}=setup(),data=await input(auth);auth.login=async()=>{throw Error('Synthetic sign-in failure');};
 const res=response(),result=await controller.signup(data,res);
 assert.equal(result.autoLogin,false);assert.deepEqual(res.cookies,{});const member=await memberOf(data.email);
 assert.equal(await db.memberSession.count({where:{member_id:member.id}}),0);
});
test('welcome mail is queued exactly once per member, even when enqueued again, and not at all while disabled',async()=>{
 const {auth}=setup(),data=await input(auth);await auth.signup(data);const member=await memberOf(data.email);
 await db.$transaction(tx=>enqueueWelcome(tx,member.id));await db.$transaction(tx=>enqueueWelcome(tx,member.id));
 const rows=await db.memberNotice.findMany({where:{member_id:member.id}});assert.equal(rows.length,1);assert.equal(rows[0].dedupe_key,welcomeKey(member.id));assert.equal(rows[0].kind,'welcome');assert.deepEqual(rows[0].rows,[]);
 const off=setup({WELCOME_MAIL_ENABLED:'false'}),other=await input(off.auth);await off.auth.signup(other);const quiet=await memberOf(other.email);
 assert.equal(await db.memberNotice.count({where:{member_id:quiet.id}}),0);
});
test('delivery sends once, a mail failure never fails signup and retries are bounded; existing members get nothing',async()=>{
 const {auth,config}=setup(),data=await input(auth);await auth.signup(data);const member=await memberOf(data.email);
 const existing=await db.member.create({data:{id:randomUUID(),email:`existing-${randomUUID()}@example.invalid`,password_hash:'x',name:'',nickname:'기존',preferred_username:'w'+randomUUID().replace(/-/g,'').slice(0,12),email_verified:true,status:'CONFIRMED'}});members.push(existing.id);
 const jobs=worker(config);
 // Signup above succeeded while sendWelcome throws; the first delivery fails and schedules a retry.
 await assert.rejects(jobs.deliver(),/Member notice delivery failed/);
 let row=await db.memberNotice.findUniqueOrThrow({where:{dedupe_key:welcomeKey(member.id)}});assert.equal(row.outcome,'failed');assert.equal(row.attempts,1);assert.equal(row.completed_at,null);assert.ok(row.retry_at>new Date());
 mail.sendWelcome=async(...args)=>{sent.push(args);};
 await db.memberNotice.update({where:{id:row.id},data:{retry_at:new Date(0)}});
 assert.equal(await jobs.deliver(),1);assert.equal(await jobs.deliver(),0);assert.equal(sent.length,1);
 const [to,payload,url,id]=sent[0];assert.equal(to,data.email);assert.equal(payload.nickname,'<b>환영</b>');assert.match(payload.joinedAt,/^\d{4}년 \d{1,2}월 \d{1,2}일$/);assert.equal(url,'https://crefans.com/service/landing-ai-image-generation');assert.equal(id,row.id);
 row=await db.memberNotice.findUniqueOrThrow({where:{id:row.id}});assert.equal(row.outcome,'accepted');assert.ok(row.completed_at);
 assert.equal(await db.memberNotice.count({where:{member_id:existing.id}}),0);assert.ok(sent.every(([to])=>to!==existing.email));
 // Bounded retry: 5 attempts used, or 72 hours past signup, closes the row without sending.
 for(const [label,patch] of [['attempts',{attempts:5}],['age',{created_at:new Date(Date.now()-73*3600000)}]]){
  const extra=await input(auth);await auth.signup(extra);const m=await memberOf(extra.email);
  await db.memberNotice.update({where:{dedupe_key:welcomeKey(m.id)},data:patch});const before=sent.length;await jobs.deliver();
  const closed=await db.memberNotice.findUniqueOrThrow({where:{dedupe_key:welcomeKey(m.id)}});assert.equal(closed.outcome,'expired',label);assert.equal(sent.length,before,label);
 }
 // Turning the switch off after rows were queued closes them as 'disabled' instead of sending.
 const late=await input(auth);await auth.signup(late);const lm=await memberOf(late.email);const before=sent.length;
 await worker(settings({WELCOME_MAIL_ENABLED:'false'})).deliver();
 assert.equal((await db.memberNotice.findUniqueOrThrow({where:{dedupe_key:welcomeKey(lm.id)}})).outcome,'disabled');assert.equal(sent.length,before);
});
