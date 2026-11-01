require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Terms §8 operator actions: hidden posts disappear for everyone but the author; suspended members cannot sign in.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest,hashPassword}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),ids={creator:randomUUID(),fan:randomUUID()},admins=[],cookies={},password='Moderation!'+tag;let app,origin,release,postId;
async function api(path,actor,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
async function session(name,id){const token='la.'+randomBytes(32).toString('base64url');cookies[name]='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-moderation-schema-'));try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [name,id] of Object.entries(ids)){await db.member.create({data:{id,email:`${name}-${tag}@moderation.test.invalid`,password_hash:await hashPassword(password),nickname:name,name,preferred_username:name+tag,email_verified:true,status:'CONFIRMED'}});await session(name,id);}
 await db.creator.create({data:{user_id:ids.creator,display_name:'조치 검증 크리에이터',handle:'mod'+tag}});
 postId=(await db.posting.create({data:{user_sub:ids.creator,title:'조치 검증 '+tag,content:'공개 본문',status:'PUBLISHED',is_public:true,published_at:new Date()}})).id;
 for(const [name,permissions]of[['moderator',{content:{view:true,update:true},members:{view:true,update:true}}],['reader',{content:{view:true},members:{view:true}}]]){const a=await db.admin.create({data:{user_sub:randomUUID(),name,email:randomUUID()+'@moderation.test.invalid',role:'ADMIN',permissions}});admins.push(a.id);cookies[name]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();await db.moderationAction.deleteMany({where:{target_id:{in:[postId,...Object.values(ids)]}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:[postId,...Object.values(ids)]}}});await db.posting.deleteMany({where:{id:postId}});await db.creator.deleteMany({where:{user_id:ids.creator}});await db.memberSession.deleteMany({where:{member_id:{in:Object.values(ids)}}});await db.admin.deleteMany({where:{id:{in:admins}}});await db.member.deleteMany({where:{id:{in:Object.values(ids)}}});await db.$disconnect();await release?.();});

test('moderation endpoints need the matching menu permission and a reason',async()=>{
 assert.equal((await api(`/admin/posts/${postId}/moderation`,null,{hidden:true,publicReason:'운영 정책 위반',reason:'x'})).status,401);
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'reader',{hidden:true,publicReason:'운영 정책 위반',reason:'x'})).status,403);
 assert.equal((await api(`/admin/members/${ids.fan}/suspension`,'reader',{suspended:true,days:7,publicReason:'운영 정책 위반',reason:'x'})).status,403);
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:true})).status,400);
 assert.equal((await api(`/admin/members/${ids.fan}/suspension`,'moderator',{suspended:true,days:3,reason:'x'})).status,400);});
test('a hidden post leaves feed, detail, comments and tips for others but stays listed for its author',async()=>{
 assert.equal((await api('/posts/'+postId,'fan')).status,200);
 const hidden=await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:true,publicReason:'운영 정책 위반',reason:'신고 확인: 저작권 침해'});assert.equal(hidden.status,201,hidden.errorMessage);
 assert.equal((await api('/posts/'+postId,'fan')).status,404);assert.equal((await api('/posts/'+postId)).status,404);
 assert.equal((await api(`/posts/${postId}/comments`,'fan')).status,403);
 const feed=await api('/bootstrap','fan');assert.equal(feed.data.data.posts.some(p=>p.id===postId),false);
 const studio=await api('/studio/overview','creator');const own=studio.data.management.contents.find(c=>c.id===postId);assert.ok(own,'author still sees the post');assert.equal(own.hiddenByOperator,true);
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:false,publicReason:'운영 정책 위반',reason:'이의제기 인용'})).status,201);assert.equal((await api('/posts/'+postId,'fan')).status,200);
 const history=await api(`/admin/posts/${postId}/moderation`,'reader');assert.deepEqual(history.data.map(h=>[h.action,h.reason,h.adminName]),[['post.unhidden','이의제기 인용','moderator'],['post.hidden','신고 확인: 저작권 침해','moderator']]);});
