require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-15 user decision: signed-out visitors try AI photos and post the result. The post is public in the feed for 24 hours,
// then private; signing in on the same browser moves it to the account. AI: three credits plus a first-post reward, 10 per IP a day, 200 per day overall,
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

test('replay consent is always offered with the required trial consent (privacy 17항) and versioned',async()=>{
 const version=guestModule.GUEST_REPLAY_CONSENT_VERSION,request={consent:true,version:GUEST_CONSENT_VERSION},selected={replayConsent:{agreed:true,version}};
 const status=()=>guestsService.status({cookies:{}},()=>{throw Error('anonymous status has no saved quota');});
 assert.equal((await status()).replayConsentVersion,version);
 const plain=await startGuest();
 assert.equal(await db.platformAuditLog.count({where:{entity_id:plain.id,action:'guest.replay_consented'}}),0);
 assert.equal((await guestsService.status(plain.req,async()=>({limit:3,remaining:3,postRewardClaimed:false,shareRewardClaimed:false}))).replayConsented,false,'no replay consent recorded');
 const stale=browser();
 await assert.rejects(guestsService.start(stale.req,stale.res,{...request,replayConsent:{agreed:true,version:'old'}}),code('GUEST_REPLAY_CONSENT_INVALID'));
 assert.equal(stale.req.cookies[GUEST_COOKIE],undefined);
 const agreed=browser();
 await guestsService.start(agreed.req,agreed.res,{...request,...selected});
 const id=guestFromRequest(agreed.req);guests.push(id);
 const rows=await db.platformAuditLog.findMany({where:{entity_id:id,action:{in:['guest.consented','guest.replay_consented']}}});
 assert.equal(rows.length,2);
 assert.equal(rows.find(row=>row.action==='guest.replay_consented').metadata.policyVersion,version);
 assert.equal((await guestsService.status(agreed.req,async()=>({limit:3,remaining:3,postRewardClaimed:false,shareRewardClaimed:false}))).replayConsented,true,'recorded replay consent unmasks the trial screens');
});

// 2026-11-20 user decision: the reward is paid at the first share (share sheet finished or link copied), once per browser.
test('AI result share grants three credits at the first share of the guest\'s own result, once',async()=>{
 const owner=await startGuest(),other=await startGuest();
 const result=await upload(owner.id,{aiGenerated:true}),original=await upload(owner.id),second=await upload(owner.id,{aiGenerated:true});
 const done=id=>guestsService.shareDone(owner.req,id);
 await assert.rejects(done('bad id!'),code('GUEST_SHARE_INVALID'));
 await assert.rejects(done(original),code('GUEST_SHARE_NOT_FOUND'));
 const foreign=await upload(other.id,{aiGenerated:true});
 await assert.rejects(done(foreign),code('GUEST_SHARE_NOT_FOUND'));
 assert.equal((await photos.guestQuota(owner.id)).remaining,3);
 const twice=await Promise.all([done(result),done(result)]);
 assert.equal(twice.filter(row=>row.granted).length,1,'concurrent shares pay once');
 assert.deepEqual(await done(second),{granted:false},'a later share of another result pays nothing');
 const quota=await photos.guestQuota(owner.id);
 assert.equal(quota.remaining,6);assert.equal(quota.shareRewardClaimed,true);assert.equal(quota.postRewardClaimed,false);
 assert.equal(await db.platformAuditLog.count({where:{entity_id:owner.id,action:'guest.ai_result_share_reward'}}),1);
 assert.equal(typeof guestsService.shareVisit,'undefined','visits no longer pay');
});

