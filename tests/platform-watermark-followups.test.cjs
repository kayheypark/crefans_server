require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// Watermark follow-ups (2026-11-02 user decisions, night-work 2026-11-02 #7·#8·#9): MP4·WebM limits and metadata removal,
// uploads that skip the watermark for unprintable handles, worker temp cleanup, follower notices held until media is processed,
// and retired handles that stay reserved and lead to the current profile.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp');
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const video=require('../dist/src/platform/video-transcode'),{cleanMediaTemp,watermarkNextMedia}=require('../dist/src/platform/media-watermark'),notices=require('../dist/src/platform/post-notices');
const {PlatformMediaController}=require('../dist/src/platform/media.controller'),{PlatformService}=require('../dist/src/platform/service'),{PlatformStudioService}=require('../dist/src/platform/studio.service'),{purgeMember}=require('../dist/src/platform/member-purge');
const db=new PrismaClient(),owner=randomUUID(),fan=randomUUID(),odd=randomUUID(),mover=randomUUID(),ids=[owner,fan,odd,mover];
const handle='wf_'+owner.slice(0,8),oddHandle='access-'+odd.slice(0,8),oldHandle='wo_'+mover.slice(0,8),newHandle='wn_'+mover.slice(0,8);
const service=new PlatformService(db,undefined,new ConfigService({BETA_MODE:'false'})),studio=new PlatformStudioService(service);let root,release;
const controller=()=>new PlatformMediaController(service,new ConfigService({MEDIA_ROOT:root}),{enabled:false});
async function upload(member,bytes,mimetype,originalname){const file=path.join(root,'.upload-'+randomUUID());await fs.writeFile(file,bytes);return controller().upload({path:file,mimetype,originalname,size:bytes.length},{user:{sub:member}});}
const png=()=>sharp({create:{width:64,height:48,channels:3,background:'#477c8c'}}).png().toBuffer();
const mp4=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypisom'),Buffer.alloc(64)]),webm=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(64)]);
const post=(media,status='published',id)=>({...(id?{id}:{}),title:'알림 보류',body:'본문',media,commentsEnabled:true,tipsEnabled:true,accessPlanId:null,accessLevel:null,status,scheduledAt:null});
const fanNotices=postId=>db.memberNotification.count({where:{member_id:fan,path:`/post/${postId}`}});
// No ffprobe/ffmpeg on developer machines: probe and metadata rewrite are replaced; tests set the answers.
const probe={seconds:12,side:1920},calls=[];
video.videoTools.probe=async(file,format)=>{calls.push(['probe',format]);if(probe.fail)throw new Error('probe failed');return probe;};
video.videoTools.strip=async(input,output,mime)=>{calls.push(['strip',mime]);if(probe.stripFail)throw new Error('ffmpeg exited 1');await fs.writeFile(output,'clean-'+mime);};
before(async()=>{
 release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);root=await fs.mkdtemp(path.join(os.tmpdir(),'crefans-wm-followups-'));await db.$connect();
 const names={[owner]:handle,[fan]:'wf_fan_'+fan.slice(0,8),[odd]:oddHandle,[mover]:oldHandle};
 for(const id of ids)await db.member.create({data:{id,email:id+'@wm-followups.invalid',name:'Synthetic',nickname:'Synthetic',preferred_username:names[id],email_verified:true}});
 for(const id of[owner,odd,mover])await db.creator.create({data:{user_id:id,handle:names[id],is_active:true}});
 await db.userFollow.create({data:{follower_id:fan,following_id:owner}});
});
after(async()=>{
 await db.memberNotification.deleteMany({where:{OR:[{member_id:{in:ids}},{actor_id:{in:ids}}]}});await db.userFollow.deleteMany({where:{following_id:owner}});
 await db.postingMedia.deleteMany({where:{posting:{user_sub:{in:ids}}}});await db.posting.deleteMany({where:{user_sub:{in:ids}}});await db.mediaWatermarkJob.deleteMany({where:{creator_id:{in:ids}}});await db.media.deleteMany({where:{user_sub:{in:ids}}});
 await db.platformOperationalEvent.deleteMany({where:{dedupe_key:`watermark-skipped:${odd}`}});await db.retiredHandle.deleteMany({where:{member_id:{in:ids}}});
 await db.creator.deleteMany({where:{user_id:{in:ids}}});await db.member.deleteMany({where:{id:{in:ids}}});await db.$disconnect();await fs.rm(root,{recursive:true,force:true});await release?.();
});

