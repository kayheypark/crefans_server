import {readFile} from 'fs/promises';
import {join} from 'path';
import {reject} from './http';
// 2026-11-20 user decision: the chest cup (A–G) and hip size (S–XXXL) chosen in body correction are sent to Seedream with a
// reference photo of a fictional adult (Seedream-made, fitted sportswear, side profile) showing that size. Real people's photos
// are never used. Files: ai-photo-body-references/<id>.webp (768×1024).
const IDS=new Set(['chest-A','chest-B','chest-C','chest-D','chest-E','chest-F','chest-G','hip-S','hip-M','hip-L','hip-XL','hip-XXL','hip-XXXL']);
// 2026-11-20 dev test: with the sports-bra reference the hoodie neckline was cut into a deep V. Keep the clothing exactly.
export const BODY_REFERENCE_RULE='It shows a fictional model only to indicate the requested body size. Match only the visible size and volume of that body part on the person in image 1; never copy the model\'s face, hair, skin, clothing, pose, background or lighting. Keep the clothing of the person in image 1 exactly as it is: the same garment design, neckline height, coverage, fit and fabric. Never open, cut, lower or reshape a neckline, never add a cutout or reveal more skin; the clothing simply drapes over the new body shape.';
/** At most one chest and one hip reference, only with a body edit. */
export function bodyReferenceIds(value:unknown,kinds:string[]):string[]{
 if(value===undefined)return [];
 let ids:unknown=value;try{if(typeof ids==='string')ids=JSON.parse(ids);}catch{reject(400,'INVALID_BODY_REFERENCE','신체 보정을 다시 선택해 주세요.');}
 if(!Array.isArray(ids)||ids.length>2||ids.some(id=>typeof id!=='string'||!IDS.has(id))||!kinds.includes('body'))reject(400,'INVALID_BODY_REFERENCE','신체 보정을 다시 선택해 주세요.');
 const list=ids as string[];
 if(list.filter(id=>id.startsWith('chest-')).length>1||list.filter(id=>id.startsWith('hip-')).length>1)reject(400,'INVALID_BODY_REFERENCE','신체 보정을 다시 선택해 주세요.');
 return list;
}
export function bodyReferencePart(id:string){return id.startsWith('chest-')?'chest (bust)':'hips and buttocks';}
export async function readBodyReference(id:string):Promise<Buffer>{
 if(!IDS.has(id))reject(400,'INVALID_BODY_REFERENCE','신체 보정을 다시 선택해 주세요.');
 try{return await readFile(join(__dirname,'ai-photo-body-references',id+'.webp'));}
 catch{reject(503,'BODY_REFERENCE_UNAVAILABLE','신체 보정 참고 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');}
}
