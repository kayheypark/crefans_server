import {adminPage,financialAdmin} from './admin-console';
import {requireSuperAdmin} from './admin-permissions';
import {appendAudit,auditChange} from './audit';
import {enqueueOperation} from './operations-events';
import {reject,text} from './http';

// 2026-11-06 user request: read-only console lists of every membership plan and every subscription.
// Same revenue.view permission as payments. Billing keys, card ids and plan snapshots are never selected.
const LIVE=['ONGOING','CANCELLED'];
function option(value:unknown,allowed:readonly string[]){if(value===undefined||value==='')return undefined;if(typeof value!=='string'||!allowed.includes(value))reject(400,'INVALID_QUERY','조회 조건을 확인해주세요.');return value;}
async function creatorsById(db:any,ids:string[]){const [creators,members]=await Promise.all([db.creator.findMany({where:{user_id:{in:ids}},select:{user_id:true,display_name:true,handle:true,is_active:true}}),db.member.findMany({where:{id:{in:ids}},select:{id:true,nickname:true,preferred_username:true,withdrawn_at:true}})]);
 return new Map(ids.map(id=>{const c=creators.find((x:any)=>x.user_id===id),m=members.find((x:any)=>x.id===id);return[id,{id,name:c?.display_name||m?.nickname||null,handle:c?.handle||m?.preferred_username||null,active:!!c?.is_active&&!m?.withdrawn_at}];}));}
async function creatorIdsMatching(db:any,search:string){const [creators,members]=await Promise.all([db.creator.findMany({where:{OR:[{display_name:{contains:search}},{handle:{contains:search}}]},select:{user_id:true},take:500}),db.member.findMany({where:{OR:[{preferred_username:{contains:search}},{id:search}]},select:{id:true},take:500})]);return[...creators.map((c:any)=>c.user_id),...members.map((m:any)=>m.id)];}

