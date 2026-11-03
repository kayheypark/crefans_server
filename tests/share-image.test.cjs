require('reflect-metadata');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PlatformMediaController}=require('../dist/src/platform/media.controller');
const {ShareImageRenderer,SHARE_FALLBACK,shareFrameArgs}=require('../dist/src/platform/share-image');
const sharp=require('sharp');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const id='12345678-1234-1234-1234-123456789012';
function setup(overrides={}){
 const media={id,updated_at:new Date(),processing_status:'COMPLETED',is_deleted:false};
 const post={is_public:true,is_membership:false,is_sensitive:false,medias:[{media}],...overrides};let renders=0;
 const service={db:{posting:{findFirst:async()=>post}},access:async(_post,viewer)=>{assert.equal(viewer,undefined);return true;}};
 const controller=new PlatformMediaController(service,{get:()=>undefined},{});
 controller.authorize=async(_id,req)=>{assert.deepEqual(req,{});return media;};
 controller.shareImages={render:async()=>{renders++;return Buffer.from('jpeg');}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},redirect(code,url){this.status=code;this.url=url;},send(bytes){this.bytes=bytes;}};
 return{controller,res,post,media,service,renders:()=>renders};
}
for(const [name,overrides] of Object.entries({membership:{is_membership:true},adult:{is_sensitive:true},private:{is_public:false},empty:{medias:[]}}))test(`${name} uses fallback without rendering`,async()=>{const s=setup(overrides);await s.controller.shareImage(id,s.res);assert.equal(s.res.url,SHARE_FALLBACK);assert.equal(s.renders(),0);});
test('public image is served with no-store',async()=>{const s=setup();await s.controller.shareImage(id,s.res);assert.equal(s.res.headers['Content-Type'],'image/jpeg');assert.equal(s.res.headers['Cache-Control'],'no-store');assert.ok(s.res.bytes);assert.equal(s.renders(),1);});
test('permission change during render discards bytes',async()=>{const s=setup();s.controller.shareImages.render=async()=>{s.post.is_public=false;return Buffer.from('private');};await s.controller.shareImage(id,s.res);assert.equal(s.res.url,SHARE_FALLBACK);assert.equal(s.res.bytes,undefined);});
test('linked-media authorization denial cannot be bypassed',async()=>{const s=setup();s.controller.authorize=async()=>{throw{getStatus:()=>403};};await s.controller.shareImage(id,s.res);assert.equal(s.res.url,SHARE_FALLBACK);assert.equal(s.renders(),0);});
test('inactive creator or unpublished access denied',async()=>{const s=setup();s.service.access=async()=>false;await s.controller.shareImage(id,s.res);assert.equal(s.res.url,SHARE_FALLBACK);assert.equal(s.renders(),0);});
test('conversion failure uses fallback',async()=>{const s=setup();s.controller.shareImages.render=async()=>{throw Error('broken');};await s.controller.shareImage(id,s.res);assert.equal(s.res.url,SHARE_FALLBACK);});
test('local source creates real 1200x630 JPEG',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'share-test-'));try{await sharp({create:{width:64,height:64,channels:3,background:'#2463eb'}}).png().toFile(path.join(dir,id));const renderer=new ShareImageRenderer();const media={id,updated_at:new Date(),type:'IMAGE',mime_type:'image/png',file_size:100,s3_upload_key:`local/${id}`,file_name:id};const bytes=await renderer.render(media,dir,{});const meta=await sharp(bytes).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,1200);assert.equal(meta.height,630);await assert.rejects(renderer.render({...media,id:'other',s3_upload_key:'https://example.com'},dir,{}),/LEGACY/);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('video conversion restricts protocols and strips audio/metadata',()=>{const args=shareFrameArgs('in','out','video/mp4');assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file');assert.ok(args.includes('-an'));assert.equal(args[args.indexOf('-frames:v')+1],'1');assert.equal(args[args.indexOf('-map_metadata')+1],'-1');});
test('real video frame becomes JPEG',{skip:require('node:child_process').spawnSync('ffmpeg',['-version']).error?'ffmpeg unavailable locally':false},async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'share-video-'));try{require('node:child_process').execFileSync('ffmpeg',['-nostdin','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:d=1','-threads','1','-c:v','libx264','-f','mp4',path.join(dir,id)]);const media={id,updated_at:new Date(),type:'VIDEO',mime_type:'video/mp4',file_size:1000,s3_upload_key:`local/${id}`,file_name:id};const bytes=await new ShareImageRenderer().render(media,dir,{});const meta=await sharp(bytes).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,1200);assert.equal(meta.height,630);}finally{await fs.rm(dir,{recursive:true,force:true});}});
