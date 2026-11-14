import {readFile} from 'fs/promises';
import {join} from 'path';
import {reject} from './http';
// Fixed local catalog only: never fetch a client-supplied URL or path.
// Stable six-character catalog IDs; filenames remain independent of public IDs.
const COSTUME_ASSETS:Record<string,string>={
 "773106": "maid",
 "80974e": "sailor",
 "ffb58f": "gothic",
 "666147": "mage",
 "b4bf5d": "cyber",
 "e614f6": "idol",
 "190513": "cheer",
 "ab36e8": "beach",
 "313a28": "nikke-rapi",
 "1947f3": "nikke-anis",
 "173f1e": "nikke-helm",
 "ce1f18": "nikke-noir",
 "70219a": "overwatch-dva",
 "7281fe": "overwatch-mercy",
 "8971c9": "overwatch-widow",
 "9a01b2": "overwatch-ashe",
 "da6901": "diablo-sorcerer",
 "87ad51": "diablo-necromancer",
 "72db9a": "diablo-rogue",
 "b3bfdd": "diablo-barbarian",
 "1a73b4": "aot-scout",
 "3e20e3": "aot-captain",
 "556b2b": "aot-police",
 "8f1113": "aot-final",
 "c65204": "demon-giyu",
 "9e6184": "demon-shinobu",
 "8d3d3e": "demon-rengoku",
 "6ee320": "demon-mitsuri",
 "07c722": "jjk-gojo",
 "edf3b8": "jjk-nanami",
 "6c9ecb": "jjk-geto",
 "a77dd5": "jjk-toji",
 "b516a6": "genshin-raiden",
 "752866": "genshin-jean",
 "2056e8": "genshin-zhongli",
 "d69be9": "genshin-diluc",
 "80bdd0": "blue-shiroko",
 "4298dc": "blue-hoshino",
 "c7289e": "blue-yuuka",
 "29581e": "blue-aris"
};
export const AI_PHOTO_COSTUME_IDS=Object.keys(COSTUME_ASSETS);
function canonicalId(id:string):string|undefined{
 if(Object.prototype.hasOwnProperty.call(COSTUME_ASSETS,id))return id;
 // Already-open clients may still send the previous catalog names.
 return AI_PHOTO_COSTUME_IDS.find(key=>COSTUME_ASSETS[key]===id);
}
export function costumeReferenceIds(value:unknown,kinds:string[],style:string):string[]{
 if(value===undefined)return [];
 let ids:unknown=value;try{if(typeof ids==='string')ids=JSON.parse(ids);}catch{reject(400,'INVALID_COSTUME_REFERENCES','의상을 다시 선택해 주세요.');}
 if(!Array.isArray(ids)||ids.length<1||ids.length>14||ids.some(id=>typeof id!=='string'||!canonicalId(id))||!kinds.includes('outfit')||style!=='cosplay')reject(400,'INVALID_COSTUME_REFERENCES','의상을 다시 선택해 주세요.');
 const canonical=(ids as string[]).map(id=>canonicalId(id)!);
 if(new Set(canonical).size!==canonical.length)reject(400,'INVALID_COSTUME_REFERENCES','의상을 다시 선택해 주세요.');
 return canonical;
}
export async function readCostumeReference(id:string):Promise<Buffer>{
 const canonical=canonicalId(id);if(!canonical)reject(400,'INVALID_COSTUME_REFERENCES','의상을 다시 선택해 주세요.');
 try{return await readFile(join(__dirname,'ai-photo-costumes',COSTUME_ASSETS[canonical]+'-v2.webp'));}
 catch{reject(503,'COSTUME_REFERENCE_UNAVAILABLE','의상 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');}
}
