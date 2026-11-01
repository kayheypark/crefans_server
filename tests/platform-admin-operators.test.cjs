require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();Object.assign(process.env,{LOCAL_AUTH_SECRET:'p'.repeat(64),DATA_ENCRYPTION_KEY:'d'.repeat(64)});
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials');
const {PlatformAdminController,PlatformAdminGuard}=require('../dist/src/platform/admin.controller'),{BeansAdminController}=require('../dist/src/platform/beans.controller'),{ADMIN_PERMISSION,normalizePermissions}=require('../dist/src/platform/admin-permissions');
const db=new PrismaClient(),members=[],cookies={};let app,origin,release,superAdmin;
const SUFFIX='@operators-test.invalid';
async function call(path,cookie,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1/'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,cookie:(res.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; '),...await res.json()};}
const admin=(path,user='super',body,method)=>call('admin/'+path,cookies[user]??user,body,method);
async function login(email,password){const r=await call('admin/auth/login',null,{email,password});assert.equal(r.status,201,r.errorMessage);assert.match(r.cookie,/admin_access_token=aa\./);return r.cookie;}
const adminCookie=require('./admin-session.cjs');
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-operators-schema-'));
 try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 await db.admin.deleteMany({where:{email:{endsWith:SUFFIX}}});await db.member.deleteMany({where:{email:{endsWith:SUFFIX}}});
 for(const [key,role]of[['super','SUPER_ADMIN'],['legacyAdmin','ADMIN']]){const id=randomUUID();members.push(id);await db.member.create({data:{id,email:key+SUFFIX,name:key,nickname:key,preferred_username:id,email_verified:true,status:'CONFIRMED'}});const row=await db.admin.create({data:{user_sub:id,email:key+SUFFIX,name:key,role}});if(key==='super')superAdmin=row;cookies[key]=await adminCookie(db,row.id);const token='la.'+randomBytes(32).toString('base64url');cookies[key+'Member']='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{await app?.close();const ops=await db.admin.findMany({where:{email:{endsWith:SUFFIX}}});await db.memberSession.deleteMany({where:{member_id:{in:ops.map(o=>o.user_sub)}}});await db.admin.deleteMany({where:{email:{endsWith:SUFFIX}}});await db.member.deleteMany({where:{email:{endsWith:SUFFIX}}});await db.$disconnect();await release?.();});

test('every admin route declares a permission; a route without one is denied by the guard',async()=>{
 for(const C of[PlatformAdminController,BeansAdminController])for(const name of Object.getOwnPropertyNames(C.prototype)){if(name==='constructor')continue;assert.ok(Reflect.getMetadata(ADMIN_PERMISSION,C.prototype[name]),C.name+'.'+name+' has no permission rule');}
 // Negative control: the real guard rejects a handler that lacks a rule.
 const guard=app.get(PlatformAdminGuard),bare=function(){},ctx={switchToHttp:()=>({getRequest:()=>({cookies:{admin_access_token:cookies.super.split('=')[1]}})}),getHandler:()=>bare,getClass:()=>class{}};
 await assert.rejects(guard.canActivate(ctx),e=>e.getStatus?.()===403);
});
test('permission input is validated: unknown menu/action, non-boolean and action without view are rejected',()=>{
 for(const bad of[null,[],{operators:{view:true}},{members:{delete:true,view:true}},{members:{view:'yes'}},{revenue:{create:true}},{logs:{update:true,view:true}}])assert.throws(()=>normalizePermissions(bad),e=>e.getStatus?.()===400,JSON.stringify(bad));
 assert.deepEqual(normalizePermissions({members:{view:true,update:false},logs:{}}),{members:{view:true}});
});
test('only super administrators manage operators; temporary password forces a change before any menu',async()=>{
 assert.equal((await admin('operators','legacyAdmin')).status,403);
 assert.equal((await admin('operators','super',{name:'부운영자',email:'dup'+SUFFIX,phone:'010-0000-0000',permissions:{members:{view:true}}})).status,201);
 assert.equal((await admin('operators','super',{name:'중복',email:'DUP'+SUFFIX,permissions:{}})).errorCode,'EMAIL_IN_USE');
 const created=await admin('operators','super',{name:'검수 담당',email:'sub'+SUFFIX,phone:'010-1234-5678',permissions:{members:{view:true},content:{view:true,update:true}}});
 assert.equal(created.status,201);const temp=created.data.temporaryPassword;assert.ok(temp.length>=16);assert.equal(created.data.operator.mustChangePassword,true);
 const row=await db.admin.findUnique({where:{email:'sub'+SUFFIX}});assert.notEqual(row.password_hash,temp);assert.match(row.password_hash,/^scrypt-v1\$/);assert.equal(await db.member.count({where:{email:'sub'+SUFFIX}}),0,'no fan/creator member account is created');
 const events=await db.platformAuditLog.findMany({where:{entity_id:created.data.operator.id}});assert.deepEqual(events.map(e=>e.action),['admin.operator.created']);assert.equal(JSON.stringify(events).includes(temp),false);
 cookies.sub=await login('sub'+SUFFIX,temp);
 const me=await admin('me','sub');assert.equal(me.data.mustChangePassword,true);assert.deepEqual(me.data.permissions,{members:{view:true},content:{view:true,update:true}});
 assert.equal((await admin('members','sub')).errorCode,'PASSWORD_CHANGE_REQUIRED');
 assert.equal((await admin('me/password','sub',{currentPassword:'wrong-password',newPassword:'new-strong-pass-1'})).errorCode,'PASSWORD_MISMATCH');
 assert.equal((await admin('me/password','sub',{currentPassword:temp,newPassword:'short'})).errorCode,'WEAK_PASSWORD');
 assert.equal((await admin('me/password','sub',{currentPassword:temp,newPassword:'new-strong-pass-1'})).status,201);
 assert.equal((await admin('members','sub')).status,200);
 for(const path of['revenue','payments','logs','financial-policy','operators','beans/overview'])assert.equal((await admin(path,'sub')).status,403,path);
 assert.equal((await admin('creators/'+randomUUID()+'/verification','sub',{isVerified:true},'PUT')).status,403,'view only cannot update');
 assert.equal((await admin('operators','sub',{name:'x',email:'x'+SUFFIX,permissions:{}})).status,403,'no self escalation');
});
test('permission changes apply on the next request; protected targets cannot be edited',async()=>{
 const op=await db.admin.findFirst({where:{email:'sub'+SUFFIX}});
 assert.equal((await admin('operators/'+op.id,'super',{permissions:{members:{view:true},revenue:{view:true},settings:{view:true,update:true}}},'PUT')).status,200);
 assert.equal((await admin('revenue','sub')).status,200);assert.equal((await admin('financial-policy','sub')).status,200);
 assert.equal((await admin('financial-policy','sub',{expectedVersion:0,platformFeeBps:1,settlementHoldDays:0,reason:'x'},'PUT')).errorCode,'CONFIRMATION_REQUIRED');
 assert.equal((await admin('operators/'+superAdmin.id,'super',{permissions:{}},'PUT')).errorCode,'OPERATOR_PROTECTED');
 assert.equal((await admin('me/profile','sub',{name:'검수 담당자',phone:'010-9999-0000'},'PUT')).data.phone,'010-9999-0000');assert.equal((await db.admin.findUnique({where:{email:'sub'+SUFFIX}})).phone,'010-9999-0000');
});
test('password reset and deactivation end existing sessions and keep audit history',async()=>{
 const op=await db.admin.findFirst({where:{email:'sub'+SUFFIX}});
 const reset=await admin('operators/'+op.id+'/password-reset','super',{});assert.equal(reset.status,201);assert.equal((await admin('me','sub')).status,401,'old session ends');
 cookies.sub=await login('sub'+SUFFIX,reset.data.temporaryPassword);assert.equal((await admin('members','sub')).errorCode,'PASSWORD_CHANGE_REQUIRED');
 assert.equal((await admin('operators/'+op.id,'super',undefined,'DELETE')).data.isActive,false);
 assert.equal((await admin('me','sub')).status,401);assert.equal((await db.admin.findUnique({where:{id:op.id}})).is_active,false);assert.equal(await db.adminSession.count({where:{admin_id:op.id}}),0);assert.equal((await call('admin/auth/login',null,{email:'sub'+SUFFIX,password:'new-strong-pass-1'})).status,401,'inactive operator cannot sign in');
 const list=await admin('operators');assert.equal(list.data.find(o=>o.id===op.id).isActive,false);assert.equal(JSON.stringify(list).includes('password_hash'),false);
});
test('legacy roles without stored permissions keep previous access',async()=>{
 assert.equal((await admin('revenue','legacyAdmin')).status,200);assert.equal((await admin('financial-policy','legacyAdmin')).status,403);assert.equal((await admin('me','legacyAdmin')).data.permissions.settings,undefined);
});
test('console accounts are separate from fan/creator members: member sessions and member passwords never open the console',async()=>{
 // A member session (even of a person who is also an operator) is not a console session.
 assert.equal((await admin('me','superMember')).status,401);assert.equal((await admin('members','superMember')).status,401);
 const {hashPassword}=require('../dist/src/auth/local/credentials'),id=randomUUID();members.push(id);
 await db.member.create({data:{id,email:'both'+SUFFIX,name:'both',nickname:'both',preferred_username:id,password_hash:await hashPassword('member-password-1'),email_verified:true,status:'CONFIRMED'}});
 const created=await admin('operators','super',{name:'겸업 운영자',email:'both'+SUFFIX,permissions:{members:{view:true}}});assert.equal(created.status,201);
 assert.equal((await call('admin/auth/login',null,{email:'both'+SUFFIX,password:'member-password-1'})).errorCode,'ADMIN_LOGIN_FAILED','member password does not open the console');
 const cookie=await login('both'+SUFFIX,created.data.temporaryPassword);assert.equal((await call('admin/me',cookie)).status,200);
 assert.equal((await db.member.findUnique({where:{id}})).password_hash.startsWith('scrypt-v1$'),true);assert.equal((await call('auth/login',null,{email:'both'+SUFFIX,password:created.data.temporaryPassword})).status,401,'operator password does not open the fan account');
 const refreshed=await call('admin/auth/refresh',cookie.split('; ').find(c=>c.startsWith('admin_refresh_token')),{});assert.equal(refreshed.status,201);assert.match(refreshed.cookie,/admin_access_token=aa\./);
 assert.equal((await call('admin/auth/refresh',cookie.split('; ').find(c=>c.startsWith('admin_refresh_token')),{})).status,401,'rotated refresh token is single use');
 await call('admin/auth/logout',refreshed.cookie,{});assert.equal((await call('admin/me',refreshed.cookie)).status,401);
});

