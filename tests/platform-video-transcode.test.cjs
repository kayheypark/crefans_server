require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-11-01 user decision: iPhone QuickTime (.mov) uploads are accepted and converted to MP4 on the server.
// Upload keeps the original beside the media file (PROCESSING); the worker converts it, publishes MP4 and deletes the original.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{PrismaClient}=require('@prisma/client');
const fs=require('fs'),path=require('path'),os=require('os');
assert.equal(process.env.CREFANS_E2E,'true');const source=process.env.DATABASE_URL;assert.match(source,/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {PlatformMediaController}=require('../dist/src/platform/media.controller'),video=require('../dist/src/platform/video-transcode');
const db=new PrismaClient(),member=randomUUID(),root=fs.mkdtempSync(path.join(os.tmpdir(),'crefans-transcode-'));
const movHeader=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypqt  '),Buffer.alloc(64)]);
function controller(puts){return new PlatformMediaController({db},{get:key=>({MEDIA_ROOT:root})[key]},{enabled:true,put:async(...args)=>puts.push(args)});}
async function upload(bytes,mimetype='video/quicktime',originalname='IMG_0001.MOV'){
 const file=path.join(root,'.upload-'+randomUUID());fs.writeFileSync(file,bytes);
 return controller([]).upload({path:file,mimetype,originalname,size:bytes.length},{user:{sub:member}});
}
// No ffprobe on developer machines: the probe is replaced; limit tests set their own answers.
const probeAnswer={seconds:12,side:1920};video.videoTools.probe=async()=>{if(probeAnswer.fail)throw new Error('probe failed');return probeAnswer;};
before(async()=>{await db.$connect();});
after(async()=>{await db.media.deleteMany({where:{user_sub:member}});await db.$disconnect();fs.rmSync(root,{recursive:true,force:true});});

test('QuickTime uploads are kept as an original and wait for conversion; a fake .mov is rejected',async()=>{
 const result=await upload(movHeader);
 assert.equal(result.type,'video');assert.equal(result.processing,true);
 const row=await db.media.findUniqueOrThrow({where:{id:result.id}});
 assert.equal(row.processing_status,'PROCESSING');assert.equal(row.mime_type,'video/quicktime');assert.equal(row.processed_at,null);
 assert.ok(fs.existsSync(video.sourcePath(root,result.id)));assert.equal(fs.existsSync(path.join(root,result.id)),false);
 // Some iOS versions send .mov as octet-stream: the extension and QuickTime atom decide.
 assert.equal((await upload(movHeader,'application/octet-stream','clip.mov')).processing,true);
 await assert.rejects(upload(Buffer.from('not a video at all, just text')),error=>error.getResponse?.().code==='INVALID_VIDEO');
 await assert.rejects(upload(movHeader,'video/x-msvideo','a.avi'),error=>error.getResponse?.().code==='INVALID_MEDIA');
});

test('the worker converts one waiting video to MP4, stores it under the media key and deletes the original',async()=>{
 await db.media.updateMany({where:{user_sub:member},data:{processing_status:'COMPLETED'}});
 const {id}=await upload(movHeader),puts=[],calls=[];
 const fake=async args=>{calls.push(args);fs.writeFileSync(args[args.length-1],Buffer.from('mp4-bytes'));};
 assert.equal(await video.transcodeNextVideo(db,{enabled:true,put:async(...a)=>puts.push(a)},root,fake),1);
 const row=await db.media.findUniqueOrThrow({where:{id}});
 assert.equal(row.processing_status,'COMPLETED');assert.equal(row.mime_type,'video/mp4');assert.equal(row.file_size,9);
 assert.equal(puts.length,1);assert.equal(puts[0][0],id);assert.equal(puts[0][2],'video/mp4');
 assert.equal(fs.existsSync(video.sourcePath(root,id)),false,'original (with location metadata) removed');
 assert.ok(calls[0].includes('-map_metadata')&&calls[0].includes('libx264')&&calls[0].includes('+faststart'));
 assert.equal(await video.transcodeNextVideo(db,{enabled:true,put:async()=>{}},root,fake),0,'nothing left to convert');
});

test('a failed conversion is marked FAILED and the original is removed; a claimed row is not converted twice',async()=>{
 await db.media.updateMany({where:{user_sub:member},data:{processing_status:'COMPLETED'}});
 const {id}=await upload(movHeader);
 await assert.rejects(video.transcodeNextVideo(db,{enabled:true,put:async()=>{}},root,async()=>{throw new video.TranscodeInputError('decode failed');}),/decode failed/);
 assert.equal((await db.media.findUniqueOrThrow({where:{id}})).processing_status,'FAILED');assert.equal(fs.existsSync(video.sourcePath(root,id)),false);
 const second=await upload(movHeader);await db.media.update({where:{id:second.id},data:{processed_at:new Date()}});
 assert.equal(await video.transcodeNextVideo(db,{enabled:true,put:async()=>{}},root,async()=>{throw new Error('must not run');}),0,'a fresh claim belongs to another worker');
 assert.equal(await video.transcodeNextVideo(db,{enabled:false,put:async()=>{}},root,async args=>fs.writeFileSync(args[args.length-1],'x'),new Date(Date.now()+26*60000)),1,'a stale claim is retried');
 assert.ok(fs.existsSync(path.join(root,second.id)),'local storage serves the converted file under the media id');
});

test('only the uploader can poll conversion status: processing, then completed or failed',async()=>{
 const {id}=await upload(movHeader),c=controller([]);
 assert.deepEqual(await c.status(id,{user:{sub:member}}),{status:'processing'});
 await assert.rejects(c.status(id,{user:{sub:randomUUID()}}),error=>error.getResponse?.().code==='MEDIA_NOT_FOUND');
 await db.media.update({where:{id},data:{processing_status:'COMPLETED'}});assert.deepEqual(await c.status(id,{user:{sub:member}}),{status:'completed'});
 await db.media.update({where:{id},data:{processing_status:'FAILED'}});assert.deepEqual(await c.status(id,{user:{sub:member}}),{status:'failed'});
});

test('a converting iPhone video can be saved, scheduled and published; the post shows it as optimizing; a failed one is refused',async()=>{
 const {PlatformService}=require('../dist/src/platform/service'),{PlatformStudioService}=require('../dist/src/platform/studio.service'),{ConfigService}=require('@nestjs/config');
 const service=new PlatformService(db,undefined,new ConfigService({BETA_MODE:'false'})),studio=new PlatformStudioService(service);
 if(!await db.member.findUnique({where:{id:member}}))await db.member.create({data:{id:member,email:member+'@transcode.invalid',name:'Transcode fixture',nickname:'Transcode fixture',preferred_username:member,email_verified:true}});
 if(!await db.creator.findUnique({where:{user_id:member}}))await db.creator.create({data:{user_id:member}});
 const {id}=await upload(movHeader),media=[{id,type:'video',url:`/api/v1/media/${id}/file`}];
 const base={title:'아이폰 영상',body:'본문',media,commentsEnabled:true,tipsEnabled:true,accessPlanId:null,accessLevel:null};
 try{
  const draft=await studio.saveContent(member,{...base,status:'draft',scheduledAt:null});assert.ok(draft.id,'draft saved while converting');
  await studio.saveContent(member,{...base,id:draft.id,status:'scheduled',scheduledAt:new Date(Date.now()+3600000).toISOString()});
  await studio.saveContent(member,{...base,id:draft.id,status:'published',scheduledAt:null});
  const detail=await service.postDetail(draft.id);assert.deepEqual(detail.post.media.map(m=>m.processing),[true],'viewers see the optimizing notice');
  const failed=await upload(movHeader);await db.media.update({where:{id:failed.id},data:{processing_status:'FAILED'}});
  await assert.rejects(studio.saveContent(member,{...base,id:draft.id,status:'published',scheduledAt:null,media:[{id:failed.id,type:'video',url:failed.url}]}),error=>error.getResponse?.().code==='INVALID_MEDIA');
 }finally{await db.postingMedia.deleteMany({where:{posting:{user_sub:member}}}).catch(()=>{});await db.posting.deleteMany({where:{user_sub:member}});await db.creator.deleteMany({where:{user_id:member}});await db.member.deleteMany({where:{id:member}});}
});

test('upload refuses QuickTime longer than 10 minutes, larger than 4K, or unreadable; nothing is stored',async()=>{
 try{
  Object.assign(probeAnswer,{seconds:601,side:1920});await assert.rejects(upload(movHeader),error=>error.getResponse?.().code==='VIDEO_TOO_LONG');
  Object.assign(probeAnswer,{seconds:30,side:4097});await assert.rejects(upload(movHeader),error=>error.getResponse?.().code==='VIDEO_TOO_LARGE');
  Object.assign(probeAnswer,{fail:true});await assert.rejects(upload(movHeader),error=>error.getResponse?.().code==='INVALID_VIDEO');
  assert.equal(fs.readdirSync(root).filter(f=>f.endsWith('.source')&&!fs.existsSync(path.join(root,f))).length,0);
 }finally{Object.assign(probeAnswer,{seconds:12,side:3840,fail:false});}
 assert.equal((await upload(movHeader)).processing,true,'4K and 12 seconds are accepted');
});

test('storage trouble keeps the original and retries; the third failure gives up; ffmpeg input is locked down',async()=>{
 await db.media.updateMany({where:{user_sub:member},data:{processing_status:'COMPLETED'}});
 const {id}=await upload(movHeader),fake=async args=>fs.writeFileSync(args[args.length-1],'x'),broken={enabled:true,put:async()=>{throw new Error('S3 503');}};
 let clock=Date.now();
 for(let attempt=1;attempt<=3;attempt++){
  await assert.rejects(video.transcodeNextVideo(db,broken,root,fake,new Date(clock)),/S3 503/);
  const row=await db.media.findUniqueOrThrow({where:{id}});assert.equal(row.processing_job_id,`transcode-attempt:${attempt}`);
  if(attempt<3){assert.equal(row.processing_status,'PROCESSING');assert.ok(fs.existsSync(video.sourcePath(root,id)),'original kept for retry');
   assert.equal(await video.transcodeNextVideo(db,broken,root,fake,new Date(clock+60000)),0,'not retried before two minutes');clock+=3*60000;}
  else{assert.equal(row.processing_status,'FAILED');assert.equal(fs.existsSync(video.sourcePath(root,id)),false);}
 }
 const args=video.transcodeArgs('in','out');
 assert.ok(args.indexOf('-f')<args.indexOf('-i')&&args[args.indexOf('-f')+1]==='mov'&&args.includes('-protocol_whitelist'));
 assert.match(args[args.indexOf('-vf')+1],/trunc\(min\(1280,iw\)\/2\)\*2/);
});
