require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),fs=require('node:fs');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const url=new URL(source);url.pathname='/crefans_platform_e2e';url.searchParams.set('connection_limit','1');process.env.DATABASE_URL=url.toString();process.env.CREFANS_E2E='true';
const {PrismaClient}=require('@prisma/client'),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),ids={creator:randomUUID(),fan:randomUUID(),other:randomUUID()},cookies={},categoryId=randomUUID();let app,origin,release;
async function api(path,actor,body,method='GET'){
 const response=await fetch(origin+'/api/v1'+path,{method,headers:{Origin:'https://beta.crefans.com','Content-Type':'application/json',...(actor?{cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,...await response.json()};
}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const migration=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(migration.status,0,migration.stdout+migration.stderr);
 await db.creatorCategory.create({data:{id:categoryId,name:'bio-'+tag}});
 for(const [key,id] of Object.entries(ids)){
  await db.member.create({data:{id,email:key+tag+'@bio.test.invalid',nickname:key+tag,name:'소개 검증',preferred_username:key+tag,password_hash:'test-only',email_verified:true,status:'CONFIRMED'}});
  const token='la.'+randomBytes(32).toString('base64url');cookies[key]='access_token='+token;
  await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});
 }
 await db.creator.create({data:{user_id:ids.creator,display_name:'Creator '+tag,handle:'creator'+tag,category_id:categoryId,about:'상세 소개는 그대로\n두 번째 줄'}});
 await db.userProfile.create({data:{user_id:ids.creator,bio:'처음 소개',cover:'existing-cover'}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{try{await app?.close();const all=Object.values(ids);await db.creator.deleteMany({where:{user_id:{in:all}}});await db.userProfile.deleteMany({where:{user_id:{in:all}}});await db.memberSession.deleteMany({where:{member_id:{in:all}}});await db.member.deleteMany({where:{id:{in:all}}});await db.creatorCategory.deleteMany({where:{id:categoryId}});}finally{await db.$disconnect();await release?.();}});

test('migration preserves the previously visible short bio, cover and detailed about in isolated test tables',async()=>{
 // Random table names in the isolated E2E database leave existing profile rows untouched.
 const profiles=`bio_profiles_${tag}`,creators=`bio_creators_${tag}`;
 const sqlForTest=sql=>sql.replace(/\buser_profiles\b/g,profiles).replace(/\bcreators\b/g,creators);
 const execute=sql=>db.$executeRawUnsafe(sqlForTest(sql));
 const query=sql=>db.$queryRawUnsafe(sqlForTest(sql));
 await execute('CREATE TABLE user_profiles (user_id VARCHAR(191) PRIMARY KEY,bio TEXT,cover TEXT,created_at DATETIME(3),updated_at DATETIME(3))');
 await execute('CREATE TABLE creators (user_id VARCHAR(191) PRIMARY KEY,bio TEXT,about TEXT)');
 try{
  await execute("INSERT INTO user_profiles VALUES ('both','member','cover','2020-01-01','2020-01-01'),('null','member fallback','keep','2020-01-01','2020-01-01'),('empty','empty fallback',NULL,'2020-01-01','2020-01-01'),('fan','fan bio',NULL,'2020-01-01','2020-01-01'),('space','fallback',NULL,'2020-01-01','2020-01-01')");
  await execute("INSERT INTO creators VALUES ('both','creator','long detail'),('null',NULL,'detail2'),('empty','','detail3'),('missing','only creator','detail4'),('space',' ','detail5')");
  const sql=fs.readFileSync('prisma/migrations/20261103083000_shared_short_bio/migration.sql','utf8');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await execute(statement);
  const rows=await query('SELECT user_id,bio,cover,created_at FROM user_profiles ORDER BY user_id');
  assert.deepEqual(Object.fromEntries(rows.map(r=>[r.user_id,r.bio])),{both:'creator',empty:'empty fallback',fan:'fan bio',missing:'only creator',null:'member fallback',space:' '});
  assert.equal(rows.find(r=>r.user_id==='both').cover,'cover');assert.equal(rows.find(r=>r.user_id==='both').created_at.toISOString(),'2020-01-01T00:00:00.000Z');
  assert.deepEqual((await query('SELECT about FROM creators ORDER BY user_id')).map(r=>r.about),['long detail','detail3','detail4','detail2','detail5']);
  await assert.rejects(query('SELECT bio FROM creators'));
 }finally{await execute('DROP TABLE IF EXISTS creators');await execute('DROP TABLE IF EXISTS user_profiles');}
});

async function expectShared(bio){
 const overview=await api('/studio/overview','creator');assert.equal(overview.status,200,overview.errorCode);assert.equal(overview.data.profile.bio,bio);
 const profile=await api('/profiles/'+ids.creator,'other');assert.equal(profile.data.bio,bio);assert.equal(profile.data.about,'상세 소개는 그대로\n두 번째 줄');
 const bootstrap=await api('/bootstrap','creator');assert.equal(bootstrap.data.viewer.bio,bio);assert.equal(bootstrap.data.data.creators.find(c=>c.id===ids.creator).bio,bio);
 assert.equal((await db.userProfile.findUniqueOrThrow({where:{user_id:ids.creator}})).bio,bio);
 assert.equal(await db.userProfile.count({where:{user_id:ids.creator}}),1);
}
const studioInput=bio=>({name:'Creator '+tag,category:'bio-'+tag,bio});
test('member settings edits immediately feed studio, public profile, bootstrap and directory',async()=>{
 const bio='member-edit-'+tag;
 assert.equal((await api('/me/profile','creator',{name:'Member '+tag,bio},'PUT')).status,200);
 await expectShared(bio);
 const results=await api('/creators?query='+encodeURIComponent(bio));assert.ok(results.data.creators.some(c=>c.id===ids.creator));
 assert.equal((await db.userProfile.findUniqueOrThrow({where:{user_id:ids.creator}})).cover,'existing-cover');
});
test('studio edits and explicit clearing use the same short bio without changing omitted detailed about',async()=>{
 assert.equal((await api('/studio/profile','creator',studioInput('studio-edit-'+tag),'PUT')).status,200);
 await expectShared('studio-edit-'+tag);
 assert.equal((await api('/studio/profile','creator',studioInput(''),'PUT')).status,200);
 await expectShared('');
});
test('omitted short bio on conversion preserves the fan biography and detailed about stays independently editable',async()=>{
 assert.equal((await api('/me/profile','fan',{name:'Fan '+tag,bio:'팬일 때 소개'},'PUT')).status,200);
 assert.equal((await api('/studio/start','fan',{name:'New creator',category:'bio-'+tag},'POST')).status,201);
 assert.equal((await api('/profiles/'+ids.fan)).data.bio,'팬일 때 소개');
 assert.equal((await api('/studio/profile','creator',{...studioInput('공통 짧은 소개'),about:'새로운 상세 소개'},'PUT')).status,200);
 const profile=(await api('/profiles/'+ids.creator)).data;assert.equal(profile.bio,'공통 짧은 소개');assert.equal(profile.about,'새로운 상세 소개');
});
test('anonymous writes and oversized biographies fail without modifying stored values',async()=>{
 const before=await db.userProfile.findUniqueOrThrow({where:{user_id:ids.creator}});
 assert.equal((await api('/me/profile',null,{name:'blocked',bio:'blocked'},'PUT')).status,401);
 assert.equal((await api('/studio/profile','creator',studioInput('x'.repeat(121)),'PUT')).status,400);
 assert.equal((await api('/me/profile','creator',{name:'Creator',bio:'x'.repeat(121)},'PUT')).status,400);
 assert.equal((await db.userProfile.findUniqueOrThrow({where:{user_id:ids.creator}})).bio,before.bio);
 assert.equal(await db.userProfile.findUnique({where:{user_id:ids.other}}),null);
});
