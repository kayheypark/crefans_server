require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'r'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local'});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config'),{PlatformModule}=require('../dist/src/platform/module'),{PlatformService}=require('../dist/src/platform/service'),{PlatformAuthService}=require('../dist/src/platform/auth.service'),{LegalDocumentsService}=require('../dist/src/platform/legal-documents'),{publishedCatalog}=require('./legal-fixture.cjs'),{lockHandlePolicy}=require('../dist/src/platform/handles'),{cookieParser,originGuard}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials');
const tag=crypto.randomBytes(3).toString('hex'),prefix='rh_'+tag+'_',members=[],admins=[],cookies={},reservationIds=[],ui='http://127.0.0.1:3003';let app,base,release,owner,fan,service;
async function api(path,body,user='super',method=body?'POST':'GET',withOrigin=true){const r=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(withOrigin?{Origin:path.startsWith('/admin')?ui:'http://127.0.0.1:3011'}:{}),...(cookies[user]?{Cookie:cookies[user]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json()};}
async function makeMember(handle){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@reserved.test.invalid',name:'예약 QA',nickname:'예약 QA',preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});return id;}
async function add(handle,status='reserved'){const r=await api('/admin/reserved-handles',{handle,status,reason:'격리 QA 등록'});assert.equal(r.status,201,JSON.stringify(r));reservationIds.push(r.data.item.id);return r.data.item;}
const save=(handle)=>service.profile(fan,{name:'팬 QA',bio:'',handle});
const code=wanted=>e=>e.getResponse?.().code===wanted;
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 owner=await makeMember(prefix+'owner');fan=await makeMember(prefix+'fan');await db.creator.create({data:{user_id:owner,handle:prefix+'owner',display_name:'예약 QA'}});
 for(const [key,role,permissions]of[['super','SUPER_ADMIN',undefined],['readonly','MODERATOR',{'reserved-handles':{view:true}}],['create','MODERATOR',{'reserved-handles':{view:true,create:true}}],['none','MODERATOR',{}]]){const a=await db.admin.create({data:{user_sub:crypto.randomUUID(),email:crypto.randomUUID()+'@reserved.test.invalid',name:'예약 운영 QA',role,...(permissions?{permissions}:{})}});admins.push(a);cookies[key]=await require('./admin-session.cjs')(db,a.id);}
 const token='la.'+crypto.randomBytes(32).toString('base64url');cookies.fan='access_token='+token;await db.memberSession.create({data:{member_id:fan,access_hash:digest(token),refresh_hash:digest(crypto.randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use(originGuard(['http://127.0.0.1:3011'],[ui]));app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:crypto.randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');base=await app.getUrl();service=app.get(PlatformService);
});
after(async()=>{await app?.close();try{const rows=await db.reservedHandle.findMany({where:{OR:[{id:{in:reservationIds}},{created_by:{in:admins.map(a=>a.id)}}]}});await db.reservedHandleChange.deleteMany({where:{reservation_id:{in:rows.map(r=>r.id)}}});await db.reservedHandle.deleteMany({where:{id:{in:rows.map(r=>r.id)}}});await db.platformAuditLog.deleteMany({where:{OR:[{actor_id:{in:admins.map(a=>a.user_sub)}},{entity_id:{in:[...rows.map(r=>r.id),...members]}}]}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.retiredHandle.deleteMany({where:{OR:[{member_id:{in:members}},{handle:{startsWith:prefix}}]}});await db.userProfile.deleteMany({where:{user_id:{in:members}}});await db.accountPreference.deleteMany({where:{member_id:{in:members}}});await db.memberConsent.deleteMany({where:{member_id:{in:members}}});await db.memberSession.deleteMany({where:{member_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});await db.admin.deleteMany({where:{id:{in:admins.map(a=>a.id)}}});}finally{await db.$disconnect();await release?.();}});

test('initial approved names and valid no-underscore variants are reserved, without wildcards',async()=>{
 for(const handle of ['crefans','crefans_admin','crefansadmin','crefans_no_reply','crefansnoreply','admin','crefan5'])assert.equal((await db.reservedHandle.findUniqueOrThrow({where:{handle}})).status,'reserved');
 assert.equal((await service.handleAvailability(fan,'crefans_admin')).available,false);assert.equal((await service.handleAvailability(fan,'crefans_qa_'+tag)).available,true);
});
test('every route enforces independent menu permissions, member sessions and Origin are refused',async()=>{
 for(const user of ['anonymous','fan','none'])assert.equal((await api('/admin/reserved-handles',undefined,user)).status,user==='none'?403:401);
 const item=await add(prefix+'permission');
 for(const [path,body,method]of[['/admin/reserved-handles',{handle:prefix+'denied',status:'reserved',reason:'QA'},'POST'],['/admin/reserved-handles/'+item.id,{...item,expectedVersion:0},'PUT'],['/admin/reserved-handles/'+item.id,{expectedVersion:0,confirmation:item.handle,reason:'QA'},'DELETE']])assert.equal((await api(path,body,'readonly',method)).status,403);
 assert.equal((await api('/admin/reserved-handles/'+item.id+'/history',undefined,'none')).status,403);
 assert.equal((await api('/admin/reserved-handles',undefined,'readonly')).status,200);
 assert.equal((await api('/admin/reserved-handles',{handle:prefix+'origin',status:'reserved',reason:'QA'},'super','POST',false)).status,403);
});
test('validation, normalization, duplicate conflict, paging and filtered usage are correct',async()=>{
 for(const handle of ['ab','a'.repeat(25),'a-b','a.b','관리자','abc%'])assert.equal((await api('/admin/reserved-handles',{handle,status:'reserved',reason:'QA'})).status,400);
 assert.equal((await api('/admin/reserved-handles',{handle:prefix+'invalid',status:'blocked',reason:'QA'})).status,400);
 assert.equal((await api('/admin/reserved-handles',{handle:prefix+'invalid',status:'reserved',reason:''})).status,400);
 const item=await add(' '+(prefix+'upper').toUpperCase()+' ');assert.equal(item.handle,prefix+'upper');assert.equal((await api('/admin/reserved-handles',{handle:item.handle,status:'candidate',reason:'dup'})).errorCode,'RESERVED_HANDLE_EXISTS');
 const own=await add(prefix+'owner'),list=await api('/admin/reserved-handles?search='+prefix+'owner&status=reserved');assert.equal(list.data.total,1);assert.equal(list.data.items[0].usage,'in_use');assert.ok(!('email'in list.data.items[0]));
 const retired=prefix+'retired';await db.retiredHandle.create({data:{handle:retired,member_id:null}});await add(retired);assert.equal((await api('/admin/reserved-handles?search='+retired)).data.items[0].usage,'retired');
 assert.equal((await api('/admin/reserved-handles?page=0')).status,400);assert.equal((await api('/admin/reserved-handles?status=invalid')).status,400);
 const second=await api('/admin/reserved-handles?page=2');assert.equal(second.data.page,2);assert.equal(second.data.items.length,20);
});
test('reservation blocks availability and direct profile saves atomically; owner may retain current name',async()=>{
 const handle=prefix+'blocked';await add(handle);const prior=await db.member.findUniqueOrThrow({where:{id:fan}});
 assert.equal((await api('/me/handle-availability?handle='+handle,undefined,'fan')).data.available,false);
 assert.equal((await api('/me/profile',{name:'must not change',bio:'no',handle},'fan','PUT')).errorCode,'HANDLE_TAKEN');
 assert.equal((await db.member.findUniqueOrThrow({where:{id:fan}})).nickname,prior.nickname);
 assert.equal((await service.handleAvailability(owner,prefix+'owner')).available,true);await service.profile(owner,{handle:prefix+'owner',name:'기존 공식 계정',bio:''});assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:owner}})).handle,prefix+'owner');
});
test('candidate, reservation release, stale version and soft deletion preserve immutable history',async()=>{
 const item=await add(prefix+'candidate','candidate');assert.equal((await service.handleAvailability(fan,item.handle)).available,true);
 let updated=await api('/admin/reserved-handles/'+item.id,{handle:item.handle,status:'reserved',reason:'예약 이유',expectedVersion:0},'super','PUT');assert.equal(updated.status,200);assert.equal((await service.handleAvailability(fan,item.handle)).available,false);
 assert.equal((await api('/admin/reserved-handles/'+item.id,{handle:item.handle,status:'candidate',reason:'stale',expectedVersion:0},'super','PUT')).errorCode,'RESERVED_HANDLE_CHANGED');
 updated=await api('/admin/reserved-handles/'+item.id,{handle:item.handle,status:'candidate',reason:'해제 이유',expectedVersion:1},'super','PUT');assert.equal(updated.status,200);assert.equal((await service.handleAvailability(fan,item.handle)).available,true);
 assert.equal((await api('/admin/reserved-handles/'+item.id,{reason:'삭제',expectedVersion:2,confirmation:'wrong'},'super','DELETE')).errorCode,'HANDLE_CONFIRMATION_REQUIRED');
 assert.equal((await api('/admin/reserved-handles/'+item.id,{reason:'삭제',expectedVersion:2,confirmation:item.handle},'super','DELETE')).status,200);
 assert.equal((await api('/admin/reserved-handles?search='+item.handle)).data.total,0);assert.equal((await api('/admin/reserved-handles?status=deleted&search='+item.handle)).data.total,1);
 const history=(await api('/admin/reserved-handles/'+item.id+'/history')).data;assert.deepEqual(history.items.map(r=>r.status),['deleted','candidate','reserved','candidate']);assert.equal(history.items[1].reason,'해제 이유');assert.equal(history.items[0].changedBy,admins[0].id);
 assert.equal(await db.platformAuditLog.count({where:{entity_id:item.id,action:'admin.reserved_handle_changed'}}),4);
 assert.equal((await api('/admin/reserved-handles/'+item.id,{handle:item.handle,status:'reserved',reason:'복구',expectedVersion:3},'super','PUT')).status,200);
});
test('renaming a reservation releases only its old reservation and never retired-handle protection',async()=>{
 let item=await add(prefix+'old');const next=prefix+'new';assert.equal((await api('/admin/reserved-handles/'+item.id,{handle:next,status:'reserved',reason:'오타 수정',expectedVersion:0},'super','PUT')).status,200);assert.equal((await service.handleAvailability(fan,item.handle)).available,true);assert.equal((await service.handleAvailability(fan,next)).available,false);
 const retired=prefix+'retired',row=await db.reservedHandle.findUniqueOrThrow({where:{handle:retired}});await api('/admin/reserved-handles/'+row.id,{handle:retired,status:'candidate',reason:'예약만 해제',expectedVersion:0},'super','PUT');assert.equal((await service.handleAvailability(fan,retired)).available,false);
});
test('a profile save waiting behind reservation activation reads committed protection, not an earlier snapshot',async()=>{
 const item=await add(prefix+'race','candidate');let unlock,locked;const gate=new Promise(r=>unlock=r),ready=new Promise(r=>locked=r);
 const tx=db.$transaction(async tx=>{await lockHandlePolicy(tx);await tx.reservedHandle.update({where:{id:item.id},data:{status:'reserved'}});locked();await gate;});
 await ready;const pending=save(item.handle);await new Promise(r=>setTimeout(r,80));unlock();await tx;await assert.rejects(pending,code('HANDLE_TAKEN'));assert.notEqual((await db.member.findUniqueOrThrow({where:{id:fan}})).preferred_username,item.handle);
});
test('signup generated handles skip reserved names and still consume real isolated email proof',async()=>{
 const blocked=crypto.randomBytes(7).toString('hex'),free=crypto.randomBytes(7).toString('hex');await add(blocked);
 const legal=new LegalDocumentsService();legal.catalog=publishedCatalog;const proof=crypto.randomBytes(24).toString('hex'),email=crypto.randomUUID()+'@reserved.test.invalid';
 await db.signupChallenge.create({data:{email,code_hash:'unused',proof_hash:digest(proof),verified_at:new Date(),sent_at:new Date(),expires_at:new Date(Date.now()+600000)}});
 const auth=new PlatformAuthService(db,{}, {},new ConfigService({SIGNUP_IDENTITY_MODE:'email-only',BEAN_LEDGER_ENABLED:'false'}),legal),original=crypto.randomBytes;let n=0;
 crypto.randomBytes=size=>size===7?Buffer.from(n++===0?blocked:free,'hex'):original(size);
 try{await auth.signup({email,emailProof:proof,password:'Reserved-QA-123!',nickname:'예약 가입 QA',terms:true,privacy:true,marketing:false,ageAcknowledged:true,policyVersions:legal.signup().versions});}finally{crypto.randomBytes=original;}
 const member=await db.member.findUniqueOrThrow({where:{email}});members.push(member.id);assert.equal(member.preferred_username,free);assert.equal(await db.signupChallenge.count({where:{email}}),0);
});
