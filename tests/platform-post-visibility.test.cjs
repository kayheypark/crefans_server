require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Post unpublish (2026-11-07): postings.is_public=false shows a post to its author only, on every path that exposes it.
// The author switches it in the studio (no reason); an operator in the console (reason, no notice). Both are kept in history.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
process.env.BEAN_LEDGER_ENABLED='true';process.env.BETA_MODE='false';
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest,hashPassword}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context'),{releaseHeldNotices}=require('../dist/src/platform/post-notices'),{TIP_PROVISION}=require('../dist/src/platform/creator-provision');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),ids={creator:randomUUID(),other:randomUUID(),fan:randomUUID(),subscriber:randomUUID()},admins=[],cookies={},posts=[],media=[];let app,origin,release,postId,memberPostId,plan;
async function api(path,actor,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1'+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const type=res.headers.get('content-type')||'';return{status:res.status,...(type.includes('json')?await res.json():{})};}
async function session(name,id){const token='la.'+randomBytes(32).toString('base64url');cookies[name]='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
const visible=async(actor,id=postId)=>(await api('/posts/'+id,actor)).status===200;
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-visibility-schema-'));try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [name,id] of Object.entries(ids)){await db.member.create({data:{id,email:`${name}-${tag}@visibility.test.invalid`,password_hash:await hashPassword('Visibility!'+tag),nickname:name,name,preferred_username:name+tag,email_verified:true,status:'CONFIRMED'}});await session(name,id);}
 const category=await db.creatorCategory.findFirst({where:{is_active:true,is_deleted:false}});
 await db.creator.create({data:{user_id:ids.creator,display_name:'공개 전환 크리에이터',handle:'vis'+tag,category_id:category?.id}});await db.creator.create({data:{user_id:ids.other,display_name:'다른 크리에이터',handle:'oth'+tag}});
 postId=(await db.posting.create({data:{user_sub:ids.creator,title:'미공개 검증 '+tag,content:'공개 본문',status:'PUBLISHED',is_public:true,published_at:new Date()}})).id;posts.push(postId);
 plan=await db.membershipItem.create({data:{creator_id:ids.creator,name:'L1 '+tag,level:1,price:1000,benefits:'[]',billing_unit:'MONTH'}});
 memberPostId=(await db.posting.create({data:{user_sub:ids.creator,title:'구독자 글 '+tag,content:'구독자 본문',status:'PUBLISHED',is_public:true,is_membership:true,membership_level:1,published_at:new Date()}})).id;posts.push(memberPostId);
 await db.subscription.create({data:{subscriber_id:ids.subscriber,membership_item_id:plan.id,amount:1000,started_at:new Date(Date.now()-60000),ended_at:new Date(Date.now()+86400000),plan_snapshot:{rank:1}}});
 const m=await db.media.create({data:{user_sub:ids.creator,type:'IMAGE',original_name:'x.jpg',file_name:'x',file_size:1,mime_type:'image/jpeg',original_url:'',s3_upload_key:'local/missing-'+tag,processing_status:'COMPLETED',processed_at:new Date()}});media.push(m.id);await db.postingMedia.create({data:{posting_id:postId,media_id:m.id,sort_order:0}});
 for(const [name,permissions]of[['moderator',{content:{view:true,update:true}}],['reader',{content:{view:true}}]]){const a=await db.admin.create({data:{user_sub:randomUUID(),name:name+'-'+tag,email:randomUUID()+'@visibility.test.invalid',role:'ADMIN',permissions}});admins.push(a.id);cookies[name]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();const all=[...posts,...Object.values(ids)];await db.moderationAction.deleteMany({where:{target_id:{in:all}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:all}}});await db.memberNotification.deleteMany({where:{member_id:{in:Object.values(ids)}}});await db.postViewWindow.deleteMany({where:{posting_id:{in:posts}}});await db.postMetric.deleteMany({where:{posting_id:{in:posts}}});await db.savedPost.deleteMany({where:{posting_id:{in:posts}}});await db.postingLike.deleteMany({where:{posting_id:{in:posts}}});await db.comment.deleteMany({where:{posting_id:{in:posts}}});await db.postingMedia.deleteMany({where:{posting_id:{in:posts}}});await db.media.deleteMany({where:{id:{in:media}}});await db.posting.deleteMany({where:{id:{in:posts}}});await db.subscription.deleteMany({where:{membership_item_id:plan?.id}});await db.membershipItem.deleteMany({where:{creator_id:ids.creator}});await db.userFollow.deleteMany({where:{following_id:ids.creator}});await db.creator.deleteMany({where:{user_id:{in:[ids.creator,ids.other]}}});await db.memberSession.deleteMany({where:{member_id:{in:Object.values(ids)}}});await db.admin.deleteMany({where:{id:{in:admins}}});await db.member.deleteMany({where:{id:{in:Object.values(ids)}}});await db.$disconnect();await release?.();});

