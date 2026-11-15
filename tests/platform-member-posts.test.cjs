require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-15 user decision: members who are not creators may write posts. Their posts are public only, appear in the whole feed,
// search and their profile, and can never take tips or memberships. AI photos may be granted to them by handle.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'true',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local',AI_PHOTO_BYTEPLUS_API_KEY:'seedream-test-key',AI_PHOTO_OPENAI_API_KEY:'sk-test-'+'x'.repeat(20)});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module');
const {PlatformStudioService}=require('../dist/src/platform/studio.service'),{PlatformService}=require('../dist/src/platform/service'),{BeansService}=require('../dist/src/platform/beans.service'),{AiPhotoService}=require('../dist/src/platform/ai-photo'),{grantAiPhoto}=require('../dist/src/platform/ai-photo-grants');
const tag=crypto.randomBytes(3).toString('hex'),members=[];let app,studio,service,beans,photos,writer,creator,fan;
const code=wanted=>e=>e.getResponse?.().code===wanted;
async function makeMember(handle,isCreator=false){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@member-posts.test.invalid',name:'글쓰기 QA',nickname:'글쓰기 QA '+handle,preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});if(isCreator)await db.creator.create({data:{user_id:id,handle,display_name:'크리에이터 QA'}});return id;}
const draft=extra=>({title:'회원 글 '+tag,body:'일반 회원이 쓴 글',status:'published',commentsEnabled:true,media:[],...extra});
before(async()=>{
 const release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);globalThis.__release=release;
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 writer=await makeMember('mpwriter_'+tag);creator=await makeMember('mpcreator_'+tag,true);fan=await makeMember('mpfan_'+tag);
 app=await NestFactory.create(PlatformModule,{logger:false});await app.init();studio=app.get(PlatformStudioService);service=app.get(PlatformService);beans=app.get(BeansService);photos=app.get(AiPhotoService);
});
after(async()=>{await app?.close();try{await db.aiPhotoGrantChange.deleteMany({where:{creator_user_id:{in:members}}});await db.aiPhotoGrant.deleteMany({where:{creator_user_id:{in:members}}});const posts=await db.posting.findMany({where:{user_sub:{in:members}},select:{id:true}});await db.postingMedia.deleteMany({where:{posting_id:{in:posts.map(p=>p.id)}}});await db.posting.deleteMany({where:{id:{in:posts.map(p=>p.id)}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});}finally{await db.$disconnect();await globalThis.__release?.();}});

test('a member who is not a creator can publish a public post that never takes tips',async()=>{
 const saved=await studio.saveContent(writer,draft());const row=await db.posting.findFirst({where:{user_sub:writer,title:'회원 글 '+tag}});
 assert.ok(saved&&row);assert.equal(row.status,'PUBLISHED');assert.equal(row.allow_tips,false,'tips are off even when the request omits tipsEnabled');assert.equal(row.is_membership,false);assert.equal(row.access_plan_id,null);
 await assert.rejects(studio.saveContent(writer,draft({accessLevel:1})),code('MEMBER_POST_PUBLIC_ONLY'));
 await assert.rejects(studio.saveContent(writer,draft({accessPlanId:'any-plan'})),code('MEMBER_POST_PUBLIC_ONLY'));
 await assert.rejects(studio.saveContent(writer,draft({tipsEnabled:true})),code('MEMBER_POST_NO_TIPS'));
 // A creator keeps the old behaviour: tips default on.
 await studio.saveContent(creator,draft({title:'크리에이터 글 '+tag}));assert.equal((await db.posting.findFirst({where:{user_sub:creator,title:'크리에이터 글 '+tag}})).allow_tips,true);
});

test('member posts are readable, in the whole feed, search and the member profile, but not in a category feed',async()=>{
 const row=await db.posting.findFirst({where:{user_sub:writer,title:'회원 글 '+tag},include:{medias:{include:{media:true}}}});
 assert.equal(await service.access(row,fan),true);assert.equal(await service.access(row,undefined),true);
 const dto=await service.post(row,fan,false);assert.equal(dto.tipsEnabled,false);assert.equal(dto.requiredRank,0);assert.equal(dto.commentsEnabled,true);assert.equal(dto.canAccess,true);
 const feed=await service.postPage(fan);assert.ok(feed.posts.some(p=>p.id===row.id),'whole feed carries the member post');assert.ok(feed.creators.some(c=>c.id===writer&&c.isCreator===false),'author profile comes with it');
 const profile=await service.postPage(fan,'mpwriter_'+tag);assert.deepEqual(profile.posts.map(p=>p.id),[row.id]);
 const category=await db.creatorCategory.findFirst();if(category){const filtered=await service.postPage(fan,undefined,undefined,category.name);assert.ok(!filtered.posts.some(p=>p.id===row.id),'a category feed lists creators only');}
 const found=await service.postSearch(fan,'회원 글 '+tag);assert.ok(found.posts.some(p=>p.id===row.id));
});

test('a disabled member post leaves the feed and becomes unreadable',async()=>{
 const other=await makeMember('mpgone_'+tag);await studio.saveContent(other,draft({title:'정지 회원 글 '+tag}));const row=await db.posting.findFirst({where:{user_sub:other}});
 await db.member.update({where:{id:other},data:{enabled:false}});
 assert.equal(await service.access(row,fan),false);assert.ok(!(await service.postPage(fan)).posts.some(p=>p.id===row.id));
});

test('tips go only to active creators',async()=>{
 await assert.rejects(beans.tip(fan,writer,{quantity:100,requestId:crypto.randomUUID()}),code('TIP_CREATOR_REQUIRED'));
 await db.creator.update({where:{user_id:creator},data:{is_active:false}});
 try{await assert.rejects(beans.tip(fan,creator,{quantity:100,requestId:crypto.randomUUID()}),code('TIP_CREATOR_REQUIRED'));}finally{await db.creator.update({where:{user_id:creator},data:{is_active:true}});}
});

test('AI photo can be granted to a member by handle and the member then passes the allow-list',async()=>{
 assert.equal((await photos.quota(writer)).allowed,false);
 const admin={id:crypto.randomUUID(),role:'SUPER_ADMIN',is_active:true};
 const granted=await grantAiPhoto(db,admin,{handle:'mpwriter_'+tag,reason:'회원 글쓰기 QA'});assert.equal(granted.creatorId,writer);
 assert.equal((await photos.quota(writer)).allowed,true);
 await assert.rejects(grantAiPhoto(db,admin,{handle:'nobody_'+tag,reason:'없음'}),code('CREATOR_NOT_FOUND'));
});
