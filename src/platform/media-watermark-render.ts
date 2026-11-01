import {writeFile} from 'fs/promises';
import {runFfmpeg} from './video-transcode';
const sharp:typeof import('sharp').default=require('sharp');

export const WATERMARK_VERSION=1,MAX_WATERMARK_IMAGE_SIDE=2560;
export function watermarkText(handle:string){
 // Handles are server-owned identifiers. Never interpolate arbitrary text into XML or filter syntax.
 if(!/^[a-z0-9_]{3,24}$/.test(handle))throw new Error('INVALID_WATERMARK_HANDLE');
 return `https://crefans.com/${handle}`;
}
export async function watermarkImage(input:string,output:string,handle:string){
 const text=watermarkText(handle),source=sharp(input,{limitInputPixels:40000000}),metadata=await source.metadata();
 const rotated=(metadata.orientation||0)>=5,originalWidth=rotated?metadata.height!:metadata.width!,originalHeight=rotated?metadata.width!:metadata.height!;
 const ratio=Math.min(1,MAX_WATERMARK_IMAGE_SIDE/Math.max(originalWidth,originalHeight)),width=Math.round(originalWidth*ratio),height=Math.round(originalHeight*ratio);
 sharp.concurrency(1);sharp.cache(false); // Worker-only bounded memory; originals remain unchanged.
 const pad=Math.max(2,Math.round(Math.min(width,height)*0.025)),font=Math.max(1,Math.min(Math.min(width,height)*0.035,(width-2*pad)/(text.length*0.65)));
 // A small transparent strip avoids allocating a second full-size raster for large creator photos.
 const stripHeight=Math.min(height,Math.ceil(font*2+pad)),svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stripHeight}"><text x="${width-pad}" y="${stripHeight-pad}" text-anchor="end" font-family="DejaVu Sans" font-size="${font}" font-weight="600" fill="white" fill-opacity="0.86" stroke="black" stroke-opacity="0.6" stroke-width="${Math.max(0.5,font*0.08)}" paint-order="stroke">${text}</text></svg>`);
 await source.rotate().resize({width,height,fit:'fill',withoutEnlargement:true}).composite([{input:svg,gravity:'southeast'}]).webp({quality:88}).toFile(output);
}
export function watermarkVideoArgs(input:string,output:string,textFile:string,handle:string,mime:string){
 const text=watermarkText(handle);if(!['video/mp4','video/webm'].includes(mime))throw new Error('UNSUPPORTED_WATERMARK_VIDEO');
 // Generated absolute temp paths only. Literal textfile + expansion=none avoids filter/text injection.
 if(!/^\/[A-Za-z0-9_./-]+$/.test(textFile))throw new Error('INVALID_WATERMARK_PATH');
 const font=`min(min(w,h)*0.035,(w-min(w,h)*0.05)/${text.length*0.65})`;
 const filter=`scale='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':'if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)',format=yuv420p,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${textFile}:expansion=none:fontsize='${font}':fontcolor=white@0.86:borderw=1:bordercolor=black@0.6:x=w-tw-min(w\\,h)*0.025:y=h-th-min(w\\,h)*0.025`;
 return ['-nostdin','-hide_banner','-loglevel','error','-y','-filter_threads','1','-threads','1','-f',mime==='video/webm'?'matroska':'mov','-protocol_whitelist','file','-i',input,'-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-vf',filter,'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-threads','1','-f','mp4',output];
}
export async function watermarkVideo(input:string,output:string,handle:string,mime:string){
 const textFile=output+'.txt';await writeFile(textFile,watermarkText(handle),{mode:0o600});
 await runFfmpeg(watermarkVideoArgs(input,output,textFile,handle,mime));
}
