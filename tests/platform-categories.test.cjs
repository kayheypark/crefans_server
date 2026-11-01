require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();Object.assign(process.env,{CREFANS_E2E:'true',MEDIA_STORAGE:'local',LOCAL_AUTH_SECRET:'q'.repeat(64),DATA_ENCRYPTION_KEY:'d'.repeat(64)});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),{NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser,originGuard}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http');
let app,origin,release,root,originals,cookies={},admins=[],categories=[],memberId;
const uiOrigin='http://127.0.0.1:3002';
async function api(route,body,user='super',method=body?'POST':'GET',sendOrigin=true){const res=await fetch(origin+'/api/v1/'+route,{method,headers:{...(cookies[user]?{Cookie:cookies[user]}:{}),...(sendOrigin?{Origin:uiOrigin}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
function form(bytes,name='icon.png',type='image/png'){const data=new FormData();data.append('file',new Blob([bytes],{type}),name);return data;}
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);root=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-categories-'));process.env.MEDIA_ROOT=root;
 originals=await db.creatorCategory.findMany();memberId=randomUUID();await db.member.create({data:{id:memberId,email:memberId+'@example.invalid',name:'Category QA',nickname:'Category QA',preferred_username:memberId,password_hash:'unused',email_verified:true,status:'CONFIRMED'}});
 for(const [key,role,permissions]of[['super','SUPER_ADMIN',undefined],['readonly','MODERATOR',{content:{view:true}}],['create','MODERATOR',{content:{view:true,create:true}}]]){
  const id=randomUUID(),a=await db.admin.create({data:{user_sub:id,email:id+'@example.invalid',name:'Category QA',role,...(permissions?{permissions}:{})}});admins.push(a.id);cookies[key]=await require('./admin-session.cjs')(db,a.id);
 }
 for(const n of ['B','A','C'])categories.push(await db.creatorCategory.create({data:{name:'cat-'+n+'-'+randomUUID().slice(0,8),sort_order:1000}}));
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use(originGuard([uiOrigin],[uiOrigin]));app.use((req,res,next)=>require('../dist/src/platform/request-context').requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
});
after(async()=>{await app?.close();for(const r of originals||[])await db.creatorCategory.update({where:{id:r.id},data:{sort_order:r.sort_order}});await db.platformAuditLog.deleteMany({where:{actor_id:{in:await db.admin.findMany({where:{id:{in:admins}},select:{user_sub:true}}).then(x=>x.map(a=>a.user_sub))}}});await db.creatorCategory.deleteMany({where:{id:{in:categories.map(c=>c.id)}}});await db.admin.deleteMany({where:{id:{in:admins}}});if(memberId)await db.member.delete({where:{id:memberId}});await db.$disconnect();await fs.rm(root,{recursive:true,force:true});await release?.();});
test('sorting persists into bootstrap/studio, rejects duplicates, missing IDs, stale writes and unauthorized callers',async()=>{
 const before=(await api('admin/categories')).data,expectedIds=before.map(r=>r.id),ids=[...expectedIds].reverse();
 for(const user of ['none','readonly','create'])assert.equal((await api('admin/categories/order',{ids,expectedIds},user,'PUT')).status,user==='none'?401:403);
 assert.equal((await api('admin/categories/order',{ids,expectedIds},'super','PUT',false)).status,403);
 assert.equal((await api('admin/categories/order',{ids:[ids[0],ids[0]],expectedIds},'super','PUT')).status,400);
 assert.equal((await api('admin/categories/order',{ids:ids.slice(1),expectedIds},'super','PUT')).status,400);
 assert.equal((await api('admin/categories/order',{ids,expectedIds},'super','PUT')).status,200);
 assert.deepEqual((await api('admin/categories')).data.map(r=>r.id),ids);
 assert.equal((await api('admin/categories/order',{ids:expectedIds,expectedIds},'super','PUT')).status,409);
 const active=(await api('admin/categories')).data.filter(r=>r.active).map(r=>r.name);
 assert.deepEqual((await api('bootstrap')).data.data.categories,active);
 const {PlatformStudioService}=require('../dist/src/platform/studio.service');const overview=await app.get(PlatformStudioService).overview(memberId);assert.deepEqual(overview.categories,active);
 const logs=await db.platformAuditLog.findMany({where:{entity_id:{in:ids},action:'admin.category_reordered'}});assert.ok(logs.some(r=>r.metadata.after.sort_order===0));assert.ok(logs.every(r=>r.actor_id&&r.ip==='127.0.0.1'));
});
test('rename and availability preserve identity and audit changes',async()=>{
 const c=categories[0],name='renamed-'+randomUUID().slice(0,8);
 assert.equal((await api('admin/categories/'+c.id,{name,active:false},'readonly','PUT')).status,403);
 assert.equal((await api('admin/categories/'+c.id,{name:categories[1].name,active:true},'super','PUT')).status,409);
 const r=await api('admin/categories/'+c.id,{name,active:false},'super','PUT');assert.equal(r.status,200);assert.equal(r.data.id,c.id);
 assert.ok(!(await api('bootstrap')).data.data.categories.includes(name));
 assert.equal((await api('admin/categories/'+c.id,{name,active:true},'super','PUT')).status,200);
 assert.ok((await api('bootstrap')).data.data.categories.includes(name));
});
test('icon upload re-encodes public artwork, replacement invalidates old URL, reset and unsafe uploads are enforced',async()=>{
 const c=categories[0],route='admin/categories/'+c.id+'/icon',sharp=require('sharp'),png=await sharp({create:{width:200,height:120,channels:4,background:'#aa33bb'}}).png().toBuffer();
 assert.equal((await api(route,form(png),'readonly')).status,403);assert.equal((await api(route,form(png),'none')).status,401);
 assert.equal((await api(route,form(png),'super','POST',false)).status,403);
 for(const body of [form(Buffer.from('<svg onload="alert(1)"/>'),'icon.svg','image/svg+xml'),form(Buffer.from('not an image')),form(png,'icon.php'),form(Buffer.alloc(2*1024*1024+1))])assert.ok([400,413].includes((await api(route,body)).status));
 const first=await api(route,form(png));assert.equal(first.status,201);assert.equal(first.data.customIcon,true);
 assert.equal((await fetch(origin+first.data.iconUrl.replace('/categories/','/admin/categories/'))).status,401);
 const res=await fetch(origin+first.data.iconUrl);assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/webp');assert.equal(res.headers.get('x-content-type-options'),'nosniff');const meta=await sharp(Buffer.from(await res.arrayBuffer())).metadata();assert.equal(meta.width,128);assert.equal(meta.height,128);
 assert.equal((await api('bootstrap')).data.data.categoryIcons[first.data.name],first.data.iconUrl);
 const replacement=await api(route,form(png));assert.notEqual(replacement.data.iconUrl,first.data.iconUrl);assert.equal((await fetch(origin+first.data.iconUrl)).status,404);
 assert.equal((await fs.readdir(path.join(root,'category-icons'))).length,1,'replaced file cleaned');
 assert.equal((await api(route,undefined,'super','DELETE')).status,200);assert.equal((await fetch(origin+replacement.data.iconUrl)).status,404);assert.equal((await fs.readdir(path.join(root,'category-icons'))).length,0);
 const logs=await db.platformAuditLog.findMany({where:{entity_id:c.id,action:'admin.category_icon_changed'}});assert.equal(logs.length,3);assert.ok(logs.every(r=>r.metadata.before.contentHash&&r.metadata.after.contentHash));
});
test('S3 storage path uses private object key and serves only the current category reference',async()=>{
 const storage=app.get(require('../dist/src/platform/media-storage').PlatformMediaStorage),config=app.get(require('@nestjs/config').ConfigService),original={put:storage.put,read:storage.read,remove:storage.remove},objects=new Map();
 config.set('MEDIA_STORAGE','s3');storage.put=async(id,file)=>objects.set('platform/'+id,await fs.readFile(file));storage.read=async key=>({Body:require('node:stream').Readable.from(objects.get(key))});storage.remove=async key=>objects.delete(key);
 try{
  const png=await require('sharp')({create:{width:20,height:20,channels:4,background:'#223344'}}).png().toBuffer(),route='admin/categories/'+categories[1].id+'/icon';
  const uploaded=await api(route,form(png));assert.equal(uploaded.status,201);assert.equal(objects.size,1);assert.equal((await fetch(origin+uploaded.data.iconUrl)).status,200);
  assert.equal((await fetch(origin+uploaded.data.iconUrl.replace(categories[1].id,categories[0].id))).status,404);
  const row=await db.creatorCategory.findUnique({where:{id:categories[1].id}});assert.match(row.icon,/^s3:/);assert.equal((await fs.readdir(path.join(root,'category-icons'))).length,0);
  assert.equal((await api(route,undefined,'super','DELETE')).status,200);assert.equal(objects.size,0);
 }finally{config.set('MEDIA_STORAGE','local');Object.assign(storage,original);}
});
