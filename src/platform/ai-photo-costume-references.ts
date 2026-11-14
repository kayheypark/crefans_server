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
 "29581e": "blue-aris",
 "be80aa": "overwatch-roadhog",
 "20a449": "overwatch-doctrine",
 "372386": "overwatch-dmon",
 "bf777b": "overwatch-genji",
 "d6ed5b": "overwatch-domina",
 "bd95fb": "overwatch-doomfist",
 "90f439": "overwatch-ramattra",
 "136245": "overwatch-lifeweaver",
 "c17e2b": "overwatch-reinhardt",
 "3fce14": "overwatch-wrecking-ball",
 "2d7409": "overwatch-lucio",
 "21150b": "overwatch-reaper",
 "fe56d9": "overwatch-mauga",
 "22a725": "overwatch-mei",
 "5dfc6f": "overwatch-moira",
 "d55c25": "overwatch-mizuki",
 "8fbc01": "overwatch-bastion",
 "f74872": "overwatch-baptiste",
 "14e3be": "overwatch-vendetta",
 "842c82": "overwatch-venture",
 "b456ec": "overwatch-brigitte",
 "9bf5e0": "overwatch-sojourn",
 "6c24e4": "overwatch-soldier-76",
 "d216c5": "overwatch-sombra",
 "2a9d76": "overwatch-sigma",
 "a46594": "overwatch-symmetra",
 "0c0f47": "overwatch-sierra",
 "0ed2b0": "overwatch-shion",
 "69ef61": "overwatch-ana",
 "e34f2f": "overwatch-anran",
 "94975c": "overwatch-echo",
 "d4a54c": "overwatch-emre",
 "7ec222": "overwatch-orisa",
 "7155c7": "overwatch-wuyang",
 "149795": "overwatch-winston",
 "51e8e0": "overwatch-illari",
 "6b0576": "overwatch-zarya",
 "6c0778": "overwatch-junker-queen",
 "479a45": "overwatch-junkrat",
 "ecd733": "overwatch-jetpack-cat",
 "74b6ba": "overwatch-zenyatta",
 "e0298c": "overwatch-juno",
 "60b83e": "overwatch-cassidy",
 "0c643c": "overwatch-kiriko",
 "4cdbb0": "overwatch-torbjorn",
 "105dc8": "overwatch-tracer",
 "0b3d4a": "overwatch-pharah",
 "6d6994": "overwatch-freja",
 "5841e1": "overwatch-hanzo",
 "d79fb8": "overwatch-hazard",
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
