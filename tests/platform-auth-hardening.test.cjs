// Regression tests for security review 2026-10-29: AUTH-02 (sign-in vs password change race), AUTH-03 (console origin),
// AUTH-04 (one password contract) and AUTH-05 (operator session absolute/idle limits).
require('reflect-metadata');require('dotenv').config({path:'.local/platform.env'});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL,url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();let release;
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const r=require('child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
const {hashPassword,assertNewPassword,matchesPassword,digest}=require('../dist/src/auth/local/credentials');
const {LocalMemberService}=require('../dist/src/auth/local/local-member.service');
const {AdminAuthController,adminFromAccess}=require('../dist/src/platform/admin-auth');
const {PlatformService}=require('../dist/src/platform/service');
const {originGuard}=require('../dist/src/platform/middleware');
const db=new PrismaClient(),members=[],admins=[];
const local=new LocalMemberService(db,new ConfigService({AUTH_PROVIDER:'local',LOCAL_AUTH_SECRET:'h'.repeat(64)}),{sendCode:async()=>{}});
async function member(password){const id=randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@example.invalid',name:'보안 검증',nickname:'검증',preferred_username:id,email_verified:true,status:'CONFIRMED',password_hash:await hashPassword(password)}});return db.member.findUniqueOrThrow({where:{id}});}
after(async()=>{await db.memberChallenge.deleteMany({where:{member_id:{in:members}}});await db.memberSession.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.adminSession.deleteMany({where:{admin_id:{in:admins}}});await db.admin.deleteMany({where:{id:{in:admins}}});await db.$disconnect();await release?.();});

test('AUTH-02: a sign-in verified against a password that was changed before its session commits is refused',async()=>{
 const m=await member('Old-password-1');
 await local.createSession(m,m.password_hash);assert.equal(await db.memberSession.count({where:{member_id:m.id}}),1,'control: unchanged password still signs in');
 // The interleaving from the review: old password verified, then the change and revocation commit, then the session insert.
 await db.$transaction([db.member.update({where:{id:m.id},data:{password_hash:await hashPassword('New-password-1')}}),db.memberSession.deleteMany({where:{member_id:m.id}})]);
 await assert.rejects(local.createSession(m,m.password_hash),{status:401});
 assert.equal(await db.memberSession.count({where:{member_id:m.id}}),0);
 const fresh=await db.member.findUniqueOrThrow({where:{id:m.id}});await local.createSession(fresh,fresh.password_hash);assert.equal(await db.memberSession.count({where:{member_id:m.id}}),1);
});

test('AUTH-04: every place that sets a password applies the same contract, sign-in accepts what was stored before',async()=>{
 assert.equal(assertNewPassword('a'.repeat(128)),'a'.repeat(128));
 for(const bad of ['short1',' leading-space1','trailing-space1 ','a'.repeat(129),undefined,12345678])assert.throws(()=>assertNewPassword(bad),/비밀번호/);
 assert.throws(()=>assertNewPassword('nine-char1',11),/11~128/);
 const legacy=await hashPassword('legacy-trimmed-1');
 assert.equal(await matchesPassword('legacy-trimmed-1',legacy),true);assert.equal(await matchesPassword('  legacy-trimmed-1 ',legacy),true,'old signups stored the trimmed value');
 assert.equal(await matchesPassword('legacy-trimmed-2',legacy),false);assert.equal(await matchesPassword('   ',legacy),false);
 const long=await hashPassword('x'.repeat(200));assert.equal(await matchesPassword('x'.repeat(200),long),true,'passwords set by the old 256-character reset still sign in');
 // A rejected new password must not consume the reset code.
 const m=await member('Reset-me-123');await db.memberChallenge.create({data:{member_id:m.id,purpose:'reset',digest:'0'.repeat(64),attempts:0,expires_at:new Date(Date.now()+600000),sent_at:new Date()}});
 await assert.rejects(local.resetPassword(m.email,'123456',' padded-password1'),/공백/);
 assert.equal((await db.memberChallenge.findUniqueOrThrow({where:{member_id_purpose:{member_id:m.id,purpose:'reset'}}})).attempts,0);
});

test('AUTH-03: console routes need the console origin, fan routes refuse it, and any session cookie needs an Origin',()=>{
 const guard=originGuard(['https://beta.crefans.com'],['https://admin.crefans.com']);
 const run=(path,origin,cookies={},method='POST')=>{let result='next';guard({path,method,cookies,get:()=>origin},{status:code=>({json:body=>{result=code+':'+body.errorCode;}})},()=>{});return result;};
 assert.equal(run('/api/v1/admin/auth/login','https://admin.crefans.com'),'next');
 assert.equal(run('/api/v1/admin/operators','https://beta.crefans.com',{admin_access_token:'x'}),'403:INVALID_ORIGIN');
 assert.equal(run('/api/v1/admin/operators',undefined,{admin_access_token:'x'}),'403:ORIGIN_REQUIRED');
 assert.equal(run('/api/v1/admin/auth/login',undefined),'403:ORIGIN_REQUIRED');
 assert.equal(run('/api/v1/me/email/request','https://admin.crefans.com',{access_token:'x'}),'403:INVALID_ORIGIN');
 assert.equal(run('/api/v1/me/email/request','https://beta.crefans.com',{access_token:'x'}),'next');
 assert.equal(run('/api/v1/me/email/request',undefined,{refresh_token:'x'}),'403:ORIGIN_REQUIRED');
 assert.equal(run('/api/v1/admin/operators',undefined,{},'GET'),'next','reads are not origin-checked');
 // Without ADMIN_ORIGINS the previous shared list keeps working (deploy order safety).
 const shared=originGuard(['https://beta.crefans.com','https://admin.crefans.com'],[]);let r='next';shared({path:'/api/v1/admin/x',method:'POST',cookies:{},get:()=>'https://admin.crefans.com'},{status:c=>({json:()=>{r=String(c);}})},()=>{});assert.equal(r,'next');
});

test('AUTH-05: operator sessions end 12 hours after sign-in or after 1 hour idle; refresh never extends the limit',async()=>{
 const id=randomUUID(),email=id+'@example.invalid';admins.push(id);
 await db.admin.create({data:{id,user_sub:'admin-'+id,name:'세션 검증',email,role:'ADMIN',password_hash:await hashPassword('Operator-pass-1')}});
 const jar={},res={cookie:(name,value,options)=>{jar[name]={value,options};},clearCookie:name=>{delete jar[name];}};
 const controller=new AdminAuthController(new PlatformService(db),{limit:async()=>{}},new ConfigService({}));
 const started=Date.now();await controller.login({email,password:'Operator-pass-1'},res);
 let session=await db.adminSession.findUniqueOrThrow({where:{access_hash:digest(jar.admin_access_token.value)}});
 assert.ok(Math.abs(+session.expires_at-(started+12*3600000))<5000);assert.ok(Math.abs(+session.access_until-(started+3600000))<5000);
 assert.ok(jar.admin_refresh_token.options.maxAge<=12*3600000);
 // Refresh rotates tokens and keeps the original absolute expiry.
 await controller.refresh({cookies:{admin_refresh_token:jar.admin_refresh_token.value}},res);
 const rotated=await db.adminSession.findUniqueOrThrow({where:{access_hash:digest(jar.admin_access_token.value)}});assert.equal(+rotated.expires_at,+session.expires_at);
 // Activity slides the idle window, never past the absolute limit.
 await db.adminSession.update({where:{id:rotated.id},data:{access_until:new Date(Date.now()+60000)}});
 assert.ok(await adminFromAccess(db,jar.admin_access_token.value));session=await db.adminSession.findUniqueOrThrow({where:{id:rotated.id}});assert.ok(+session.access_until>Date.now()+3500000);
 await db.adminSession.update({where:{id:rotated.id},data:{expires_at:new Date(Date.now()+120000),access_until:new Date(Date.now()+60000)}});
 await adminFromAccess(db,jar.admin_access_token.value);assert.ok(+(await db.adminSession.findUniqueOrThrow({where:{id:rotated.id}})).access_until<=Date.now()+120000);
 // Idle past the window: neither the access token nor refresh works.
 await db.adminSession.update({where:{id:rotated.id},data:{access_until:new Date(Date.now()-1000),expires_at:new Date(Date.now()+3600000)}});
 assert.equal(await adminFromAccess(db,jar.admin_access_token.value),null);
 await assert.rejects(controller.refresh({cookies:{admin_refresh_token:jar.admin_refresh_token.value}},res),{status:401});
 // Password changed between verification and session insert (AUTH-02 for operators) is refused.
 let changed=false;const racingDb=new Proxy(db,{get:(target,key)=>key==='$transaction'?async fn=>{if(!changed){changed=true;await target.admin.update({where:{id},data:{password_hash:await hashPassword('Operator-pass-2')}});}return target.$transaction(fn);}:target[key]});
 const before=await db.adminSession.count({where:{admin_id:id}});
 await assert.rejects(new AdminAuthController({db:racingDb},{limit:async()=>{}},new ConfigService({})).login({email,password:'Operator-pass-1'},res),{status:401});
 assert.equal(changed,true);assert.equal(await db.adminSession.count({where:{admin_id:id}}),before);
});
