import {Prisma} from '@prisma/client';
import {dateOnly,reject} from './http';
import {financialAdmin,revenuePeriod} from './admin-console';
const DAY=86400000;
const zero=()=>({newSubscriptions:0,paymentCount:0,gross:0,refunds:0,netSales:0,platformFees:0});
function integer(value:any){const n=Number(value??0);if(!Number.isSafeInteger(n))reject(500,'AMOUNT_OVERFLOW','집계 범위를 초과했습니다.');return n;}
function metrics(row:any){const gross=integer(row?.gross),refunds=integer(row?.refunds);return{newSubscriptions:integer(row?.newSubscriptions),paymentCount:integer(row?.paymentCount),gross,refunds,netSales:gross-refunds,platformFees:integer(row?.platformFees)};}
export function dashboardPeriod(query:any,now=new Date()){
 const day=query.date??dateOnly(now),days=query.days??'30';
 if(typeof days!=='string'||!['7','30','90'].includes(days))reject(400,'INVALID_PERIOD','추이 기간을 확인해주세요.');
 const p=revenuePeriod({from:day,to:day},now);
 if(p.start>now)reject(400,'INVALID_PERIOD','미래 날짜는 조회할 수 없습니다.');
 const end=new Date(Math.min(+p.end,+now)),previousStart=new Date(+p.start-DAY),previousEnd=new Date(+previousStart+(+end-+p.start));
 return{day,days:Number(days),start:p.start,end,previousStart,previousEnd,trendStart:new Date(+p.start-(Number(days)-1)*DAY),partial:+end<+p.end};
}
export async function adminDashboard(db:any,admin:any,query:any,now=new Date()){
 financialAdmin(admin);const p=dashboardPeriod(query,now);
 return db.$transaction(async(tx:any)=>{
  // First successful approval per subscription, including subscriptions refunded later.
  // Renewals have the same subscription_id and must not count as new subscriptions.
  const source=Prisma.sql`FROM checkout_orders o JOIN revenue_entries e ON e.order_id=o.id
   JOIN (SELECT q.subscription_id,MIN(q.paid_at) AS first_paid_at FROM checkout_orders q
    JOIN revenue_entries r ON r.order_id=q.id
    WHERE q.subscription_id IS NOT NULL AND q.paid_at IS NOT NULL AND q.status IN ('paid','refunding','refunded')
    GROUP BY q.subscription_id) first ON first.subscription_id=o.subscription_id
   WHERE o.status IN ('paid','refunding','refunded')`;
  const measures=Prisma.sql`COUNT(*) AS paymentCount,COUNT(DISTINCT CASE WHEN o.paid_at=first.first_paid_at THEN o.subscription_id END) AS newSubscriptions,
   COALESCE(SUM(e.gross),0) AS gross,COALESCE(SUM(e.reversals),0) AS refunds,COALESCE(SUM(e.fees),0) AS platformFees`;
  const [daily,previous,currentActive]=await Promise.all([
   tx.$queryRaw(Prisma.sql`SELECT DATE_FORMAT(DATE_ADD(o.paid_at,INTERVAL 9 HOUR),'%Y-%m-%d') AS day,${measures} ${source}
    AND o.paid_at>=${p.trendStart} AND o.paid_at<${p.end} GROUP BY day ORDER BY day`),
   tx.$queryRaw(Prisma.sql`SELECT ${measures} ${source} AND o.paid_at>=${p.previousStart} AND o.paid_at<${p.previousEnd}`),
   tx.subscription.count({where:{status:{in:['ONGOING','CANCELLED']},started_at:{lte:now},ended_at:{gt:now}}})
  ]);
  const rows=new Map<string,ReturnType<typeof metrics>>(daily.map((r:any)=>[r.day,metrics(r)]));
  const trend=Array.from({length:p.days},(_,i)=>{const day=dateOnly(new Date(+p.trendStart+i*DAY));return{date:day,...(rows.get(day)||zero())};});
  return{asOf:now.toISOString(),timeZone:'Asia/Seoul',currency:'KRW',basis:'subscription-approval-cohort-current-ledger',
   period:{date:p.day,previousDate:dateOnly(p.previousStart),days:p.days,from:dateOnly(p.trendStart),to:p.day,partial:p.partial,cutoff:p.end.toISOString(),previousCutoff:p.previousEnd.toISOString()},
   currentActive,summary:rows.get(p.day)||zero(),previous:metrics(previous[0]),trend};
 },{isolationLevel:'RepeatableRead'});
}