export async function adminMemberships(db:any,admin:any,query:any){financialAdmin(admin);const {page,size,skip}=adminPage(query),search=query.search===undefined?'':text(query.search,100,false),state=option(query.state,['active','inactive','deleted']);
 const where:any={...(state==='deleted'?{is_deleted:true}:{is_deleted:false}),...(state==='active'?{is_active:true}:state==='inactive'?{is_active:false}:{})};
 if(search)where.OR=[{name:{contains:search}},{id:search},{creator_id:{in:await creatorIdsMatching(db,search)}}];
 const [rows,total]=await db.$transaction([db.membershipItem.findMany({where,select:{id:true,name:true,level:true,creator_id:true,price:true,billing_unit:true,billing_period:true,trial_unit:true,trial_period:true,is_active:true,is_deleted:true,version:true,created_at:true,updated_at:true},orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),db.membershipItem.count({where})]);
 const ids=rows.map((r:any)=>r.id),now=new Date(),[groups,current,creators]=await Promise.all([ids.length?db.subscription.groupBy({by:['membership_item_id','status'],where:{membership_item_id:{in:ids}},_count:{_all:true}}):[],ids.length?db.subscription.groupBy({by:['membership_item_id'],where:{membership_item_id:{in:ids},status:{in:LIVE},ended_at:{gt:now}},_count:{_all:true}}):[],creatorsById(db,[...new Set<string>(rows.map((r:any)=>r.creator_id))])]);
 const count=(id:string,status:string)=>groups.find((g:any)=>g.membership_item_id===id&&g.status===status)?._count._all||0;
 return{items:rows.map((r:any)=>({id:r.id,name:r.name,level:r.level,price:Number(r.price),billingUnit:r.billing_unit,billingPeriod:r.billing_period,trialUnit:r.trial_unit,trialPeriod:r.trial_period||0,active:r.is_active,deleted:r.is_deleted,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at,creator:creators.get(r.creator_id),subscriptions:{current:current.find((g:any)=>g.membership_item_id===r.id)?._count._all||0,autoRenew:count(r.id,'ONGOING'),cancelled:count(r.id,'CANCELLED'),expired:count(r.id,'EXPIRED')}})),total,page,pageSize:size};}

// status is the stored value: ONGOING renews automatically, CANCELLED keeps access until endedAt, EXPIRED is over.
export async function adminSubscriptions(db:any,admin:any,query:any){financialAdmin(admin);const {page,size,skip}=adminPage(query),search=query.search===undefined?'':text(query.search,100,false),status=option(query.status,['ONGOING','CANCELLED','EXPIRED']),membershipId=query.membershipId===undefined||query.membershipId===''?undefined:text(query.membershipId,64);
 const where:any={...(status?{status}:{}),...(membershipId?{membership_item_id:membershipId}:{})};
 if(search){const [members,creatorIds]=await Promise.all([db.member.findMany({where:{OR:[{id:search},{nickname:{contains:search}}]},select:{id:true},take:500}),creatorIdsMatching(db,search)]);where.OR=[{subscriber_id:{in:members.map((m:any)=>m.id)}},{membership_item:{creator_id:{in:creatorIds}}}];}
 const now=new Date(),[rows,total,byStatus,current]=await db.$transaction([db.subscription.findMany({where,select:{id:true,subscriber_id:true,status:true,auto_renew:true,amount:true,started_at:true,ended_at:true,next_billing_date:true,last_payment_date:true,payment_failure_count:true,created_at:true,cancel_reason:true,cancelled_by:true,membership_item:{select:{id:true,name:true,level:true,creator_id:true}}},orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),db.subscription.count({where}),db.subscription.groupBy({by:['status'],where,_count:{_all:true},orderBy:{status:'asc'}}),db.subscription.count({where:{...where,AND:[{status:{in:LIVE}},{ended_at:{gt:now}}]}})]);
 const [subscribers,creators]=await Promise.all([db.member.findMany({where:{id:{in:rows.map((r:any)=>r.subscriber_id)}},select:{id:true,nickname:true,withdrawn_at:true,purged_at:true}}),creatorsById(db,[...new Set<string>(rows.map((r:any)=>r.membership_item.creator_id))])]);
 const summary={current,ONGOING:0,CANCELLED:0,EXPIRED:0};for(const g of byStatus as any[])(summary as any)[g.status]=g._count._all;
 return{items:rows.map((r:any)=>{const m=subscribers.find((x:any)=>x.id===r.subscriber_id);return{id:r.id,status:r.status,autoRenew:r.auto_renew,amount:Number(r.amount),startedAt:r.started_at,endedAt:r.ended_at,nextBillingDate:r.next_billing_date,lastPaymentDate:r.last_payment_date,paymentFailureCount:r.payment_failure_count,createdAt:r.created_at,cancelReason:r.cancel_reason,cancelledBy:r.cancelled_by,subscriber:{id:r.subscriber_id,nickname:m&&!m.purged_at?m.nickname:null,withdrawn:!m||!!m.withdrawn_at},membership:{id:r.membership_item.id,name:r.membership_item.name,level:r.membership_item.level},creator:creators.get(r.membership_item.creator_id)};}),summary,total,page,pageSize:size};}

// 2026-11-06 user decision: console "즉시 해지" ends access now (ended_at=now, EXPIRED) with no refund and no
// payment-provider call. SUPER_ADMIN only; the reason is stored on the row (audit metadata takes no free text). The member-facing cancel keeps the paid period;
// this one does not, so it is a separate action with its own audit entry.
export async function cancelSubscriptionNow(db:any,admin:any,id:string,input:any){
 requireSuperAdmin(admin);
 const subscriptionId=text(id,64),reason=text(input?.reason,500);
 return db.$transaction(async (tx:any)=>{
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${subscriptionId} FOR UPDATE`;
  const sub=await tx.subscription.findUnique({where:{id:subscriptionId},select:{id:true,subscriber_id:true,status:true,auto_renew:true,ended_at:true,membership_item:{select:{id:true,creator_id:true}}}});
  if(!sub)reject(404,'SUBSCRIPTION_NOT_FOUND','구독을 찾을 수 없습니다.');
  const now=new Date();
  if(sub.status==='EXPIRED'||!sub.ended_at||sub.ended_at<=now)reject(409,'SUBSCRIPTION_ALREADY_ENDED','이미 종료된 구독입니다.');
  await tx.subscription.update({where:{id:sub.id},data:{status:'EXPIRED',ended_at:now,auto_renew:false,next_billing_date:null,cancel_reason:reason,cancelled_by:admin.user_sub}});
  await tx.checkoutOrder.updateMany({where:{subscription_id:sub.id,status:{in:['pending','failed']}},data:{status:'cancelled',retry_at:null}});
  await enqueueOperation(tx,'subscription.cancelled',{memberId:sub.subscriber_id,creatorId:sub.membership_item.creator_id,subscriptionId:sub.id,planId:sub.membership_item.id,status:'EXPIRED',previousStatus:sub.status});
  await appendAudit(tx,{category:'admin',action:'admin.subscription.cancelled_now',entityId:sub.id,data:auditChange({status:sub.status,auto_renew:sub.auto_renew},{status:'EXPIRED',auto_renew:false})});
  return{message:'구독을 즉시 해지했습니다.',id:sub.id,status:'EXPIRED',endedAt:now,refunded:false};
 });
}