test('MP4 and WebM get the 10-minute/4K limit and are stored without metadata; nothing is kept when they are refused',async()=>{
 calls.length=0;const a=await upload(fan,mp4,'video/mp4','clip.mp4'),b=await upload(fan,webm,'video/webm','clip.webm');
 assert.deepEqual(calls,[['probe','mov'],['strip','video/mp4'],['probe','matroska'],['strip','video/webm']]);
 assert.equal(await fs.readFile(path.join(root,a.id),'utf8'),'clean-video/mp4','the stored file is the rewritten one');
 assert.equal((await db.media.findUniqueOrThrow({where:{id:b.id}})).file_size,'clean-video/webm'.length);
 try{
  Object.assign(probe,{seconds:601});await assert.rejects(upload(fan,mp4,'video/mp4','long.mp4'),e=>e.getResponse?.().code==='VIDEO_TOO_LONG');
  Object.assign(probe,{seconds:30,side:4097});await assert.rejects(upload(fan,webm,'video/webm','big.webm'),e=>e.getResponse?.().code==='VIDEO_TOO_LARGE');
  Object.assign(probe,{side:1920,stripFail:true});await assert.rejects(upload(fan,mp4,'video/mp4','odd.mp4'),e=>e.getResponse?.().code==='INVALID_VIDEO');
 }finally{Object.assign(probe,{seconds:12,side:1920,stripFail:false});}
 assert.equal(await db.media.count({where:{user_sub:fan}}),2);assert.deepEqual((await fs.readdir(root)).filter(f=>!f.startsWith('.')).sort(),[a.id,b.id].sort(),'no leftover upload or partial file');
 const args=video.stripMetadataArgs('/in','/out','video/webm');
 assert.ok(args.indexOf('-f')<args.indexOf('-i')&&args[args.indexOf('-f')+1]==='matroska'&&args.includes('-protocol_whitelist'));
 for(const flag of['-map_metadata','-map_metadata:s','-map_chapters'])assert.equal(args[args.indexOf(flag)+1],'-1');
 assert.equal(args[args.indexOf('-c')+1],'copy');assert.deepEqual(args.slice(-3),['-f','webm','/out']);assert.deepEqual(video.stripMetadataArgs('/in','/out','video/mp4').slice(-5),['-movflags','+faststart','-f','mp4','/out']);
});

test('an active creator whose handle cannot be printed still uploads without a watermark; operators hear once',async()=>{
 const first=await upload(odd,await png(),'image/png','a.png'),second=await upload(odd,await png(),'image/png','b.png');
 for(const {id} of[first,second])assert.equal((await db.media.findUniqueOrThrow({where:{id}})).metadata,null);
 const events=await db.platformOperationalEvent.findMany({where:{dedupe_key:`watermark-skipped:${odd}`}});
 assert.equal(events.length,1);assert.equal(events[0].type,'media.watermark_skipped');assert.deepEqual(events[0].data,{memberId:odd,status:'invalid_handle'});
});

