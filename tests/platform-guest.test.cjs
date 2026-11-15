require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-15 user decision: signed-out visitors try AI photos and post the result. The post is public in the feed for 24 hours,
// then private; signing in on the same browser moves it to the account. AI: 10 per visitor, 10 per IP a day, 200 per day overall,
// no hearts. Providers are stubs (no network).
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const mediaRoot=fs.mkdtempSync(path.join(os.tmpdir(),'guest-'));
Object.assign(process.env,{LOCAL_AUTH_SECRET:'r'.repeat(64),DATA_ENCRYPTION_KEY:'a'.repeat(64),TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:'',SMTP_HOST:'',BEAN_LEDGER_ENABLED:'false',AUTH_PROVIDER:'local',MEDIA_STORAGE:'local',MEDIA_ROOT:mediaRoot,AI_PHOTO_BYTEPLUS_API_KEY:'seedream-test-key',AI_PHOTO_OPENAI_API_KEY:'sk-test-'+'x'.repeat(20),AI_PHOTO_DAILY_TOTAL:'100000'});
const sharp=require('sharp'),{PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module');
const {PlatformStudioService}=require('../dist/src/platform/studio.service'),{PlatformService}=require('../dist/src/platform/service'),{AiPhotoService}=require('../dist/src/platform/ai-photo'),guestModule=require('../dist/src/platform/guest'),{requestContext}=require('../dist/src/platform/request-context');
const {GuestService,GUEST_CONSENT_VERSION,GUEST_COOKIE,guestFromRequest}=guestModule;
const tag=crypto.randomBytes(3).toString('hex'),members=[],guests=[];let app,studio,service,photos,guestsService,member;
const code=wanted=>e=>e.getResponse?.().code===wanted;
const png=(w,h)=>sharp({create:{width:w,height:h,channels:3,background:{r:200,g:120,b:160}}}).png().toBuffer();
async function stub(url,init){if(url.endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:false}]}),{status:200});if(url.endsWith('/images/generations'))return new Response(JSON.stringify({data:[{b64_json:(await png(1024,1536)).toString('base64')}]}),{status:200});throw new Error('unexpected '+url);}
function browser(){const jar={};return{req:{get cookies(){return jar;}},res:{cookie(name,value){jar[name]=value;},clearCookie(name){delete jar[name];}}};}
async function startGuest(){const b=browser();await guestsService.start(b.req,b.res,{consent:true,version:GUEST_CONSENT_VERSION});const id=guestFromRequest(b.req);guests.push(id);return{...b,id};}
async function upload(owner,metadata){const id=crypto.randomUUID();fs.writeFileSync(path.join(mediaRoot,id),await sharp(await png(600,900)).webp().toBuffer());await db.media.create({data:{id,user_sub:owner,type:'IMAGE',original_name:'s.webp',file_name:id,file_size:1,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:`local/${id}`,processing_status:'COMPLETED',processed_at:new Date(),...(metadata?{metadata}:{})}});return id;}
const post=extra=>({title:'체험 글 '+tag,body:'비로그인 체험',status:'published',commentsEnabled:true,media:[],...extra});
const edit=(sourceId,extra)=>({sourceId,kind:'pose',style:'photo',prompt:'벤치에 앉은 포즈',consent:'true',...extra});
before(async()=>{
 globalThis.__release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 member=crypto.randomUUID();members.push(member);await db.member.create({data:{id:member,email:member+'@guest.test.invalid',name:'체험 연결 QA',nickname:'체험 연결 QA',preferred_username:'guestclaim_'+tag,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});
 app=await NestFactory.create(PlatformModule,{logger:false});await app.init();studio=app.get(PlatformStudioService);service=app.get(PlatformService);photos=app.get(AiPhotoService);photos.fetcher=stub;guestsService=app.get(GuestService);
});
after(async()=>{await app?.close();try{const owners=[...members,...guests];const posts=await db.posting.findMany({where:{user_sub:{in:owners}},select:{id:true}});await db.postingMedia.deleteMany({where:{posting_id:{in:posts.map(p=>p.id)}}});await db.posting.deleteMany({where:{id:{in:posts.map(p=>p.id)}}});await db.media.deleteMany({where:{user_sub:{in:owners}}});await db.member.deleteMany({where:{id:{in:members}}});}finally{await db.$disconnect();await globalThis.__release?.();fs.rmSync(mediaRoot,{recursive:true,force:true});}});

test('a guest needs the consent of the current notice; the cookie holds a random token, the server only its hash',async()=>{
 const b=browser();await assert.rejects(guestsService.start(b.req,b.res,{consent:true,version:'old'}),code('GUEST_CONSENT_REQUIRED'));assert.equal(b.req.cookies[GUEST_COOKIE],undefined);
 await guestsService.start(b.req,b.res,{consent:true,version:GUEST_CONSENT_VERSION});const token=b.req.cookies[GUEST_COOKIE];assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 const id=guestFromRequest(b.req);guests.push(id);assert.match(id,/^guest:[0-9a-f]{40}$/);assert.ok(!id.includes(token));
 await guestsService.start(b.req,b.res,{consent:true,version:GUEST_CONSENT_VERSION});assert.equal(b.req.cookies[GUEST_COOKIE],token,'an existing visitor keeps the same token');
});

test('a guest publishes only, without comments or tips; the post is in the feed for 24 hours and then closed',async()=>{
 const g=await startGuest();
 await assert.rejects(studio.saveContent(g.id,post({status:'draft'}),{guest:true}),code('GUEST_PUBLISH_ONLY'));
 await studio.saveContent(g.id,post(),{guest:true});const row=await db.posting.findFirst({where:{user_sub:g.id},include:{medias:{include:{media:true}}}});
 assert.equal(row.status,'PUBLISHED');assert.equal(row.allow_comments,false);assert.equal(row.allow_tips,false);assert.equal(row.is_membership,false);
 assert.equal(await service.access(row,undefined),true);const dto=await service.post(row,undefined,false);assert.equal(dto.commentsEnabled,false);assert.equal(dto.tipsEnabled,false);
 const feed=await service.postPage(undefined);assert.ok(feed.posts.some(p=>p.id===row.id),'whole feed shows the guest post');const author=feed.creators.find(c=>c.id===g.id);assert.equal(author.isGuest,true);assert.equal(author.name,'체험 사용자');
 assert.equal((await service.postDetail(row.id)).creator.isGuest,true);
 await db.posting.update({where:{id:row.id},data:{published_at:new Date(Date.now()-25*3600000)}});const old={...row,published_at:new Date(Date.now()-25*3600000)};
 assert.equal(await service.access(old,undefined),false,'closed after 24 hours');assert.equal(await service.access(old,member),false);
 assert.ok(!(await service.postPage(undefined)).posts.some(p=>p.id===row.id));await assert.rejects(service.postDetail(row.id),code('POST_NOT_FOUND'));
 assert.ok(!(await service.postSearch(undefined,'체험 글 '+tag)).posts.some(p=>p.id===row.id),'guest posts stay out of search');
});

test('signing in on the same browser moves guest posts and photos to the account; posts past 24 hours stay private',async()=>{
 const g=await startGuest();const photo=await upload(g.id,{aiGenerated:true});
 await studio.saveContent(g.id,post({title:'최근 체험 '+tag,media:[{id:photo}]}),{guest:true});await studio.saveContent(g.id,post({title:'지난 체험 '+tag}),{guest:true});
 await db.posting.updateMany({where:{user_sub:g.id,title:'지난 체험 '+tag},data:{published_at:new Date(Date.now()-48*3600000)}});
 const other=browser();assert.deepEqual(await guestsService.claim(member,other.req,other.res),{claimed:0},'a browser without the cookie claims nothing');
 assert.deepEqual(await guestsService.claim(member,g.req,g.res),{claimed:2});assert.equal(g.req.cookies[GUEST_COOKIE],undefined,'cookie cleared');
 const moved=await db.posting.findMany({where:{user_sub:member}});assert.equal(moved.length,2);assert.equal(moved.find(p=>p.title==='최근 체험 '+tag).is_public,true);assert.equal(moved.find(p=>p.title==='지난 체험 '+tag).is_public,false);
 assert.equal((await db.media.findUnique({where:{id:photo}})).user_sub,member);assert.equal(await db.posting.count({where:{user_sub:g.id}}),0);
});

test('guest AI: no allow-list needed, no library or hearts, 10 per visitor and then a clear refusal',async()=>{
 const g=await startGuest(),photo=await upload(g.id),ip={ipHash:'iphash'+tag};
 await assert.rejects(photos.edit(g.id,edit(photo,{libraryIds:'["x"]'}),undefined,ip),code('GUEST_FEATURE_UNAVAILABLE'));
 await assert.rejects(photos.edit(g.id,edit(photo,{heartGameId:'game'}),undefined,ip),code('GUEST_FEATURE_UNAVAILABLE'));
 assert.equal(await photos.guestRemaining(g.id),10);
 const first=await requestContext.run({ip:'198.51.100.7',peerIp:'198.51.100.7',requestId:crypto.randomUUID()},()=>photos.edit(g.id,edit(photo),undefined,ip));
 assert.equal(first.images.length,1);assert.equal(first.remaining,9);assert.equal((await db.media.findUnique({where:{id:first.images[0].id}})).user_sub,g.id,'the result belongs to the guest');
 for(let i=0;i<9;i++)await photos.edit(g.id,edit(photo),undefined,{ipHash:'other'+i+tag});
 assert.equal(await photos.guestRemaining(g.id),0);await assert.rejects(photos.edit(g.id,edit(photo),undefined,{ipHash:'fresh'+tag}),code('GUEST_AI_LIMIT'));
 const h=await startGuest(),hp=await upload(h.id);for(let i=0;i<9;i++)await photos.edit(h.id,edit(hp),undefined,ip);
 await assert.rejects(photos.edit(h.id,edit(hp),undefined,ip),code('GUEST_IP_LIMIT'),'the same IP stops at 10 a day');assert.equal(await photos.guestRemaining(h.id),1,'a refused try is given back');
});

test('spam guard: 10 trial posts per visitor a day',async()=>{
 const g=await startGuest();await requestContext.run({ip:'203.0.113.'+(Math.floor(Math.random()*200)+1),peerIp:'x',requestId:crypto.randomUUID()},async()=>{for(let i=0;i<10;i++)await guestsService.guard('post',g.id);await assert.rejects(guestsService.guard('post',g.id),code('GUEST_RATE_LIMITED'));});
});

// 2026-11-15 user decisions (night-work /ask-me): a guest post carries only the guest's own AI results; guests have their own daily
// AI budget and never use the members' service-wide cap; a public trial post (within 24 hours) still stays out of search.
test("a guest post accepts only the guest's own AI results, never an uploaded original or someone else's result",async()=>{
 const g=await startGuest(),h=await startGuest(),original=await upload(g.id),result=await upload(g.id,{aiGenerated:true}),other=await upload(h.id,{aiGenerated:true});
 await assert.rejects(studio.saveContent(g.id,post({media:[{id:original}]}),{guest:true}),code('GUEST_AI_RESULT_ONLY'));
 await assert.rejects(studio.saveContent(g.id,post({media:[{id:result},{id:original}]}),{guest:true}),code('GUEST_AI_RESULT_ONLY'));
 await assert.rejects(studio.saveContent(g.id,post({media:[{id:other}]}),{guest:true}),code('INVALID_MEDIA'));
 await studio.saveContent(g.id,post({title:'결과만 '+tag,media:[{id:result}]}),{guest:true});
 assert.equal(await db.posting.count({where:{user_sub:g.id,title:'결과만 '+tag}}),1);
});

test('a public trial post (within 24 hours) is in the feed but not in search',async()=>{
 const g=await startGuest(),title='검색 제외 '+tag;
 await studio.saveContent(g.id,post({title}),{guest:true});const row=await db.posting.findFirst({where:{user_sub:g.id,title}});
 assert.ok((await service.postPage(undefined)).posts.some(p=>p.id===row.id),'public in the feed now');
 assert.ok(!(await service.postSearch(undefined,title)).posts.some(p=>p.id===row.id),'still not searchable');
});

test("guest AI: the 200-a-day guest budget closes trials without touching the members' service-wide cap",async()=>{
 const {digest}=require('../dist/src/auth/local/credentials');const DAY=86400,windowId=key=>digest(`${key}:${Math.floor(Date.now()/(DAY*1000))}`);
 const read=async key=>(await db.authRateBucket.findUnique({where:{id:windowId(key)}}))?.count||0;
 const g=await startGuest(),photo=await upload(g.id),ip={ipHash:'budget'+tag};
 const memberTotal=await read('ai-photo:total');
 await photos.edit(g.id,edit(photo),undefined,ip);
 assert.equal(await read('ai-photo:total'),memberTotal,'a guest generation does not count against ai-photo:total');
 const guestTotal=await read('ai-photo:guest-total');assert.ok(guestTotal>=1);
 const id=windowId('ai-photo:guest-total'),expires=new Date((Math.floor(Date.now()/(DAY*1000))+1)*DAY*1000);
 await db.authRateBucket.upsert({where:{id},create:{id,count:200,expires_at:expires},update:{count:200}});
 try{
  const before=await photos.guestRemaining(g.id);
  await assert.rejects(photos.edit(g.id,edit(photo),undefined,{ipHash:'budget2'+tag}),code('GUEST_DAILY_CLOSED'));
  assert.equal(await photos.guestRemaining(g.id),before,'the visitor keeps the refused try');
  assert.equal(await read('ai-photo:total'),memberTotal,'still untouched');
 }finally{await db.authRateBucket.update({where:{id},data:{count:guestTotal}});}
});
