import {Injectable} from '@nestjs/common';
import {PlatformService} from './service';
import {appendAudit} from './audit';
import {reject} from './http';
import {AI_SHOP_MIN_UNIT_KRW,AI_SHOP_TERMS,shopTerms} from './ai-shop';
import {aiPhotoAllowed} from './ai-photo-grants';
import {ConfigService} from '@nestjs/config';
import {InicisBillingProvider} from './inicis-billing';

// 2026-11-16 user decision: AI 이용권 구독형 (monthly card billing) next to 횟수형 (one payment).
// - The member registers a card in the PG billing window; the first month is charged right away from the server with the billing key.
// - Every paid period creates an ai_shop_orders row (paid, remaining = monthly uses, expires at the period end): no carry-over,
//   and generation keeps using the existing paid-use path (reservePaidPhoto / finishPaidPhoto).
// - Renewal on the same day each month; a failed renewal is retried every 24 hours up to 3 times, then the subscription ends.
// - Cancel stops the next renewal (uses stay until the period end). A refund returns the unused uses × unit price of the current
//   period (same rule as 횟수형) and ends the subscription immediately.
export const AI_SUBSCRIPTION_RETRIES=3,AI_SUBSCRIPTION_RETRY_MS=24*3600000;
export type BillingCharge={tid:string;paidAt:Date};
/** The PG side of AI subscriptions. KG이니시스 빌링 implements it; tests use a fake. */
export interface AiBillingProvider{
 readonly name:string;
 environment():'test'|'live'|'unavailable';
 /** Charges an issued billing key; throws on refusal (code in getResponse().code) or returns the PG transaction id. */
 charge(input:{billingKey:string;moid:string;amount:number;goodName:string;buyerName:string;buyerEmail?:string}):Promise<BillingCharge>;
 /** Full or partial cancel of a paid charge. */
 cancel(input:{tid:string;amount:number;remainingAmount:number;reason:string;moid:string}):Promise<void>;
}
export const AI_BILLING_PROVIDER='AI_BILLING_PROVIDER';
/** Adds one calendar month in KST, clamping to the month end (Jan 31 → Feb 28/29). */
export function addMonth(at:Date){const k=new Date(at.getTime()+9*3600000),y=k.getUTCFullYear(),m=k.getUTCMonth(),d=k.getUTCDate(),last=new Date(Date.UTC(y,m+2,0)).getUTCDate();const next=new Date(Date.UTC(y,m+1,Math.min(d,last),k.getUTCHours(),k.getUTCMinutes(),k.getUTCSeconds()));return new Date(next.getTime()-9*3600000);}
const statusLabels:Record<string,string>={pending:'카드 등록 대기',active:'구독 중',cancel_scheduled:'해지 예약',past_due:'결제 재시도 중',ended:'구독 종료',refunded:'환불 후 종료'};
export function subscriptionView(row:any,remaining?:number){const p=row.product_snapshot||{};return{id:row.id,productId:row.product_id,name:p.name,amount:p.amount,quantity:p.quantity,unitPrice:p.amount&&p.quantity?Math.floor(p.amount/p.quantity):null,status:row.status,statusLabel:statusLabels[row.status]||row.status,cardLabel:row.card_label,currentPeriodStart:row.current_period_start,currentPeriodEnd:row.current_period_end,nextChargeAt:row.status==='active'||row.status==='past_due'?row.next_charge_at:null,remaining:remaining??null,lastFailureCode:row.last_failure_code,environment:row.environment,createdAt:row.created_at};}

