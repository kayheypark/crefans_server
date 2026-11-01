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
 await assert.rejects(video.transcodeNextVideo(db,{enabled:true,put:async()=>{}},root,async()=>{throw new Error('decode failed');}),/decode failed/);
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
