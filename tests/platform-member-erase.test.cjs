require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Console member erase (2026-10-30): SUPER_ADMIN only, reason + typed email required, the self-withdrawal checks still apply,
// and personal data is purged at once (no 30-day wait) so the same email can be invited or sign up again.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),ids={target:randomUUID(),seller:randomUUID(),gone:randomUUID()},emails={},admins={},cookies={};let app,origin,release,postId;
async function call(path,actor,body){const res=await fetch(origin+'/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://admin.crefans.com',cookie:cookies[actor]},body:JSON.stringify(body)});return{status:res.status,...await res.json()};}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-erase-schema-'));try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [name,id] of Object.entries(ids)){emails[name]=`${name}-${tag}@erase.test.invalid`;await db.member.create({data:{id,email:emails[name],password_hash:'x',nickname:name+tag,name,preferred_username:name+tag,email_verified:true,status:'CONFIRMED',...(name==='gone'?{enabled:false,withdrawn_at:new Date()}:{})}});}
 await db.memberSession.create({data:{member_id:ids.target,access_hash:digest(randomUUID()),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});
 postId=(await db.posting.create({data:{user_sub:ids.target,title:'삭제 검증 '+tag,content:'본문',status:'PUBLISHED',is_public:true,published_at:new Date()}})).id;
 await db.creator.create({data:{user_id:ids.seller,display_name:'판매 중 '+tag,handle:'er'+ids.seller.slice(0,8)}});await db.membershipItem.create({data:{creator_id:ids.seller,name:'판매 중 상품',price:3000,billing_unit:'MONTH',benefits:'혜택'}});
 for(const [name,role,permissions] of [['owner','SUPER_ADMIN',{}],['staff','ADMIN',{members:{view:true,update:true}}]]){const a=await db.admin.create({data:{user_sub:randomUUID(),name,email:`${name}-${tag}@erase.test.invalid`,role,permissions}});admins[name]=a.id;cookies[name]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();const all=Object.values(ids);await db.moderationAction.deleteMany({where:{target_id:{in:all}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:all}}});await db.membershipItem.deleteMany({where:{creator_id:{in:all}}});await db.posting.deleteMany({where:{user_sub:{in:all}}});await db.creator.deleteMany({where:{user_id:{in:all}}});await db.memberSession.deleteMany({where:{member_id:{in:all}}});await db.adminSession.deleteMany({where:{admin_id:{in:Object.values(admins)}}});await db.admin.deleteMany({where:{id:{in:Object.values(admins)}}});await db.member.deleteMany({where:{id:{in:all}}});await db.$disconnect();await release?.();});

test('only the top administrator can erase, and only with a reason and the member email typed back',async()=>{
 const staff=await call(`/admin/members/${ids.target}/erase`,'staff',{reason:'요청',confirmEmail:emails.target});assert.equal(staff.status,403);assert.equal(staff.errorCode,'SUPER_ADMIN_REQUIRED');
 assert.equal((await call(`/admin/members/${ids.target}/erase`,'owner',{confirmEmail:emails.target})).status,400,'reason required');
 const wrong=await call(`/admin/members/${ids.target}/erase`,'owner',{reason:'요청',confirmEmail:'other@erase.test.invalid'});assert.equal(wrong.status,400);assert.equal(wrong.errorCode,'CONFIRMATION_MISMATCH');
 const row=await db.member.findUniqueOrThrow({where:{id:ids.target}});assert.equal(row.email,emails.target);assert.equal(row.purged_at,null);
});
test('the self-withdrawal checks still apply: a creator with a membership on sale is refused and left untouched',async()=>{
 const r=await call(`/admin/members/${ids.seller}/erase`,'owner',{reason:'요청',confirmEmail:emails.seller});assert.equal(r.status,409);assert.equal(r.errorCode,'MEMBERSHIP_ON_SALE');
 const row=await db.member.findUniqueOrThrow({where:{id:ids.seller}});assert.equal(row.enabled,true);assert.equal(row.email,emails.seller);
 assert.equal(await db.moderationAction.count({where:{target_id:ids.seller}}),0,'nothing recorded when refused');
});
test('erase purges at once: email freed, sessions and posts gone, reason kept; a second erase is refused',async()=>{
 const r=await call(`/admin/members/${ids.target}/erase`,'owner',{reason:'본인 요청으로 삭제',confirmEmail:emails.target.toUpperCase()});assert.equal(r.status,201,r.errorMessage);
 const row=await db.member.findUniqueOrThrow({where:{id:ids.target}});assert.equal(row.enabled,false);assert.ok(row.withdrawn_at);assert.ok(row.purged_at);assert.equal(row.email,`withdrawn-${ids.target}@deleted.invalid`);assert.equal(row.nickname,'탈퇴한 사용자');assert.equal(row.password_hash,null);
 assert.equal(await db.member.findFirst({where:{email:emails.target}}),null,'the invite check (signup-invites MEMBER_EXISTS) no longer finds the email');
 assert.equal(await db.memberSession.count({where:{member_id:ids.target}}),0);assert.equal((await db.posting.findUniqueOrThrow({where:{id:postId}})).is_deleted,true);
 const action=await db.moderationAction.findFirstOrThrow({where:{target_id:ids.target}});assert.equal(action.action,'member.erased');assert.equal(action.reason,'본인 요청으로 삭제');assert.equal(action.admin_id,admins.owner);
 assert.deepEqual((await db.platformAuditLog.findMany({where:{entity_id:ids.target},select:{action:true}})).map(a=>a.action).sort(),['admin.member_erased','member.purged']);
 const again=await call(`/admin/members/${ids.target}/erase`,'owner',{reason:'다시',confirmEmail:row.email});assert.equal(again.status,409);assert.equal(again.errorCode,'MEMBER_ALREADY_PURGED');
});
test('a member who already withdrew is purged without waiting for the 30 days',async()=>{
 assert.equal((await call(`/admin/members/${ids.gone}/erase`,'owner',{reason:'재가입 요청',confirmEmail:emails.gone})).status,201);
 const row=await db.member.findUniqueOrThrow({where:{id:ids.gone}});assert.ok(row.purged_at);assert.equal(await db.member.findFirst({where:{email:emails.gone}}),null);
});
