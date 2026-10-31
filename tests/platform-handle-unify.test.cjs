require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-10-31 user request: the member user name and the creator profile address are one value, changed from the profile
// settings, not entered separately when becoming a creator. Existing accounts are aligned by migration 20261031180000.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const fs=require('node:fs'),path=require('node:path');
const db=new PrismaClient(),tag=randomBytes(3).toString('hex'),ids={a:randomUUID(),b:randomUUID(),c:randomUUID(),d:randomUUID()},cookies={};let app,origin,release,category;
async function api(p,actor,body,method='POST'){const res=await fetch(origin+'/api/v1'+p,{method,headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
async function member(key,pref){await db.member.create({data:{id:ids[key],email:`${key}-${tag}@handle.test.invalid`,password_hash:'x',nickname:'핸들'+key,name:'핸들 검증',preferred_username:pref,email_verified:true,status:'CONFIRMED'}});
 const token='la.'+randomBytes(32).toString('base64url');cookies[key]='access_token='+token;await db.memberSession.create({data:{member_id:ids[key],access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);
 const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
 await member('a','a'+tag+'old');await member('b','b'+tag+'tkn');await member('c','c'+tag+'rnd');await member('d','d'+tag+'rnd');
 category=await db.creatorCategory.create({data:{name:'핸들분야'+tag}});
 await db.creator.create({data:{user_id:ids.a,display_name:'A '+tag,handle:'a'+tag+'old'}});
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();const all=Object.values(ids);await db.creator.deleteMany({where:{user_id:{in:all}}});if(category)await db.creatorCategory.delete({where:{id:category.id}}).catch(()=>null);await db.userProfile.deleteMany({where:{user_id:{in:all}}});await db.memberSession.deleteMany({where:{member_id:{in:all}}});await db.member.deleteMany({where:{id:{in:all}}});await db.$disconnect();await release?.();});

test('the user name is changed in profile settings and the creator address follows it; format and duplicates are refused',async()=>{
 const body=handle=>({name:'핸들A',bio:'',handle});
 assert.equal((await api('/me/profile','a',body('Bad-Name'),'PUT')).errorCode,'INVALID_HANDLE');
 assert.equal((await api('/me/profile','a',body('b'+tag+'tkn'),'PUT')).errorCode,'HANDLE_TAKEN','another member\'s user name');
 const ok=await api('/me/profile','a',body('a'+tag+'new'),'PUT');assert.equal(ok.status,200,ok.errorCode);
 assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.a}})).preferred_username,'a'+tag+'new');
 assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:ids.a}})).handle,'a'+tag+'new');
 assert.equal((await api('/me/profile','b',body('a'+tag+'new'),'PUT')).errorCode,'HANDLE_TAKEN','a creator address is taken too');
 const keep=await api('/me/profile','a',{name:'핸들A2',bio:''},'PUT');assert.equal(keep.status,200);assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.a}})).preferred_username,'a'+tag+'new','omitting handle keeps it');
});

test('becoming a creator uses the user name; an address sent from the studio is ignored',async()=>{
 const start=await api('/studio/start','c',{name:'C '+tag,handle:'ignored'+tag,category:category.name,bio:''});assert.ok([200,201].includes(start.status),start.errorCode+' '+start.errorMessage);
 assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:ids.c}})).handle,'c'+tag+'rnd');
 const edit=await api('/studio/profile','c',{name:'C '+tag,handle:'other'+tag,category:category.name,bio:''},'PUT');assert.ok([200,201].includes(edit.status),edit.errorCode);
 assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:ids.c}})).handle,'c'+tag+'rnd');
});

test('migration: a chosen creator address becomes the user name unless taken; every creator address then matches',async()=>{
 await db.creator.create({data:{user_id:ids.d,display_name:'D '+tag,handle:'d'+tag+'pick'}});
 await db.creator.update({where:{user_id:ids.a},data:{handle:'b'+tag+'tkn'}}).catch(()=>null);// would collide with member b's user name
 const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261031180000_unify_handles/migration.sql'),'utf8').replace(/^\s*--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
 for(const statement of sql)await db.$executeRawUnsafe(statement);
 assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.d}})).preferred_username,'d'+tag+'pick','chosen address kept as the user name');
 assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:ids.d}})).handle,'d'+tag+'pick');
 assert.equal((await db.member.findUniqueOrThrow({where:{id:ids.a}})).preferred_username,'a'+tag+'new','a taken name is not copied');
 assert.equal((await db.creator.findUniqueOrThrow({where:{user_id:ids.a}})).handle,'a'+tag+'new','the address follows the user name');
});
