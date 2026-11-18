// 2026-11-18 user decision (별도 권한 + 사유 + 감사): console member phone reveal is SUPER_ADMIN only, POST with a reason, audited without the number.
require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();Object.assign(process.env,{LOCAL_AUTH_SECRET:'p'.repeat(64),DATA_ENCRYPTION_KEY:'d'.repeat(64)});
const {NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{PaymentProvider}=require('../dist/src/platform/payment-provider');
const adminCookie=require('./admin-session.cjs');
const db=new PrismaClient(),SUFFIX='@phone-reveal-test.invalid',cookies={},ids={};let app,origin,release;
const PHONE='01012345678',REASON='회원 본인 요청 고객센터 회신';
async function call(path,cookie,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1/'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,cacheControl:res.headers.get('cache-control'),...await res.json().catch(()=>({}))};}
const reveal=(who,memberId,body)=>call('admin/members/'+memberId+'/phone',cookies[who],body,'POST');
const audits=memberId=>db.platformAuditLog.findMany({where:{action:'admin.member_phone_revealed',entity_id:memberId}});
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-phone-reveal-schema-'));
 try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [key,role,permissions] of[['super','SUPER_ADMIN'],['limited','SUPER_ADMIN'],['legacyAdmin','ADMIN'],['sub','MODERATOR',{members:{view:true,update:true}}]]){const id=randomUUID();await db.member.create({data:{id,email:key+SUFFIX,name:key,nickname:key,preferred_username:id,email_verified:true,status:'CONFIRMED'}});const row=await db.admin.create({data:{user_sub:id,email:key+SUFFIX,name:key,role,...(permissions?{permissions}:{})}});ids[key]=row.id;cookies[key]=await adminCookie(db,row.id);}
 for(const key of['kept','notKept']){const id=randomUUID();ids[key]=id;await db.member.create({data:{id,email:key+SUFFIX,name:key,nickname:key,preferred_username:id,email_verified:true,status:'CONFIRMED'}});}
 const provider=new PaymentProvider(new ConfigService({DATA_ENCRYPTION_KEY:'d'.repeat(64)}));
 await db.memberPhone.create({data:{member_id:ids.kept,phone_hash:createHash('sha256').update('reveal-test:'+ids.kept).digest('hex'),phone_encrypted:provider.encrypt(PHONE),last_four:'5678'}});
 await db.memberPhone.create({data:{member_id:ids.notKept,phone_hash:createHash('sha256').update('reveal-test:'+ids.notKept).digest('hex'),last_four:'0000'}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{await app?.close();try{const members=(await db.member.findMany({where:{email:{endsWith:SUFFIX}},select:{id:true}})).map(m=>m.id);await db.platformAuditLog.deleteMany({where:{action:'admin.member_phone_revealed',entity_id:{in:members}}});await db.memberPhone.deleteMany({where:{member_id:{in:members}}});const ops=await db.admin.findMany({where:{email:{endsWith:SUFFIX}}});await db.adminSession.deleteMany({where:{admin_id:{in:ops.map(o=>o.id)}}});await db.admin.deleteMany({where:{email:{endsWith:SUFFIX}}});await db.member.deleteMany({where:{id:{in:members}}});}finally{await db.$disconnect();await release?.();}});

test('operators other than SUPER_ADMIN get 403 even with members view/update, and nothing is audited',async()=>{
 for(const who of['legacyAdmin','sub']){const r=await reveal(who,ids.kept,{reason:REASON});assert.equal(r.status,403,who);assert.equal(r.errorCode,'SUPER_ADMIN_REQUIRED');assert.equal(r.data,null);assert.ok(!JSON.stringify(r).includes('5678'),who+' sees no part of the number');}
 assert.equal((await call('admin/members/'+ids.kept+'/phone',null,{reason:REASON})).status,401,'no operator session');
 assert.equal((await audits(ids.kept)).length,0);
});
test('a missing, blank, short or overlong reason is 400 before any lookup, and a reason in the query string does not count',async()=>{
 for(const body of[{},{reason:''},{reason:'    '},{reason:'짧음'},{reason:'  a b  '},{reason:'가'.repeat(201)},{reason:12345}]){const r=await reveal('super',ids.kept,body);assert.equal(r.status,400,JSON.stringify(body));assert.equal(r.errorCode,'REVEAL_REASON_REQUIRED');assert.equal(r.data,null);}
 assert.equal((await call('admin/members/'+ids.kept+'/phone?reason='+encodeURIComponent(REASON),cookies.super,{},'POST')).status,400);
 assert.equal((await audits(ids.kept)).length,0);
});
test('SUPER_ADMIN with a reason sees the full number, uncached; the audit row has who/whose/reason hash but neither the number nor the reason',async()=>{
 const r=await reveal('super',ids.kept,{reason:'  '+REASON+'  '});
 assert.equal(r.status,200,r.errorMessage);assert.equal(r.data.phone,'010-1234-5678');assert.match(r.cacheControl||'',/no-store/);
 const rows=await audits(ids.kept);assert.equal(rows.length,1);const row=rows[0],raw=JSON.stringify(row);
 assert.equal(row.category,'admin');assert.equal(row.entity_id,ids.kept);assert.equal(row.metadata.changedBy,ids.super);
 assert.equal(row.metadata.after.contentHash,createHash('sha256').update(JSON.stringify(REASON)).digest('hex'),'trimmed reason hash');
 for(const secret of[PHONE,'1234-5678','12345678',REASON])assert.ok(!raw.includes(secret),'audit row must not contain '+secret);
 // Exactly 200 characters is accepted.
 assert.equal((await reveal('super',ids.kept,{reason:'가'.repeat(200)})).status,200);
});
test('the old GET route is gone and a number kept only as a hash stays 404 PHONE_NOT_KEPT',async()=>{
 const old=await call('admin/members/'+ids.kept+'/phone',cookies.super);assert.ok([404,405].includes(old.status),'GET must not reveal: '+old.status);assert.ok(!JSON.stringify(old).includes('5678'));
 const r=await reveal('super',ids.notKept,{reason:REASON});assert.equal(r.status,404);assert.equal(r.errorCode,'PHONE_NOT_KEPT');
 assert.equal((await audits(ids.notKept)).length,0);
});
test('reveals are limited to 20 per hour per operator (429), counted per operator',async()=>{
 // Avoid a flaky run across the hourly bucket boundary.
 const left=3600000-Date.now()%3600000;if(left<15000)await new Promise(r=>setTimeout(r,left+500));
 for(let i=0;i<20;i++)assert.equal((await reveal('limited',ids.kept,{reason:REASON})).status,200,'call '+(i+1));
 const blocked=await reveal('limited',ids.kept,{reason:REASON});assert.equal(blocked.status,429);assert.equal(blocked.data,null);
 assert.equal((await reveal('super',ids.kept,{reason:REASON})).status,200,'another operator is not blocked');
});
