require('reflect-metadata');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
require('dotenv').config({path:'.local/platform.env'});
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/,'Only isolated development DB allowed');
const {PrismaClient}=require('@prisma/client'),{Module}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core');
const {PlatformService}=require('../dist/src/platform/service'),{PlatformController}=require('../dist/src/platform/controller'),{EmailChangeService}=require('../dist/src/platform/email-change.service'),{LocalMemberService}=require('../dist/src/auth/local/local-member.service');
const {EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http');
const db=new PrismaClient(),service=new PlatformService(db),owners=Array.from({length:3},()=>randomUUID()),categories=Array.from({length:2},()=>randomUUID()),names=categories.map(id=>`분야-${id}`),posts=Array.from({length:28},()=>randomUUID());let app,origin;
async function get(params={}){const response=await fetch(`${origin}/api/v1/posts?${new URLSearchParams(params)}`);return{status:response.status,...await response.json()};}
before(async()=>{
 await db.creatorCategory.createMany({data:categories.map((id,i)=>({id,name:names[i]}))});
 for(const [i,id]of owners.entries()){
  await db.member.create({data:{id,email:`${id}@example.invalid`,name:'분류 검사',nickname:'분류 검사',preferred_username:id,password_hash:'unused-test-hash',email_verified:true,status:'CONFIRMED'}});
  await db.creator.create({data:{user_id:id,display_name:'분류 검사',category_id:categories[i===1?1:0],is_active:i!==2}});
 }
 await db.posting.createMany({data:posts.map((id,i)=>({id,user_sub:owners[i<22||i>24?0:i===24?2:1],title:`분류 게시물 ${i}`,total_view_count:i*1234,content:'TEST_PROTECTED_BODY',status:i===25?'DRAFT':'PUBLISHED',is_public:i!==26,publish_start_at:i===27?new Date(Date.now()+86400000):null,published_at:new Date(Date.now()-i*1000),is_membership:i===0,membership_level:i===0?1:null}))});
 class TestModule{};Module({controllers:[PlatformController],providers:[{provide:PlatformService,useValue:service},{provide:EmailChangeService,useValue:{}},{provide:LocalMemberService,useValue:{}}]})(TestModule);
 app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{await app?.close();await db.posting.deleteMany({where:{id:{in:posts}}});await db.creator.deleteMany({where:{user_id:{in:owners}}});await db.member.deleteMany({where:{id:{in:owners}}});await db.creatorCategory.deleteMany({where:{id:{in:categories}}});await db.$disconnect();});
test('category applies before pagination and preserves locked content and publication rules',async()=>{
 const first=await get({category:names[0]});assert.equal(first.status,200);assert.equal(first.data.posts.length,20);assert.ok(first.data.nextCursor);
 const second=await get({category:names[0],cursor:first.data.nextCursor});assert.equal(second.status,200);assert.equal(second.data.posts.length,2);assert.equal(second.data.nextCursor,null);
 const rows=[...first.data.posts,...second.data.posts];assert.deepEqual(rows.map(p=>p.id),posts.slice(0,22));assert.ok(rows.every(p=>p.creatorId===owners[0]));
 const locked=rows.find(p=>p.id===posts[0]);assert.equal(locked.body,'');assert.equal(locked.canAccess,false);assert.deepEqual(locked.media,[]);
 const other=await get({category:names[1]});assert.deepEqual(other.data.posts.map(p=>p.id),posts.slice(22,24));
});
test('empty/all/invalid filters and creator-profile pagination retain their contracts',async()=>{
 const empty=await get({category:`empty-${randomUUID()}`});assert.equal(empty.status,200);assert.deepEqual(empty.data,{posts:[],creators:[],nextCursor:null});
 assert.deepEqual((await get({category:'전체'})).data,(await get()).data);
 assert.equal((await get({category:'a'.repeat(61)})).status,400);
 const own=await get({creatorId:owners[0],category:names[1]});assert.equal(own.status,200);assert.deepEqual(own.data.posts.map(p=>p.id),posts.slice(0,20));
});


test('feed, detail and bootstrap expose persisted views, including zero and locked posts, without changing the total',async()=>{
 const feed=await get({creatorId:owners[0]});
 for(const row of feed.data.posts)assert.equal(row.views,posts.indexOf(row.id)*1234);
 for(const index of [0,1]){
  const response=await fetch(`${origin}/api/v1/posts/${posts[index]}`),detail=await response.json();assert.equal(response.status,200);assert.equal(detail.data.post.views,index*1234);
  if(index===0){assert.equal(detail.data.post.body,'');assert.deepEqual(detail.data.post.media,[]);}
 }
 const response=await fetch(`${origin}/api/v1/bootstrap`),bootstrap=await response.json();assert.equal(response.status,200);
 for(const index of [0,1]){assert.equal(bootstrap.data.data.posts.find(p=>p.id===posts[index]).views,index*1234);assert.equal((await db.posting.findUnique({where:{id:posts[index]}})).total_view_count,index*1234);}
});
