// 2026-11-21 user request (유입 분석·랜딩 링크): count AI photo landing visits per KST day and UTM combination, and keep the
// operator's tagged landing links. Aggregate only — day, utm values, referrer host and a count. No IP, member, guest id,
// cookie or user agent is stored and there is no per-visitor row. Counting starts at deploy (no backfill).
import {randomUUID} from 'node:crypto';
import {kstDay} from './ai-preset-usage';
import {reject} from './http';
import {appendAudit,auditChange} from './audit';

export const UTM=/^[A-Za-z0-9_.-]{1,40}$/;
type Source={referrerHost?:string;utmSource?:string;utmMedium?:string;utmCampaign?:string;utmContent?:string};

/** Never throws: a counting failure must not change the request it rides on. Source and medium are lowercased. */
export async function recordLandingUtm(db:any,source:Source,now=new Date()){
 try{
  const s=(source.utmSource||'').toLowerCase(),m=(source.utmMedium||'').toLowerCase(),c=source.utmCampaign||'',t=source.utmContent||'',r=source.referrerHost||'';
  await db.$executeRaw`INSERT INTO landing_utm_daily (day,source,medium,campaign,content,referrer_host,count) VALUES (${kstDay(now)},${s},${m},${c},${t},${r},1) ON DUPLICATE KEY UPDATE count=count+1`;
  return true;
 }catch{console.error(JSON.stringify({event:'funnel.landing_utm_failed'}));return false;}
}

export const UTM_STATS_DEFAULT_DAYS=14,UTM_STATS_MAX_DAYS=92;
const DATE=/^\d{4}-\d\d-\d\d$/,DAY=86400000,iso=(d:Date)=>d.toISOString().slice(0,10);
function day(value:unknown,fallback:Date){
 if(value===undefined||value==='')return fallback;
 const d=typeof value==='string'&&DATE.test(value)?new Date(value+'T00:00:00Z'):null;
 if(!d||Number.isNaN(+d)||iso(d)!==value)reject(400,'INVALID_INPUT','날짜는 YYYY-MM-DD 형식으로 입력해주세요.');
 return d as Date;
}
/** KST date range, both ends included. Default: the last 14 days through today. At most 92 days, never after today. */
export function utmRange(query:any,now=new Date()){
 const today=kstDay(now),to=day(query?.to,today),from=day(query?.from,new Date(+to-(UTM_STATS_DEFAULT_DAYS-1)*DAY));
 if(from>to)reject(400,'INVALID_INPUT','시작일이 종료일보다 늦어요.');
 if(to>today)reject(400,'INVALID_INPUT','오늘 이후 날짜는 볼 수 없어요.');
 const days=Math.round((+to-+from)/DAY)+1;
 if(days>UTM_STATS_MAX_DAYS)reject(400,'INVALID_INPUT',`기간은 최대 ${UTM_STATS_MAX_DAYS}일까지 볼 수 있어요.`);
 return{from,to,days};
}

