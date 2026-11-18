require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-18 user decision: photos made with game/anime costumes (catalog category other than 'general') cannot be used commercially.
// Posts with them take no post tips and stay fully public. Providers are stubs (no network); isolated crefans_platform_e2e DB.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const mediaRoot=fs.mkdtempSync(path.join(os.tmpdir(),'franchise-'));
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'true',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local',MEDIA_ROOT:mediaRoot,AI_PHOTO_BYTEPLUS_API_KEY:'seedream-test-key',AI_PHOTO_OPENAI_API_KEY:'sk-test-'+'x'.repeat(20),AI_PHOTO_DAILY_TOTAL:'100000'});
const sharp=require('sharp'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config'),{PlatformModule}=require('../dist/src/platform/module');
const {AiPhotoService}=require('../dist/src/platform/ai-photo'),{PlatformStudioService}=require('../dist/src/platform/studio.service'),{PlatformService}=require('../dist/src/platform/service'),{BeansService}=require('../dist/src/platform/beans.service');
const {AI_PHOTO_COSTUME_IDS,costumeCategory,franchiseCostumeMeta}=require('../dist/src/platform/ai-photo-costume-references'),{franchiseBackfill,franchiseNonPublicPosts}=require('../dist/src/platform/franchise-costume'),{PaymentProvider}=require('../dist/src/platform/payment-provider');
const tag=crypto.randomBytes(3).toString('hex'),members=[],logIds=[];let app,photos,studio,service,beans,release,creator,fan,plan,logsBefore;
const code=wanted=>e=>e.getResponse?.().code===wanted;
const status=(wanted,c,message)=>e=>e.getStatus?.()===wanted&&e.getResponse?.().code===c&&(!message||e.getResponse?.().message===message);
const png=(w,h,color={r:200,g:120,b:160})=>sharp({create:{width:w,height:h,channels:3,background:color}}).png().toBuffer();
async function member(handle,isCreator=false){const id=crypto.randomUUID();members.push(id);await db.member.create({data:{id,email:id+'@franchise.test.invalid',name:'의상 QA',nickname:'의상 QA',preferred_username:handle,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});if(isCreator)await db.creator.create({data:{user_id:id,handle,display_name:'의상 QA'}});return id;}
async function media(owner,metadata){const id=crypto.randomUUID();fs.writeFileSync(path.join(mediaRoot,id),await sharp(await png(600,900)).webp().toBuffer());await db.media.create({data:{id,user_sub:owner,type:'IMAGE',original_name:'s.webp',file_name:id,file_size:1,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:`local/${id}`,processing_status:'COMPLETED',processed_at:new Date(),...(metadata?{metadata}:{})}});return id;}
async function stub(url,init){
 if(url.endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:false}]}),{status:200});
 if(url.endsWith('/images/generations'))return new Response(JSON.stringify({data:[{b64_json:(await png(1024,1536)).toString('base64')}]}),{status:200});
 throw new Error('unexpected '+url);
}
async function mask(){const img=sharp({create:{width:600,height:900,channels:4,background:{r:255,g:255,b:255,alpha:1}}});return{buffer:await img.composite([{input:await sharp({create:{width:200,height:300,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer(),left:200,top:300,blend:'dest-out'}]).png().toBuffer(),mimetype:'image/png',size:1000};}
const edit=async(sourceId,costumeIds)=>(await photos.edit(creator,{sourceId,kind:'outfit',style:'cosplay',costumeIds,prompt:'의상 참조 사진 1의 코디를 적용해줘.',consent:'true'},await mask())).images[0];
const post=extra=>({title:'의상 글 '+tag,body:'본문',status:'published',commentsEnabled:true,tipsEnabled:true,media:[],...extra});
const tip=(postId,requestId=crypto.randomUUID())=>beans.tip(fan,creator,{quantity:10,requestId,creatorProvision:'2026-10-30.1',...(postId?{postId}:{})});
const meta=async id=>(await db.media.findUniqueOrThrow({where:{id}})).metadata||{};
const postRow=title=>db.posting.findFirstOrThrow({where:{user_sub:creator,title},include:{medias:{include:{media:true}}}});
let flagged,general;
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 logsBefore=new Set((await db.aiPhotoFailureDetail.findMany({select:{request_id:true}})).map(r=>r.request_id));
 creator=await member('fccreator_'+tag,true);fan=await member('fcfan_'+tag);
 plan=(await db.membershipItem.create({data:{creator_id:creator,name:'의상 QA 멤버십',level:1,price:1000,benefits:'["혜택"]',billing_unit:'MONTH',billing_period:1}})).id;
 app=await NestFactory.create(PlatformModule,{logger:false});await app.init();photos=app.get(AiPhotoService);photos.fetcher=stub;photos.logger={warn:()=>{}};photos.costDay=()=>'run-'+tag;
 studio=app.get(PlatformStudioService);service=app.get(PlatformService);beans=app.get(BeansService);
});
after(async()=>{await app?.close();try{
 const posts=await db.posting.findMany({where:{user_sub:{in:members}},select:{id:true}});await db.postingMedia.deleteMany({where:{posting_id:{in:posts.map(p=>p.id)}}});await db.posting.deleteMany({where:{id:{in:posts.map(p=>p.id)}}});
 await db.mediaWatermarkJob.deleteMany({where:{creator_id:{in:members}}});await db.media.deleteMany({where:{user_sub:{in:members}}});await db.membershipVersion.deleteMany({where:{membership_id:plan}}).catch(()=>{});await db.membershipItem.deleteMany({where:{creator_id:{in:members}}});
 const logs=(await db.aiPhotoFailureDetail.findMany({select:{request_id:true}})).map(r=>r.request_id).filter(id=>!logsBefore?.has(id));await db.aiPhotoFailureDetail.deleteMany({where:{request_id:{in:[...logs,...logIds]}}});
 await db.memberNotification.deleteMany({where:{member_id:{in:members}}});await db.creator.deleteMany({where:{user_id:{in:members}}});await db.member.deleteMany({where:{id:{in:members}}});
}finally{await db.$disconnect();fs.rmSync(mediaRoot,{recursive:true,force:true});await release?.();}});

test('catalog categories: every server costume has a category, the 8 basics are general, anything else is franchise',()=>{
 const categories=AI_PHOTO_COSTUME_IDS.map(costumeCategory);assert.ok(categories.every(c=>typeof c==='string'&&c.length>0));
 assert.equal(categories.filter(c=>c==='general').length,8);
 assert.deepEqual([...new Set(categories)].sort(),['aot','bluearchive','demon-slayer','diablo','general','genshin','jujutsu','nikke','overwatch']);
 assert.equal(franchiseCostumeMeta(['773106']),null,'maid is a basic outfit');
 assert.deepEqual(franchiseCostumeMeta(['773106','1a73b4']),{aiFranchiseCostume:true,aiCostumeCategory:'aot'});
 assert.deepEqual(franchiseCostumeMeta(['aot-scout']),{aiFranchiseCostume:true,aiCostumeCategory:'aot'},'previous catalog names map too');
});

test('AI edit records the flag only for game/anime costumes; re-edit and crop of a flagged photo keep it',async()=>{
 const source=await media(creator);
 const made=await edit(source,['1a73b4']);assert.equal(made.franchiseCostume,true);
 assert.deepEqual([(await meta(made.id)).aiFranchiseCostume,(await meta(made.id)).aiCostumeCategory],[true,'aot']);
 const basic=await edit(source,['773106']);assert.equal(basic.franchiseCostume,undefined);assert.equal((await meta(basic.id)).aiFranchiseCostume,undefined);
 const reedit=(await photos.edit(creator,{sourceId:made.id,kind:'pose',style:'photo',prompt:'벤치에 앉은 포즈',consent:'true'})).images[0];
 assert.equal(reedit.franchiseCostume,true,'a pose edit of a franchise photo still shows the costume');assert.equal((await meta(reedit.id)).aiCostumeCategory,'aot');
 const cropped=await photos.crop(creator,{sourceId:made.id,left:0,top:0,width:300,height:300});assert.equal(cropped.franchiseCostume,true);assert.equal((await meta(cropped.id)).aiFranchiseCostume,true);
 const plain=(await photos.edit(creator,{sourceId:basic.id,kind:'pose',style:'photo',prompt:'벤치에 앉은 포즈',consent:'true'})).images[0];assert.equal(plain.franchiseCostume,undefined);
 flagged=made.id;general=basic.id;
});

test('posts with franchise media: public only (create, update, keep-level update), branded copy flagged; general media unaffected',async()=>{
 const msg='게임·애니메이션 의상을 사용한 게시물은 전체 공개로만 올릴 수 있어요.';
 await assert.rejects(studio.saveContent(creator,post({title:'레벨 '+tag,accessLevel:1,media:[{id:flagged}]})),status(400,'FRANCHISE_COSTUME_PUBLIC_ONLY',msg));
 await assert.rejects(studio.saveContent(creator,post({title:'상품 '+tag,accessPlanId:plan,media:[{id:flagged}]})),status(400,'FRANCHISE_COSTUME_PUBLIC_ONLY',msg));
 assert.equal(await db.posting.count({where:{user_sub:creator,title:{in:['레벨 '+tag,'상품 '+tag]}}}),0,'nothing saved');
 await studio.saveContent(creator,post({title:'공개 '+tag,media:[{id:flagged}]}));const open=await postRow('공개 '+tag);
 assert.equal(open.is_membership,false);const branded=open.medias[0].media;assert.notEqual(branded.id,flagged,'watermarked copy');assert.equal(branded.metadata.aiFranchiseCostume,true);assert.equal(branded.metadata.aiCostumeCategory,'aot');
 await assert.rejects(studio.saveContent(creator,post({id:open.id,title:'공개 '+tag,accessLevel:1,media:[{id:branded.id}]})),code('FRANCHISE_COSTUME_PUBLIC_ONLY'),'update to a level');
 // Control: general media may be membership-only.
 await studio.saveContent(creator,post({title:'멤버 '+tag,accessLevel:1,media:[{id:general}]}));const member=await postRow('멤버 '+tag);assert.equal(member.is_membership,true);
 await studio.saveContent(creator,post({title:'상품전용 '+tag,accessPlanId:plan,media:[{id:general}]}));assert.equal((await postRow('상품전용 '+tag)).access_plan_id,plan);
 // Adding franchise media to an existing level post (accessLevel omitted keeps the level) is refused; the post is unchanged.
 await assert.rejects(studio.saveContent(creator,post({id:member.id,title:'멤버 '+tag,media:[{id:member.medias[0].media_id},{id:flagged}]})),code('FRANCHISE_COSTUME_PUBLIC_ONLY'));
 const unchanged=await postRow('멤버 '+tag);assert.equal(unchanged.medias.length,1);assert.equal(unchanged.membership_level,1);
 // Making it public explicitly is allowed.
 await studio.saveContent(creator,post({id:member.id,title:'멤버 '+tag,accessLevel:null,media:[{id:member.medias[0].media_id},{id:flagged}]}));assert.equal((await postRow('멤버 '+tag)).is_membership,false);
});

test('post responses: commercialRestricted + tipsEnabled false + media flag; studio contents too; general post unaffected',async()=>{
 const restricted=await service.post(await postRow('공개 '+tag),fan,false);assert.equal(restricted.commercialRestricted,true);assert.equal(restricted.tipsEnabled,false);assert.equal(restricted.media[0].franchiseCostume,true);
 const plain=await service.post(await postRow('상품전용 '+tag),creator);assert.equal(plain.commercialRestricted,false);assert.equal(plain.tipsEnabled,true);assert.equal(plain.media[0].franchiseCostume,undefined);
 const contents=await studio.contents(creator);assert.equal(contents.find(c=>c.title==='공개 '+tag).commercialRestricted,true);assert.equal(contents.find(c=>c.title==='상품전용 '+tag).commercialRestricted,false);
});

test('tips: blocked (403) only on franchise posts; general post and profile tips pass the check (fail later on balance)',async()=>{
 const restricted=await postRow('공개 '+tag);
 await assert.rejects(tip(restricted.id),status(403,'POST_COMMERCIAL_RESTRICTED','게임·애니메이션 의상을 사용한 게시물은 저작권 문제로 후원을 받을 수 없어요.'));
 await studio.saveContent(creator,post({title:'일반 '+tag,media:[{id:general}]}));const open=await postRow('일반 '+tag);
 await assert.rejects(tip(open.id),code('INSUFFICIENT_BEANS'),'general public post is not restricted');
 await assert.rejects(tip(undefined),code('INSUFFICIENT_BEANS'),'profile tip is not restricted');
 assert.equal(await db.beanTip.count({where:{sender_id:fan}}),0);
});

test('backfill: request log and source-chain evidence, unknown left alone, dry run writes nothing, second run changes nothing',async()=>{
 const crypt=new PaymentProvider(new ConfigService({DATA_ENCRYPTION_KEY:'a'.repeat(64)}));
 const legacy=()=>media(creator,{aiGenerated:true,watermarkEligible:1});
 const [fromLog,fromLogGeneral,unknown]=[await legacy(),await legacy(),await legacy()];
 const crop=await media(creator,{aiGenerated:true,croppedFrom:fromLog}),copy=await media(creator,{aiGenerated:true,watermark:{version:1,sourceId:crop}});
 const fromString=await legacy();
 for(const [targetId,costumeIds] of [[fromLog,['773106','8971c9']],[fromLogGeneral,['773106']],[fromString,'["773106","313a28"]']]){const id=crypto.randomUUID();logIds.push(id);await db.aiPhotoFailureDetail.create({data:{request_id:id,payload_encrypted:crypt.encrypt(JSON.stringify({outcome:'succeeded',targetId,options:{costumeIds}})),expires_at:new Date(Date.now()+86400000)}});}
 // An existing level-1 post that holds the legacy photo: listed for a decision, never changed.
 const p=await db.posting.create({data:{title:'예전 멤버 글 '+tag,content:'본문',user_sub:creator,status:'PUBLISHED',is_membership:true,membership_level:1,published_at:new Date(),allow_tips:true}});await db.postingMedia.create({data:{posting_id:p.id,media_id:copy,sort_order:0}});
 const decrypt=v=>crypt.decrypt(v);
 const dry=await franchiseBackfill(db,decrypt,false);assert.ok(dry.toUpdate>=3);assert.equal(dry.updated,0);assert.equal((await meta(fromLog)).aiFranchiseCostume,undefined,'dry run writes nothing');
 const applied=await franchiseBackfill(db,decrypt,true);assert.equal(applied.updated,applied.toUpdate);
 assert.deepEqual([(await meta(fromLog)).aiCostumeCategory,(await meta(crop)).aiCostumeCategory,(await meta(copy)).aiCostumeCategory],['overwatch','overwatch','overwatch']);
 assert.equal((await meta(copy)).watermark.sourceId,crop,'other metadata kept');
 assert.equal((await meta(fromString)).aiCostumeCategory,'nikke','multipart JSON-string costumeIds in the request log count too');
 assert.equal((await meta(fromLogGeneral)).aiFranchiseCostume,undefined);assert.equal((await meta(unknown)).aiFranchiseCostume,undefined,'no evidence → not blocked');
 assert.ok(applied.unknownNoInfo>=1);assert.ok(applied.provenNoFranchise>=1);
 const again=await franchiseBackfill(db,decrypt,true);assert.equal(again.toUpdate,0);assert.equal(again.updated,0);
 const listed=(await franchiseNonPublicPosts(db)).find(x=>x.postId===p.id);assert.deepEqual(Object.keys(listed).sort(),['access','createdAt','creatorHandle','postId','status']);assert.equal(listed.creatorHandle,'fccreator_'+tag);assert.equal(listed.access,'level:1');
 assert.equal((await db.posting.findUniqueOrThrow({where:{id:p.id}})).is_membership,true,'backfill leaves the post as it is');
 await assert.rejects(tip(p.id),code('POST_COMMERCIAL_RESTRICTED'),'tips stop on the existing post immediately');
});
