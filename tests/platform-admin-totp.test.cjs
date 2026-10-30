require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Operator TOTP (2026-10-30): RFC 6238 codes, 7-day grace for unenrolled operators, enrollment with one-time recovery codes,
// replayed codes refused. Safety standard art. 6(2) (second factor for outside access) is in force from 2026-10-31.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
process.env.DATA_ENCRYPTION_KEY=process.env.DATA_ENCRYPTION_KEY||'c'.repeat(64);
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{hashPassword}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const {totpCode,verifyTotp,base32}=require('../dist/src/platform/admin-totp-core');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),password='Totp!'+tag+'-'+randomBytes(8).toString('hex'),email=`totp-${tag}@totp.test.invalid`;let app,origin,release,adminId;
async function call(path,body,cookie,method=body!==undefined?'POST':'GET'){const res=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://admin.crefans.com',...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const set=res.headers.getSetCookie?.()||[];return{status:res.status,cookie:set.map(c=>c.split(';')[0]).filter(c=>c.startsWith('admin_access_token=')).join('; '),...await res.json()};}
const login=(extra={})=>call('/admin/auth/login',{email,password,...extra});
const now30=()=>Math.floor(Date.now()/30000);
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-totp-schema-'));try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 adminId=(await db.admin.create({data:{user_sub:randomUUID(),name:'totp',email,role:'ADMIN',password_hash:await hashPassword(password),permissions:{members:{view:true}}}})).id;
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();await db.platformAuditLog.deleteMany({where:{entity_id:adminId}});await db.adminSession.deleteMany({where:{admin_id:adminId}});await db.authRateBucket.deleteMany({where:{id:{contains:adminId}}}).catch(()=>{});await db.admin.deleteMany({where:{id:adminId}});await db.$disconnect();await release?.();});

test('codes follow RFC 6238 (SHA1 test vector) and a used window is never accepted again',()=>{
 const secret=base32(Buffer.from('12345678901234567890'));assert.equal(secret,'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 assert.equal(totpCode(secret,1),'287082','RFC 6238 T=59s → 94287082 (last 6 digits)');
 const step=now30(),code=totpCode(secret,step);assert.equal(verifyTotp(secret,code,null),step);assert.equal(verifyTotp(secret,code,step),null,'replay of the same window');assert.equal(verifyTotp(secret,'000000x',null),null);
});
test('an unenrolled operator gets 7 days from first sign-in, then only the enrollment routes',async()=>{
 const first=await login();assert.equal(first.status,201,first.errorMessage);
 const row=await db.admin.findUniqueOrThrow({where:{id:adminId}});assert.ok(Math.abs(row.totp_grace_until-Date.now()-7*86400000)<60000);
 assert.equal((await call('/admin/members',undefined,first.cookie)).status,200,'inside the grace period the console works');
 await db.admin.update({where:{id:adminId},data:{totp_grace_until:new Date(Date.now()-1000)}});
 const blocked=await call('/admin/members',undefined,first.cookie);assert.equal(blocked.status,403);assert.equal(blocked.errorCode,'TOTP_ENROLLMENT_REQUIRED');
 const me=await call('/admin/me',undefined,first.cookie);assert.equal(me.status,200);assert.equal(me.data.totp.enabled,false);
});
test('enrollment needs a correct code; then sign-in needs a code, refuses replay, and each recovery code works once',async()=>{
 const s=await login();const setup=await call('/admin/me/totp/setup',{},s.cookie);assert.equal(setup.status,201,setup.errorMessage);assert.match(setup.data.otpauthUri,/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+&issuer=crefans/);
 assert.equal((await call('/admin/me/totp/enable',{code:'123456'},s.cookie)).status,401);
 const enabled=await call('/admin/me/totp/enable',{code:totpCode(setup.data.secret,now30())},s.cookie);assert.equal(enabled.status,201,enabled.errorMessage);assert.equal(enabled.data.recoveryCodes.length,8);
 const row=await db.admin.findUniqueOrThrow({where:{id:adminId}});assert.notEqual(row.totp_secret_encrypted,setup.data.secret,'the secret is stored encrypted');assert.equal(row.totp_grace_until,null);
 assert.equal((await call('/admin/members',undefined,s.cookie)).status,200,'enrolled operators use the console');
 const missing=await login();assert.equal(missing.status,401);assert.equal(missing.errorCode,'TOTP_REQUIRED');
 // Next window, so the code used for enabling is not a replay.
 const next=totpCode(setup.data.secret,now30()+1),ok=await login({code:next});assert.equal(ok.status,201,ok.errorMessage);assert.ok(ok.cookie);
 const replay=await login({code:next});assert.equal(replay.status,401);assert.equal(replay.errorCode,'TOTP_INVALID');
 const recovery=enabled.data.recoveryCodes[0];assert.equal((await login({recoveryCode:recovery})).status,201);assert.notEqual((await login({recoveryCode:recovery})).status,201,'one-time (401, or 429 once the 5-per-5-minutes limit is reached)');
 assert.equal((await call('/admin/me',undefined,s.cookie)).data.totp.recoveryCodesLeft,7);
});
