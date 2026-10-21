const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
require('dotenv').config({path:'.local/platform.env'});
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/,'Only isolated development DB allowed');
const {PrismaClient}=require('@prisma/client');
const {randomUUID}=require('node:crypto');
const {hashPassword,digest}=require('../dist/src/auth/local/credentials');
const db=new PrismaClient(),owner=randomUUID(),fan=randomUUID(),stranger=randomUUID(),ids=[owner,fan,stranger];
const origin=process.env.PLATFORM_TEST_ORIGIN||'http://127.0.0.1:3001',secret=`private-${randomUUID()}`,cookies={};
let plan,otherPlan,foreignPlan,post,subscription,comment,reply,media=[];
async function request(path,user,options={}){return fetch(`${origin}/api/v1${path}`,{...options,headers:{Origin:'http://127.0.0.1:3010',...(user?{Cookie:cookies[user]}:{}),...options.headers}});}
async function json(path,user,options){const response=await request(path,user,options);return{status:response.status,headers:response.headers,...await response.json()};}
before(async()=>{
 const hash=await hashPassword('Access-test-123!');
 for(const id of ids){await db.member.create({data:{id,email:`${id}@example.invalid`,name:'권한 검증',nickname:'권한 검증',preferred_username:`access-${id}`,password_hash:hash,email_verified:true,status:'CONFIRMED'}});const login=await request('/auth/login',undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${id}@example.invalid`,password:'Access-test-123!'})});assert.equal(login.status,201);cookies[id]=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
 await db.creator.create({data:{user_id:owner,display_name:'권한 검증'}});
 await db.creator.create({data:{user_id:stranger,display_name:'다른 작성자'}});
 const data={name:'권한 검증',price:1000,benefits:'[]',billing_unit:'MONTH',billing_period:1};
 plan=await db.membershipItem.create({data:{...data,creator_id:owner,level:1}});
 otherPlan=await db.membershipItem.create({data:{...data,creator_id:owner,level:5}});
 foreignPlan=await db.membershipItem.create({data:{...data,creator_id:stranger,level:5}});
 const png=await require('sharp')({create:{width:2,height:2,channels:3,background:'#abcdef'}}).png().toBuffer();
 // The video fixture tests authorization, not decoding or playback quality.
 for(const [bytes,type,name]of[[png,'image/png','access.png'],[Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109]),'video/mp4','access.mp4']]){const body=new FormData();body.append('file',new Blob([bytes],{type}),name);const r=await json('/media',owner,{method:'POST',body});assert.equal(r.success,true);media.push(r.data);}
 post=await db.posting.create({data:{user_sub:owner,title:'구독 전용',content:secret,status:'PUBLISHED',is_membership:true,access_plan_id:plan.id,membership_level:1,medias:{create:media.map((m,i)=>({media_id:m.id,sort_order:i}))}}});
 comment=await db.comment.create({data:{posting_id:post.id,author_id:owner,content:secret}});
 reply=await db.comment.create({data:{posting_id:post.id,author_id:owner,parent_id:comment.id,content:secret}});
 subscription=await db.subscription.create({data:{subscriber_id:fan,membership_item_id:plan.id,amount:1000,started_at:new Date(Date.now()-60000),ended_at:new Date(Date.now()+86400000),plan_snapshot:{rank:1}}});
});
after(async()=>{
 await db.comment.deleteMany({where:{posting:{user_sub:{in:ids}}}});
 await db.postingMedia.deleteMany({where:{posting:{user_sub:{in:ids}}}});
 await db.posting.deleteMany({where:{user_sub:{in:ids}}});
 const files=await db.media.findMany({where:{user_sub:{in:ids}}});for(const m of files){try{await require('node:fs/promises').unlink(require('node:path').join(process.env.MEDIA_ROOT||'.local/media',m.file_name));}catch(e){if(e.code!=='ENOENT')throw e;}}
 await db.media.deleteMany({where:{user_sub:{in:ids}}});
 await db.subscription.deleteMany({where:{subscriber_id:{in:ids}}});await db.membershipItem.deleteMany({where:{creator_id:{in:ids}}});await db.creator.deleteMany({where:{user_id:{in:ids}}});await db.identityProof.deleteMany({where:{member_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
});
async function check(user,allowed){
 for(const path of[`/posts/${post.id}`,'/bootstrap','/posts',`/posts?creatorId=${owner}`]){const r=await json(path,user);assert.equal(r.success,true,path);const row=path===`/posts/${post.id}`?r.data.post:path==='/bootstrap'?r.data.data.posts.find(p=>p.id===post.id):r.data.posts.find(p=>p.id===post.id);assert.ok(row,path);const exposed=allowed&&path!=='/bootstrap';assert.equal(row.canAccess,exposed,path);assert.equal(row.body,exposed?secret:'',path);assert.equal(row.media.length,exposed?2:0,path);if(!exposed)assert.equal(row.image,'');}
 for(const path of[`/posts/${post.id}/comments`,`/posts/${post.id}/comments-page`,`/posts/${post.id}/comments?parentId=${comment.id}`]){const r=await json(path,user);assert.equal(r.status,allowed?200:403,path);if(!allowed){assert.equal(r.data,null);assert.equal(r.errorCode,'POST_ACCESS_DENIED');}}
 for(const m of media)for(const [method,headers]of[['GET',{}],['GET',{Range:'bytes=0-3'}],['HEAD',{}]]){const r=await request(`/media/${m.id}/file`,user,{method,headers});assert.ok(allowed?[200,206].includes(r.status):r.status===403,`${method} media status ${r.status}`);await r.arrayBuffer();}
}
test('only owner and an active exact-plan subscriber can read paid bodies, comments and image/video bytes',async()=>{await check(undefined,false);await check(stranger,false);await check(owner,true);await check(fan,true);assert.equal((await json('/studio/overview',fan)).data.management.contents.length,0);});
test('wrong plan, other creator, future start, expired period and expired status cannot grant access; cancelled renewal retains paid time',async()=>{
 const base={membership_item_id:plan.id,started_at:new Date(Date.now()-60000),ended_at:new Date(Date.now()+86400000),status:'ONGOING',auto_renew:true};
 try{for(const change of[{membership_item_id:otherPlan.id},{membership_item_id:foreignPlan.id},{started_at:new Date(Date.now()+3600000)},{ended_at:new Date(Date.now()-1000)},{status:'EXPIRED'}]){await db.subscription.update({where:{id:subscription.id},data:{...base,...change}});await check(fan,false);}await db.subscription.update({where:{id:subscription.id},data:{...base,status:'CANCELLED',auto_renew:false}});await check(fan,true);}finally{await db.subscription.update({where:{id:subscription.id},data:base});}
});
test('public post or membership cover reuse cannot bypass a paid media entitlement',async()=>{
 const publicPost=await db.posting.create({data:{user_sub:owner,title:'공개 재사용',content:'공개',status:'PUBLISHED',medias:{create:media.map((m,i)=>({media_id:m.id,sort_order:i}))}}});
 async function blocked(){for(const user of[undefined,stranger])for(const m of media){const r=await request(`/media/${m.id}/file`,user);assert.equal(r.status,403);await r.arrayBuffer();}}
 try{await blocked();await db.postingMedia.deleteMany({where:{posting_id:publicPost.id}});await db.membershipItem.update({where:{id:plan.id},data:{image:media[0].url}});await blocked();await check(owner,true);await check(fan,true);}finally{await db.membershipItem.update({where:{id:plan.id},data:{image:null}});await db.postingMedia.deleteMany({where:{posting_id:publicPost.id}});await db.posting.delete({where:{id:publicPost.id}});}
});
test('personalized JSON, successful files and denied files prohibit browser/shared caching',async()=>{
 for(const [path,user]of[[`/posts/${post.id}`,fan],['/bootstrap',fan],[`/posts/${post.id}/comments-page`,fan],[`/media/${media[0].id}/file`,fan],[`/media/${media[0].id}/file`,undefined],['/studio/overview',owner]]){const r=await request(path,user);assert.match(r.headers.get('cache-control')||'',/private/);assert.match(r.headers.get('cache-control')||'',/no-store/);await r.arrayBuffer();}
});
test('unpublished, hidden, deleted and out-of-window posts deny subscriber files and comments',async()=>{
 try{for(const change of[{status:'DRAFT'},{is_public:false},{is_deleted:true},{publish_start_at:new Date(Date.now()+3600000)},{publish_end_at:new Date(Date.now()-1000)}]){await db.posting.update({where:{id:post.id},data:change});const detail=await json(`/posts/${post.id}`,fan);if(detail.status!==404){assert.equal(detail.data.post.body,'');assert.deepEqual(detail.data.post.media,[]);}assert.equal((await json(`/posts/${post.id}/comments`,fan)).status,403);for(const m of media){const r=await request(`/media/${m.id}/file`,fan);assert.equal(r.status,403);await r.arrayBuffer();}await db.posting.update({where:{id:post.id},data:{status:'PUBLISHED',is_public:true,is_deleted:false,publish_start_at:null,publish_end_at:null}});}}finally{await db.posting.update({where:{id:post.id},data:{status:'PUBLISHED',is_public:true,is_deleted:false,publish_start_at:null,publish_end_at:null}});}
});
test('adult verification and revoked sessions cannot be replaced by a subscription or client viewer id',async()=>{
 try{await db.posting.update({where:{id:post.id},data:{is_sensitive:true}});await check(fan,false);const hash=digest(randomUUID());await db.member.update({where:{id:fan},data:{identity_hash:hash}});await db.identityProof.create({data:{member_id:fan,purpose:'signup',attempt_id:randomUUID(),provider_reference:randomUUID(),identity_hash:hash,adult_verified:true,token_hash:digest(randomUUID()),consumed_at:new Date(),expires_at:new Date(Date.now()+60000)}});await check(fan,true);await check(owner,true);}finally{await db.posting.update({where:{id:post.id},data:{is_sensitive:false}});}
 await db.member.update({where:{id:fan},data:{enabled:false}});try{const r=await json(`/posts/${post.id}?viewer=${owner}&user_sub=${owner}`,fan);assert.equal(r.status,401);const file=await request(`/media/${media[0].id}/file`,fan);assert.equal(file.status,401);await file.arrayBuffer();}finally{await db.member.update({where:{id:fan},data:{enabled:true}});}
 const spoof=await json(`/posts/${post.id}?viewer=${owner}&user_sub=${owner}`,stranger);assert.equal(spoof.data.post.canAccess,false);
});
