import {createHash} from 'crypto';
import {auditOperation} from './audit';

// 2026-11-18 user decision (중복 제거 + 하루 요약): informational events stay in the outbox/audit trail but are not sent one by one;
// one 09:00 KST digest counts them. Money, security, bank transfer, order, deposit, payout and AI cost alerts are never listed here.
// Signup and content registration are sent immediately (2026-11-19 content alert decision).
export const DIGEST_TYPES=new Set(['worker.hourly','worker.completed','content.updated','content.deleted','member.profile.updated','creator.profile.updated','admin.inquiry_replied','admin.report_resolved','admin.document_saved']);
// Same error (type + job/route + code/fingerprint) is sent at most once an hour; later occurrences are stored and counted.
// 2026-11-18 user decision (revised): every ai-photo.failed is sent (not deduped) while the service is at an early stage.
export const DEDUPE_TYPES=new Set(['http.error','worker.error']);
export const DIGESTED='DIGESTED',SUPPRESSED='SUPPRESSED_DUPLICATE',DIGEST_TYPE='operations.daily_digest';
const HOUR=3600000,DAY=86400000,KST=9*HOUR;

/** Outbox fields that mark an event as handled without a Telegram message (it is not backlog and is purged like delivered rows). */
export function digestOnly(type:string,now=new Date()){return DIGEST_TYPES.has(type)?{delivered_at:now,last_error_code:DIGESTED}:{};}

const kst=(d:Date)=>new Date(+d+KST).toISOString().slice(0,16).replace('T',' ');
// Only already-allow-listed, non-personal fields form the key (no IP, request or member identifiers).
export function dedupeGroup(type:string,data:Record<string,any>){
 const parts=['job','route','method','status','errorType','errorCode','fingerprint','stage','provider','actor'].map(k=>`${k}=${data[k]??''}`);
 if(data.failures&&typeof data.failures==='object')parts.push('failures='+Object.keys(data.failures).sort().join(','));
 return`alert-dedupe:${type}:${createHash('sha256').update(parts.join('|')).digest('hex').slice(0,32)}`;
}
/** Runs inside the event's transaction; the row lock serializes concurrent API/worker instances. */
export async function throttleError(tx:any,type:string,data:Record<string,any>,now=new Date()){
 const id=dedupeGroup(type,data);
 await tx.platformJob.createMany({data:[{id,locked_until:new Date(0),completed_at:null,note:'{"suppressed":0}'}],skipDuplicates:true});
 await tx.$queryRaw`SELECT id FROM platform_jobs WHERE id=${id} FOR UPDATE`;
 const row=await tx.platformJob.findUniqueOrThrow({where:{id}}),suppressed=Number(JSON.parse(row.note||'{}').suppressed)||0;
 if(row.completed_at&&+now-+row.completed_at<HOUR){
  await tx.platformJob.update({where:{id},data:{note:JSON.stringify({suppressed:suppressed+1})}});
  return{delivered_at:now,last_error_code:SUPPRESSED};
 }
 await tx.platformJob.update({where:{id},data:{locked_until:now,completed_at:now,note:'{"suppressed":0}'}});
 return suppressed&&row.completed_at?{data:{...data,'반복':`직전 알림(${kst(row.completed_at)} KST) 이후 ${suppressed}회 더 발생 — 같은 오류는 1시간에 1번만 보냄`}}:{};
}

