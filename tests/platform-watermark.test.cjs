require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp');
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {watermarkText,watermarkImage,watermarkVideoArgs}=require('../dist/src/platform/media-watermark-render'),{ensureWatermarkedMedia,watermarkNextMedia}=require('../dist/src/platform/media-watermark');
const {PlatformMediaController}=require('../dist/src/platform/media.controller'),{PlatformService}=require('../dist/src/platform/service'),{PlatformStudioService}=require('../dist/src/platform/studio.service');
const db=new PrismaClient(),owner=randomUUID(),fan=randomUUID();let root,release;const handle='watermark_'+owner.slice(0,8),storage={enabled:false};
const config=new ConfigService({BETA_MODE:'false'}),service=new PlatformService(db,undefined,config),studio=new PlatformStudioService(service);
const digest=b=>createHash('sha256').update(b).digest('hex');
function controller(){return new PlatformMediaController(service,new ConfigService({MEDIA_ROOT:root}),storage);}
async function upload(member=owner){const file=path.join(root,'upload-'+randomUUID()),bytes=await sharp({create:{width:800,height:600,channels:3,background:'#477c8c'}}).png().toBuffer();await fs.writeFile(file,bytes);return controller().upload({path:file,mimetype:'image/png',size:bytes.length,originalname:'fixture.png'},{user:{sub:member}});}
const payload=media=>({title:'Watermark test',body:'Synthetic fixture',media,commentsEnabled:true,tipsEnabled:true,accessPlanId:null,accessLevel:null,status:'draft',scheduledAt:null});
async function enqueue(id){return db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM medias WHERE id=${id} FOR UPDATE`;return ensureWatermarkedMedia(tx,id,owner);});}
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);root=await fs.mkdtemp(path.join(os.tmpdir(),'crefans-watermark-'));await db.$connect();for(const id of[owner,fan])await db.member.create({data:{id,email:id+'@watermark.invalid',name:'Synthetic',nickname:'Synthetic',preferred_username:id===owner?handle:'fan_'+id.slice(0,8),email_verified:true}});await db.creator.create({data:{user_id:owner,handle,is_active:true}});});
after(async()=>{await db.postingMedia.deleteMany({where:{posting:{user_sub:owner}}});await db.posting.deleteMany({where:{user_sub:owner}});await db.mediaWatermarkJob.deleteMany({where:{creator_id:owner}});await db.media.deleteMany({where:{user_sub:{in:[owner,fan]}}});await db.creator.deleteMany({where:{user_id:owner}});await db.member.deleteMany({where:{id:{in:[owner,fan]}}});await db.$disconnect();await fs.rm(root,{recursive:true,force:true});await release?.();});

test('only active-creator new uploads carry eligibility; upload alone never changes photos or schedules a job',async()=>{
 const c=await upload(),f=await upload(fan);const cr=await db.media.findUniqueOrThrow({where:{id:c.id}}),fr=await db.media.findUniqueOrThrow({where:{id:f.id}});
 assert.deepEqual(cr.metadata,{watermarkEligible:1,watermarkHandle:handle});assert.equal(fr.metadata,null);assert.equal(await db.mediaWatermarkJob.count({where:{creator_id:owner}}),0);assert.equal(cr.processing_status,'COMPLETED');
 await db.creator.update({where:{user_id:owner},data:{is_active:false}});const inactive=await upload();assert.equal((await db.media.findUniqueOrThrow({where:{id:inactive.id}})).metadata,null);await db.creator.update({where:{user_id:owner},data:{is_active:true}});
});
test('pre-release file stays untouched when a post is created and edited; foreign uploads are rejected',async()=>{
 const old=await upload();await db.media.update({where:{id:old.id},data:{metadata:require('@prisma/client').Prisma.DbNull}});
 const p=await studio.saveContent(owner,payload([old]));await studio.saveContent(owner,{...payload([old]),id:p.id});assert.equal((await db.postingMedia.findFirstOrThrow({where:{posting_id:p.id}})).media_id,old.id);assert.equal(await db.mediaWatermarkJob.count({where:{source_id:old.id}}),0);
 const f=await upload(fan);await assert.rejects(studio.saveContent(owner,payload([f])),e=>e.getResponse?.().code==='INVALID_MEDIA');
});
test('new post uses a distinct pending derivative, repeated/concurrent save reuses it, and original/handle snapshot remain unchanged',async()=>{
 const m=await upload(),original=await fs.readFile(path.join(root,m.id));await db.member.update({where:{id:owner},data:{preferred_username:handle+'_new'}});
 const p=await studio.saveContent(owner,payload([m])),target=(await db.postingMedia.findFirstOrThrow({where:{posting_id:p.id}})).media_id;assert.notEqual(target,m.id);assert.equal((await db.media.findUniqueOrThrow({where:{id:target}})).processing_status,'PROCESSING');
 assert.deepEqual(await Promise.all([enqueue(m.id),enqueue(m.id)]),[target,target]);await studio.saveContent(owner,{...payload([{...m,id:target}]),id:p.id});assert.equal(await enqueue(target),target);assert.equal(await db.mediaWatermarkJob.count({where:{source_id:m.id}}),1);
 for(const id of[owner,fan])await assert.rejects(controller().edgeAuthorize(target,{user:{sub:id}}),e=>e.getResponse?.().code==='MEDIA_NOT_FOUND');
 assert.equal(await watermarkNextMedia(db,storage,root),1);const result=await db.media.findUniqueOrThrow({where:{id:target}});assert.equal(result.processing_status,'COMPLETED');assert.equal(result.mime_type,'image/webp');assert.equal(result.metadata.watermark.handle,handle);
 assert.equal(digest(await fs.readFile(path.join(root,m.id))),digest(original));assert.notEqual(digest(await fs.readFile(path.join(root,target))),digest(original));
 await assert.rejects(controller().edgeAuthorize(target,{user:{sub:fan}}),e=>e.getResponse?.().code==='MEDIA_ACCESS_DENIED');await db.posting.update({where:{id:p.id},data:{status:'PUBLISHED',is_public:true,published_at:new Date()}});assert.deepEqual(await controller().edgeAuthorize(target,{}),{delivery:'api'});
 await db.member.update({where:{id:owner},data:{preferred_username:handle}});
});
test('conversion claim prevents duplicate work; remote source/target use different private keys',async()=>{
 const m=await upload();await db.media.update({where:{id:m.id},data:{s3_upload_key:'platform/'+m.id}});const target=await enqueue(m.id);let unblock,started;const waiting=new Promise(r=>started=r),gate=new Promise(r=>unblock=r),calls=[];
 const remote={enabled:true,read:async key=>{assert.equal(key,'platform/'+m.id);return{Body:require('node:stream').Readable.from(await fs.readFile(path.join(root,m.id))) };},put:async(id,file,mime,size)=>{calls.push(id);assert.equal(id,target);assert.equal(mime,'image/webp');assert.ok(size>0);}};
 const first=watermarkNextMedia(db,remote,root,{image:async(...a)=>{started();await gate;return watermarkImage(...a);},video:()=>assert.fail()});await waiting;assert.equal(await watermarkNextMedia(db,remote,root),0);unblock();assert.equal(await first,1);assert.deepEqual(calls,[target]);
});
test('failed rendering stays unpublished, retries with delay, fails after three attempts and keeps raw bytes',async()=>{
 const m=await upload(),target=await enqueue(m.id),broken={image:async()=>{throw Error('provider-secret');},video:()=>assert.fail()};let now=new Date();
 for(let i=1;i<=3;i++){await assert.rejects(watermarkNextMedia(db,storage,root,broken,now),/^Error: WATERMARK_CONVERSION_FAILED$/);const j=await db.mediaWatermarkJob.findUniqueOrThrow({where:{source_id:m.id}});assert.equal(j.attempts,i);assert.equal(j.status,i===3?'failed':'pending');assert.equal(j.error_code,'WATERMARK_CONVERSION_FAILED');assert.equal(await watermarkNextMedia(db,storage,root,broken,new Date(now.getTime()+1000)),0);now=new Date(now.getTime()+180000);}
 assert.equal((await db.media.findUniqueOrThrow({where:{id:target}})).processing_status,'FAILED');assert.ok((await fs.stat(path.join(root,m.id))).size>0);assert.deepEqual(await fs.readdir(path.join(root,'.watermark')),[]);
});
test('pending source waits without consuming retries, then can complete',async()=>{
 const m=await upload();await db.media.update({where:{id:m.id},data:{processing_status:'PROCESSING'}});const target=await enqueue(m.id),now=new Date();assert.equal(await watermarkNextMedia(db,storage,root,undefined,now),1);assert.equal((await db.mediaWatermarkJob.findUniqueOrThrow({where:{source_id:m.id}})).attempts,0);await db.media.update({where:{id:m.id},data:{processing_status:'COMPLETED'}});assert.equal(await watermarkNextMedia(db,storage,root,undefined,new Date(now.getTime()+20000)),1);assert.equal((await db.media.findUniqueOrThrow({where:{id:target}})).processing_status,'COMPLETED');
});
test('actual raster changes are in the bottom-right, dimensions preserved; injection and unknown formats fail',async()=>{
 for(const handle of['../bad','x:bad','bad<svg>','abc\nxyz','ab','A_NAME'])assert.throws(()=>watermarkText(handle),/INVALID/);assert.equal(watermarkText('creator_1'),'https://crefans.com/creator_1');
 const input=path.join(root,'render.png'),output=path.join(root,'render.webp');await sharp({create:{width:800,height:600,channels:3,background:'#808080'}}).png().toFile(input);await watermarkImage(input,output,'creator_1');const {data,info}=await sharp(output).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,800);assert.equal(info.height,600);let changed=0;for(let y=0;y<600;y++)for(let x=0;x<800;x++){const p=(y*800+x)*info.channels;if(Math.abs(data[p]-128)>15){assert.ok(y>550&&x>400,'mark confined to lower-right');changed++;}}assert.ok(changed>300);
 const args=watermarkVideoArgs('/tmp/input','/tmp/out','/tmp/out.txt','creator_1','video/webm');assert.ok(args.includes('matroska'));assert.ok(args.includes('-protocol_whitelist'));assert.match(args[args.indexOf('-vf')+1],/expansion=none/);assert.throws(()=>watermarkVideoArgs('in','out','/tmp/out.txt','creator_1','video/avi'));assert.throws(()=>watermarkVideoArgs('in','out','/tmp/x:evil','creator_1','video/mp4'));
});
test('cleanup protects raw and derivative files while conversion is pending',async()=>{
 const {PlatformJobsService}=require('../dist/src/platform/jobs.service'),m=await upload(),target=await enqueue(m.id);await db.media.updateMany({where:{id:{in:[m.id,target]}},data:{created_at:new Date(0)}});
 const scope=new Proxy(db,{get(object,key){if(key==='media')return new Proxy(object.media,{get(delegate,method){if(method==='findMany')return args=>delegate.findMany({...args,where:{...args.where,id:{in:[m.id,target]}}});return delegate[method];}});const v=object[key];return typeof v==='function'?v.bind(object):v;}});
 const jobs=new PlatformJobsService(new PlatformService(scope),{},new ConfigService({MEDIA_ROOT:root,MEDIA_DELETE_ENABLED:'true',MEDIA_ORPHAN_GRACE_DAYS:'7'})),now=new Date('2098-11-01T12:00:00Z');
 try{await jobs.cleanup(now);for(const id of[m.id,target])assert.equal((await db.media.findUniqueOrThrow({where:{id}})).is_deleted,false);await fs.access(path.join(root,m.id));}finally{await db.platformJob.deleteMany({where:{id:'media-cleanup-2098-11-01'}});}
});
