import {appendAudit} from './audit';
import {reject} from './http';
export const promotionActive=(creator:any,now=new Date())=>!!creator?.promoted||!!(creator?.ad_promoted_until&&new Date(creator.ad_promoted_until)>now);
export function adPurchaseView(order:any,now=new Date(),blockedUntil:Date|null=null){
 const useStatus=order.starts_at?(order.ends_at&&order.ends_at>now?'active':'completed'):'ready';
 return{id:order.id,name:order.name,amount:order.amount,durationDays:order.duration_days,createdAt:order.created_at,status:order.status,useStatus,startsAt:order.starts_at,endsAt:order.ends_at,blockedUntil:useStatus==='ready'?blockedUntil:null};
}
export async function listAdPurchases(db:any,creatorId:string){
 const now=new Date();
 const [orders,active]=await Promise.all([db.adPurchase.findMany({where:{creator_id:creatorId},orderBy:[{created_at:'desc'},{id:'desc'}]}),db.adPurchase.findFirst({where:{creator_id:creatorId,status:'paid',starts_at:{lte:now},ends_at:{gt:now}},orderBy:{ends_at:'desc'}})]);
 return orders.map((o:any)=>adPurchaseView(o,now,active?.ends_at??null));
}
export async function activateAdPurchase(db:any,creatorId:string,id:string){
 return db.$transaction(async(tx:any)=>{
  // One lock per creator serializes different purchases and repeat clicks together.
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;
  const creator=await tx.creator.findUnique({where:{user_id:creatorId}});
  if(!creator?.is_active)reject(403,'CREATOR_UNAVAILABLE','활성 크리에이터만 광고를 사용할 수 있습니다.');
  const order=await tx.adPurchase.findFirst({where:{id,creator_id:creatorId}});
  if(!order)reject(404,'AD_PURCHASE_NOT_FOUND','구매 내역을 찾을 수 없습니다.');
  if(order.status!=='paid')reject(409,'AD_PURCHASE_NOT_PAID','결제가 완료된 상품만 사용할 수 있습니다.');
  const now=new Date();
  if(order.starts_at)return adPurchaseView(order,now);
  if(order.placement!=='featured_creator'||!Number.isSafeInteger(order.duration_days)||order.duration_days<1||order.duration_days>365)reject(409,'INVALID_AD_PURCHASE','상품의 이용기간을 확인해주세요.');
  const active=await tx.adPurchase.findFirst({where:{creator_id:creatorId,status:'paid',starts_at:{lte:now},ends_at:{gt:now}}});
  if(active)reject(409,'AD_ALREADY_ACTIVE','현재 광고가 끝난 뒤 사용할 수 있습니다.');
  const endsAt=new Date(now.getTime()+order.duration_days*86400000);
  const updated=await tx.adPurchase.update({where:{id},data:{starts_at:now,ends_at:endsAt}});
  await tx.creator.update({where:{user_id:creatorId},data:{ad_promoted_until:endsAt}});
  await appendAudit(tx,{category:'business',action:'advertising.started',entityId:id,data:{creatorId,orderId:id,status:'active'}});
  return adPurchaseView(updated,now);
 });
}