// 2026-11-20 user decisions: guest credits refill to 3 every day at 09:00 KST (00:00 UTC) and the share reward can be earned
// again the next day; yesterday's leftovers do not carry over.
test('guest credits and the share reward reset at the next 09:00 KST',async()=>{
 const owner=await startGuest(),result=await upload(owner.id,{aiGenerated:true});
 const realNow=Date.now,day=Math.floor(realNow()/86400000);
 try{
  Date.now=()=>day*86400000+3600000;// 10:00 KST today
  assert.equal((await photos.guestQuota(owner.id)).remaining,3);
  assert.deepEqual(await guestsService.shareDone(owner.req,result),{granted:true});assert.deepEqual(await guestsService.shareDone(owner.req,result),{granted:false});
  assert.equal((await photos.guestQuota(owner.id)).remaining,6);
  Date.now=()=>(day+1)*86400000+60000;// 09:01 KST tomorrow
  const next=await photos.guestQuota(owner.id);assert.equal(next.remaining,3,'refilled to 3, no carry-over');assert.equal(next.shareRewardClaimed,false);
  assert.deepEqual(await guestsService.shareDone(owner.req,result),{granted:true},'the share reward can be earned again');
  assert.equal((await photos.guestQuota(owner.id)).remaining,6);
 }finally{Date.now=realNow;}
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

test('three trial credits, a single transactional publishing reward and the shared network cap',async()=>{
 const g=await startGuest(),photo=await upload(g.id),ip={ipHash:'iphash'+tag};
 await assert.rejects(photos.edit(g.id,edit(photo,{libraryIds:'["x"]'}),undefined,ip),code('GUEST_FEATURE_UNAVAILABLE'));
 await assert.rejects(photos.edit(g.id,edit(photo,{heartGameId:'game'}),undefined,ip),code('GUEST_FEATURE_UNAVAILABLE'));
 assert.equal((await guestsService.status(g.req,id=>photos.guestQuota(id))).postRewardClaimed,false);
 assert.equal(await photos.guestRemaining(g.id),3);
 const first=await requestContext.run({ip:'198.51.100.7',peerIp:'198.51.100.7',requestId:crypto.randomUUID()},()=>photos.edit(g.id,edit(photo,{generationMethod:'fast'}),undefined,ip));
 assert.equal(first.remaining,2.5);
 assert.equal((await db.media.findUnique({where:{id:first.images[0].id}})).user_sub,g.id);
 await photos.edit(g.id,edit(photo,{generationMethod:'precise'}),undefined,ip);
 await photos.edit(g.id,edit(photo,{generationMethod:'fast'}),undefined,ip);
 await assert.rejects(photos.edit(g.id,edit(photo),undefined,ip),code('GUEST_AI_LIMIT'));
 await assert.rejects(studio.saveContent(g.id,post({media:[{id:photo}]}),{guest:true}),code('GUEST_AI_RESULT_ONLY'));
 assert.equal(await photos.guestRemaining(g.id),0,'refused publication does not grant credits');
 const published=await Promise.all([
   studio.saveContent(g.id,post({media:[{id:first.images[0].id}]}),{guest:true}),
   studio.saveContent(g.id,post({title:'후속 체험 글 '+tag}),{guest:true}),
 ]);
 assert.deepEqual(published.map(result=>result.rewardGranted).sort(),[0,3]);
 const status=await guestsService.status(g.req,id=>photos.guestQuota(id));
 assert.equal(status.remaining,3);
 assert.equal(status.limit,6);
 assert.equal(status.postRewardClaimed,true);
 for(let n=0;n<6;n++)await photos.edit(g.id,edit(photo,{generationMethod:'fast'}),undefined,ip);
 const h=await startGuest(),hp=await upload(h.id);
 assert.equal((await photos.edit(h.id,edit(hp),undefined,ip)).remaining,2);
 await assert.rejects(photos.edit(h.id,edit(hp),undefined,ip),code('GUEST_IP_LIMIT'));
 assert.equal(await photos.guestRemaining(h.id),2,'network refusal does not debit the other visitor');
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

test('2026-11-16: the guest author edits only the title and body of their own post; others, empty text and deletion stay refused',async()=>{
 const g=await startGuest(),other=await startGuest();
 assert.equal((await guestsService.status(g.req,async()=>0)).authorId,g.id,'the session tells the browser its own author id');
 await studio.saveContent(g.id,post({title:'고칠 글 '+tag}),{guest:true});const row=await db.posting.findFirst({where:{user_sub:g.id,title:'고칠 글 '+tag}});
 await studio.updateGuestText(g.id,row.id,{title:' 새 제목 ',body:'새 내용',status:'draft',media:[],allow_comments:true});
 const after=await db.posting.findUnique({where:{id:row.id}});assert.equal(after.title,'새 제목');assert.equal(after.content,'새 내용');
 assert.equal(after.status,'PUBLISHED','other fields in the request are ignored');assert.equal(after.allow_comments,false);assert.equal(after.is_deleted,false);
 await assert.rejects(studio.updateGuestText(other.id,row.id,{title:'남의 글',body:'x'}),code('POST_NOT_FOUND'),'another visitor cannot edit it');
 await assert.rejects(studio.updateGuestText(g.id,row.id,{title:'',body:'x'}),code('INVALID_INPUT'));await assert.rejects(studio.updateGuestText(g.id,row.id,{title:'x',body:' '}),code('INVALID_INPUT'));
 assert.equal((await db.posting.findUnique({where:{id:row.id}})).title,'새 제목');
 const routes=Reflect.getMetadataKeys?Object.getOwnPropertyNames(require('../dist/src/platform/guest').GuestController.prototype):[];assert.ok(!routes.some(n=>/delete/i.test(n)),'no guest delete route');
});

test('2026-11-16: before linking, the signed-in browser can count its trial posts; nothing moves until claim is called',async()=>{
 const g=await startGuest();await studio.saveContent(g.id,post({title:'연동 전 '+tag}),{guest:true});
 assert.deepEqual(await guestsService.claimable(member,g.req),{posts:1});
 assert.equal(await db.posting.count({where:{user_sub:g.id}}),1,'counting moves nothing');
 assert.deepEqual(await guestsService.claimable(member,browser().req),{posts:0},'a browser without a trial has nothing');
});
