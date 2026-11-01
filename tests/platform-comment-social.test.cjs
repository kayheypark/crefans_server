require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// D9 comment rules: a blocked fan cannot comment, comments notify and tag people, comments can be reported and hidden by an operator.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest,hashPassword}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),names={creator:'크리'+tag,fan:'지민'+tag,other:'서연'+tag,twinA:'동명'+tag,twinB:'동명'+tag,outsider:'외부'+tag},ids=Object.fromEntries(Object.keys(names).map(k=>[k,randomUUID()])),admins=[],cookies={};let app,origin,release,postId;
const page='하늘'+tag;
async function api(path,actor,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
async function session(name,id){const token='la.'+randomBytes(32).toString('base64url');cookies[name]='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
const notices=member=>db.memberNotification.findMany({where:{member_id:member},orderBy:{created_at:'asc'}});
const comment=async(actor,body,parentId)=>{const r=await api(`/posts/${postId}/comments`,actor,parentId?{body,parentId}:{body});return r;};
const find=async(body,parentId)=>(await db.comment.findFirst({where:{posting_id:postId,content:body,...(parentId?{parent_id:parentId}:{})}}));
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-comment-social-schema-'));try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [key,id] of Object.entries(ids)){await db.member.create({data:{id,email:`${key}-${tag}@comment-social.test.invalid`,password_hash:await hashPassword('Comment!'+tag),nickname:names[key],name:names[key],preferred_username:key+tag,email_verified:true,status:'CONFIRMED'}});await session(key,id);}
 await db.creator.create({data:{user_id:ids.creator,display_name:page,handle:'cs'+tag}});
 postId=(await db.posting.create({data:{user_sub:ids.creator,title:'댓글 검증 '+tag,content:'공개 본문',status:'PUBLISHED',is_public:true,allow_comments:true,published_at:new Date()}})).id;
 for(const [name,permissions]of[['moderator',{content:{view:true,update:true}}],['reader',{content:{view:true}}]]){const a=await db.admin.create({data:{user_sub:randomUUID(),name,email:randomUUID()+'@comment-social.test.invalid',role:'ADMIN',permissions}});admins.push(a.id);cookies[name]=await require('./admin-session.cjs')(db,a.id);}
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();const comments=(await db.comment.findMany({where:{posting_id:postId},select:{id:true}})).map(c=>c.id);await db.userReport.deleteMany({where:{reporter_id:{in:Object.values(ids)}}});await db.moderationAction.deleteMany({where:{target_id:{in:comments}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:comments}}});await db.comment.deleteMany({where:{posting_id:postId,parent_id:{not:null}}});await db.comment.deleteMany({where:{posting_id:postId}});await db.memberNotification.deleteMany({where:{member_id:{in:Object.values(ids)}}});await db.memberBlock.deleteMany({where:{member_id:{in:Object.values(ids)}}});await db.posting.deleteMany({where:{id:postId}});await db.creator.deleteMany({where:{user_id:ids.creator}});await db.memberSession.deleteMany({where:{member_id:{in:Object.values(ids)}}});await db.admin.deleteMany({where:{id:{in:admins}}});await db.member.deleteMany({where:{id:{in:Object.values(ids)}}});await db.$disconnect();await release?.();});

test('a comment notifies the post author and a reply notifies the parent author, never the writer, under the 댓글 filter',async()=>{
 const first=await comment('fan','첫 댓글이에요');assert.equal(first.status,201,first.errorMessage);
 assert.deepEqual((await notices(ids.creator)).map(n=>[n.type,n.text,n.actor_id,n.path]),[['comment','내 게시물에 새 댓글이 달렸습니다.',ids.fan,`/post/${postId}`]]);
 assert.equal((await notices(ids.fan)).length,0,'no notice for your own comment');
 const parent=await find('첫 댓글이에요');assert.equal((await comment('other','저도요',parent.id)).status,201);
 assert.deepEqual((await notices(ids.fan)).map(n=>[n.type,n.text,n.actor_id]),[['comment','내 댓글에 답글이 달렸습니다.',ids.other]]);
 assert.equal((await notices(ids.creator)).length,1,'a reply notifies the parent author only');
 assert.equal((await comment('fan','제 글에 제가 답글',parent.id)).status,201);assert.equal((await notices(ids.fan)).length,1,'answering your own comment notifies nobody');
 const boot=await api('/bootstrap','creator');assert.equal(boot.data.data.notifications.find(n=>n.text==='내 게시물에 새 댓글이 달렸습니다.').type,'댓글');});

test('"@이름" tags a participant once; shared names, outsiders and yourself are not tagged; the page name tags the creator',async()=>{
 assert.equal((await comment('twinA','저 A')).status,201);assert.equal((await comment('twinB','저 B')).status,201);
 const before=(await notices(ids.fan)).length;
 const body=`@${names.fan} @${names.twinA} @${names.outsider} @${names.other} @${page} 반가워요 @${names.fan}`;assert.equal((await comment('other',body)).status,201);
 const row=await find(body);assert.deepEqual(row.mentions.map(m=>m.id).sort(),[ids.creator,ids.fan].sort());
 const fan=(await notices(ids.fan)).slice(before);assert.deepEqual(fan.map(n=>n.text),['댓글에서 회원님을 언급했습니다.'],'one notice per tagged person');
 assert.equal((await notices(ids.creator)).at(-1).text,'내 게시물에 새 댓글이 달렸습니다.','the creator gets one notice, not two');
 assert.equal((await notices(ids.twinA)).length,0);assert.equal((await notices(ids.outsider)).length,0);
 const list=await api(`/posts/${postId}/comments`,'fan');const shown=list.data.find(c=>c.body===body);assert.deepEqual(shown.mentions.map(m=>m.name).sort(),[names.fan,page].sort());
 const edited=await api(`/posts/${postId}/comments/${row.id}`,'other',{body:'태그 없이 고침'},'PUT');assert.equal(edited.status,200,edited.errorMessage);
 assert.deepEqual((await db.comment.findUnique({where:{id:row.id}})).mentions,[],'editing re-reads the tags from the new text');
 const many=Array.from({length:12},(_,i)=>names.fan).join(' ');assert.equal((await comment('other','@'+many)).status,201,'repeated tags of one person are fine');});

