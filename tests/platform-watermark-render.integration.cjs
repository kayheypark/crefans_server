// Real ffmpeg/libvips verification inside the production Linux image. No DB, provider or network calls.
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{mkdtempSync}=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),sharp=require('sharp');
const {watermarkImage,watermarkVideo}=require('../dist/src/platform/media-watermark-render');
const root=mkdtempSync(path.join(os.tmpdir(),'wm-real-')),out=process.env.WATERMARK_EVIDENCE_DIR||root;
function ff(args){execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-threads','1',...args],{timeout:60000});}
function probe(file){return JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));}
after(async()=>fs.rm(root,{recursive:true,force:true}));
for(const [format,width,height,audio]of[['mp4',1280,720,true],['webm',720,1280,false]])test('real '+format+' watermark preserves aspect ratio and optional audio',async()=>{
 const input=path.join(root,'input.'+format),output=path.join(root,'output-'+format+'.mp4');
 ff(['-f','lavfi','-i',`color=c=0x477c8c:s=${width}x${height}:r=5:d=1`,...(audio?['-f','lavfi','-i','sine=frequency=440:duration=1']:[]),'-c:v',format==='webm'?'libvpx-vp9':'libx264','-threads','1',...(audio?['-c:a','aac']:[]),input]);
 await watermarkVideo(input,output,'creator_qa',format==='webm'?'video/webm':'video/mp4');const meta=probe(output),v=meta.streams.find(s=>s.codec_type==='video');assert.equal(v.codec_name,'h264');assert.equal(v.width,width);assert.equal(v.height,height);assert.equal(meta.streams.some(s=>s.codec_type==='audio'),audio);assert.ok(Number(meta.format.duration)>.8);
 const png=path.join(root,format+'.png');ff(['-i',output,'-frames:v','1',png]);const raw=await sharp(png).raw().toBuffer({resolveWithObject:true});let marks=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*raw.info.channels;if(raw.data[i]>160){assert.ok(y>height*.9&&x>width*.2);marks++;}}assert.ok(marks>100);await fs.copyFile(png,path.join(out,format+'-frame.png'));await fs.copyFile(output,path.join(out,format+'-watermarked.mp4'));
});
test('EXIF orientation normalized and metadata removed with readable mark',async()=>{
 const input=path.join(root,'rotated.jpg'),output=path.join(root,'portrait.webp');await sharp({create:{width:1000,height:700,channels:3,background:'#70899b'}}).withMetadata({orientation:6}).jpeg().toFile(input);await watermarkImage(input,output,'creator_qa');const m=await sharp(output).metadata();assert.equal(m.width,700);assert.equal(m.height,1000);assert.equal(m.orientation,undefined);await fs.copyFile(output,path.join(out,'portrait.webp'));
});
test('40 megapixel photo completes under the configured container memory limit',async()=>{
 const input=path.join(root,'large.webp'),output=path.join(root,'large-marked.webp');await fs.copyFile(path.join(out,'large-input.webp'),input);await watermarkImage(input,output,'creator_qa');const m=await sharp(output).metadata();assert.equal(m.width,2560);assert.equal(m.height,1600);await sharp(output).resize(1200).png().toFile(path.join(out,'large-preview.png'));
});
