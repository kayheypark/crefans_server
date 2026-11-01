require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
Object.assign(process.env,{CREFANS_E2E:'true',LOCAL_AUTH_SECRET:'q'.repeat(64),DATA_ENCRYPTION_KEY:'d'.repeat(64)});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http');
const prefix='new-'+randomUUID().slice(0,8),ids=Array.from({length:28},()=>randomUUID()),categories=[randomUUID(),randomUUID()];let app,origin,release;
async function get(params={}){const r=await fetch(origin+'/api/v1/creators?'+new URLSearchParams({query:prefix,...params}));return{status:r.status,...await r.json()};}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 await db.creatorCategory.createMany({data:categories.map((id,i)=>({id,name:prefix+'-'+i}))});
 for(const [i,id]of ids.entries()){
  await db.member.create({data:{id,email:id+'@example.invalid',name:'Discovery QA',nickname:prefix+' '+i,preferred_username:id,password_hash:'unused',email_verified:true,status:'CONFIRMED',enabled:i!==26}});
  await db.creator.create({data:{user_id:id,display_name:prefix+' '+i,category_id:categories[i===23?1:0],is_active:i!==25,promoted:i<20,created_at:new Date(Date.UTC(2020,0,i+1)),bio:i===22?'unique-newcomer':''}});
 }
 await db.accountPreference.create({data:{member_id:ids[27],allow_search:false}});
 await db.creator.update({where:{user_id:ids[24]},data:{is_active:false}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{try{await app?.close();await db.accountPreference.deleteMany({where:{member_id:{in:ids}}});await db.creator.deleteMany({where:{user_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});await db.creatorCategory.deleteMany({where:{id:{in:categories}}});}finally{await db.$disconnect();await release?.();}});
test('newest six are registration-ordered independently of the promoted first page',async()=>{
 const r=await get();assert.equal(r.status,200);assert.equal(r.data.creators.length,20);assert.ok(r.data.nextCursor);
 assert.deepEqual(r.data.newCreators.map(c=>c.id),ids.slice(18,24).reverse());assert.ok(!r.data.creators.some(c=>c.id===ids[23]));
 await db.creator.update({where:{user_id:ids[0]},data:{bio:'edited old profile'}});
 assert.deepEqual((await get()).data.newCreators.map(c=>c.id),ids.slice(18,24).reverse());
 const next=await get({cursor:r.data.nextCursor});assert.equal(next.data.creators.length,4);assert.deepEqual(next.data.newCreators,[]);assert.equal(next.data.nextCursor,null);
 assert.equal(new Set([...r.data.creators,...next.data.creators].map(c=>c.id)).size,24);
});
test('new section honors category, search, disabled member, inactive creator and search privacy',async()=>{
 const a=await get({category:prefix+'-0'});assert.deepEqual(a.data.newCreators.map(c=>c.id),ids.slice(17,23).reverse());
 const b=await get({category:prefix+'-1'});assert.deepEqual(b.data.newCreators.map(c=>c.id),[ids[23]]);
 const q=await get({query:'unique-newcomer'});assert.deepEqual(q.data.newCreators.map(c=>c.id),[ids[22]]);
 for(const params of [{query:randomUUID()},{query:"' UNION SELECT 1 --"},{category:randomUUID()}]){const r=await get(params);assert.deepEqual(r.data.creators,[]);assert.deepEqual(r.data.newCreators,[]);}
 assert.equal((await get({query:'x'.repeat(101)})).status,400);
});
test('equal registration times have a deterministic id tie breaker',async()=>{
 const date=new Date('2030-01-01T00:00:00Z');await db.creator.updateMany({where:{user_id:{in:ids.slice(21,24)}},data:{created_at:date}});
 const rows=await db.creator.findMany({where:{user_id:{in:ids.slice(21,24)}},orderBy:{id:'desc'}});
 assert.deepEqual((await get()).data.newCreators.slice(0,3).map(c=>c.id),rows.map(c=>c.user_id));
});