test('mention candidates are the creator and visible commenters, without yourself, outsiders or blocked people',async()=>{
 assert.equal((await api(`/posts/${postId}/mention-candidates`)).status,401);
 const r=await api(`/posts/${postId}/mention-candidates`,'other');assert.equal(r.status,200,r.errorMessage);
 const got=r.data.map(c=>c.name);assert.ok(got.includes(page)&&got.includes(names.fan));assert.equal(got.includes(names.other),false);assert.equal(got.includes(names.outsider),false);assert.equal(got.filter(n=>n===names.twinA).length,2);
 assert.deepEqual(Object.keys(r.data[0]).sort(),['image','name'],'member ids are not exposed');
 await db.memberBlock.create({data:{member_id:ids.fan,target_id:ids.other}});
 assert.equal((await api(`/posts/${postId}/mention-candidates`,'other')).data.some(c=>c.name===names.fan),false);
 const before=(await notices(ids.fan)).length;assert.equal((await comment('other',`@${names.fan} 차단 뒤 태그`)).status,201);assert.equal((await notices(ids.fan)).length,before,'a block stops the notice');
 await db.memberBlock.deleteMany({where:{member_id:ids.fan}});});

test('a fan the creator blocked cannot comment or reply, but earlier comments stay',async()=>{
 const parent=await find('첫 댓글이에요');
 assert.equal((await api('/members/'+ids.fan+'/block','creator',{enabled:true},'PUT')).status,200);
 for(const r of [await comment('fan','차단 뒤 댓글'),await comment('fan','차단 뒤 답글',parent.id)]){assert.equal(r.status,403);assert.equal(r.errorCode,'COMMENT_BLOCKED');}
 assert.ok((await api(`/posts/${postId}/comments`,'other')).data.some(c=>c.body==='첫 댓글이에요'));
 assert.equal((await comment('other','다른 팬은 그대로')).status,201);
 assert.equal((await api('/members/'+ids.fan+'/block','creator',{enabled:false},'PUT')).status,200);assert.equal((await comment('fan','해제 뒤 댓글')).status,201);});

test('a comment can be reported; the operator sees it in the report list and can hide it from every list',async()=>{
 const target=await find('다른 팬은 그대로');
 assert.equal((await api('/reports','fan',{id:randomUUID(),kind:'COMMENT',reason:'SPAM'})).status,404);
 const reported=await api('/reports','fan',{id:target.id,kind:'COMMENT',reason:'SPAM'});assert.equal(reported.status,201,reported.errorMessage);
 const row=await db.userReport.findFirst({where:{reporter_id:ids.fan,target_id:target.id}});assert.equal(row.target_type,'COMMENT');
 const listed=(await api('/admin/reports','reader')).data.find(r=>r.id===row.id);assert.equal(listed.comment.content,'다른 팬은 그대로');assert.equal(listed.comment.posting_id,postId);
 assert.equal((await api(`/admin/comments/${target.id}/moderation`,'reader',{hidden:true,publicReason:'운영 정책 위반',reason:'x'})).status,403);
 assert.equal((await api(`/admin/comments/${target.id}/moderation`,'moderator',{hidden:true})).status,400);
 const count=async()=>(await db.posting.findUnique({where:{id:postId}})).comment_count,before=await count();
 const hidden=await api(`/admin/comments/${target.id}/moderation`,'moderator',{hidden:true,publicReason:'운영 정책 위반',reason:'스팸 신고 확인'});assert.equal(hidden.status,201,hidden.errorMessage);
 assert.equal((await api(`/posts/${postId}/comments`,'fan')).data.some(c=>c.id===target.id),false);assert.equal(await count(),before-1);
 assert.equal((await api('/reports','fan',{id:target.id,kind:'COMMENT',reason:'SPAM'})).status,404,'a hidden comment cannot be reported again');
 assert.equal((await api(`/admin/comments/${target.id}/moderation`,'moderator',{hidden:true,publicReason:'운영 정책 위반',reason:'다시'})).data.message,'이미 숨긴 댓글입니다.');assert.equal(await count(),before-1,'hiding twice changes nothing');
 assert.equal((await api(`/admin/comments/${target.id}/moderation`,'moderator',{hidden:false,publicReason:'운영 정책 위반',reason:'오인 신고'})).status,201);assert.equal(await count(),before);
 const history=await api(`/admin/comments/${target.id}/moderation`,'reader');assert.deepEqual(history.data.map(h=>[h.action,h.reason]),[['comment.unhidden','오인 신고'],['comment.hidden','스팸 신고 확인']]);});

test('a creator reply from the studio notifies the fan the same way',async()=>{
 const parent=await find('첫 댓글이에요'),before=(await notices(ids.fan)).length;
 const r=await api(`/studio/comments/${parent.id}/reply`,'creator',{body:'스튜디오 답글'});assert.equal(r.status,201,r.errorMessage);
 assert.deepEqual((await notices(ids.fan)).slice(before).map(n=>[n.text,n.actor_id,n.path]),[['내 댓글에 답글이 달렸습니다.',ids.creator,`/post/${postId}`]]);});