/** 09:00 KST equals 00:00 UTC: the latest slot at or before now. */
export function digestSlot(now:Date){return new Date(Math.floor(+now/DAY)*DAY);}
export async function runDailyDigest(db:any,now=new Date()){
 const clockId='worker-operations-digest',slot=digestSlot(now),from=new Date(+slot-DAY);
 // A new clock starts at now, so the first digest is the next 09:00 KST one (never a partial day on first deploy).
 await db.platformJob.upsert({where:{id:clockId},create:{id:clockId,locked_until:now,completed_at:now},update:{}});
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM platform_jobs WHERE id=${clockId} FOR UPDATE`;
  const clock=await tx.platformJob.findUniqueOrThrow({where:{id:clockId}});
  if(clock.completed_at&&+clock.completed_at>=+slot)return;
  const range={gte:from,lt:slot};
  const grouped=await tx.platformOperationalEvent.groupBy({by:['type'],where:{created_at:range,type:{not:DIGEST_TYPE}},_count:{_all:true}});
  const types=Object.fromEntries(grouped.map(g=>[g.type,g._count._all]).sort((a,b)=>b[1]-a[1]));
  const repeats:Record<string,number>={};
  for(const r of await tx.platformOperationalEvent.findMany({where:{created_at:range,last_error_code:SUPPRESSED},select:{type:true,data:true}})){
   const d=r.data||{},key=`${r.type} ${d.job||d.route||d.stage||Object.keys(d.failures||{}).sort().join(',')||'-'}${d.errorCode?' '+d.errorCode:''}`;repeats[key]=(repeats[key]||0)+1;
  }
  const notes=(await tx.platformJob.findMany({where:{id:{startsWith:'worker-run-'},completed_at:range},select:{note:true}})).map(r=>JSON.parse(r.note||'{}'));
  const activity:Record<string,number>={};for(const n of notes)for(const [k,v] of Object.entries(n.activity||{}))activity[k]=(activity[k]||0)+(Number(v)||0);
  const worker={runs:notes.length,failedRuns:notes.filter(n=>Object.keys(n.failures||{}).length).length,processed:notes.reduce((s,n)=>s+(Number(n.processed)||0),0),activity};
  const event=await tx.platformOperationalEvent.create({data:{type:DIGEST_TYPE,data:{from:from.toISOString(),to:slot.toISOString(),types,repeats,worker},dedupe_key:`operations-digest:${slot.toISOString()}`}});
  await auditOperation(tx,event);
  await tx.platformJob.update({where:{id:clockId},data:{completed_at:now}});
  return event;
 });
}
export function digestText(row:{id:string;data:any},env:string,labels:Record<string,string>){
 const d=row.data,name=(t:string)=>labels[t]?`${labels[t].split(/ [—(]/)[0]}`:t;
 const total=Object.values(d.types as Record<string,number>).reduce((a,b)=>a+b,0),repeated=Object.values(d.repeats as Record<string,number>).reduce((a,b)=>a+b,0);
 const lines=[`[crefans] ${labels[DIGEST_TYPE]||DIGEST_TYPE}`,`환경: ${env}`,`기간: ${kst(new Date(d.from))} ~ ${kst(new Date(d.to))} (KST)`,`기록 ID: ${row.id}`,'',`■ 알림 유형별 건수 (총 ${total}건, * = 요약으로만 보냄)`];
 for(const [t,n] of Object.entries(d.types as Record<string,number>))lines.push(`- ${name(t)}${DIGEST_TYPES.has(t)?' *':''}: ${n}건`);
 lines.push('',`■ 중복으로 생략된 오류 알림 (총 ${repeated}건)`);
 for(const [k,n] of Object.entries(d.repeats as Record<string,number>).sort((a,b)=>b[1]-a[1]).slice(0,15)){const [t,...rest]=k.split(' ');lines.push(`- ${name(t)} ${rest.join(' ')}: ${n}회`);}
 const w=d.worker;lines.push('','■ 배치',`- 실행 ${w.runs}회 · 실패 포함 ${w.failedRuns}회 · 처리 ${w.processed}건`);
 const jobs=Object.entries(w.activity as Record<string,number>).sort((a,b)=>b[1]-a[1]).slice(0,15);if(jobs.length)lines.push(`- 작업별 처리: ${jobs.map(([k,v])=>`${k} ${v}`).join(', ')}`);
 return lines.join('\n').slice(0,3800);
}