test('a suspended member loses sessions, cannot sign in until released, and the record keeps the period',async()=>{
 assert.equal((await api('/me','fan')).status===401,false);
 const r=await api(`/admin/members/${ids.fan}/suspension`,'moderator',{suspended:true,days:7,publicReason:'운영 정책 위반',reason:'반복 스팸'});assert.equal(r.status,201,r.errorMessage);
 assert.equal(await db.memberSession.count({where:{member_id:ids.fan}}),0);
 const wrong=await api('/auth/login',null,{email:`fan-${tag}@moderation.test.invalid`,password:'wrong-'+tag});assert.notEqual(wrong.errorCode,'ACCOUNT_SUSPENDED','a wrong password must not reveal the restriction');
 const login=await api('/auth/login',null,{email:`fan-${tag}@moderation.test.invalid`,password});assert.equal(login.status,403);assert.equal(login.errorCode,'ACCOUNT_SUSPENDED');assert.match(login.errorMessage,/이용이 제한된 계정입니다\(.+까지\)/);
 const row=await db.member.findUnique({where:{id:ids.fan}});assert.ok(Math.abs(row.suspended_until-Date.now()-7*86400000)<60000);
 await db.member.update({where:{id:ids.fan},data:{suspended_until:new Date(Date.now()-1000)}});assert.equal((await api('/auth/login',null,{email:`fan-${tag}@moderation.test.invalid`,password})).status,201,'an expired restriction no longer blocks');
 assert.equal((await api(`/admin/members/${ids.fan}/suspension`,'moderator',{suspended:true,days:null,publicReason:'운영 정책 위반',reason:'무기한'})).status,201);assert.equal((await api('/auth/login',null,{email:`fan-${tag}@moderation.test.invalid`,password})).errorMessage.includes('운영자가 해제할 때까지'),true);
 assert.equal((await api(`/admin/members/${ids.fan}/suspension`,'moderator',{suspended:false,publicReason:'운영 정책 위반',reason:'해제'})).status,201);assert.equal((await api('/auth/login',null,{email:`fan-${tag}@moderation.test.invalid`,password})).status,201);
 const history=await api(`/admin/members/${ids.fan}/suspension`,'reader');assert.deepEqual(history.data.map(h=>h.action),['member.unsuspended','member.suspended','member.suspended']);assert.equal(history.data[2].until!==null,true);assert.equal(history.data[1].until,null);});
test('reports keep the reason the reporter chose; an unknown reason is refused and a missing one is filed as other',async()=>{
 await session('fan',ids.fan);const before=new Date();
 assert.equal((await api('/reports','fan',{id:postId,kind:'POSTING',reason:'NOT_A_REASON'})).status,400);
 assert.equal((await api('/reports','fan',{id:postId,kind:'POSTING',reason:'PRIVACY'})).status,201);
 assert.equal((await api('/reports','fan',{id:postId,kind:'POSTING'})).status,201);
 const rows=await db.userReport.findMany({where:{reporter_id:ids.fan,created_at:{gte:new Date(before.getTime()-1000)}},orderBy:{created_at:'asc'}});
 assert.deepEqual(rows.map(r=>r.reason),['PRIVACY','OTHER']);await db.userReport.deleteMany({where:{reporter_id:ids.fan}});});
test('beta review queue lists unchecked published posts; review or hide removes them and an author edit puts them back',async()=>{
 const queue=async()=>(await api('/admin/posts?review=pending','reader')).data.items.map(p=>p.id);
 await db.posting.update({where:{id:postId},data:{reviewed_at:null,hidden_at:null}});
 assert.ok((await queue()).includes(postId));assert.equal((await api('/admin/posts?review=other','reader')).status,400);
 assert.equal((await api(`/admin/posts/${postId}/review`,'reader',{})).status,403);
 assert.equal((await api(`/admin/posts/${postId}/review`,'moderator',{})).status,201);assert.equal((await queue()).includes(postId),false);
 await session('creator',ids.creator);const edit=await api('/studio/content','creator',{id:postId,title:'수정됨 '+tag,body:'수정한 본문',media:[],commentsEnabled:true,accessPlanId:null,accessLevel:null,status:'published'});
 assert.ok([200,201].includes(edit.status),edit.errorMessage);assert.ok((await queue()).includes(postId),'an author edit needs a new review');
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:true,publicReason:'운영 정책 위반',reason:'검수 중 부적절'})).status,201);assert.equal((await queue()).includes(postId),false,'hiding is a review decision');
 const history=await api(`/admin/posts/${postId}/moderation`,'reader');assert.ok(history.data.some(h=>h.action==='post.reviewed'));});