/** Console 유입 분석: totals per source/medium/campaign/content, a no-UTM bucket by referrer host, and a zero-filled daily series. */
export async function landingUtmStats(db:any,query:any,now=new Date()){
 const {from,to,days}=utmRange(query,now);
 const rows:any[]=await db.$queryRaw`SELECT day,source,medium,campaign,content,referrer_host,count FROM landing_utm_daily WHERE day>=${from} AND day<=${to}`;
 const views:any[]=await db.$queryRaw`SELECT day,count FROM funnel_step_daily WHERE step='landing_view' AND day>=${from} AND day<=${to}`;
 const [first]:any[]=await db.$queryRaw`SELECT MIN(day) AS day FROM landing_utm_daily`;
 const trackingSince=first?.day?iso(new Date(first.day)):null;
 const dates=Array.from({length:days},(_,i)=>iso(new Date(+from+i*DAY)));
 const daily=new Map(dates.map(d=>[d,{date:d,landingViews:0,withUtm:0,withoutUtm:0}]));
 // Share is against landing_view on days UTM counting already ran, so days before deploy do not dilute it.
 let landingViews=0;
 for(const v of views){const d=iso(new Date(v.day)),n=Number(v.count);daily.get(d)!.landingViews=n;if(trackingSince&&d>=trackingSince)landingViews+=n;}
 const groups=new Map<string,any>(),hosts=new Map<string,number>(),sources=new Map<string,number>();let withUtm=0,withoutUtm=0;
 for(const r of rows){
  const n=Number(r.count),d=daily.get(iso(new Date(r.day)))!;
  if(r.source||r.medium||r.campaign||r.content){
   withUtm+=n;d.withUtm+=n;
   const key=[r.source,r.medium,r.campaign,r.content].join('\u0000'),g=groups.get(key)||{source:r.source,medium:r.medium,campaign:r.campaign,content:r.content,count:0};
   g.count+=n;groups.set(key,g);sources.set(r.source,(sources.get(r.source)||0)+n);
  }else{withoutUtm+=n;d.withoutUtm+=n;hosts.set(r.referrer_host,(hosts.get(r.referrer_host)||0)+n);}
 }
 const byCount=(a:any,b:any)=>b.count-a.count;
 const top=[...sources].map(([source,count])=>({source,count})).sort(byCount)[0]||null;
 return{timeZone:'Asia/Seoul',from:iso(from),to:iso(to),days,maxDays:UTM_STATS_MAX_DAYS,trackingSince,dates,
  totals:{landingViews,recorded:withUtm+withoutUtm,withUtm,withoutUtm},topSource:top,
  groups:[...groups.values()].sort(byCount),noUtm:[...hosts].map(([referrerHost,count])=>({referrerHost,count})).sort(byCount),
  daily:[...daily.values()],
  notice:'날짜는 한국 시간 기준이에요. 유입 집계는 이 기능 배포 이후부터 쌓여요(이전 방문은 없음). AI 사진 랜딩 방문만 세며, 브라우저가 탭(세션)당 한 번 보내는 대략값이에요. 개인을 구분하지 않아 같은 사람이 여러 번 셀 수 있어요.'};
}

// Landing links (랜딩 링크 관리). Only these landing paths can be linked.
export const LANDING_BASE_URL='https://crefans.com';
export const LANDING_PATHS=['/service/landing-ai-image-generation','/'] as const;
const field=(value:unknown,label:string,required:boolean)=>{
 if(value===undefined||value===null||value===''){if(required)reject(400,'INVALID_INPUT',`${label}을(를) 입력해주세요.`);return'';}
 if(typeof value!=='string'||!UTM.test(value))reject(400,'INVALID_INPUT',`${label}은(는) 영문·숫자·_ . - 만 40자까지 쓸 수 있어요.`);
 return value as string;
};
const label=(value:unknown,max:number,name:string,required:boolean)=>{
 if(value===undefined&&!required)return undefined;
 if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))reject(400,'INVALID_INPUT',`${name}은(는) ${required?'1':'0'}~${max}자로 입력해주세요.`);
 return(value as string).trim();
};
export function landingUrl(link:{landing_path:string;utm_source:string;utm_medium:string;utm_campaign:string;utm_content:string}){
 const q=[['utm_source',link.utm_source],['utm_medium',link.utm_medium],['utm_campaign',link.utm_campaign],['utm_content',link.utm_content]].filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join('&');
 return`${LANDING_BASE_URL}${link.landing_path}?${q}`;
}
const view=(r:any,visits:Map<string,{last14:number;last30:number}>)=>({id:r.id,name:r.name,landingPath:r.landing_path,utmSource:r.utm_source,utmMedium:r.utm_medium,utmCampaign:r.utm_campaign,utmContent:r.utm_content,memo:r.memo,
 url:landingUrl(r),createdBy:r.created_by_name||null,createdAt:r.created_at,archivedAt:r.archived_at,
 visits:r.landing_path==='/'?null:visits.get([r.utm_source,r.utm_medium,r.utm_campaign,r.utm_content].join('\u0000'))||{last14:0,last30:0}});
const activeKey=(s:string,m:string,c:string,t:string)=>[s,m,c,t].join('|');

