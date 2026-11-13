import {readFile} from 'fs/promises';
import {join} from 'path';
import {reject} from './http';
// Fixed local catalog only: never fetch a client-supplied URL or path.
export const AI_PHOTO_COSTUME_IDS=["maid", "sailor", "gothic", "mage", "cyber", "idol", "cheer", "beach", "nikke-rapi", "nikke-anis", "nikke-helm", "nikke-noir", "overwatch-dva", "overwatch-mercy", "overwatch-widow", "overwatch-ashe", "diablo-sorcerer", "diablo-necromancer", "diablo-rogue", "diablo-barbarian", "aot-scout", "aot-captain", "aot-police", "aot-final", "demon-giyu", "demon-shinobu", "demon-rengoku", "demon-mitsuri", "jjk-gojo", "jjk-nanami", "jjk-geto", "jjk-toji"] as const;
export function costumeReferenceIds(value:unknown,kinds:string[],style:string):string[]{
 if(value===undefined)return [];
 let ids:unknown=value;try{if(typeof ids==='string')ids=JSON.parse(ids);}catch{reject(400,'INVALID_COSTUME_REFERENCES','의상을 다시 선택해 주세요.');}
 if(!Array.isArray(ids)||ids.length<1||ids.length>14||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!(AI_PHOTO_COSTUME_IDS as readonly string[]).includes(id))||!kinds.includes('outfit')||style!=='cosplay')reject(400,'INVALID_COSTUME_REFERENCES','의상을 다시 선택해 주세요.');
 return ids as string[];
}
export async function readCostumeReference(id:string):Promise<Buffer>{
 try{return await readFile(join(__dirname,'ai-photo-costumes',id+'-v2.webp'));}
 catch{reject(503,'COSTUME_REFERENCE_UNAVAILABLE','의상 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');}
}
