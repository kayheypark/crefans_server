// Explicit live AWS opt-in. Fixtures are restricted to the local development DB.
require('reflect-metadata');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID,createHash,randomBytes}=require('node:crypto');
const {signedEdgeHeaders,authCookie}=require('../dist/src/platform/media-edge-protocol');
const edgeSecret=randomBytes(32).toString('hex');
const {spawn}=require('node:child_process');
assert.equal(process.env.CREFANS_S3_E2E,'true','Explicit live AWS test opt-in required');
require('dotenv').config({path:'.local/platform.env'});
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const {PrismaClient}=require('@prisma/client'),{NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config');
const {S3Client,HeadObjectCommand}=require('@aws-sdk/client-s3');
const {hashPassword,digest}=require('../dist/src/auth/local/credentials');
const {PlatformMediaStorage}=require('../dist/src/platform/media-storage');
const {PlatformService}=require('../dist/src/platform/service');
const {PlatformJobsService}=require('../dist/src/platform/jobs.service');
const {EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http');
const db=new PrismaClient(),owner=randomUUID(),fan=randomUUID(),stranger=randomUUID(),ids=[owner,fan,stranger],cookies={};
const origin='http://127.0.0.1:3012',password='Cloud-test-'+randomUUID()+'!',media=[];
let app,storage,s3,root,resources,plan,otherPlan,foreignPlan,post,sub,order,frontend,frontLog,videoBytes;
const baseSub=()=>({membership_item_id:plan.id,started_at:new Date(Date.now()-60000),ended_at:new Date(Date.now()+86400000),status:'ONGOING',auto_renew:true});
async function request(url,user,options={}){return fetch(origin+'/api/v1'+url,{redirect:'manual',...options,headers:{Origin:'http://127.0.0.1:3011',...(user?{Cookie:cookies[user]}:{}),...options.headers}});}
const sha=b=>createHash('sha256').update(b).digest('hex');
async function status(url,user,expected){const r=await request(url,user);assert.equal(r.status,expected);await r.arrayBuffer();return r;}
before(async()=>{
 resources=JSON.parse(await fs.readFile(process.env.CREFANS_S3_E2E_STATE,'utf8'));
 assert.match(resources.bucket,/^crefans-beta-media-/);
 root=await fs.mkdtemp(path.join(os.tmpdir(),'crefans-cloud-media-'));
 Object.assign(process.env,{CREFANS_E2E:'true',MEDIA_EDGE_SECRET:edgeSecret,MEDIA_STORAGE:'s3',MEDIA_ROOT:root,AWS_REGION:resources.region,S3_MEDIA_BUCKET:resources.bucket,TELEGRAM_OPERATIONS_ENABLED:'false',TELEGRAM_OPERATIONS_BOT_TOKEN:'',SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:''});
 // Use the local SDK profile, never copy access keys into test artifacts.
 for(const key of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN'])delete process.env[key];
 app=await NestFactory.create(require('../dist/src/platform/module').PlatformModule,{logger:false});
 app.setGlobalPrefix('api/v1');app.use(require('cookie-parser')());app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(3012,'127.0.0.1');
 storage=app.get(PlatformMediaStorage);s3=new S3Client({region:resources.region});
 const hash=await hashPassword(password);
 for(const id of ids){await db.member.create({data:{id,email:`${id}@example.invalid`,name:'미디어 검증',nickname:'미디어 검증',preferred_username:`media-${id}`,password_hash:hash,email_verified:true,status:'CONFIRMED'}});const r=await request('/auth/login',null,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${id}@example.invalid`,password})});assert.equal(r.status,201);cookies[id]=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
 for(const id of [owner,stranger])await db.creator.create({data:{user_id:id,display_name:'미디어 검증'}});
 const data={name:'미디어 검증',price:1000,benefits:'[]',billing_unit:'MONTH',billing_period:1};
 plan=await db.membershipItem.create({data:{...data,creator_id:owner,level:1}});otherPlan=await db.membershipItem.create({data:{...data,creator_id:owner,level:5}});foreignPlan=await db.membershipItem.create({data:{...data,creator_id:stranger,level:5}});
 sub=await db.subscription.create({data:{subscriber_id:fan,...baseSub(),amount:1000,plan_snapshot:{rank:1}}});
 order=await db.checkoutOrder.create({data:{member_id:fan,membership_id:plan.id,amount:1000,status:'paid',snapshot:{id:plan.id,creatorId:owner,name:'미디어 검증',rank:1,price:1000,benefits:[],version:1},idempotency_key:randomUUID(),expires_at:new Date(Date.now()+86400000),period_start:sub.started_at,period_end:sub.ended_at}});
});
after(async()=>{
 if(frontend){frontend.kill('SIGTERM');await new Promise(resolve=>frontend.once('exit',resolve));}await frontLog?.close();
 await app?.close();
 const files=await db.media.findMany({where:{user_sub:{in:ids}}});
 for(const m of files)if(m.s3_upload_key.startsWith('platform/'))await storage.remove(m.s3_upload_key);
 await db.comment.deleteMany({where:{posting:{user_sub:{in:ids}}}});await db.postingMedia.deleteMany({where:{posting:{user_sub:{in:ids}}}});await db.posting.deleteMany({where:{user_sub:{in:ids}}});await db.media.deleteMany({where:{user_sub:{in:ids}}});
 await db.checkoutOrder.deleteMany({where:{member_id:{in:ids}}});await db.subscription.deleteMany({where:{subscriber_id:{in:ids}}});await db.membershipVersion.deleteMany({where:{membership_id:{in:(await db.membershipItem.findMany({where:{creator_id:{in:ids}},select:{id:true}})).map(p=>p.id)}}});await db.membershipItem.deleteMany({where:{creator_id:{in:ids}}});await db.creator.deleteMany({where:{user_id:{in:ids}}});await db.identityProof.deleteMany({where:{member_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});await db.$disconnect();s3?.destroy();await fs.rm(root,{recursive:true,force:true});
});
test('real multipart upload stores normalized image and playable MP4 in private S3, with no EC2 media copy',async()=>{
 const png=await require('sharp')({create:{width:20,height:20,channels:3,background:'#abcdef'}}).png().toBuffer();videoBytes=await fs.readFile('../crefans_front/public/video_1.mp4');
 for(const [bytes,type,name]of[[png,'image/png','cloud.png'],[videoBytes,'video/mp4','cloud.mp4']]){
  const body=new FormData();body.append('file',new Blob([bytes],{type}),name);const r=await request('/media',owner,{method:'POST',body});assert.equal(r.status,201);const m=(await r.json()).data;media.push(m);
  const row=await db.media.findUniqueOrThrow({where:{id:m.id}});assert.equal(row.s3_upload_key,`platform/${m.id}`);assert.equal(row.processing_status,'COMPLETED');assert.equal(row.mime_type,type==='image/png'?'image/webp':type);
  const head=await s3.send(new HeadObjectCommand({Bucket:resources.bucket,Key:row.s3_upload_key}));assert.equal(head.ServerSideEncryption,'AES256');assert.equal(head.ContentLength,Number(row.file_size));assert.equal(head.ContentType,row.mime_type);
 }
 assert.deepEqual((await fs.readdir(root)).filter(n=>n!=='.uploads'),[]);assert.deepEqual(await fs.readdir(path.join(root,'.uploads')),[]);
 post=await db.posting.create({data:{user_sub:owner,title:'세션 미디어 검증',content:'격리된 테스트 콘텐츠',status:'PUBLISHED',is_membership:true,access_plan_id:plan.id,medias:{create:media.map((m,i)=>({media_id:m.id,sort_order:i}))}}});
});
test('API authorizes owner and paid subscriber, marks content consumption before streaming, and blocks refund races',async()=>{
 for(const m of media){for(const u of [null,stranger])await status(`/media/${m.id}/file`,u,403);for(const u of [owner,fan]){const r=await status(`/media/${m.id}/file`,u,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('location'),null);}}
 assert.ok((await db.checkoutOrder.findUniqueOrThrow({where:{id:order.id}})).content_accessed_at);
 await db.checkoutOrder.update({where:{id:order.id},data:{status:'refunding'}});try{await status(`/media/${media[0].id}/file`,fan,403);}finally{await db.checkoutOrder.update({where:{id:order.id},data:{status:'paid'}});}
 for(const change of[{membership_item_id:otherPlan.id},{membership_item_id:foreignPlan.id},{ended_at:new Date(0)},{started_at:new Date(Date.now()+60000)},{status:'EXPIRED'}]){await db.subscription.update({where:{id:sub.id},data:{...baseSub(),...change}});await status(`/media/${media[1].id}/file`,fan,403);}
 await db.subscription.update({where:{id:sub.id},data:{...baseSub(),status:'CANCELLED',auto_renew:false}});await status(`/media/${media[1].id}/file`,fan,200);await db.subscription.update({where:{id:sub.id},data:baseSub()});
});
test('public reuse, inactive plan cover, hidden posts, adult gates and revoked accounts cannot bypass private delivery',async()=>{
 const publicPost=await db.posting.create({data:{user_sub:owner,title:'공개 재사용',content:'공개',status:'PUBLISHED',medias:{create:{media_id:media[0].id}}}});
 try{await db.membershipItem.update({where:{id:plan.id},data:{image:media[0].url}});await status(`/media/${media[0].id}/file`,stranger,403);}finally{await db.membershipItem.update({where:{id:plan.id},data:{image:null}});await db.postingMedia.deleteMany({where:{posting_id:publicPost.id}});await db.posting.delete({where:{id:publicPost.id}});}
 for(const change of[{status:'DRAFT'},{is_public:false},{is_deleted:true},{publish_start_at:new Date(Date.now()+60000)},{publish_end_at:new Date(0)},{is_sensitive:true}]){await db.posting.update({where:{id:post.id},data:change});await status(`/media/${media[1].id}/file`,fan,403);await db.posting.update({where:{id:post.id},data:{status:'PUBLISHED',is_public:true,is_deleted:false,publish_start_at:null,publish_end_at:null,is_sensitive:false}});}
 await db.member.update({where:{id:fan},data:{enabled:false}});try{await status(`/media/${media[1].id}/file`,fan,401);}finally{await db.member.update({where:{id:fan},data:{enabled:true}});}
});
test('copied URL is session protected for GET/HEAD/Range even after authorized reads, logout and expiry',async()=>{
 const file=`/media/${media[1].id}/file`;
 const full=await request(file,fan);assert.equal(full.status,200);assert.equal(sha(Buffer.from(await full.arrayBuffer())),sha(videoBytes));assert.equal(full.headers.get('location'),null);
 const head=await request(file,fan,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),videoBytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);
 const range=await request(file,fan,{headers:{Range:'bytes=100-199'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 100-199/${videoBytes.length}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),videoBytes.subarray(100,200));assert.match(range.headers.get('cache-control'),/no-store/);
 for(const user of[null,stranger])for(const options of[{},{method:'HEAD'},{headers:{Range:'bytes=100-199'}},{headers:{'If-None-Match':'*'}}]){const r=await request(file,user,options);assert.equal(r.status,403);assert.equal(r.headers.get('location'),null);await r.arrayBuffer();}
 for(const range of['bytes=999999999999-','bytes=0-2,4-6','items=0-9']){const r=await request(file,fan,{headers:{Range:range}});assert.equal(r.status,416);await r.arrayBuffer();}
 const raw=await fetch(`https://${resources.bucket}.s3.${resources.region}.amazonaws.com/platform/${media[1].id}`);assert.equal(raw.status,403);await raw.arrayBuffer();
 if(process.env.CREFANS_CDN_RETIRED==='true'){try{const r=await fetch(resources.origin+`/platform/${media[1].id}`);assert.equal(r.status,403);await r.arrayBuffer();}catch(e){assert.equal(e.cause?.code,'ENOTFOUND');}}
 await db.subscription.update({where:{id:sub.id},data:{ended_at:new Date(Date.now()+1000)}});await status(file,fan,200);await new Promise(r=>setTimeout(r,1100));await status(file,fan,403);await db.subscription.update({where:{id:sub.id},data:baseSub()});
 const logout=await request('/auth/logout',fan,{method:'POST'});assert.equal(logout.status,201);await logout.arrayBuffer();const revoked=await request(file,fan,{headers:{Range:'bytes=0-19'}});assert.ok([401,403].includes(revoked.status));await revoked.arrayBuffer();
 const login=await request('/auth/login',null,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${fan}@example.invalid`,password})});assert.equal(login.status,201);cookies[fan]=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');await login.arrayBuffer();
});
async function save(path,body,user=owner){const r=await request(path,user,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
test('studio validates and persists membership levels, keeps old subscriptions and exact posts unchanged',async()=>{
 const input={name:'레벨 검증',price:1000,benefits:['레벨 콘텐츠'],rank:2};
 for(const rank of[0,-1,101,1.5,'2',null])assert.equal((await save('/studio/memberships',{...input,rank})).status,400);
 assert.equal((await save('/studio/memberships',input,fan)).status,403);
 const created=await save('/studio/memberships',input);assert.equal(created.status,201);
 const p=await db.membershipItem.findUniqueOrThrow({where:{id:created.data.id}});assert.equal(p.level,2);
 const snapshot=await db.membershipVersion.findFirstOrThrow({where:{membership_id:p.id}});assert.equal(snapshot.snapshot.rank,2);
 const original=await db.subscription.findUniqueOrThrow({where:{id:sub.id}});
 assert.equal((await save('/studio/memberships',{...input,id:plan.id,rank:3})).status,201);
 assert.deepEqual((await db.subscription.findUniqueOrThrow({where:{id:sub.id}})).plan_snapshot,original.plan_snapshot);
 assert.equal((await db.posting.findUniqueOrThrow({where:{id:post.id}})).access_plan_id,plan.id);
 assert.equal((await save('/studio/memberships',{...input,id:plan.id,rank:1})).status,201);
});
test('minimum-level API matrix protects body, comments, images and video across paid ranks 1/2/3',async()=>{
 const input={id:post.id,title:'레벨 공개 검증',body:'private-tier-body',media,commentsEnabled:true,accessPlanId:null,accessLevel:2,status:'published',scheduledAt:null};
 const draft=await save('/studio/content',{...input,id:undefined,status:'draft'});assert.equal(draft.status,201);const draftRow=await db.posting.findUniqueOrThrow({where:{id:draft.data.id}});assert.equal(draftRow.membership_level,2);assert.equal(draftRow.access_plan_id,null);assert.equal(draftRow.is_membership,true);assert.equal(draftRow.status,'DRAFT');await db.postingMedia.deleteMany({where:{posting_id:draftRow.id}});await db.posting.delete({where:{id:draftRow.id}});
 const original=await db.posting.findUniqueOrThrow({where:{id:post.id}});
 const c=await db.comment.create({data:{posting_id:post.id,author_id:owner,content:'private-comment'}});
 async function check(user,allowed){
  for(const path of[`/posts/${post.id}`,'/posts',`/posts?creatorId=${owner}`]){const r=await request(path,user);assert.equal(r.status,200);const data=(await r.json()).data;const row=data.post||data.posts.find(p=>p.id===post.id);assert.equal(row.canAccess,allowed);assert.equal(row.body,allowed?input.body:'');assert.equal(row.media.length,allowed?2:0);assert.equal(row.requiredPlanId,undefined);}
  for(const path of[`/posts/${post.id}/comments`,`/posts/${post.id}/comments-page`])await status(path,user,allowed?200:403);
  for(const m of media)for(const options of[{},{method:'HEAD'},{headers:{Range:'bytes=0-3'}}]){const r=await request(`/media/${m.id}/file`,user,options);assert.equal(r.status,allowed?(options.headers?206:200):403);assert.equal(r.headers.get('location'),null);await r.arrayBuffer();}
 }
 try{
  for(const change of[{accessLevel:0},{accessLevel:101},{accessLevel:1.5},{accessLevel:'2'},{accessPlanId:plan.id}])assert.equal((await save('/studio/content',{...input,...change})).status,400);
  assert.equal((await save('/studio/content',input,stranger)).status,403);
  for(const minimum of[1,2,3]){
   assert.equal((await save('/studio/content',{...input,accessLevel:minimum})).status,201);
   const overview=await request('/studio/overview',owner);const saved=(await overview.json()).data.management.contents.find(p=>p.id===post.id);assert.equal(saved.accessLevel,minimum);assert.equal(saved.accessPlanId,null);
   for(const rank of[1,2,3]){await db.subscription.update({where:{id:sub.id},data:{...baseSub(),plan_snapshot:{rank,entitlementMode:'exact'}}});await check(fan,rank>=minimum);}
  }
  await check(null,false);await check(stranger,false);await check(owner,true);
  await db.subscription.update({where:{id:sub.id},data:{...baseSub(),membership_item_id:otherPlan.id,plan_snapshot:{rank:3}}});await check(fan,true);
  for(const change of[{membership_item_id:foreignPlan.id},{started_at:new Date(Date.now()+60000)},{ended_at:new Date(0)},{status:'EXPIRED'},{plan_snapshot:{rank:'3'}}]){await db.subscription.update({where:{id:sub.id},data:{...baseSub(),plan_snapshot:{rank:3},...change}});await check(fan,false);}
  await db.subscription.update({where:{id:sub.id},data:{...baseSub(),status:'CANCELLED',auto_renew:false,plan_snapshot:{rank:3}}});await check(fan,true);
  // Historical clients omitting the new field cannot silently make a tier post public.
  const {accessLevel,...oldClient}=input;assert.equal((await save('/studio/content',oldClient)).status,201);assert.equal((await db.posting.findUniqueOrThrow({where:{id:post.id}})).membership_level,3);
  await db.checkoutOrder.update({where:{id:order.id},data:{status:'refunding'}});await check(fan,false);await db.checkoutOrder.update({where:{id:order.id},data:{status:'paid'}});
  assert.equal((await save('/studio/content',{...input,accessLevel:null})).status,201);const publicRow=await db.posting.findUniqueOrThrow({where:{id:post.id}});assert.equal(publicRow.is_membership,false);assert.equal(publicRow.membership_level,null);
 }finally{await db.comment.delete({where:{id:c.id}});await db.posting.update({where:{id:post.id},data:{title:original.title,content:original.content,access_plan_id:plan.id,membership_level:original.membership_level,is_membership:true}});await db.subscription.update({where:{id:sub.id},data:{...baseSub(),plan_snapshot:{rank:1}}});await db.checkoutOrder.update({where:{id:order.id},data:{status:'paid'}});}
});
test('real guarded edge API checks current sessions, ranks, cancellation and refund without S3 bytes',async()=>{
 const read=storage.read;storage.read=async()=>assert.fail('Authorization API must not download S3');
 async function authorize(m,user,method='GET',range=''){
  const uri=`/api/v1/media/${m.id}/edge-authorize`,envelope={purpose:'media',ip:'198.51.100.7',at:String(Date.now()),id:randomUUID(),method:'GET',uri,mediaMethod:method,range,cookie:authCookie(user?cookies[user]:'')};
  const r=await request(uri.slice('/api/v1'.length),user,{headers:{...signedEdgeHeaders(edgeSecret,envelope),...(range?{Range:range}:{})}});const body=await r.json();if(r.status===200)assert.deepEqual(body.data,{delivery:'s3',key:`platform/${m.id}`});return r.status;
 }
 try{
  assert.equal((await request(`/media/${media[0].id}/edge-authorize`,owner)).status,403);
  for(const m of media)for(const [method,range]of[['GET',''],['HEAD',''],['GET','bytes=0-3']]){assert.equal(await authorize(m,owner,method,range),200);assert.equal(await authorize(m,fan,method,range),200);assert.equal(await authorize(m,stranger,method,range),403);assert.equal(await authorize(m,null,method,range),403);}
  assert.equal(await authorize(media[0],fan,'GET','bytes=999999-'),416);
  for(const minimum of[1,2,3]){await db.posting.update({where:{id:post.id},data:{access_plan_id:null,membership_level:minimum}});for(const rank of[1,2,3]){await db.subscription.update({where:{id:sub.id},data:{plan_snapshot:{rank}}});assert.equal(await authorize(media[1],fan),rank>=minimum?200:403);}}
  await db.subscription.update({where:{id:sub.id},data:{plan_snapshot:{rank:3},status:'CANCELLED'}});assert.equal(await authorize(media[1],fan),200);
  await db.checkoutOrder.update({where:{id:order.id},data:{status:'refunding'}});assert.equal(await authorize(media[1],fan),403);await db.checkoutOrder.update({where:{id:order.id},data:{status:'paid'}});
  await db.subscription.update({where:{id:sub.id},data:{ended_at:new Date(0)}});assert.equal(await authorize(media[1],fan),403);
  await db.member.update({where:{id:fan},data:{enabled:false}});assert.ok([401,403].includes(await authorize(media[1],fan)));await db.member.update({where:{id:fan},data:{enabled:true}});
 }finally{storage.read=read;await db.posting.update({where:{id:post.id},data:{access_plan_id:plan.id,membership_level:1}});await db.subscription.update({where:{id:sub.id},data:{...baseSub(),plan_snapshot:{rank:1}}});await db.checkoutOrder.update({where:{id:order.id},data:{status:'paid'}});await db.member.update({where:{id:fan},data:{enabled:true}});}
});
test('S3 orphan cleanup retains referenced media and retries a failed delete without losing the tombstone',async()=>{
 const id=randomUUID(),key=`platform/${id}`,now=new Date('2099-02-03T11:00:00Z'),jobId='media-cleanup-2099-02-03',file=path.join(root,'cleanup');await fs.writeFile(file,'cleanup');await storage.put(id,file,'image/webp',7);
 await db.media.create({data:{id,user_sub:owner,type:'IMAGE',original_name:'cleanup',file_name:id,file_size:7,mime_type:'image/webp',original_url:`/api/v1/media/${id}/file`,s3_upload_key:key,processing_status:'COMPLETED'}});
 const scopedDb=new Proxy(db,{get(target,k){if(k==='media')return new Proxy(target.media,{get(d,n){if(n==='findMany')return args=>d.findMany({...args,where:{...args.where,user_sub:owner}});return d[n];}});const v=target[k];return typeof v==='function'?v.bind(target):v;}});
 const settings=new ConfigService({MEDIA_DELETE_ENABLED:'true',MEDIA_ORPHAN_GRACE_DAYS:'7'});let fail=true;
 const provider={remove:async k=>{assert.equal(k,key);if(fail)throw Error('test provider unavailable');return storage.remove(k);}};
 const jobs=new PlatformJobsService(new PlatformService(scopedDb),{},settings,undefined,undefined,provider);
 try{await assert.rejects(jobs.cleanup(now),/unavailable/);assert.equal((await db.media.findUniqueOrThrow({where:{id}})).is_deleted,true);assert.equal((await db.platformJob.findUniqueOrThrow({where:{id:jobId}})).completed_at,null);fail=false;await db.platformJob.update({where:{id:jobId},data:{locked_until:new Date(0)}});await jobs.cleanup(now);await assert.rejects(s3.send(new HeadObjectCommand({Bucket:resources.bucket,Key:key})),e=>e.$metadata?.httpStatusCode===404);for(const m of media)await s3.send(new HeadObjectCommand({Bucket:resources.bucket,Key:`platform/${m.id}`}));}finally{await db.platformJob.deleteMany({where:{id:jobId}});await fs.unlink(file);}
});
test('separate Chromium sessions cannot open a subscriber copied image/video URL; subscriber plays and seeks',{skip:process.env.CREFANS_S3_BROWSER!=='true',timeout:180000},async()=>{
 const {chromium}=require('../../crefans_front/node_modules/playwright');
 frontLog=await fs.open(path.join(root,'next.log'),'w');frontend=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3011'],{cwd:path.resolve('../crefans_front'),env:{...process.env,CREFANS_E2E:'true',PLATFORM_API_ORIGIN:origin},stdio:['ignore',frontLog.fd,frontLog.fd]});
 for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:3011/preview/login')).ok)break;}catch{}if(i===89)assert.fail('Frontend did not start');await new Promise(r=>setTimeout(r,1000));}
 const browser=await chromium.launch({headless:true});try{
 const contexts=[];
 for(const user of[fan,null,stranger]){const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);if(user)await context.addCookies(cookies[user].split('; ').map(v=>({name:v.split('=')[0],value:v.slice(v.indexOf('=')+1),url:'http://127.0.0.1:3011'})));}
 const page=await contexts[0].newPage(),mediaResponses=[],external=[];page.on('response',r=>{if(r.url().includes('/api/v1/media/'))mediaResponses.push({url:r.url(),status:r.status(),location:r.headers()['location']});if(r.url().includes('cloudfront.net')||r.url().includes('.amazonaws.com'))external.push(r.url());});
 await page.goto(`http://127.0.0.1:3011/service/post/${post.id}`);const video=page.locator('video').first();await video.waitFor({state:'attached'});await page.getByRole('button',{name:'다음 미디어',exact:true}).first().click();await video.evaluate(v=>{v.muted=true;});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).some(v=>v.readyState>=2&&v.videoWidth>0),{},{timeout:60000});
 await video.evaluate(v=>{void v.play().catch(()=>{});v.currentTime=Math.min(2,v.duration/2);});await page.waitForTimeout(800);assert.ok(await video.evaluate(v=>v.currentTime>0&&!v.error));
 assert.ok(mediaResponses.some(r=>r.status===200||r.status===206));assert.ok(mediaResponses.every(r=>!r.location));assert.deepEqual(external,[]);
 for(const m of media){const shared=`http://127.0.0.1:3011${m.url}`;for(const context of contexts.slice(1)){const target=await context.newPage();const result=await target.goto(shared);assert.equal(result.status(),403);assert.equal(result.headers()['location'],undefined);await target.close();}for(const method of['GET','HEAD']){const result=await contexts[2].request.fetch(shared,{method,headers:{Range:'bytes=0-19'}});assert.equal(result.status(),403);}}
 // Reuse the same browser after entitlement expires: the next byte-range request must fail.
 await db.subscription.update({where:{id:sub.id},data:{ended_at:new Date(0)}});const expired=await page.evaluate(async url=>(await fetch(url,{headers:{Range:'bytes=0-19'},cache:'no-store'})).status,media[1].url);assert.equal(expired,403);await db.subscription.update({where:{id:sub.id},data:baseSub()});
 if(process.env.CREFANS_S3_E2E_ARTIFACTS){await fs.mkdir(process.env.CREFANS_S3_E2E_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.CREFANS_S3_E2E_ARTIFACTS,'private-video-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.CREFANS_S3_E2E_ARTIFACTS,'private-video-mobile.png')});}
 console.log('Real S3 + Chromium: subscriber playback/seek; copied image/video URL denied in two other sessions; no storage redirects');
 }finally{await browser.close();}
});

test('Chromium studio saves membership rank and minimum post level, and lower versus higher fan views differ',{skip:process.env.CREFANS_S3_BROWSER!=='true',timeout:120000},async()=>{
 const {chromium}=require('../../crefans_front/node_modules/playwright'),browser=await chromium.launch({headless:true}),base='http://127.0.0.1:3011';
 try{
  const creator=await browser.newContext({viewport:{width:1440,height:1000}});await creator.addCookies(cookies[owner].split('; ').map(v=>({name:v.split('=')[0],value:v.slice(v.indexOf('=')+1),url:base})));
  await db.membershipItem.update({where:{id:plan.id},data:{name:'기본 레벨 검증'}});
  const page=await creator.newPage();await page.goto(base+'/service/studio/memberships');
  await page.locator('article').filter({has:page.getByRole('heading',{name:'기본 레벨 검증',exact:true})}).getByRole('button',{name:'수정',exact:true}).click();await page.getByRole('spinbutton',{name:'멤버십 레벨',exact:true}).fill('3');await page.getByRole('button',{name:'저장하기',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await db.membershipItem.findUniqueOrThrow({where:{id:plan.id}})).level,3);
  await page.goto(base+`/service/studio/content/${post.id}/edit`);
  await page.getByRole('combobox',{name:'공개 범위',exact:true}).click();await page.getByRole('option',{name:'레벨 2 이상',exact:true}).click();await page.getByRole('button',{name:'수정 저장',exact:true}).click();await page.getByText('게시물을 저장했습니다.',{exact:true}).waitFor();
  let stored=await db.posting.findUniqueOrThrow({where:{id:post.id}});assert.equal(stored.access_plan_id,null);assert.equal(stored.membership_level,2);await page.reload();await page.getByRole('combobox',{name:'공개 범위',exact:true}).waitFor();assert.match(await page.getByRole('combobox',{name:'공개 범위',exact:true}).innerText(),/레벨 2 이상/);
  if(process.env.CREFANS_S3_E2E_ARTIFACTS)await page.screenshot({path:path.join(process.env.CREFANS_S3_E2E_ARTIFACTS,'studio-minimum-level.png'),fullPage:true});
  const fanContext=await browser.newContext();await fanContext.addCookies(cookies[fan].split('; ').map(v=>({name:v.split('=')[0],value:v.slice(v.indexOf('=')+1),url:base})));const view=await fanContext.newPage();
  await view.goto(base+`/service/post/${post.id}`);await view.getByText('레벨 2 이상 멤버십으로 볼 수 있습니다.',{exact:true}).waitFor();assert.equal(await view.locator('video').count(),0);
  await db.subscription.update({where:{id:sub.id},data:{plan_snapshot:{rank:3}}});await view.reload();await view.locator('video').first().waitFor({state:'attached'});await view.getByRole('button',{name:'다음 미디어',exact:true}).first().click();await view.waitForFunction(()=>Array.from(document.querySelectorAll('video')).some(v=>v.readyState>=2&&v.videoWidth>0));
  await view.waitForTimeout(500); // Wait for the gallery slide transition before capturing evidence.
  if(process.env.CREFANS_S3_E2E_ARTIFACTS)await view.screenshot({path:path.join(process.env.CREFANS_S3_E2E_ARTIFACTS,'higher-tier-video.png')});
  console.log('Studio UI rank and minimum scope persisted; historical rank1 denied, rank3 video decoded');
 }finally{await browser.close();}
});
