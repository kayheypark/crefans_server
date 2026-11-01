require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-10-31 user request: the profile photo and background photo are changed from the member profile page.
// members.picture / user_profiles.cover are the source and a creator's creators.avatar/cover follow them.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
process.env.MEDIA_ROOT=require('node:path').join(require('node:os').tmpdir(),'crefans-photo-'+randomBytes(3).toString('hex'));
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const sharp=require('sharp');
const db=new PrismaClient(),tag=randomBytes(3).toString('hex'),ids={fan:randomUUID(),creator:randomUUID(),other:randomUUID()},cookies={};let app,origin,release,png;
const headers=actor=>({Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})});
async function api(p,actor,body,method='POST'){const res=await fetch(origin+'/api/v1'+p,{method,headers:{'Content-Type':'application/json',...headers(actor)},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
async function upload(actor){const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'photo.png');const res=await fetch(origin+'/api/v1/media',{method:'POST',headers:headers(actor),body:form});const json=await res.json();assert.equal(res.status,201,JSON.stringify(json));return json.data.url;}
const view=async(path,actor)=>(await fetch(origin+path,{headers:headers(actor)})).status;
async function member(key){await db.member.create({data:{id:ids[key],email:`${key}-${tag}@photo.test.invalid`,password_hash:'x',nickname:'사진'+key,name:'사진 검증',preferred_username:key+tag,email_verified:true,status:'CONFIRMED'}});
 const token='la.'+randomBytes(32).toString('base64url');cookies[key]='access_token='+token;await db.memberSession.create({data:{member_id:ids[key],access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 png=await sharp({create:{width:8,height:8,channels:3,background:'#888'}}).png().toBuffer();
 for(const key of Object.keys(ids))await member(key);
 await db.creator.create({data:{user_id:ids.creator,display_name:'C '+tag,handle:'creator'+tag}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();const all=Object.values(ids);await db.media.deleteMany({where:{user_sub:{in:all}}});await db.creator.deleteMany({where:{user_id:{in:all}}});await db.userProfile.deleteMany({where:{user_id:{in:all}}});await db.memberSession.deleteMany({where:{member_id:{in:all}}});await db.member.deleteMany({where:{id:{in:all}}});await db.$disconnect();await release?.();});

test('a fan saves a profile and background photo; others can view them only while they are in use',async()=>{
 const avatar=await upload('fan'),cover=await upload('fan');
 assert.equal(await view(avatar,'other'),403,'an unused upload stays private');
 const saved=await api('/me/profile/photos','fan',{avatar,cover},'PUT');assert.equal(saved.status,200,saved.errorCode);
 assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.fan}})).picture,avatar);
 assert.equal((await db.userProfile.findUniqueOrThrow({where:{user_id:ids.fan}})).cover,cover);
 assert.equal(await view(avatar,'other'),200);assert.equal(await view(cover,null),200,'a profile photo in use is public');
 const profile=await api('/profiles/'+ids.fan,'other',undefined,'GET');assert.equal(profile.data.image,avatar);assert.equal(profile.data.cover,cover);
 const removed=await api('/me/profile/photos','fan',{cover:null},'PUT');assert.equal(removed.status,200);
 assert.equal((await db.userProfile.findUniqueOrThrow({where:{user_id:ids.fan}})).cover,null);assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.fan}})).picture,avatar,'omitted photo is kept');
 assert.equal(await view(cover,'other'),403,'a removed background is private again');
});

test('a creator profile follows the member photos',async()=>{
 const avatar=await upload('creator'),cover=await upload('creator');
 assert.equal((await api('/me/profile/photos','creator',{avatar,cover},'PUT')).status,200);
 const c=await db.creator.findUniqueOrThrow({where:{user_id:ids.creator}});assert.equal(c.avatar,avatar);assert.equal(c.cover,cover);
 assert.equal((await api('/me/profile/photos','creator',{avatar:null},'PUT')).status,200);
 assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:ids.creator}})).avatar,null);assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.creator}})).picture,null);
});

test('only the member\'s own uploaded images are accepted',async()=>{
 const foreign=await upload('other');
 assert.equal((await api('/me/profile/photos','fan',{avatar:foreign},'PUT')).errorCode,'INVALID_MEDIA','another member\'s upload');
 assert.equal((await api('/me/profile/photos','fan',{cover:'https://example.com/x.png'},'PUT')).errorCode,'INVALID_MEDIA','outside url');
 assert.equal((await api('/me/profile/photos','fan',{},'PUT')).errorCode,'NO_CHANGES');
 assert.equal((await api('/me/profile/photos',null,{avatar:null},'PUT')).status,401);
});
