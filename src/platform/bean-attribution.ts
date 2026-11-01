import {Prisma} from '@prisma/client';
/** Read-only attribution. Financial amounts continue to come from the immutable ledger. */
export async function attributeTips(db:any,tips:any[]){
 const ids=[...new Set(tips.map(t=>t.post_id).filter(Boolean))];
 const posts=ids.length?await db.posting.findMany({where:{id:{in:ids}},select:{id:true,title:true,status:true,is_deleted:true}}):[];
 const byId=new Map<string,any>(posts.map((p:any)=>[p.id,p]));
 return tips.map(t=>{const post=byId.get(t.post_id),snapshot=t.post_title_snapshot;
  return {...t,sourceType:t.post_id?'post':'profile',postTitle:t.post_id?(snapshot??post?.title??null):null,
   postTitleSource:t.post_id?(snapshot!==null&&snapshot!==undefined?'snapshot':post?'current':'unavailable'):null,
   postAvailable:!!post&&!post.is_deleted&&post.status==='PUBLISHED'};
 });
}
/** Each earned lot belongs to one tip. Count only the portion reserved in this payout. */
export async function attributePayouts(db:any,payouts:any[]){
 if(!payouts.length)return [];
 const allocations=await db.beanPayoutAllocation.findMany({where:{payout_id:{in:payouts.map(p=>p.id)}}});
 const lots=await db.beanLot.findMany({where:{id:{in:allocations.map((a:any)=>a.lot_id)}}});
 const tips=await db.beanTipAllocation.findMany({where:{target_lot_id:{in:allocations.map((a:any)=>a.lot_id)}}});
 const rows=await db.beanTip.findMany({where:{id:{in:tips.map((a:any)=>a.tip_id)}},select:{id:true,post_id:true}});
 const byTip=new Map<string,any>(rows.map((t:any)=>[t.id,t]));
 const byLot=new Map<string,any>(tips.map((a:any)=>[a.target_lot_id,byTip.get(a.tip_id)]));
 const totals=new Map<string,{postQuantity:number;profileQuantity:number;unattributedQuantity:number}>();
 for(const a of allocations){const sum=totals.get(a.payout_id)||{postQuantity:0,profileQuantity:0,unattributedQuantity:0},tip=byLot.get(a.lot_id);
  sum[!tip?'unattributedQuantity':tip.post_id?'postQuantity':'profileQuantity']+=a.quantity;totals.set(a.payout_id,sum);
 }
 return payouts.map(p=>{const sources=totals.get(p.id)||{postQuantity:0,profileQuantity:0,unattributedQuantity:0};
  sources.unattributedQuantity+=Math.max(0,p.quantity-sources.postQuantity-sources.profileQuantity-sources.unattributedQuantity);
  const funding={paidQuantity:0,promotionQuantity:0,unknownQuantity:0};
  for(const a of allocations.filter(a=>a.payout_id===p.id)){const bucket=lots.find(l=>l.id===a.lot_id)?.bucket;funding[bucket==='earned-paid'?'paidQuantity':bucket==='earned-promotion'?'promotionQuantity':'unknownQuantity']+=a.quantity;}
  funding.unknownQuantity+=Math.max(0,p.quantity-funding.paidQuantity-funding.promotionQuantity-funding.unknownQuantity);
  return {...p,sources,funding};
 });
}
export async function tipSourceTotals(db:any,creatorId?:string){
 const groups=await db.$queryRaw(Prisma.sql`SELECT IF(post_id IS NULL,'profile','post') AS sourceType, COUNT(*) AS count, SUM(paid_quantity) AS paidQuantity, SUM(promotion_quantity) AS promotionQuantity FROM bean_tips ${creatorId?Prisma.sql`WHERE creator_id=${creatorId}`:Prisma.empty} GROUP BY IF(post_id IS NULL,'profile','post')`);
 return (['post','profile'] as const).map(sourceType=>{const g=groups.find((g:any)=>g.sourceType===sourceType);return {sourceType,count:Number(g?.count||0),paidQuantity:Number(g?.paidQuantity||0),promotionQuantity:Number(g?.promotionQuantity||0)};});
}

/** Funding totals use stored payout amounts; promotional payouts do not create PG charge revenue. */
export async function payoutFundingGroups(db:any){
 const groups=await db.$queryRaw(Prisma.sql`SELECT p.environment, p.status, CASE WHEN l.bucket='earned-paid' THEN 'paid' WHEN l.bucket='earned-promotion' THEN 'promotion' ELSE 'unknown' END AS source, SUM(a.quantity) AS quantity, SUM(p.gross*a.quantity/p.quantity) AS gross, SUM(p.fee*a.quantity/p.quantity) AS fee, SUM(p.net*a.quantity/p.quantity) AS net FROM bean_payouts p JOIN bean_payout_allocations a ON a.payout_id=p.id LEFT JOIN bean_lots l ON l.id=a.lot_id GROUP BY p.environment,p.status,source`);
 return groups.map((g:any)=>({...g,quantity:Number(g.quantity),gross:Number(g.gross),fee:Number(g.fee),net:Number(g.net)}));
}
