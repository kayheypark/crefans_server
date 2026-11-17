import {Injectable} from '@nestjs/common';
import {PlatformService} from './service';
import {BankTransferService} from './bank-transfer';
import {appendAudit} from './audit';
import {reject,text} from './http';
import {adPurchaseView} from './advertising-use';

// 2026-11-16 user decision: advertising products are bought by bank transfer (무통장입금). The order waits 24 hours for the deposit;
// after the operator confirms it the purchase is 'paid' and the creator starts it with '사용' (advertising-use.ts). A purchase not yet
// started can be refunded in full to the account the creator gives (operator transfer, 3 business days). PG card comes later.
@Injectable()
export class AdvertisingPurchaseService{
 constructor(private service:PlatformService,private transfers:BankTransferService){
  transfers.register('ad',{
   confirm:async(tx,id)=>{await tx.$queryRaw`SELECT id FROM ad_purchases WHERE id=${id} FOR UPDATE`;const o=await tx.adPurchase.findUniqueOrThrow({where:{id}});if(o.status==='paid')return;if(o.status!=='pending')reject(409,'AD_PURCHASE_UNAVAILABLE','입금 대기 중인 광고 주문이 아니에요.');await tx.adPurchase.update({where:{id},data:{status:'paid'}});await appendAudit(tx,{category:'finance',action:'advertising.paid',entityId:id,data:{amount:o.amount,creatorId:o.creator_id}});},
   cancel:async id=>{await this.db.adPurchase.updateMany({where:{id,status:'pending'},data:{status:'cancelled'}});},
   refunded:async id=>{await this.db.adPurchase.updateMany({where:{id,status:'refunding'},data:{status:'refunded',refunded_at:new Date()}});},
   refundRejected:async id=>{await this.db.adPurchase.updateMany({where:{id,status:'refunding'},data:{status:'paid',refund_amount:null}});},
  });
 }
 get db(){return this.service.db;}
 async create(creatorId:string,input:any){
  await this.service.requireCreator(creatorId);
  if(input?.method!=='bank_transfer')reject(400,'PAYMENT_METHOD_UNAVAILABLE','지금은 무통장입금으로만 구매할 수 있어요.');
  const key=text(input?.requestId,100),account=await this.transfers.requireOpen();
  return this.db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;
   const creator=await tx.creator.findUnique({where:{user_id:creatorId}});if(!creator?.is_active)reject(403,'CREATOR_UNAVAILABLE','활성 크리에이터만 광고상품을 구매할 수 있습니다.');
   const old=await tx.adPurchase.findUnique({where:{request_key:key}});if(old){if(old.creator_id!==creatorId||old.product_id!==input.productId)reject(409,'REQUEST_CONFLICT','다른 구매 요청입니다.');return adPurchaseView(old);}
   const p=await tx.adProduct.findUnique({where:{id:String(input.productId)}});
   if(!p||p.deleted_at||!p.visible||!p.on_sale)reject(409,'PRODUCT_UNAVAILABLE','판매 중인 광고상품이 아닙니다.');
   if(p.version!==input.version)reject(409,'PRODUCT_CHANGED','상품 조건이 변경되었습니다. 다시 확인해 주세요.');
   if(await tx.adPurchase.count({where:{creator_id:creatorId,status:'pending'}})>=3)reject(429,'OPEN_ORDER_LIMIT','입금 대기 중인 광고 주문을 먼저 확인해 주세요.');
   const o=await tx.adPurchase.create({data:{creator_id:creatorId,product_id:p.id,request_key:key,payment_method:'bank_transfer',name:p.name,terms:p.terms,amount:p.amount,duration_days:p.duration_days,placement:p.placement,status:'pending'}});
   await this.transfers.open(tx,'ad',o.id,creatorId,o.amount,input,account,p.name);
   await appendAudit(tx,{category:'finance',action:'advertising.order_created',entityId:o.id,data:{amount:o.amount,creatorId}});
   return adPurchaseView(o);
  });
 }
 async refund(creatorId:string,id:string,input:any){
  await this.db.$transaction(async(tx:any)=>{
   await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;
   const o=await tx.adPurchase.findFirst({where:{id,creator_id:creatorId}});if(!o)reject(404,'AD_PURCHASE_NOT_FOUND','구매 내역을 찾을 수 없습니다.');
   if(['refunding','refunded'].includes(o.status))return;
   if(o.status!=='paid'||o.starts_at||o.payment_method!=='bank_transfer')reject(409,'AD_REFUND_UNAVAILABLE','사용을 시작하지 않은 무통장입금 구매만 환불할 수 있어요. 그 밖의 경우 고객센터로 문의해 주세요.');
   await tx.adPurchase.update({where:{id},data:{status:'refunding',refund_amount:o.amount}});
   await this.transfers.openRefund(tx,'ad',id,id,creatorId,o.amount,input?.refundAccount,creatorId);
  });
  return adPurchaseView(await this.db.adPurchase.findUnique({where:{id}}));
 }
}
