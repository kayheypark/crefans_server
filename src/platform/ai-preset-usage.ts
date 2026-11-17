// 2026-11-17 user decision: count which presets successful AI photo requests used, to pick HOT badges and ordering later.
// Aggregate only — KST day, kind, preset key, count. No member, visitor, IP or request id is stored, so it is not personal data.
// Outfit and background come from the IDs the server already validates; other kinds come from the client's `presetKeys`
// (the preset card titles), which are only counted, never trusted for anything else.
// background here covers the built-in text backgrounds (코믹월드, 내 방 …) that have no reference ID.
const KINDS=new Set(['makeup','expression','pose','camera','lens','body','background']);
const MAX_KEYS=20;
const cleanKey=(v:unknown)=>typeof v==='string'?v.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,64):'';
/** The KST calendar day as a UTC-midnight Date (stored in a DATE column). */
export const kstDay=(now=new Date())=>new Date(new Date(now.getTime()+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
export function presetUsageKeys(input:any):{kind:string;key:string}[]{
 const out=new Map<string,{kind:string;key:string}>();const add=(kind:string,key:string)=>{if(key&&out.size<MAX_KEYS)out.set(kind+'\u0000'+key,{kind,key});};
 let ids:unknown=input?.costumeIds;try{if(typeof ids==='string')ids=JSON.parse(ids);}catch{ids=[];}
 if(Array.isArray(ids))for(const id of ids)if(typeof id==='string'&&/^[0-9a-f]{6}$/.test(id))add('outfit',id);
 if(typeof input?.backgroundId==='string'&&/^[0-9a-f]{6}$/.test(input.backgroundId))add('background',input.backgroundId);
 let keys:unknown=input?.presetKeys;try{if(typeof keys==='string')keys=JSON.parse(keys);}catch{keys=[];}
 if(Array.isArray(keys))for(const item of keys){const kind=typeof item?.kind==='string'?item.kind:'',key=cleanKey(item?.key);if(KINDS.has(kind))add(kind,key);}
 return [...out.values()];
}
/** Never throws: a counting failure must not change a successful generation. */
export async function recordPresetUsage(db:any,input:any,now=new Date()){
 const keys=presetUsageKeys(input);if(!keys.length)return 0;const day=kstDay(now);
 try{for(const {kind,key} of keys)await db.$executeRaw`INSERT INTO ai_preset_usage_daily (day,kind,preset_key,count) VALUES (${day},${kind},${key},1) ON DUPLICATE KEY UPDATE count=count+1`;return keys.length;}
 catch{console.error(JSON.stringify({event:'ai-photo.preset_usage_failed'}));return 0;}
}