test('worker start removes job folders and partial MP4s older than a lease, never running ones or originals',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'crefans-wm-clean-')),old=new Date(Date.now()-26*60000);
 try{
  await fs.mkdir(path.join(temp,'.watermark','job-old'),{recursive:true});await fs.writeFile(path.join(temp,'.watermark','job-old','input'),'x');await fs.mkdir(path.join(temp,'.watermark','job-new'));
  for(const name of['a.mp4.tmp','b.mp4.tmp','c.source'])await fs.writeFile(path.join(temp,name),'x');
  for(const file of[path.join(temp,'.watermark','job-old'),path.join(temp,'a.mp4.tmp'),path.join(temp,'c.source')])await fs.utimes(file,old,old);
  assert.equal(await cleanMediaTemp(temp),2);
  assert.deepEqual(await fs.readdir(path.join(temp,'.watermark')),['job-new']);assert.deepEqual((await fs.readdir(temp)).sort(),['.watermark','b.mp4.tmp','c.source']);
  assert.equal(await cleanMediaTemp(path.join(temp,'missing')),0,'no media folder yet is fine');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('followers hear of a post only after its photo is watermarked; a post without media is announced at once',async()=>{
 const photo=await upload(owner,await png(),'image/png','p.png'),{id}=await studio.saveContent(owner,post([photo]));
 assert.equal(await fanNotices(id),0,'not announced while the photo is processing');assert.equal((await db.posting.findUniqueOrThrow({where:{id}})).notify_pending,true);
 assert.equal(await notices.releaseHeldNotices(db),0);
 assert.equal(await watermarkNextMedia(db,{enabled:false},root),1);
 assert.equal(await notices.releaseHeldNotices(db),1);assert.equal(await fanNotices(id),1);assert.equal((await db.posting.findUniqueOrThrow({where:{id}})).notify_pending,false);
 assert.equal(await notices.releaseHeldNotices(db),0);await studio.saveContent(owner,post([],'published',id));assert.equal(await fanNotices(id),1,'never announced twice');
 const text=await studio.saveContent(owner,post([]));assert.equal(await fanNotices(text.id),1);assert.equal((await db.posting.findUniqueOrThrow({where:{id:text.id}})).notify_pending,false);
});

test('a failed photo tells the creator and holds the notice until the post is fixed; back to draft drops the held notice',async()=>{
 const photo=await upload(owner,await png(),'image/png','f.png'),{id}=await studio.saveContent(owner,post([photo]));
 const target=(await db.postingMedia.findFirstOrThrow({where:{posting_id:id}})).media_id,broken={image:async()=>{throw new Error('render failed');},video:()=>assert.fail()};let now=Date.now();
 for(let i=0;i<3;i++){await assert.rejects(watermarkNextMedia(db,{enabled:false},root,broken,new Date(now)),/WATERMARK_CONVERSION_FAILED/);now+=3*60000;}
 assert.equal((await db.media.findUniqueOrThrow({where:{id:target}})).processing_status,'FAILED');
 const told=await db.memberNotification.findMany({where:{member_id:owner,type:'media'}});
 assert.equal(told.length,1);assert.equal(told[0].path,`/studio/content/${id}/edit`);
 assert.equal(await notices.releaseHeldNotices(db),0);assert.equal(await fanNotices(id),0,'followers are not sent to a post with a missing photo');
 await studio.saveContent(owner,post([],'published',id));assert.equal(await fanNotices(id),1,'announced when the creator removes the failed photo');
 const later=await upload(owner,await png(),'image/png','d.png'),draft=await studio.saveContent(owner,post([later]));
 await studio.saveContent(owner,post([{...later,id:(await db.postingMedia.findFirstOrThrow({where:{posting_id:draft.id}})).media_id}],'draft',draft.id));
 assert.equal((await db.posting.findUniqueOrThrow({where:{id:draft.id}})).notify_pending,false);
 assert.equal(await watermarkNextMedia(db,{enabled:false},root),1);assert.equal(await notices.releaseHeldNotices(db),0);assert.equal(await fanNotices(draft.id),0);
});

test('a changed handle stays reserved for its owner and leads to the current profile; taking it back or withdrawing releases it',async()=>{
 await service.profile(mover,{name:'Mover',bio:'',handle:newHandle});
 assert.deepEqual(await service.handleAvailability(fan,oldHandle),{handle:oldHandle,available:false});
 assert.deepEqual(await service.handleAvailability(mover,oldHandle),{handle:oldHandle,available:true});
 await assert.rejects(service.profile(fan,{name:'Fan',bio:'',handle:oldHandle}),e=>e.getResponse?.().code==='HANDLE_TAKEN');
 const shown=await service.publicProfile(oldHandle);assert.equal(shown.id,mover);assert.equal(shown.handle,newHandle);
 await service.profile(mover,{name:'Mover',bio:'',handle:oldHandle});
 assert.deepEqual((await db.retiredHandle.findMany({where:{member_id:mover}})).map(r=>r.handle),[newHandle]);
 await db.$transaction(tx=>purgeMember(tx,mover,mover+'@wm-followups.invalid'));
 assert.equal(await db.retiredHandle.count({where:{member_id:mover}}),0);assert.equal((await service.handleAvailability(fan,newHandle)).available,true);
});