test('only the author (studio) and content.update operators can switch visibility; input is checked',async()=>{
 assert.equal((await api(`/studio/content/${postId}/visibility`,null,{public:false},'PUT')).status,401);
 assert.equal((await api(`/studio/content/${postId}/visibility`,'other',{public:false},'PUT')).status,404,'another creator cannot touch the post');
 assert.equal((await api(`/studio/content/${postId}/visibility`,'fan',{public:false},'PUT')).status,404);
 assert.equal((await api(`/studio/content/${postId}/visibility`,'creator',{public:'no'},'PUT')).status,400);
 assert.equal((await api(`/admin/posts/${postId}/visibility`,null,{public:false,reason:'x'})).status,401);
 assert.equal((await api(`/admin/posts/${postId}/visibility`,'creator',{public:false,reason:'x'})).status,401,'a member session is not an operator session');
 assert.equal((await api(`/admin/posts/${postId}/visibility`,'reader',{public:false,reason:'x'})).status,403);
 assert.equal((await api(`/admin/posts/${postId}/visibility`,'moderator',{public:false})).status,400,'operators must give a reason');
 assert.equal((await api(`/admin/posts/${postId}/visibility`,'moderator',{public:false,reason:'   '})).status,400);
 assert.equal((await db.posting.findUnique({where:{id:postId}})).is_public,true,'refused requests change nothing');
 assert.equal(await db.moderationAction.count({where:{target_id:postId}}),0);});

test('an unpublished post disappears for fans, subscribers and guests on every path but stays for its author',async()=>{
 // Before: the fan sees, saves and likes the post; the subscriber sees the members-only post.
 assert.equal(await visible('fan'),true);assert.equal(await visible('subscriber',memberPostId),true);
 assert.equal((await api(`/posts/${postId}/save`,'fan',{enabled:true},'PUT')).status,200);
 assert.notEqual((await api(`/media/${media[0]}/file`,'fan')).status,403,'public media is not refused');
 const countBefore=(await api(`/profiles/${ids.creator}`,'fan')).data.postCount;
 for(const id of[postId,memberPostId]){const r=await api(`/studio/content/${id}/visibility`,'creator',{public:false},'PUT');assert.equal(r.status,200,r.errorMessage);assert.match(r.data.message,/미공개/);}
 assert.equal((await api(`/studio/content/${postId}/visibility`,'creator',{public:false},'PUT')).data.message,'이미 미공개인 게시물입니다.');
 // Detail and direct link
 for(const actor of['fan','subscriber',null,'other'])assert.equal(await visible(actor),false,`detail hidden for ${actor}`);
 assert.equal(await visible('subscriber',memberPostId),false,'membership subscribers lose it too');
 const own=await api('/posts/'+postId,'creator');assert.equal(own.status,200);assert.equal(own.data.post.canAccess,true);assert.equal(own.data.post.body,'공개 본문');
 // Feed, profile list/count, saved collection, search-backed bootstrap
 for(const actor of['fan','subscriber',null]){const feed=await api('/bootstrap',actor);assert.equal(feed.data.data.posts.some(p=>[postId,memberPostId].includes(p.id)),false);const list=await api(`/posts?creatorId=${ids.creator}`,actor);assert.equal(list.data.posts.some(p=>[postId,memberPostId].includes(p.id)),false);const page=await api('/posts',actor);assert.equal(page.data.posts.some(p=>[postId,memberPostId].includes(p.id)),false);}
 assert.equal((await api('/bootstrap?collection=saved','fan')).data.data.posts.some(p=>p.id===postId),false,'saved collection drops it');
 assert.equal((await api(`/profiles/${ids.creator}`,'fan')).data.postCount,countBefore-2);
 // Interactions
 assert.equal((await api(`/posts/${postId}/comments`,'fan')).status,403);assert.equal((await api(`/posts/${postId}/comments-page`,'fan')).status,403);
 assert.equal((await api(`/posts/${postId}/comments`,'fan',{body:'안녕하세요'})).status,403);assert.equal((await api(`/posts/${memberPostId}/comments`,'subscriber',{body:'안녕하세요'})).status,403);
 assert.equal((await api(`/posts/${postId}/like`,'fan',{enabled:true},'PUT')).status,403);assert.equal((await api(`/posts/${postId}/save`,'fan',{enabled:true},'PUT')).status,403);
 assert.equal((await api(`/posts/${postId}/mention-candidates`,'fan')).status,403);
 const tip=await api(`/creators/${ids.creator}/tips`,'fan',{quantity:1,requestId:randomUUID(),postId,creatorProvision:TIP_PROVISION.version});assert.equal(tip.errorCode,'POST_ACCESS_REQUIRED',tip.errorMessage);
 // Media, share image, views
 assert.equal((await api(`/media/${media[0]}/file`,'fan')).status,403);assert.equal((await api(`/media/${media[0]}/file`)).status,403);
 assert.notEqual((await api(`/media/${media[0]}/file`,'creator')).status,403,'the author still reaches the file');
 const share=await api(`/media/posts/${postId}/share-image`);assert.equal(share.status,302);
 const view=await api(`/posts/${postId}/views`,'fan',{kind:'detail',source:'direct',visitor:randomUUID()});assert.equal(view.data.recorded,false);
 // Studio shows the state; the author can still comment on their own post.
 const studio=await api('/studio/overview','creator');const row=studio.data.management.contents.find(c=>c.id===postId);assert.equal(row.unpublished,true);assert.equal(row.hiddenByOperator,undefined);
 assert.equal((await api(`/posts/${postId}/comments`,'creator',{body:'작성자 메모'})).status,201);
 // Republish restores everything as it was.
 const back=await api(`/studio/content/${postId}/visibility`,'creator',{public:true},'PUT');assert.equal(back.data.message,'게시물을 다시 공개했습니다.');
 assert.equal(await visible('fan'),true);assert.equal((await api('/bootstrap?collection=saved','fan')).data.data.posts.some(p=>p.id===postId),true,'the earlier save is kept');
 assert.equal((await api(`/posts/${postId}/like`,'fan',{enabled:true},'PUT')).status,200);
 assert.equal((await api('/studio/overview','creator')).data.management.contents.find(c=>c.id===postId).unpublished,undefined);});

