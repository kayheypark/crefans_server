require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'r'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config'),{PlatformModule}=require('../dist/src/platform/module'),{PlatformService}=require('../dist/src/platform/service'),{PlatformAuthService}=require('../dist/src/platform/auth.service'),{LegalDocumentsService}=require('../dist/src/platform/legal-documents'),{publishedCatalog}=require('./legal-fixture.cjs'),{lockHandlePolicy}=require('../dist/src/platform/handles'),{cookieParser,originGuard}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials');
// Studio AI photo editor allow-list (2026-11-08): console grant/revoke with reasons, history and audit; permissions under `members`.
const {aiPhotoAllowed}=require('../dist/src/platform/ai-photo-grants');
const tag=crypto.randomBytes(3).toString('hex'),prefix='ap_'+tag+'_',members=[],admins=[],cookies={},ui='http://127.0.0.1:3003';let app,base,release,creatorA,creatorB,inactive;
async function api(path,body,user='super',method=body?'POST':'GET',withOrigin=true){const r=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(withOrigin?{Origin:path.startsWith('/admin')?ui:'http://127.0.0.1:3011'}:{}),...(cookies[user]?{Cookie:cookies[user]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
async function makeCreator(handle,active=true){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@ai-photo.test.invalid',name:'AI QA',nickname:'AI QA',preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});await db.creator.create({data:{user_id:id,handle,display_name:'AI 사진 QA '+handle.slice(-1),is_active:active}});return id;}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 creatorA=await makeCreator(prefix+'a');creatorB=await makeCreator(prefix+'b');inactive=await makeCreator(prefix+'x',false);
 for(const [key,role,permissions]of[['super','SUPER_ADMIN',undefined],['viewer','MODERATOR',{members:{view:true}}],['editor','MODERATOR',{members:{view:true,update:true}}],['none','MODERATOR',{}]]){const a=await db.admin.create({data:{user_sub:crypto.randomUUID(),email:crypto.randomUUID()+'@ai-photo.test.invalid',name:'AI 운영 QA '+key,role,...(permissions?{permissions}:{})}});admins.push(a);cookies[key]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use(originGuard(['http://127.0.0.1:3011'],[ui]));app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:crypto.randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{await app?.close();try{await db.aiPhotoGrant.deleteMany({where:{creator_user_id:{in:members}}});await db.aiPhotoGrantChange.deleteMany({where:{creator_user_id:{in:members}}});await db.platformAuditLog.deleteMany({where:{OR:[{actor_id:{in:admins.map(a=>a.user_sub)}},{entity_id:{in:members}}]}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.memberSession.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.admin.deleteMany({where:{id:{in:admins.map(a=>a.id)}}});}finally{await db.$disconnect();await release?.();}});

test('permissions: members.view lists, members.update grants and revokes; others, member sessions and missing Origin are refused',async()=>{
 for(const user of ['anonymous','none'])assert.equal((await api('/admin/ai-photo-grants',undefined,user)).status,user==='none'?403:401);
 assert.equal((await api('/admin/ai-photo-grants',undefined,'viewer')).status,200);
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'a',reason:'권한 없음 QA'},'viewer')).status,403);
 assert.equal((await api('/admin/ai-photo-grants/'+creatorA,{reason:'권한 없음 QA'},'viewer','DELETE')).status,403);
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'a',reason:'Origin 없음 QA'},'editor','POST',false)).status,403);
 assert.equal(await aiPhotoAllowed(db,creatorA),false);
});

test('grant: handle normalized, reason required, inactive/unknown refused, duplicate 409, list shows who and why',async()=>{
 for(const body of [{handle:prefix+'a',reason:''},{handle:prefix+'a',reason:'가'.repeat(501)},{handle:'',reason:'정상 사유'},{handle:'관리자!',reason:'정상 사유'}])assert.equal((await api('/admin/ai-photo-grants',body,'editor')).status,400,JSON.stringify(body));
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'x',reason:'비활성 QA'},'editor')).errorCode,'CREATOR_NOT_FOUND');
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'missing',reason:'없음 QA'},'editor')).errorCode,'CREATOR_NOT_FOUND');
 const ok=await api('/admin/ai-photo-grants',{handle:' @'+(prefix+'a').toUpperCase()+' ',reason:'코스프레 시범 운영'},'editor');assert.equal(ok.status,201,JSON.stringify(ok));assert.equal(ok.data.creatorId,creatorA);
 assert.equal((await api('/admin/ai-photo-grants',{handle:prefix+'a',reason:'중복 QA'},'editor')).errorCode,'ALREADY_GRANTED');
 assert.equal(await aiPhotoAllowed(db,creatorA),true);assert.equal(await aiPhotoAllowed(db,creatorB),false);
 const list=await api('/admin/ai-photo-grants?search='+prefix,undefined,'viewer');assert.equal(list.data.total,1);
 const row=list.data.items[0];assert.equal(row.handle,prefix+'a');assert.equal(row.reason,'코스프레 시범 운영');assert.equal(row.grantedByName,'AI 운영 QA editor');assert.ok(!('email'in row));
 assert.equal((await api('/admin/ai-photo-grants?search='+encodeURIComponent('코스프레 시범'),undefined,'viewer')).data.items.some(r=>r.creatorId===creatorA),true);
});

test('revoke: reason required, unknown 404, row removed, history and audit kept without reason text',async()=>{
 assert.equal((await api('/admin/ai-photo-grants/'+creatorA,{reason:''},'editor','DELETE')).status,400);
 assert.equal((await api('/admin/ai-photo-grants/'+creatorB,{reason:'없는 허용 QA'},'editor','DELETE')).errorCode,'GRANT_NOT_FOUND');
 const r=await api('/admin/ai-photo-grants/'+creatorA,{reason:'시범 종료'},'editor','DELETE');assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(await aiPhotoAllowed(db,creatorA),false);
 const history=await api('/admin/ai-photo-grants/'+creatorA+'/history',undefined,'viewer');
 assert.deepEqual(history.data.items.map(i=>[i.action,i.reason,i.changedByName]),[['revoked','시범 종료','AI 운영 QA editor'],['granted','코스프레 시범 운영','AI 운영 QA editor']]);
 const audits=await db.platformAuditLog.findMany({where:{entity_id:creatorA},orderBy:{occurred_at:'asc'}});
 assert.deepEqual(audits.map(a=>a.action),['admin.ai_photo_granted','admin.ai_photo_revoked']);
 const raw=JSON.stringify(audits);assert.ok(!raw.includes('시범 종료')&&!raw.includes('코스프레 시범'),'reason text must not be in the audit log');assert.match(raw,/"status":"revoked"/);
});