@Injectable()
export class AiSubscriptionService{
 provider?:AiBillingProvider;
 constructor(private service:PlatformService,config:ConfigService){this.provider=new InicisBillingProvider(config);}
 get db(){return this.service.db;}
 setProvider(provider:AiBillingProvider){this.provider=provider;}
 private requireProvider(){const p=this.provider;if(!p||p.environment()==='unavailable')reject(503,'BILLING_UNAVAILABLE','구독 결제를 준비 중이에요.');return p!;}
 private async allowed(member:string){await this.service.member(member);if(!await aiPhotoAllowed(this.db,member))reject(403,'AI_PHOTO_NOT_ALLOWED','AI 사진 편집을 사용할 수 있는 계정만 구독할 수 있어요.');}
 available(){return !!this.provider&&this.provider.environment()!=='unavailable';}
 async list(member:string){await this.service.member(member);const rows=await this.db.aiSubscription.findMany({where:{creator_id:member,status:{not:'pending'}},orderBy:{created_at:'desc'},take:20});
  return{available:this.available(),items:await Promise.all(rows.map(async(row:any)=>subscriptionView(row,await this.remaining(row))))};}
 private async remaining(row:any){const charge=await this.db.aiSubscriptionCharge.findFirst({where:{subscription_id:row.id,status:'paid'},orderBy:{period_start:'desc'}});if(!charge?.order_id)return 0;const o=await this.db.aiShopOrder.findUnique({where:{id:charge.order_id}});return o&&o.status==='paid'&&o.expires_at>new Date()?o.remaining:0;}
 /** Step 1: a pending subscription for the chosen plan; the PG window then issues the billing key for it. */
 async start(member:string,input:any){await this.allowed(member);this.requireProvider();if(input?.termsVersion!==AI_SHOP_TERMS)reject(400,'PAYMENT_TERMS_REQUIRED','구독 조건을 다시 확인해 주세요.');
  return this.db.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;
   const p=await tx.aiShopProduct.findUnique({where:{id:String(input?.productId)}});if(!p||p.deleted_at||!p.visible||!p.on_sale||p.kind!=='subscription')reject(409,'PRODUCT_UNAVAILABLE','판매 중인 구독 상품이 아닙니다.');if(p.version!==input.version)reject(409,'PRODUCT_CHANGED','상품 조건이 변경되었습니다. 다시 확인해 주세요.');if(p.amount/p.quantity<AI_SHOP_MIN_UNIT_KRW)reject(409,'PRODUCT_UNAVAILABLE','판매 조건을 확인 중인 상품입니다.');
   if(await tx.aiSubscription.count({where:{creator_id:member,status:{in:['active','past_due','cancel_scheduled']}}}))reject(409,'SUBSCRIPTION_EXISTS','이미 이용 중인 AI 이용권 구독이 있어요. 해지 예약 후 기간이 끝나면 다시 신청할 수 있어요.');
   await tx.aiSubscription.deleteMany({where:{creator_id:member,status:'pending',created_at:{lt:new Date(Date.now()-3600000)}}});
   const row=await tx.aiSubscription.create({data:{creator_id:member,product_id:p.id,product_snapshot:{name:p.name,amount:p.amount,quantity:p.quantity,terms:shopTerms,termsVersion:AI_SHOP_TERMS,acceptedAt:new Date().toISOString()},provider:this.provider!.name,environment:this.provider!.environment()}});
   await appendAudit(tx,{category:'finance',action:'ai_subscription.started',entityId:row.id,data:{amount:p.amount,count:p.quantity}});
   const buyer=await tx.member.findUnique({where:{id:member}});
   const window=this.provider instanceof InicisBillingProvider?this.provider.windowForm({orderId:row.id.replace(/-/g,''),price:p.amount,goodName:p.name.slice(0,40),buyerName:(buyer?.nickname||'크레팬스 회원').slice(0,30),buyerEmail:buyer?.email||'',buyerTel:'',returnUrl:'https://crefans.com/api/v1/payments/inicis/billing-return'}):null;
   return{id:row.id,amount:p.amount,name:p.name,window};
  });}
 /** Step 2 (after the PG issued the billing key): store it encrypted and charge the first month right away. */
 async activate(subscriptionId:string,billingKeyEncrypted:string,cardLabel:string){const row=await this.db.aiSubscription.findUnique({where:{id:subscriptionId}});if(!row)reject(404,'SUBSCRIPTION_NOT_FOUND','구독 신청을 찾을 수 없어요.');if(row.status!=='pending')return subscriptionView(row);
  const now=new Date();await this.db.aiSubscription.update({where:{id:subscriptionId},data:{billing_key_encrypted:billingKeyEncrypted,card_label:cardLabel.slice(0,60),status:'active',current_period_start:now,current_period_end:addMonth(now),next_charge_at:now}});
  await this.chargePeriod(subscriptionId,true);return subscriptionView(await this.db.aiSubscription.findUnique({where:{id:subscriptionId}}));}
 /** Charges the period starting at next_charge_at; on success grants that month's uses. First charge failure ends the signup. */
 async chargePeriod(subscriptionId:string,first=false,decrypt:(v:string)=>string=v=>v){const provider=this.requireProvider();
  const claimed=await this.db.aiSubscription.updateMany({where:{id:subscriptionId,status:{in:['active','past_due']},OR:[{locked_until:null},{locked_until:{lt:new Date()}}]},data:{locked_until:new Date(Date.now()+120000)}});if(!claimed.count)return;
  const row=await this.db.aiSubscription.findUniqueOrThrow({where:{id:subscriptionId}}),p=row.product_snapshot as any,start=row.next_charge_at||new Date(),end=addMonth(start);
  const moid=`aisub_${row.id.replace(/-/g,'').slice(0,16)}_${start.getTime()}`.slice(0,64);
  let charge=await this.db.aiSubscriptionCharge.findUnique({where:{moid}});
  if(charge?.status==='paid'){await this.db.aiSubscription.update({where:{id:row.id},data:{locked_until:null}});return;}
  if(!charge)charge=await this.db.aiSubscriptionCharge.create({data:{subscription_id:row.id,moid,period_start:start,period_end:end,amount:p.amount}});
  try{const member=await this.db.member.findUnique({where:{id:row.creator_id}});
   const result=await provider.charge({billingKey:decrypt(row.billing_key_encrypted),moid,amount:p.amount,goodName:`${p.name}`.slice(0,40),buyerName:(member?.nickname||member?.name||'크레팬스 회원').slice(0,30),buyerEmail:member?.email||undefined});
   await this.db.$transaction(async(tx:any)=>{const order=await tx.aiShopOrder.create({data:{creator_id:row.creator_id,product_id:row.product_id,request_key:moid,name:p.name,amount:p.amount,quantity:p.quantity,validity_days:30,terms:JSON.stringify({version:p.termsVersion,text:p.terms,subscriptionId:row.id}),environment:row.environment==='live'?'live':'test',status:'paid',remaining:p.quantity,paid_at:result.paidAt,expires_at:end,payment_key:`${provider.name}:${result.tid}`.slice(0,200)}});
    await tx.aiSubscriptionCharge.update({where:{id:charge!.id},data:{status:'paid',provider_tid:result.tid,order_id:order.id,paid_at:result.paidAt,failure_code:null}});
    await tx.aiSubscription.update({where:{id:row.id},data:{status:row.cancel_requested_at?'cancel_scheduled':'active',current_period_start:start,current_period_end:end,next_charge_at:end,retry_count:0,last_failure_code:null,locked_until:null}});
    await appendAudit(tx,{category:'finance',action:'ai_subscription.charged',entityId:row.id,data:{amount:p.amount,count:p.quantity,orderId:order.id}});});
  }catch(error:any){const code=String(error?.getResponse?.()?.code||error?.code||'BILLING_FAILED').slice(0,100),retries=row.retry_count+1,give=first||retries>AI_SUBSCRIPTION_RETRIES;
   await this.db.aiSubscriptionCharge.update({where:{id:charge.id},data:{status:'failed',failure_code:code}});
   await this.db.aiSubscription.update({where:{id:row.id},data:give?{status:'ended',ended_at:new Date(),last_failure_code:code,next_charge_at:null,locked_until:null}:{status:'past_due',retry_count:retries,last_failure_code:code,next_charge_at:new Date(Date.now()+AI_SUBSCRIPTION_RETRY_MS),locked_until:null}});
   await appendAudit(this.db,{category:'finance',action:give?'ai_subscription.ended':'ai_subscription.charge_failed',entityId:row.id,data:{errorCode:code,count:retries}});
   if(first)throw error;
  }}
 async cancel(member:string,id:string){const row=await this.db.aiSubscription.findFirst({where:{id,creator_id:member}});if(!row)reject(404,'SUBSCRIPTION_NOT_FOUND','구독을 찾을 수 없어요.');
  if(['ended','refunded','cancel_scheduled'].includes(row.status))return subscriptionView(row);
  // A past-due subscription has no paid current period to keep, so it ends now; an active one keeps its uses until the period end.
  const data=row.status==='past_due'?{status:'ended',ended_at:new Date(),next_charge_at:null,cancel_requested_at:new Date()}:{status:'cancel_scheduled',cancel_requested_at:new Date()};
  const updated=await this.db.aiSubscription.update({where:{id},data});await appendAudit(this.db,{category:'finance',action:'ai_subscription.cancel_requested',entityId:id,data:{status:updated.status}});
  return subscriptionView(updated,await this.remaining(updated));}
 /** Refund of the current period: unused uses × unit price via PG partial cancel; the subscription ends immediately. */
 async refund(member:string,id:string){const provider=this.requireProvider();const row=await this.db.aiSubscription.findFirst({where:{id,creator_id:member}});if(!row)reject(404,'SUBSCRIPTION_NOT_FOUND','구독을 찾을 수 없어요.');
  const charge=await this.db.aiSubscriptionCharge.findFirst({where:{subscription_id:id,status:'paid'},orderBy:{period_start:'desc'}});if(!charge?.order_id)reject(409,'NO_REFUNDABLE_USES','환불할 남은 횟수가 없어요.');
  const reserved=await this.db.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM ai_shop_orders WHERE id=${charge!.order_id} FOR UPDATE`;const o=await tx.aiShopOrder.findUniqueOrThrow({where:{id:charge!.order_id}});
   if(o.status!=='paid'||o.remaining<=0||o.expires_at<=new Date())reject(409,'NO_REFUNDABLE_USES','환불할 남은 횟수가 없어요.');if(await tx.aiShopUse.count({where:{order_id:o.id,status:'reserved'}}))reject(409,'GENERATION_IN_PROGRESS','사진 생성이 끝난 뒤 환불해 주세요.');
   const amount=Math.floor(o.amount/o.quantity)*o.remaining;await tx.aiShopOrder.update({where:{id:o.id},data:{status:'refunding',refund_quantity:o.remaining,refund_amount:amount}});return{o,amount};});
  try{await provider.cancel({tid:charge!.provider_tid!,amount:reserved.amount,remainingAmount:charge!.amount-reserved.amount,reason:'AI 이용권 구독 남은 횟수 환불',moid:charge!.moid});}
  catch(error){await this.db.aiShopOrder.updateMany({where:{id:reserved.o.id,status:'refunding'},data:{status:'paid',refund_quantity:null,refund_amount:null}});throw error;}
  await this.db.$transaction(async(tx:any)=>{await tx.aiShopOrder.update({where:{id:reserved.o.id},data:{status:'refunded',remaining:0,refunded_at:new Date()}});await tx.aiSubscriptionCharge.update({where:{id:charge!.id},data:{refund_amount:reserved.amount}});await tx.aiSubscription.update({where:{id},data:{status:'refunded',ended_at:new Date(),next_charge_at:null}});
   await appendAudit(tx,{category:'finance',action:'ai_subscription.refunded',entityId:id,data:{amount:reserved.amount,count:reserved.o.remaining}});});
  return subscriptionView(await this.db.aiSubscription.findUnique({where:{id}}),0);}
 /** Worker: renew due subscriptions and end scheduled cancellations at their period end. */
 async tick(decrypt:(v:string)=>string,now=new Date()){if(!this.provider||this.provider.environment()==='unavailable')return 0;let count=0;
  await this.db.aiSubscription.updateMany({where:{status:'cancel_scheduled',current_period_end:{lte:now}},data:{status:'ended',ended_at:now,next_charge_at:null}});
  const due=await this.db.aiSubscription.findMany({where:{status:{in:['active','past_due']},next_charge_at:{lte:now},environment:this.provider.environment()},orderBy:{next_charge_at:'asc'},take:30});
  for(const row of due){try{await this.chargePeriod(row.id,false,decrypt);count++;}catch{/* recorded on the row */}}
  return count;}
}