test('operator switch needs a reason, sends no notice, and both actors appear in the console history',async()=>{
 const notices=await db.memberNotification.count({where:{member_id:ids.creator}});
 const off=await api(`/admin/posts/${postId}/visibility`,'moderator',{public:false,reason:'신고 검토 중 임시 미공개'});assert.equal(off.status,201,off.errorMessage);
 assert.equal(await visible('fan'),false);
 const on=await api(`/admin/posts/${postId}/visibility`,'moderator',{public:true,reason:'검토 완료'});assert.equal(on.status,201);assert.equal(await visible('fan'),true);
 assert.equal(await db.memberNotification.count({where:{member_id:ids.creator}}),notices,'the creator is not notified');
 const history=await api(`/admin/posts/${postId}/moderation`,'reader');assert.equal(history.status,200);
 assert.deepEqual(history.data.map(h=>[h.action,h.actorType,h.actorName,h.reason]),[
  ['post.republished','admin','moderator-'+tag,'검토 완료'],['post.unpublished','admin','moderator-'+tag,'신고 검토 중 임시 미공개'],
  ['post.republished','creator','공개 전환 크리에이터',null],['post.unpublished','creator','공개 전환 크리에이터',null]]);
 assert.equal(history.data[2].actorId,ids.creator);assert.ok(history.data.every(h=>h.createdAt));
 const audit=await db.platformAuditLog.findMany({where:{entity_id:postId},select:{action:true,category:true}});
 for(const action of['creator.post_unpublished','creator.post_republished','admin.post_unpublished','admin.post_republished'])assert.ok(audit.some(a=>a.action===action),action);});

test('operator hiding and creator unpublish are separate: either one hides, the creator cannot lift the operator hiding',async()=>{
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:true,reason:'저작권 신고',publicReason:'저작권 침해 신고 확인'})).status,201);
 assert.equal((await api(`/studio/content/${postId}/visibility`,'creator',{public:false},'PUT')).status,200);
 const republished=await api(`/studio/content/${postId}/visibility`,'creator',{public:true},'PUT');assert.match(republished.data.message,/운영 정책에 따라 숨겨진/);
 assert.equal(await visible('fan'),false,'still hidden by the operator');
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'creator',{hidden:false,reason:'x',publicReason:'x'})).status,401,'creators have no operator route');
 const row=(await api('/studio/overview','creator')).data.management.contents.find(c=>c.id===postId);assert.equal(row.hiddenByOperator,true);assert.equal(row.unpublished,undefined);
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:false,reason:'해제',publicReason:'소명 확인'})).status,201);assert.equal(await visible('fan'),true);});

test('follower notice of a post published while unpublished waits until it is public again',async()=>{
 await db.userFollow.create({data:{follower_id:ids.fan,following_id:ids.creator}});
 const saved=await api('/studio/content','creator',{title:'나중 공개 '+tag,body:'본문',media:[],commentsEnabled:true,status:'draft'});assert.equal(saved.status,201,saved.errorMessage);posts.push(saved.data.id);
 assert.equal((await api(`/studio/content/${saved.data.id}/visibility`,'creator',{public:false},'PUT')).status,200);
 const published=await api('/studio/content','creator',{id:saved.data.id,title:'나중 공개 '+tag,body:'본문',media:[],commentsEnabled:true,status:'published'});assert.equal(published.status,201,published.errorMessage);
 const notices=()=>db.memberNotification.count({where:{member_id:ids.fan,type:'content',path:`/post/${saved.data.id}`}});
 assert.equal(await notices(),0,'no notice while unpublished');assert.equal((await db.posting.findUnique({where:{id:saved.data.id}})).notify_pending,true);
 await releaseHeldNotices(db);assert.equal(await notices(),0,'the worker keeps holding it');
 assert.equal((await api(`/studio/content/${saved.data.id}/visibility`,'creator',{public:true},'PUT')).status,200);
 await releaseHeldNotices(db);assert.equal(await notices(),1,'announced once when it becomes public');
 await releaseHeldNotices(db);assert.equal(await notices(),1);});
