import {can} from './admin-permissions';
import {Prisma} from '@prisma/client';
import {dateOnly,reject,text} from './http';

export function financialAdmin(admin:any){if(!can(admin,'revenue','view'))reject(403,'FINANCE_ADMIN_REQUIRED','매출 조회 권한이 필요합니다.');}
export function adminPage(query:any){const raw=query.page??'1';if(typeof raw!=='string'||!/^\d{1,6}$/.test(raw)||Number(raw)<1)reject(400,'INVALID_PAGE','페이지를 확인해주세요.');return{page:Number(raw),size:20,skip:(Number(raw)-1)*20};}
export function revenuePeriod(query:any,now=new Date()){
 const today=dateOnly(now),from=query.from??today.slice(0,8)+'01',to=query.to??today;
 const parse=(value:unknown)=>{if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))reject(400,'INVALID_PERIOD','조회 기간을 확인해주세요.');const day=new Date(value+'T00:00:00+09:00');if(!Number.isFinite(+day)||dateOnly(day)!==value)reject(400,'INVALID_PERIOD','조회 날짜를 확인해주세요.');return day;};
 const start=parse(from),last=parse(to),end=new Date(+last+86400000);
 if(start>last||(+end-+start)/86400000>366)reject(400,'INVALID_PERIOD','조회 기간은 최대 366일입니다.');
 return{from,to,start,end,timeZone:'Asia/Seoul'};
}
function number(value:any){const n=Number(value??0);if(!Number.isSafeInteger(n))reject(500,'AMOUNT_OVERFLOW','금액 집계 범위를 초과했습니다.');return n;}
function amounts(row:any){return{count:number(row?.count),gross:number(row?.gross),refunds:number(row?.refunds),netSales:number(row?.gross)-number(row?.refunds),platformFees:number(row?.platformFees),creatorNet:number(row?.creatorNet)};}

// Cohort accounting: current ledger values attributed to the ORIGINAL approval date.
// Refund-date cashflow cannot be inferred: CheckoutOrder has no immutable refunded_at.
export async function adminRevenue(db:any,admin:any,query:any){
 financialAdmin(admin);const period=revenuePeriod(query),{page,size,skip}=adminPage(query);
 return db.$transaction(async(tx:any)=>{
  const where=Prisma.sql`o.paid_at >= ${period.start} AND o.paid_at < ${period.end} AND o.status IN ('paid','refunding','refunded')`;
  const measures=Prisma.sql`COUNT(*) AS count, COALESCE(SUM(e.gross),0) AS gross, COALESCE(SUM(e.reversals),0) AS refunds, COALESCE(SUM(e.fees),0) AS platformFees, COALESCE(SUM(e.net),0) AS creatorNet`;
  const join=Prisma.sql`FROM revenue_entries e JOIN checkout_orders o ON o.id=e.order_id WHERE ${where}`;
  const [totals,daily,creators,groups]=await Promise.all([
   tx.$queryRaw(Prisma.sql`SELECT ${measures} ${join}`),
   tx.$queryRaw(Prisma.sql`SELECT DATE_FORMAT(DATE_ADD(o.paid_at,INTERVAL 9 HOUR),'%Y-%m-%d') AS day, ${measures} ${join} GROUP BY day ORDER BY day`),
   tx.$queryRaw(Prisma.sql`SELECT e.creator_id AS id, ${measures} ${join} GROUP BY e.creator_id ORDER BY gross DESC,e.creator_id ASC LIMIT ${size} OFFSET ${skip}`),
   tx.$queryRaw(Prisma.sql`SELECT COUNT(DISTINCT e.creator_id) AS count ${join}`)
  ]);
  const names=await tx.creator.findMany({where:{user_id:{in:creators.map((c:any)=>c.id)}},select:{user_id:true,display_name:true,handle:true}});
  return{period:{from:period.from,to:period.to,timeZone:period.timeZone},basis:'approval-cohort-current-ledger',currency:'KRW',summary:amounts(totals[0]),daily:daily.map((r:any)=>({date:r.day,...amounts(r)})),creators:{items:creators.map((r:any)=>({id:r.id,name:names.find((c:any)=>c.user_id===r.id)?.display_name||r.id,...amounts(r)})),page,pageSize:size,total:number(groups[0]?.count)}};
 },{isolationLevel:'RepeatableRead'});
}