test('withdrawal waits 30 days, then posts are deleted, personal data is erased and comments read as a withdrawn user',async()=>{
 const {purgeWithdrawnMembers}=require('../dist/src/platform/member-purge');
 await db.posting.update({where:{id:postId},data:{hidden_at:null}});
 const id=randomUUID(),email=`leaving-${tag}@moderation.test.invalid`;
 await db.member.create({data:{id,email,password_hash:await hashPassword(password),nickname:'떠나는 크리에이터',name:'실명',preferred_username:'leave'+tag,phone_number:'01000000000',picture:'/p.png',email_verified:true,status:'CONFIRMED'}});
 await db.creator.create({data:{user_id:id,display_name:'떠나는 크리에이터',handle:'leave'+tag,bio:'소개'}});
 const post=await db.posting.create({data:{user_sub:id,title:'남길 글',content:'본문',status:'PUBLISHED',is_public:true}});
 const comment=await db.comment.create({data:{posting_id:postId,author_id:id,content:'남긴 댓글'}});
 await db.billingMethod.create({data:{member_id:id,billing_key_encrypted:'x',label:'카드',last_four:'1234'}});
 await session('leaving',id);const w=await api('/me/withdraw','leaving',{});assert.ok([200,201].includes(w.status),w.errorMessage);
 let row=await db.member.findUnique({where:{id}});assert.ok(row.withdrawn_at);assert.equal(row.enabled,false);
 assert.ok((await db.billingMethod.findFirst({where:{member_id:id}})).deleted_at,'card key is released at withdrawal');
 await db.member.update({where:{id},data:{withdrawn_at:new Date(Date.now()-29*86400000)}});await purgeWithdrawnMembers(db);
 assert.equal((await db.member.findUnique({where:{id}})).email,email,'nothing is erased during the grace period');
 await db.member.update({where:{id},data:{withdrawn_at:new Date(Date.now()-31*86400000)}});await purgeWithdrawnMembers(db);
 row=await db.member.findUnique({where:{id}});
 assert.deepEqual([row.email,row.name,row.nickname,row.phone_number,row.picture,row.password_hash,row.identity_hash],[`withdrawn-${id}@deleted.invalid`,'','탈퇴한 사용자','',null,null,null]);assert.ok(row.purged_at);
 assert.equal((await db.posting.findUnique({where:{id:post.id}})).is_deleted,true);
 const c=await db.creator.findUnique({where:{user_id:id}});assert.deepEqual([c.display_name,c.handle,c.bio],['탈퇴한 사용자',null,null]);
 assert.equal((await db.comment.findUnique({where:{id:comment.id}})).content,'남긴 댓글','comments stay, anonymized at display');
 await session('fan',ids.fan);const listed=await api(`/posts/${postId}/comments`,'fan');assert.ok(JSON.stringify(listed.data).includes('탈퇴한 사용자'));assert.equal(JSON.stringify(listed.data).includes('떠나는 크리에이터'),false);
 assert.equal(await purgeWithdrawnMembers(db),0,'purge runs once');
 await db.comment.deleteMany({where:{id:comment.id}});await db.posting.deleteMany({where:{id:post.id}});await db.billingMethod.deleteMany({where:{member_id:id}});await db.creator.deleteMany({where:{user_id:id}});await db.platformAuditLog.deleteMany({where:{entity_id:id}});await db.member.deleteMany({where:{id}});});
test('fans edit and delete only their own comments; edited is flagged and a deleted comment with replies stays as a placeholder',async()=>{
 await db.posting.update({where:{id:postId},data:{hidden_at:null}});await session('fan',ids.fan);await session('creator',ids.creator);
 const add=await api(`/posts/${postId}/comments`,'fan',{body:'첫 댓글'});assert.ok([200,201].includes(add.status),add.errorMessage);
 const list=async(actor='fan',parentId)=>(await api(`/posts/${postId}/comments${parentId?`?parentId=${parentId}`:''}`,actor)).data;
 const mine=(await list()).find(c=>c.body==='첫 댓글');assert.equal(mine.own,true);assert.equal(mine.edited,undefined);assert.equal((await list('creator')).find(c=>c.id===mine.id).own,undefined);
 assert.equal((await api(`/posts/${postId}/comments/${mine.id}`,'creator',{body:'남의 수정'},'PUT')).errorCode,'NOT_COMMENT_AUTHOR');
 assert.ok([200].includes((await api(`/posts/${postId}/comments/${mine.id}`,'fan',{body:'고친 댓글'},'PUT')).status));
 const edited=(await list()).find(c=>c.id===mine.id);assert.equal(edited.body,'고친 댓글');assert.equal(edited.edited,true);
 await api(`/posts/${postId}/comments`,'creator',{body:'작성자 답글',parentId:mine.id});
 assert.equal((await api(`/posts/${postId}/comments/${mine.id}`,'creator',undefined,'DELETE')).errorCode,'NOT_COMMENT_AUTHOR');
 const before=(await db.posting.findUnique({where:{id:postId}})).comment_count;assert.equal((await api(`/posts/${postId}/comments/${mine.id}`,'fan',undefined,'DELETE')).status,200);
 const placeholder=(await list('creator')).find(c=>c.id===mine.id);assert.deepEqual([placeholder.deleted,placeholder.body,placeholder.author.name,placeholder.replyCount],[true,'','',1]);
 assert.equal((await db.posting.findUnique({where:{id:postId}})).comment_count,before-1);
 const reply=(await list('creator',mine.id))[0];assert.equal((await api(`/posts/${postId}/comments/${reply.id}`,'creator',undefined,'DELETE')).status,200);
 assert.equal((await list()).some(c=>c.id===mine.id),false,'a deleted comment with no replies left disappears');
 assert.equal((await api(`/posts/${postId}/comments/${mine.id}`,'fan',{body:'다시'},'PUT')).status,404);
 await db.comment.deleteMany({where:{posting_id:postId}});});