export async function listLandingLinks(db:any,now=new Date()){
 const today=kstDay(now),d30=new Date(+today-29*DAY),d14=new Date(+today-13*DAY);
 const rows:any[]=await db.$queryRaw`SELECT l.*,a.name AS created_by_name FROM landing_links l LEFT JOIN admins a ON a.id=l.created_by ORDER BY l.archived_at IS NULL DESC,l.created_at DESC`;
 const sums:any[]=await db.$queryRaw`SELECT source,medium,campaign,content,SUM(count) AS last30,SUM(CASE WHEN day>=${d14} THEN count ELSE 0 END) AS last14 FROM landing_utm_daily WHERE day>=${d30} AND day<=${today} GROUP BY source,medium,campaign,content`;
 const visits=new Map(sums.map(s=>[[s.source,s.medium,s.campaign,s.content].join('\u0000'),{last14:Number(s.last14),last30:Number(s.last30)}]));
 return{baseUrl:LANDING_BASE_URL,paths:LANDING_PATHS,links:rows.map(r=>view(r,visits)),
  notice:'방문 수는 같은 UTM 조합의 AI 사진 랜딩 방문(유입 분석과 같은 집계)이에요. 홈(/) 링크는 방문을 세지 않아요. 집계는 이 기능 배포 이후부터예요.'};
}
const findLink=async(tx:any,id:string,lock=false)=>{
 const [row]:any[]=lock?await tx.$queryRaw`SELECT * FROM landing_links WHERE id=${id} FOR UPDATE`:await tx.$queryRaw`SELECT * FROM landing_links WHERE id=${id}`;
 if(!row)reject(404,'NOT_FOUND','링크를 찾을 수 없어요.');return row;
};

/** settings.update. The same active UTM combination twice is refused (its visits could not be told apart). */
export async function createLandingLink(db:any,admin:any,input:any){
 const name=label(input?.name,80,'이름',true)!,memo=label(input?.memo??'',500,'메모',false)!;
 const path=input?.landingPath;if(!LANDING_PATHS.includes(path))reject(400,'INVALID_INPUT','연결할 랜딩 페이지를 목록에서 골라주세요.');
 const s=field(input?.utmSource,'utm_source',true).toLowerCase(),m=field(input?.utmMedium,'utm_medium',true).toLowerCase(),c=field(input?.utmCampaign,'utm_campaign',true),t=field(input?.utmContent,'utm_content',false);
 const id=randomUUID();
 return db.$transaction(async(tx:any)=>{
  try{await tx.$executeRaw`INSERT INTO landing_links (id,name,landing_path,utm_source,utm_medium,utm_campaign,utm_content,memo,created_by,active_key) VALUES (${id},${name},${path},${s},${m},${c},${t},${memo},${admin.id},${activeKey(s,m,c,t)})`;}
  catch(error:any){if(String(error?.meta?.code||error?.message).includes('1062'))reject(409,'DUPLICATE_LINK','같은 UTM 조합의 링크가 이미 있어요.');throw error;}
  await appendAudit(tx,{category:'admin',action:'admin.landing_link_created',entityId:id,data:{adminId:admin.id,targetId:id}});
  const row=await findLink(tx,id);return{link:view(row,new Map()),message:'링크를 만들었어요.'};
 });
}
/** settings.update. Only name and memo change; the UTM values stay fixed so past visits keep matching. */
export async function updateLandingLink(db:any,admin:any,id:string,input:any){
 const name=label(input?.name,80,'이름',false),memo=label(input?.memo,500,'메모',false);
 if(name===undefined&&memo===undefined)reject(400,'INVALID_INPUT','바꿀 이름이나 메모를 입력해주세요.');
 if(name==='')reject(400,'INVALID_INPUT','이름은(는) 1~80자로 입력해주세요.');
 return db.$transaction(async(tx:any)=>{
  const before=await findLink(tx,id,true);
  if(before.archived_at)reject(409,'LINK_ARCHIVED','보관된 링크는 바꿀 수 없어요.');
  const next={name:name??before.name,memo:memo??before.memo};
  await tx.$executeRaw`UPDATE landing_links SET name=${next.name},memo=${next.memo} WHERE id=${id}`;
  await appendAudit(tx,{category:'admin',action:'admin.landing_link_updated',entityId:id,data:{adminId:admin.id,targetId:id,changedFields:auditChange({name:before.name,memo:before.memo},next).changedFields}});
  return{link:view(await findLink(tx,id),new Map()),message:'링크를 수정했어요.'};
 });
}
/** settings.update. Archived links stay listed (history) and free their UTM combination for a new link. */
export async function archiveLandingLink(db:any,admin:any,id:string){
 return db.$transaction(async(tx:any)=>{
  const before=await findLink(tx,id,true);
  if(before.archived_at)reject(409,'LINK_ARCHIVED','이미 보관된 링크예요.');
  await tx.$executeRaw`UPDATE landing_links SET archived_at=CURRENT_TIMESTAMP(3),active_key=NULL WHERE id=${id}`;
  await appendAudit(tx,{category:'admin',action:'admin.landing_link_archived',entityId:id,data:{adminId:admin.id,targetId:id,status:'archived'}});
  return{id,message:'링크를 보관했어요.'};
 });
}