export async function adminOverview(db:any){const [members,creators,posts,reports,inquiries,failedPayments,pendingWithdrawals,undeliveredEvents,jobs]=await Promise.all([
 db.member.count(),db.creator.count(),db.posting.count({where:{is_deleted:false}}),db.userReport.count({where:{status:'PENDING'}}),db.supportTicket.count({where:{status:'pending'}}),db.checkoutOrder.count({where:{status:'failed'}}),db.withdrawalRequest.count({where:{status:{in:['requested','processing']}}}),db.platformOperationalEvent.count({where:{delivered_at:null}}),db.platformJob.findMany({where:{id:'worker-health'},select:{id:true,completed_at:true}})
 ]);return{members,creators,posts,reports,inquiries,failedPayments,pendingWithdrawals,undeliveredEvents,jobs};}

export async function adminMembers(db:any,query:any){const {page,size,skip}=adminPage(query),search=query.search===undefined?'':text(query.search,100,false),where=search?{OR:[{email:{contains:search}},{nickname:{contains:search}},{id:search}]}:{};return db.$transaction(async(tx:any)=>{const [items,total]=await Promise.all([tx.member.findMany({where,select:{id:true,email:true,nickname:true,enabled:true,status:true,suspended_at:true,suspended_until:true,suspension_reason:true,withdrawn_at:true,purged_at:true,created_at:true},orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),tx.member.count({where})]);const creators=await tx.creator.findMany({where:{user_id:{in:items.map((m:any)=>m.id)}},select:{user_id:true,display_name:true,is_active:true,is_verified:true}});return{items:items.map((m:any)=>({...m,creator:creators.find((c:any)=>c.user_id===m.id)||null})),total,page,pageSize:size};});}
export async function adminPosts(db:any,query:any){const {page,size,skip}=adminPage(query),search=query.search===undefined?'':text(query.search,100,false);if(query.review!==undefined&&query.review!=='pending')reject(400,'INVALID_QUERY','조회 조건을 확인해주세요.');const where={...(search?{OR:[{title:{contains:search}},{id:search},{user_sub:search}]}:{}),...(query.review==='pending'?{status:'PUBLISHED',is_deleted:false,hidden_at:null,reviewed_at:null}:{})};const [items,total]=await db.$transaction([db.posting.findMany({where,select:{id:true,title:true,user_sub:true,status:true,is_membership:true,is_public:true,is_deleted:true,hidden_at:true,hidden_reason:true,reviewed_at:true,created_at:true},orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),db.posting.count({where})]);return{items,total,page,pageSize:size};}
export async function adminPayments(db:any,admin:any,query:any){financialAdmin(admin);const period=revenuePeriod(query),{page,size,skip}=adminPage(query),where={created_at:{gte:period.start,lt:period.end}};const [items,total]=await db.$transaction([db.checkoutOrder.findMany({where,select:{id:true,member_id:true,amount:true,status:true,failure_code:true,paid_at:true,created_at:true},orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),db.checkoutOrder.count({where})]);return{items,total,page,pageSize:size};}
export async function adminWithdrawals(db:any,admin:any,query:any){financialAdmin(admin);const {page,size,skip}=adminPage(query);const [items,total]=await db.$transaction([db.withdrawalRequest.findMany({select:{id:true,creator_id:true,amount:true,status:true,created_at:true,updated_at:true},orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),db.withdrawalRequest.count()]);return{items,total,page,pageSize:size};}
