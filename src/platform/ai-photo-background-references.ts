import {readFile} from 'fs/promises';
import {join} from 'path';
import {reject} from './http';
const IDS=new Set(['b7a101','b7a102','b7a103','b7a104','b7a105','b7a106','b7a107','c8b201','c8b202','c8b203','c8b204','c8b205','c8b206','c8b207','c8b208','c8b209']);
export function backgroundReferenceId(value:unknown,kinds:string[]):string|undefined{
 if(value===undefined)return;
 if(typeof value!=='string'||!IDS.has(value)||!kinds.includes('background'))reject(400,'INVALID_BACKGROUND_REFERENCE','배경을 다시 선택해 주세요.');
 return value as string;
}
export async function readBackgroundReference(id:string):Promise<Buffer>{
 backgroundReferenceId(id,['background']);
 try{return await readFile(join(__dirname,'ai-photo-backgrounds',id+'.webp'));}
 catch{reject(503,'BACKGROUND_REFERENCE_UNAVAILABLE','배경 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');}
}
