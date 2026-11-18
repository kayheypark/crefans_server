// 2026-11-18 user decision ("방법 1 서버 집계"): count how many visits reach each step of the AI photo trial funnel.
// Aggregate only — KST day, step key, count. No member, guest id, IP, cookie or user agent is stored, so it is not personal data.
// Server steps are counted where they happen; the browser may only report the three view steps below (once per tab session, approximate).
import {createHash} from 'node:crypto';
import {kstDay} from './ai-preset-usage';
import {reject} from './http';
import {requestContext} from './request-context';

export const FUNNEL_STEPS=[
 ['landing_view','AI 사진 랜딩 방문'],
 ['guest_consent_view','체험 동의 화면'],
 ['guest_consent_agreed','체험 동의 완료'],
 ['ai_started_guest','AI 생성 시작(비회원)'],
 ['ai_started_member','AI 생성 시작(회원)'],
 ['ai_succeeded_guest','AI 생성 성공(비회원)'],
 ['ai_succeeded_member','AI 생성 성공(회원)'],
 ['caption_written','글 자동 작성'],
 ['post_published_guest','게시(비회원)'],
 ['post_published_member','게시(회원)'],
 ['signup_view','회원가입 화면'],
 ['signup_completed','회원가입 완료'],
] as const;
export type FunnelStep=typeof FUNNEL_STEPS[number][0];
/** Only these may come from the browser; every other step is counted by the server itself. */
export const CLIENT_FUNNEL_STEPS=new Set<string>(['landing_view','guest_consent_view','signup_view']);
const KEYS=new Set<string>(FUNNEL_STEPS.map(([key])=>key));

/** Never throws: a counting failure must not change the request it rides on. */
export async function recordFunnelStep(db:any,step:FunnelStep,now=new Date()){
 if(!KEYS.has(step))return false;
 try{await db.$executeRaw`INSERT INTO funnel_step_daily (day,step,count) VALUES (${kstDay(now)},${step},1) ON DUPLICATE KEY UPDATE count=count+1`;return true;}
 catch{console.error(JSON.stringify({event:'funnel.record_failed'}));return false;}
}

// In-process limit per client IP. The IP is hashed only as a Map key for the current minute and is never written anywhere.
const WINDOW_MS=60000,PER_WINDOW=30,MAX_KEYS=20000;
let bucket={window:0,counts:new Map<string,number>()};
export function funnelRateLimit(ip:string|undefined,now=Date.now()){
 const window=Math.floor(now/WINDOW_MS);if(bucket.window!==window||bucket.counts.size>MAX_KEYS)bucket={window,counts:new Map()};
 const key=createHash('sha256').update(ip||'unknown').digest('hex').slice(0,32),count=(bucket.counts.get(key)||0)+1;bucket.counts.set(key,count);
 return count<=PER_WINDOW;
}

// 2026-11-18 user decision (랜딩 방문 텔레그램 알림): landing_view may also carry the external referrer host and utm_source.
// Anything that fails the pattern is silently dropped (the count still happens); other fields stay a 400.
const OPTIONAL_FIELDS=new Set(['referrerHost','utmSource']),HOST=/^[a-z0-9.-]{1,253}$/,UTM=/^[A-Za-z0-9_.-]{1,40}$/;
export function landingSource(input:any){
 return{referrerHost:typeof input?.referrerHost==='string'&&HOST.test(input.referrerHost)?input.referrerHost:undefined,utmSource:typeof input?.utmSource==='string'&&UTM.test(input.utmSource)?input.utmSource:undefined};
}

// Alert limits (2026-11-18 user decision "같은 아이피알림도 계속 알려줘": no per-IP quiet window):
// at most 100 landing alerts per KST day; the 100th is followed by one cap alert and then counting only. Obvious bots are skipped.
const ALERT_DAILY_CAP=100;
const BOT=/^node$|undici|bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|okhttp|go-http|axios|node-fetch|java\/|monitor|scan/i;
export const isBotAgent=(ua:unknown)=>typeof ua!=='string'||!ua.trim()||BOT.test(ua);
const device=(ua:string)=>/Mobi|Android|iPhone|iPad|iPod/i.test(ua)?'모바일':'데스크톱';
const kstTime=(d:Date)=>new Date(+d+9*3600000).toISOString().slice(0,16).replace('T',' ');

/** Queues the immediate 랜딩 방문 alert. Never throws; the caller does not await it. */
export async function landingVisitAlert(db:any,operations:{record:Function},source:{referrerHost?:string;utmSource?:string},userAgent:unknown,now=new Date()){
 try{
  if(isBotAgent(userAgent))return'skipped';
  const day=kstDay(now),start=new Date(+day-9*3600000);
  const sent=await db.platformOperationalEvent.count({where:{type:'funnel.landing_view',created_at:{gte:start}}});
  if(sent>=ALERT_DAILY_CAP){await operations.record('funnel.landing_cap',{limit:ALERT_DAILY_CAP},`funnel.landing_cap:${day.toISOString().slice(0,10)}`,{omitIp:true});return'capped';}
  const today=(await db.funnelStepDaily.findUnique({where:{day_step:{day,step:'landing_view'}}}))?.count||0;
  const from=[source.referrerHost,source.utmSource?`utm_source=${source.utmSource}`:undefined].filter(Boolean).join(' · ')||'직접 방문 또는 알 수 없음';
  await operations.record('funnel.landing_view',{'방문 시각(KST)':kstTime(now),'랜딩':'AI 사진 랜딩','유입':from,'기기':device(String(userAgent)),'오늘 랜딩 방문':today},undefined,{omitIp:true});
  return'queued';
 }catch{console.error(JSON.stringify({event:'funnel.landing_alert_failed'}));return'failed';}
}

export async function reportFunnelStep(db:any,input:any,alert?:{operations:{record:Function};userAgent:unknown}){
 const step=input?.step;
 if(typeof step!=='string'||!CLIENT_FUNNEL_STEPS.has(step)||Object.keys(input).some(k=>k!=='step'&&!(step==='landing_view'&&OPTIONAL_FIELDS.has(k))))reject(400,'INVALID_FUNNEL_STEP','알 수 없는 단계예요.');
 const ip=requestContext.getStore()?.ip;
 if(!funnelRateLimit(ip))reject(429,'RATE_LIMITED','잠시 후 다시 시도해주세요.');
 const recorded=await recordFunnelStep(db,step as FunnelStep);
 if(recorded&&step==='landing_view'&&alert)void landingVisitAlert(db,alert.operations,landingSource(input),alert.userAgent);
 return{recorded};
}

const dateOnly=(d:Date)=>d.toISOString().slice(0,10);
/** Last `days` KST days (today included, oldest first) with zero-filled counts per step. */
export async function funnelStats(db:any,days=14,now=new Date()){
 const today=kstDay(now),from=new Date(today.getTime()-(days-1)*86400000);
 const rows:{day:Date;step:string;count:number}[]=await db.funnelStepDaily.findMany({where:{day:{gte:from,lte:today}},select:{day:true,step:true,count:true}});
 const dates=Array.from({length:days},(_,i)=>dateOnly(new Date(from.getTime()+i*86400000)));
 const counts:Record<string,Record<string,number>>={};for(const [key] of FUNNEL_STEPS)counts[key]=Object.fromEntries(dates.map(d=>[d,0]));
 for(const row of rows)if(counts[row.step])counts[row.step][dateOnly(row.day)]=row.count;
 return{timeZone:'Asia/Seoul',dates,
  steps:FUNNEL_STEPS.map(([key,label])=>({key,label,source:CLIENT_FUNNEL_STEPS.has(key)?'browser':'server',daily:dates.map(d=>counts[key][d]),total:dates.reduce((sum,d)=>sum+counts[key][d],0)})),
  notice:'날짜는 한국 시간 기준이에요. 화면 방문 3단계는 브라우저가 탭(세션)당 한 번만 보내는 대략값이고, 나머지는 서버에서 센 값이에요. 개인을 구분하지 않아 같은 사람이 여러 번 셀 수 있어요.'};
}
