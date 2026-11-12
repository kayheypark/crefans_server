import {noticeCancelReserved,noticePaymentCompleted,noticeRefunded} from './membership-notices';
import {settlementPending,settlementHoldReasons} from './settlement-receipts';
import {CREATOR_PROVISION} from './creator-provision';
import {PAYMENT_TERMS,paymentTermsAccepted} from './payment-terms';
import {betaPolicy,isBeta,inPayoutBatch,PAYOUT_SCHEDULE_MESSAGE,manualPayouts,paymentEnvironment,renewalPolicy,unusedRefundReason} from './beta-policy';
import {can,requirePermission,requireSuperAdmin} from './admin-permissions';
import {paymentFailureCodes,renewalDeadline,unusableCardCodes} from './billing-failures';
import {appendAudit,auditChange} from './audit';
import {enqueueOperation} from './operations-events';
import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {randomUUID,randomBytes} from 'crypto';
import {paymentPolicy} from './financial-policy';
import {studioTerms,withdrawalTerms} from './signup-invites';
import {billingCard} from './billing-card';
import {PlatformService} from './service';
import {PaymentProvider,providerOrderId,acceptedPaymentMethod} from './payment-provider';
import {BankProvider} from './bank-provider';
import {digest} from '../auth/local/credentials';
import {hashPassword,verifyPassword} from '../auth/local/credentials';
import {checkWithdrawalPin,noticePinChanged,pinCheckMessage,pinCheckStatus,weakPin,WEAK_PIN_MESSAGE} from './withdrawal-pin';
import {reject,text,dateOnly} from './http';
import {clawBackReferralReward,qualifyReferralReward,requireBeanPayoutMember} from './referrals';
import {isPartnerCreator,PARTNER_REQUIRED_MESSAGE,requirePartnerCreator,type PartnerCheck} from './partner-policy';
export const nextMonth=(now:Date,anchor:Date=now)=>{const date=new Date(now),day=anchor.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));return date;};
const WITHDRAWAL_NOTE_MAX=191,MANUAL_REJECT_PREFIX='수동 이체 반려 · ';
@Injectable()
export class PlatformFinanceService {
 constructor(private service:PlatformService,private provider:PaymentProvider,private config:ConfigService,private bank:BankProvider){}
 get db(){return this.service.db;}
 async audit(tx:any,action:string,entityId:string,data:Record<string,unknown>){return appendAudit(tx,{category:'finance',action,entityId,data});}
 async billingConfig(member:string){const data=this.provider.configForClient();const customer=await this.db.billingCustomer.upsert({where:{member_id:member},create:{member_id:member},update:{}});return{...data,customerKey:customer.customer_key};}
 async startRegistration(member:string,input:any){const config=await this.billingConfig(member),returnPath=text(input.returnPath||'/service/payment-methods',250);if(returnPath!=='/service/payment-methods'&&!/^\/service\/checkout\/[a-f0-9-]{36}$/.test(returnPath))reject(400,'INVALID_RETURN_PATH','등록 후 이동 경로를 확인해주세요.');if(returnPath.startsWith('/service/checkout/'))await this.order(member,returnPath.split('/').pop());const state=randomBytes(32).toString('base64url');const registration=await this.db.billingRegistration.create({data:{member_id:member,customer_key:config.customerKey,state_hash:digest(state),return_path:returnPath,expires_at:new Date(Date.now()+1800000)}});return{...config,registrationId:registration.id,state,returnPath};}
 async addMethod(member:string,input:any){const id=text(input.registrationId,191),state=text(input.state,100);const registration=await this.db.billingRegistration.findFirst({where:{id,member_id:member,state_hash:digest(state)}});if(!registration)reject(403,'INVALID_REGISTRATION','결제수단 등록 요청이 일치하지 않습니다.');if(input.customerKey&&input.customerKey!==registration.customer_key)reject(403,'CUSTOMER_MISMATCH','결제수단 인증 계정이 일치하지 않습니다.');if(registration.status==='completed'){const method=await this.db.billingMethod.findUnique({where:{id:registration.billing_method_id}});if(!method||method.deleted_at)reject(409,'AUTH_KEY_USED','새로 카드 등록을 진행해주세요.');return{message:'결제수단을 등록했습니다.',returnPath:registration.return_path};}if(registration.status==='failed')reject(409,'REGISTRATION_FAILED','카드 인증에 실패했습니다. 새로 등록해주세요.');if(registration.expires_at<=new Date())reject(409,'REGISTRATION_EXPIRED','카드 등록 시간이 만료되었습니다. 새로 진행해주세요.');
  if(input.authKey){const encrypted=this.provider.encrypt(text(input.authKey,300));await this.db.billingRegistration.updateMany({where:{id,auth_key_encrypted:null,status:'pending'},data:{auth_key_encrypted:encrypted}});}if(!input.authKey&&!registration.auth_key_encrypted)reject(409,'REGISTRATION_AUTH_REQUIRED','카드 인증을 다시 진행해주세요.');return this.finishRegistration(id);
 }
 async finishRegistration(id:string){const claimed=await this.db.billingRegistration.updateMany({where:{id,status:{in:['pending','processing']},expires_at:{gt:new Date()},auth_key_encrypted:{not:null},OR:[{locked_until:null},{locked_until:{lt:new Date()}}]},data:{status:'processing',locked_until:new Date(Date.now()+90000)}});if(!claimed.count)reject(409,'REGISTRATION_PROCESSING','등록 상태를 확인하고 있습니다. 잠시 후 다시 확인해주세요.');const registration=await this.db.billingRegistration.findUniqueOrThrow({where:{id}});
  try{const result=await this.provider.issue(this.provider.decrypt(registration.auth_key_encrypted),registration.customer_key,id);if(!result.billingKey||result.customerKey!==registration.customer_key)reject(502,'INVALID_PROVIDER_RESPONSE','카드 등록 결과를 확인할 수 없습니다.');const card=billingCard(result),encrypted=this.provider.encrypt(result.billingKey);let unavailable=false;await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${registration.member_id} FOR UPDATE`;const member=await tx.member.findUnique({where:{id:registration.member_id}});unavailable=!member?.enabled;const count=await tx.billingMethod.count({where:{member_id:registration.member_id,deleted_at:null}});await tx.billingMethod.upsert({where:{id},create:{id,member_id:registration.member_id,customer_key:registration.customer_key,billing_key_encrypted:encrypted,label:card.label,last_four:card.lastFour,masked_number:card.maskedNumber,is_default:!unavailable&&count===0,deleted_at:unavailable?new Date():null},update:{}});await tx.billingRegistration.update({where:{id},data:{status:unavailable?'failed':'completed',billing_method_id:id,auth_key_encrypted:null,locked_until:null}});await this.audit(tx,'billing.registered',id,{memberId:registration.member_id,status:unavailable?'failed':'completed'});});if(unavailable){try{await this.revokeMethod(id);}catch{}reject(403,'MEMBER_UNAVAILABLE','계정을 확인해주세요.');}return{message:'결제수단을 등록했습니다.',returnPath:registration.return_path};
  }catch(error:any){const failed=error.getResponse?.()?.code==='PAYMENT_FAILED';await this.db.billingRegistration.updateMany({where:{id,status:'processing'},data:{status:failed?'failed':'pending',locked_until:failed?null:new Date(Date.now()+30000),...(failed?{auth_key_encrypted:null}:{})}});throw error;}
 }
 async revokeMethod(id:string){const method=await this.db.billingMethod.findFirst({where:{id,deleted_at:{not:null},revoked_at:null}});if(!method)return;try{await this.provider.revoke(this.provider.decrypt(method.billing_key_encrypted),`revoke-${id}`);await this.db.billingMethod.update({where:{id},data:{revoked_at:new Date(),revoke_retry_at:null,billing_key_encrypted:''}});}catch(error){await this.db.billingMethod.update({where:{id},data:{revoke_attempts:{increment:1},revoke_retry_at:new Date(Date.now()+300000)}});throw error;}}
 async retryBilling(){const pending=await this.db.billingRegistration.findMany({where:{status:{in:['pending','processing']},expires_at:{gt:new Date()},auth_key_encrypted:{not:null},OR:[{locked_until:null},{locked_until:{lt:new Date()}}]},take:20,orderBy:{updated_at:'asc'}});let failures=0;for(const row of pending){try{await this.finishRegistration(row.id);}catch{failures++;}}const revoked=await this.db.billingMethod.findMany({where:{deleted_at:{not:null},revoked_at:null,OR:[{revoke_retry_at:null},{revoke_retry_at:{lte:new Date()}}]},take:20,orderBy:{created_at:'asc'}});for(const row of revoked){try{await this.revokeMethod(row.id);}catch{failures++;}}const expired=await this.db.billingRegistration.updateMany({where:{expires_at:{lte:new Date()},status:{notIn:['completed','expired']},OR:[{locked_until:null},{locked_until:{lt:new Date()}}]},data:{status:'expired',auth_key_encrypted:null}});if(failures)reject(503,'BILLING_RETRY_FAILED','결제수단 재처리 실패가 있어 운영 확인이 필요합니다.');return pending.length+revoked.length+expired.count;}
 async method(member:string,id:string,operation:string){if(!['delete','default'].includes(operation))reject(400,'INVALID_OPERATION','결제수단 작업을 확인해주세요.');await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;const m=await tx.billingMethod.findFirst({where:{id,member_id:member}});if(operation==='default'&&m?.unavailable_at)reject(409,'PAYMENT_METHOD_UNAVAILABLE','다른 카드를 등록하고 기본 결제수단으로 설정해주세요.');if(!m||m.deleted_at&&operation!=='delete')reject(404,'METHOD_NOT_FOUND','결제수단을 찾을 수 없습니다.');if(operation==='delete'){if(m.deleted_at)return;if(await tx.checkoutOrder.count({where:{member_id:member,billing_method_id:id,status:'processing'}})||await tx.subscription.count({where:{subscriber_id:member,billing_method_id:id,status:'ONGOING',auto_renew:true}}))reject(409,'METHOD_IN_USE','구독 갱신에 사용 중입니다. 다른 기본 결제수단을 먼저 선택해주세요.');await tx.billingMethod.update({where:{id},data:{deleted_at:new Date(),is_default:false}});if(m.is_default){const next=await tx.billingMethod.findFirst({where:{member_id:member,deleted_at:null,unavailable_at:null},orderBy:{created_at:'asc'}});if(next)await tx.billingMethod.update({where:{id:next.id},data:{is_default:true}});}}else{await tx.billingMethod.updateMany({where:{member_id:member},data:{is_default:false}});await tx.billingMethod.update({where:{id},data:{is_default:true}});await tx.subscription.updateMany({where:{subscriber_id:member,status:'ONGOING',auto_renew:true},data:{billing_method_id:id}});const subs=await tx.subscription.findMany({where:{subscriber_id:member,status:'ONGOING',auto_renew:true},select:{id:true}});await tx.checkoutOrder.updateMany({where:{member_id:member,subscription_id:{in:subs.map(s=>s.id)},status:'failed',billing_method_id:{not:id}},data:{retry_at:new Date()}});}});if(operation==='delete'){try{await this.revokeMethod(id);}catch{return{message:'결제수단을 삭제했습니다. 결제사 등록 해제는 확인 중입니다.'};}}return{message:'결제수단을 변경했습니다.'};}
 async createOrder(member:string,input:any){const key=text(input.requestId,100),planId=text(input.planId,191);if(input.creatorProvision!==CREATOR_PROVISION.version)reject(400,'CREATOR_PROVISION_CONSENT_REQUIRED','크리에이터에게 구독자 정보를 제공하는 데 동의해야 멤버십에 가입할 수 있습니다. 화면을 새로고침한 뒤 다시 확인해주세요.');return this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;const prior=await tx.checkoutOrder.findUnique({where:{idempotency_key:key}});if(prior){if(prior.member_id!==member||prior.membership_id!==planId)reject(409,'IDEMPOTENCY_CONFLICT','요청 식별자가 다른 주문에 사용되었습니다.');return this.orderView(prior);}await tx.$queryRaw`SELECT id FROM membership_items WHERE id=${planId} FOR UPDATE`;const p=await tx.membershipItem.findUnique({where:{id:planId}});const c=p?await tx.creator.findUnique({where:{user_id:p.creator_id}}):null;if(!p?.is_active||p.is_deleted||!c?.is_active)reject(409,'PLAN_UNAVAILABLE','가입할 수 없는 멤버십입니다.');if(!Number.isSafeInteger(Number(p.price))||Number(p.price)<100||Number(p.price)>1100000)reject(400,'INVALID_AMOUNT','카드 결제 금액은 100원 이상이어야 합니다.');if(p.creator_id===member)reject(400,'SELF_SUBSCRIPTION','본인 멤버십에 가입할 수 없습니다.');if(await tx.subscription.count({where:{subscriber_id:member,membership_item:{creator_id:p.creator_id},status:{in:['ONGOING','CANCELLED']},OR:[{ended_at:{gt:new Date()}},{status:'ONGOING',auto_renew:true}]}}))reject(409,'ALREADY_SUBSCRIBED','이미 이용 중인 멤버십입니다.');const order=await tx.checkoutOrder.create({data:{member_id:member,membership_id:p.id,amount:Number(p.price),snapshot:{...this.service.plan(p),creatorId:p.creator_id,refundWindowDays:betaPolicy.refundDays,policyVersion:betaPolicy.version,paymentEnvironment:paymentEnvironment(this.provider.configForClient().clientKey)},idempotency_key:key,expires_at:new Date(Date.now()+1800000)}});await tx.memberConsent.create({data:{member_id:member,kind:'creator-provision',document_id:`code:creator-provision:${CREATOR_PROVISION.version}`,document_snapshot:{...CREATOR_PROVISION,creatorId:p.creator_id,orderId:order.id}}});await this.audit(tx,'order.created',order.id,{memberId:member,amount:order.amount,status:order.status});return this.orderView(order);});}
 orderView(o:any){return{id:o.id,planId:o.membership_id,amount:o.amount,status:o.status,snapshot:o.snapshot,expiresAt:o.expires_at.toISOString()};}
 async order(member:string,id:string){const o=await this.db.checkoutOrder.findFirst({where:{id,member_id:member}});if(!o)reject(404,'ORDER_NOT_FOUND','주문을 찾을 수 없습니다.');return this.orderView(o);}
 async retryPayment(member:string,id:string){
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const order=await tx.checkoutOrder.findFirst({where:{id,member_id:member}});if(!order)reject(404,'ORDER_NOT_FOUND','주문을 찾을 수 없습니다.');
   if(order.status!=='failed')return this.orderView(order);
   if(order.subscription_id)reject(409,'RENEWAL_MANAGED','구독 갱신은 자동 재시도 정책으로 처리됩니다.');
   if(order.expires_at<=new Date())reject(409,'ORDER_EXPIRED','주문이 만료되었습니다. 멤버십을 다시 선택해주세요.');
   const updated=await tx.checkoutOrder.update({where:{id},data:{status:'pending',attempts:{increment:1},billing_method_id:null,payment_key:null,failure_code:null,retry_at:null,locked_until:null,processing_started_at:null}});return this.orderView(updated);
  });
 }
 async paymentWindow(member:string,id:string,terms?:unknown){
  if(!paymentTermsAccepted(terms))reject(400,'PAYMENT_TERMS_REQUIRED','결제 조건을 확인하고 동의해야 결제할 수 있습니다. 화면을 새로고침한 뒤 다시 확인해주세요.');
  const config=await this.billingConfig(member);
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const o=await tx.checkoutOrder.findFirst({where:{id,member_id:member}});
   if(!o)reject(404,'ORDER_NOT_FOUND','주문을 찾을 수 없습니다.');
   if(o.status!=='pending'||o.subscription_id||o.expires_at<=new Date())reject(409,'INVALID_ORDER_STATE','새 주문으로 결제해주세요.');
   await tx.checkoutOrder.update({where:{id},data:{snapshot:{...(o.snapshot as any),paymentMode:'one-time'}}});
   if(terms!==undefined)await tx.memberConsent.create({data:{member_id:member,kind:'payment-terms',document_id:`code:payment-terms:${PAYMENT_TERMS.version}`,document_snapshot:{...PAYMENT_TERMS,orderId:id,amount:o.amount,paymentMode:'one-time'}}});
   return{...config,orderId:providerOrderId(o),amount:o.amount,orderName:String((o.snapshot as any).name).slice(0,100)};
  });
 }
 async confirmPayment(member:string,id:string,input:any){
  const o=await this.db.checkoutOrder.findFirst({where:{id,member_id:member}});
  if(!o)reject(404,'ORDER_NOT_FOUND','주문을 찾을 수 없습니다.');
  if((o.snapshot as any).paymentMode!=='one-time'||input.orderId!==providerOrderId(o)||input.amount!==o.amount)reject(400,'PAYMENT_MISMATCH','결제 주문과 금액이 일치하지 않습니다.');
  const paymentKey=text(input.paymentKey,300);
  if(o.payment_key&&o.payment_key!==paymentKey)reject(409,'PAYMENT_MISMATCH','다른 결제 요청입니다.');
  return this.pay(member,id,undefined,paymentKey);
 }
 async pay(member:string,id:string,methodId?:string,windowKey?:string,terms?:unknown){
  const currentEnvironment=paymentEnvironment(this.provider.configForClient().clientKey);
  let method:any,recover=false,renewalMethodId:string;
  const order=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const o=await tx.checkoutOrder.findFirst({where:{id,member_id:member}});if(!o)reject(404,'ORDER_NOT_FOUND','주문을 찾을 수 없습니다.');if(o.status==='paid')return o;if((o.snapshot as any).paymentEnvironment&&((o.snapshot as any).paymentEnvironment!==currentEnvironment)||currentEnvironment==='live'&&(o.snapshot as any).paymentEnvironment!=='live')reject(409,'PAYMENT_ENVIRONMENT_CHANGED','테스트 구독은 실제 결제로 전환되지 않습니다. 새 결제 동의와 주문이 필요합니다.');
   if(!['pending','processing'].includes(o.status))reject(409,'INVALID_ORDER_STATE','결제할 수 없는 주문입니다.');
   if(o.locked_until&&o.locked_until>new Date())reject(409,'PAYMENT_IN_PROGRESS','결제 결과를 확인 중입니다. 잠시 후 다시 확인해주세요.');
   // 2026-11-02 user decision: closing the one-time payment window must not lock the order out of the monthly card payment.
   // A pending order with no approved window returns to subscription under a new provider order id, so a late window approval no longer matches.
   const reopened=(o.snapshot as any).paymentMode==='one-time'&&!windowKey&&!o.payment_key&&o.status==='pending',oneTime=(o.snapshot as any).paymentMode==='one-time'&&!reopened;
   if(windowKey&&!oneTime||oneTime&&!windowKey&&!o.payment_key)reject(409,'PAYMENT_AUTH_REQUIRED','결제창에서 인증을 완료해주세요.');
   if(windowKey&&o.payment_key&&o.payment_key!==windowKey)reject(409,'PAYMENT_MISMATCH','다른 결제 요청입니다.');
   recover=o.status==='processing';if(!recover&&o.expires_at<=new Date())reject(409,'ORDER_EXPIRED','주문이 만료되었습니다.');
   if(!recover&&!o.subscription_id&&!paymentTermsAccepted(terms))reject(400,'PAYMENT_TERMS_REQUIRED','결제 조건을 확인하고 동의해야 결제할 수 있습니다. 화면을 새로고침한 뒤 다시 확인해주세요.');
   const p=await tx.membershipItem.findUnique({where:{id:o.membership_id}});
   if(!recover){
    if(!p?.is_active||p.is_deleted||!await tx.creator.findFirst({where:{user_id:p.creator_id,is_active:true}}))reject(409,'PLAN_UNAVAILABLE','가입할 수 없는 멤버십입니다.');
    const m=await tx.member.findUnique({where:{id:member}});if(!m?.enabled)reject(403,'MEMBER_UNAVAILABLE','계정을 확인해주세요.');
    if(o.subscription_id){if(await tx.checkoutOrder.count({where:{subscription_id:o.subscription_id,status:'refunding'}}))reject(409,'REFUND_IN_PROGRESS','환불 결과 확인 후 갱신할 수 있습니다.');await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${o.subscription_id} FOR UPDATE`;const sub=await tx.subscription.findUniqueOrThrow({where:{id:o.subscription_id}});if(!sub.auto_renew||sub.status!=='ONGOING'||!sub.next_billing_date||sub.next_billing_date.getTime()!==o.period_start?.getTime())reject(409,'RENEWAL_CANCELLED','구독 갱신이 중단되었습니다.');if(renewalDeadline(sub,renewalPolicy(this.config).retries,renewalPolicy(this.config).hours)<=new Date())reject(409,'RENEWAL_RECOVERY_ENDED','갱신 복구 기간이 종료되었습니다. 내 구독을 확인해주세요.');renewalMethodId=sub.billing_method_id;}
    else if(await tx.subscription.count({where:{subscriber_id:member,membership_item:{creator_id:p.creator_id},status:{in:['ONGOING','CANCELLED']},OR:[{ended_at:{gt:new Date()}},{status:'ONGOING',auto_renew:true}]}}))reject(409,'ALREADY_SUBSCRIBED','이미 이용 중인 멤버십입니다.');
    if(await tx.checkoutOrder.count({where:{member_id:member,status:'processing',NOT:{id}}}))reject(409,'PAYMENT_IN_PROGRESS','다른 주문 결제가 진행 중입니다.');
   }
   method=await tx.billingMethod.findFirst({where:{member_id:member,...(!recover?{deleted_at:null}:{}),...(!recover&&o.subscription_id?{id:renewalMethodId||''}:o.billing_method_id?{id:o.billing_method_id}:methodId?{id:methodId}:{is_default:true})}});
   if(!recover&&!oneTime&&!method)reject(409,'PAYMENT_METHOD_REQUIRED','결제수단을 등록해주세요.');
   if(!recover&&!oneTime&&method?.unavailable_at)reject(409,'PAYMENT_METHOD_UNAVAILABLE','사용할 수 없는 카드입니다. 다른 카드를 기본 결제수단으로 설정해주세요.');
   if(!recover&&terms!==undefined)await tx.memberConsent.create({data:{member_id:member,kind:'payment-terms',document_id:`code:payment-terms:${PAYMENT_TERMS.version}`,document_snapshot:{...PAYMENT_TERMS,orderId:id,amount:o.amount,paymentMode:'subscription'}}});
   return tx.checkoutOrder.update({where:{id},data:{status:'processing',locked_until:new Date(Date.now()+90000),...(!recover?{billing_method_id:oneTime?null:method.id,...(oneTime?{payment_key:windowKey}:{}),processing_started_at:new Date(),...(reopened?{attempts:{increment:1}}:{}),snapshot:{...(o.snapshot as any),...(reopened?{paymentMode:'subscription'}:{}),...(!o.subscription_id?await paymentPolicy(tx,(o.snapshot as any).creatorId):{})}}:{})}});
  });
  if(order.status==='paid')return{message:'가입이 완료되었습니다.',order:this.orderView(order)};
  try{
   let response=recover?await this.provider.lookup(providerOrderId(order)):null;
   if(!response){
    // The provider's idempotency window is 15 days; unresolved old attempts need manual reconciliation.
    if(recover&&Date.now()-(order.processing_started_at||order.created_at).getTime()>=15*86400000)reject(503,'PAYMENT_RECONCILIATION_REQUIRED','오래된 결제의 확인이 필요합니다. 고객센터로 문의해주세요.');
    if((order.snapshot as any).paymentMode==='one-time'){
     if(!order.payment_key)reject(503,'PAYMENT_UNCERTAIN','결제 인증 확인이 필요합니다.');
     response=await this.provider.confirm(order.payment_key,order);
    }else{
    if(!method?.billing_key_encrypted)reject(503,'PAYMENT_UNCERTAIN','결제수단과 결제 결과 확인이 필요합니다.');
    response=await this.provider.charge(this.provider.decrypt(method.billing_key_encrypted),method.customer_key||member,order);
    }
   }
   if(response&&['ABORTED','EXPIRED'].includes(response.status)&&response.totalAmount===order.amount&&response.orderId===providerOrderId(order))reject(400,'PAYMENT_FAILED','결제가 승인되지 않았습니다.');
   if((order.snapshot as any).paymentMode==='one-time'&&response?.paymentKey!==order.payment_key)reject(503,'PAYMENT_UNCERTAIN','결제 식별자 확인이 필요합니다.');
   if(response?.status!=='DONE'||response.totalAmount!==order.amount||response.orderId!==providerOrderId(order)||!response.paymentKey||!acceptedPaymentMethod(response))reject(503,'PAYMENT_UNCERTAIN','결제 응답 확인이 필요합니다.');
   await this.finalize(order.id,response.paymentKey);return{message:'가입이 완료되었습니다.',order:await this.order(member,id)};
  }catch(error:any){
   if(paymentFailureCodes.has(error.getResponse?.()?.code))await this.recordPaymentFailure(order,error.getResponse().code,error.providerCode);
   throw error;
  }finally{await this.db.checkoutOrder.updateMany({where:{id,status:'processing'},data:{locked_until:null}});}
 }
 async finalize(id:string,paymentKey:string){
  const owner=await this.db.checkoutOrder.findUniqueOrThrow({where:{id},select:{member_id:true}});
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${owner.member_id} FOR UPDATE`;
   const o=await tx.checkoutOrder.findUniqueOrThrow({where:{id}});if(o.status==='paid')return;if(o.status!=='processing')reject(409,'INVALID_ORDER_STATE','결제 결과 확인 상태가 아닙니다.');text(paymentKey,300);
   const p=await tx.membershipItem.findUniqueOrThrow({where:{id:o.membership_id}});
   await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${p.creator_id} FOR UPDATE`;
   const now=new Date(),start=o.period_start||now;let end=nextMonth(start);
   let sub:any;
   if(o.subscription_id){
    await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${o.subscription_id} FOR UPDATE`;
    sub=await tx.subscription.findUniqueOrThrow({where:{id:o.subscription_id}});end=nextMonth(start,sub.started_at);
    await tx.subscription.update({where:{id:sub.id},data:{ended_at:end,next_billing_date:sub.auto_renew?end:null,status:sub.auto_renew?'ONGOING':'CANCELLED',last_payment_date:now,payment_failure_count:0}});
   }else sub=await tx.subscription.create({data:{subscriber_id:o.member_id,membership_item_id:p.id,amount:o.amount,plan_snapshot:o.snapshot,billing_method_id:o.billing_method_id,started_at:start,ended_at:end,next_billing_date:(o.snapshot as any).paymentMode==='one-time'?null:end,last_payment_date:now,auto_renew:(o.snapshot as any).paymentMode!=='one-time',status:(o.snapshot as any).paymentMode==='one-time'?'CANCELLED':'ONGOING'}});
   await tx.checkoutOrder.update({where:{id},data:{status:'paid',usage_tracking_started_at:now,payment_key:paymentKey,subscription_id:sub.id,period_start:start,period_end:end,paid_at:now,locked_until:null}});
   const bps=Number((o.snapshot as any).platformFeeBps),hold=Number((o.snapshot as any).settlementHoldDays);
   if(!Number.isInteger(bps)||bps<0||bps>10000)reject(503,'FEE_POLICY_REQUIRED','주문의 수수료 정책 확인이 필요합니다.');
   if(!Number.isInteger(hold)||hold<0||hold>365)reject(503,'SETTLEMENT_POLICY_REQUIRED','주문의 정산 정책 확인이 필요합니다.');
   const fees=Math.floor(o.amount*bps/10000);await tx.revenueEntry.create({data:{creator_id:p.creator_id,order_id:o.id,title:(o.snapshot as any).name,gross:o.amount,fees,net:o.amount-fees,available_at:new Date(now.getTime()+hold*86400000)}});
   // One 알림 center entry plus one queued mail per paid order (replaces the in-app-only notification; 2026-11-07).
   await noticePaymentCompleted(tx,{id:o.id,member_id:o.member_id,membership_id:p.id,amount:o.amount,renewal:!!o.subscription_id},{start,end,nextBilling:(o.subscription_id?sub.auto_renew:(o.snapshot as any).paymentMode!=='one-time')?end:null},now);
   await enqueueOperation(tx,o.subscription_id?'subscription.renewed':'subscription.started',{memberId:o.member_id,creatorId:p.creator_id,subscriptionId:sub.id,orderId:o.id,planId:p.id},`subscription.paid:${o.id}`);
   await qualifyReferralReward(tx,o.member_id,'checkout',o.id,(o.snapshot as any).paymentEnvironment==='live');
  });
 }
 async cancelSubscription(member:string,creator:string){
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const rows=await tx.subscription.findMany({where:{subscriber_id:member,membership_item:{creator_id:creator},status:{in:['ONGOING','CANCELLED']}}});if(!rows.length)reject(404,'SUBSCRIPTION_NOT_FOUND','구독을 찾을 수 없습니다.');
   for(const sub of rows){if(sub.auto_renew){await enqueueOperation(tx,'subscription.cancelled',{memberId:member,creatorId:creator,subscriptionId:sub.id,status:'CANCELLED',previousStatus:sub.status});await noticeCancelReserved(tx,sub,'member');}await tx.subscription.update({where:{id:sub.id},data:{auto_renew:false,status:'CANCELLED',next_billing_date:null}});await tx.checkoutOrder.updateMany({where:{subscription_id:sub.id,status:{in:['pending','failed']}},data:{status:'cancelled',retry_at:null}});}
  });return{message:'갱신을 해지했습니다. 이용 종료일까지 권한이 유지됩니다.'};
 }
 async resumeSubscription(member:string,id:string,input:any){
  if(input?.paymentTerms!==PAYMENT_TERMS.version)reject(400,'PAYMENT_TERMS_REQUIRED','자동 갱신 조건을 확인하고 동의해주세요.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${id} FOR UPDATE`;
   const sub=await tx.subscription.findFirst({where:{id,subscriber_id:member}});
   if(!sub)reject(404,'SUBSCRIPTION_NOT_FOUND','구독을 찾을 수 없습니다.');
   if(!await tx.member.findFirst({where:{id:member,enabled:true}}))reject(403,'MEMBER_UNAVAILABLE','계정을 확인해주세요.');
   if(!sub.ended_at||sub.ended_at<=new Date()||!['ONGOING','CANCELLED'].includes(sub.status))reject(409,'SUBSCRIPTION_ENDED','이용 기간이 끝났습니다. 멤버십을 다시 선택해주세요.');
   if(input.renewAt!==dateOnly(sub.ended_at)||input.price!==Number(sub.amount))reject(409,'SUBSCRIPTION_CHANGED','구독 정보가 변경됐습니다. 화면을 새로고침하고 다시 확인해주세요.');
   const message='자동 갱신을 다시 시작했습니다. 다음 결제일부터 결제됩니다.';
   if(sub.auto_renew&&sub.status==='ONGOING')return{message};
   if(await tx.checkoutOrder.count({where:{subscription_id:id,status:{in:['processing','refunding']}}}))reject(409,'PAYMENT_IN_PROGRESS','결제 또는 환불 결과 확인 후 다시 이용해주세요.');
   const plan=await tx.membershipItem.findUnique({where:{id:sub.membership_item_id}});
   if(!plan?.is_active||plan.is_deleted||!await tx.creator.findFirst({where:{user_id:plan.creator_id,is_active:true}}))reject(409,'PLAN_UNAVAILABLE','현재 다시 이용할 수 없는 멤버십입니다.');
   if(!sub.plan_snapshot)reject(409,'MISSING_SNAPSHOT','기존 구독 조건 확인이 필요합니다.');
   const method=await tx.billingMethod.findFirst({where:{member_id:member,is_default:true,deleted_at:null}});
   if(!method)reject(409,'PAYMENT_METHOD_REQUIRED','결제수단 관리에서 기본 카드를 등록해주세요.');
   if(method.unavailable_at||method.revoked_at||!method.billing_key_encrypted)reject(409,'PAYMENT_METHOD_UNAVAILABLE','결제수단 관리에서 사용 가능한 카드를 기본으로 설정해주세요.');
   await tx.subscription.update({where:{id},data:{auto_renew:true,status:'ONGOING',next_billing_date:sub.ended_at,billing_method_id:method.id,payment_failure_count:0}});
   await tx.memberConsent.create({data:{member_id:member,kind:'payment-terms',document_id:`code:payment-terms:${PAYMENT_TERMS.version}`,document_snapshot:{...PAYMENT_TERMS,purpose:'subscription-resume',subscriptionId:id,amount:Number(sub.amount),nextBillingAt:sub.ended_at.toISOString(),paymentMode:'subscription'}}});
   await enqueueOperation(tx,'subscription.resumed',{memberId:member,creatorId:plan.creator_id,subscriptionId:id,planId:plan.id,status:'ONGOING',previousStatus:sub.status},undefined,{amount:Number(sub.amount)});
   return{message};
  });
 }
 async finance(member:string,tx:any=this.db){const [entries,withdrawals,accounts]=await Promise.all([tx.revenueEntry.findMany({where:{creator_id:member},orderBy:{created_at:'desc'}}),tx.withdrawalRequest.findMany({where:{creator_id:member},orderBy:{created_at:'desc'}}),tx.settlementAccount.findMany({where:{creator_id:member}})]);const refunding=await tx.checkoutOrder.findMany({where:{id:{in:entries.map((e:any)=>e.order_id)},status:'refunding'},select:{id:true,amount:true}}),refundReserved=refunding.reduce((a:any,o:any)=>{const entry=entries.find((e:any)=>e.order_id===o.id);return a+o.amount-(entry&&settlementPending(entry)?Math.max(0,entry.net):0);},0);const sum=(key:string)=>entries.reduce((a:any,e:any)=>a+e[key],0),pending=entries.filter((e:any)=>settlementPending(e)).reduce((a:any,e:any)=>a+Math.max(0,e.net),0),requested=withdrawals.filter((w:any)=>['requested','processing'].includes(w.status)).reduce((a:any,w:any)=>a+w.amount,0),paid=withdrawals.filter((w:any)=>w.status==='paid').reduce((a:any,w:any)=>a+w.amount,0);
   return{summary:{gross:sum('gross'),reversals:sum('reversals'),fees:sum('fees'),net:sum('net'),pending,available:sum('net')-pending-requested-paid-refundReserved,requested,paid,refundReserved},earnings:entries.map((e:any)=>({id:e.id,settlementId:e.id,date:dateOnly(e.created_at),title:e.title,gross:e.gross,reversals:e.reversals,fees:e.fees,net:e.net})),settlements:entries.map((e:any)=>({id:e.id,period:dateOnly(e.created_at),status:settlementPending(e)?'pending':'available',availableAt:dateOnly(e.available_at),holdReasons:settlementHoldReasons(e)})),withdrawals:withdrawals.map((w:any)=>this.withdrawalView(w)),accounts:accounts.map((a:any)=>this.accountView(a)),pinConfigured:!!await tx.withdrawalCredential.findUnique({where:{creator_id:member}}),creatorTerms:await studioTerms(tx,member),receivables:(await tx.creatorReceivable.findMany({where:{creator_id:member,status:'open'},orderBy:{created_at:'asc'}})).map((r:any)=>({id:r.id,kind:r.kind,amount:r.amount,createdAt:dateOnly(r.created_at)})),closingBlockers:await this.service.closingBlockers(tx,member)};
 }
 accountView(a:any){return{id:a.id,bank:a.bank,holderAlias:a.holder_alias,lastFour:a.last_four,verified:a.verified,isDefault:a.is_default};}
 withdrawalView(w:any){return{id:w.id,requestId:w.request_key,accountId:w.account_id,accountLabel:w.account_label,amount:w.amount,requestedAt:dateOnly(w.created_at),status:w.status,statusNote:w.note};}
 async account(member:string,input:any){await requireBeanPayoutMember(this.db,member);const account=text(input.accountNumber,40);if(!/^\d{8,30}$/.test(account))reject(400,'INVALID_ACCOUNT','계좌번호를 확인해주세요.');const data={bank:text(input.bank,60),holder_alias:text(input.holderAlias,60),last_four:account.slice(-4),account_encrypted:this.provider.encrypt(account)};if(!/^\d{4}$/.test(data.last_four))reject(400,'INVALID_ACCOUNT','계좌 끝 4자리를 확인해주세요.');if(input.id){const saved=await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;const old=await tx.settlementAccount.findFirst({where:{id:input.id,creator_id:member}});if(!old)reject(404,'ACCOUNT_NOT_FOUND','계좌를 찾을 수 없습니다.');if(await tx.withdrawalRequest.count({where:{account_id:old.id,status:{in:['requested','processing']}}})||this.config.get('BEAN_LEDGER_ENABLED')==='true'&&await tx.beanPayout.count({where:{account_id:old.id,status:{in:['requested','processing','blocked']}}}))reject(409,'ACCOUNT_IN_USE','출금 처리 중인 계좌는 변경할 수 없습니다.');return tx.settlementAccount.update({where:{id:old.id},data:{...data,verified:false,is_default:false,version:{increment:1}}});});return{account:this.accountView(saved),message:'계좌를 저장했습니다.'};}const a=await this.db.settlementAccount.create({data:{...data,creator_id:member}});return{account:this.accountView(a),message:'계좌를 저장했습니다.'};}
 async verifyAccount(member:string,id:string){const account=await this.db.settlementAccount.findFirst({where:{id,creator_id:member}});if(!account)reject(404,'ACCOUNT_NOT_FOUND','계좌를 찾을 수 없습니다.');const result=await this.bank.verify(account.bank,this.provider.decrypt(account.account_encrypted),(await this.service.member(member)).name,`verify-${account.id}-${account.version}`);if(result.verified!==true)reject(400,'ACCOUNT_VERIFICATION_FAILED','계좌와 예금주를 확인해주세요.');const saved=await this.db.settlementAccount.updateMany({where:{id,creator_id:member,version:account.version},data:{verified:true}});if(saved.count!==1)reject(409,'ACCOUNT_CHANGED','계좌가 변경되었습니다.');return{message:'계좌 확인을 완료했습니다.'};}
 async defaultAccount(member:string,id:string){await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;const a=await tx.settlementAccount.findFirst({where:{id,creator_id:member,verified:true}});if(!a)reject(409,'ACCOUNT_NOT_VERIFIED','확인된 계좌만 기본 설정할 수 있습니다.');await tx.settlementAccount.updateMany({where:{creator_id:member},data:{is_default:false}});await tx.settlementAccount.update({where:{id},data:{is_default:true}});});return{message:'기본 계좌를 설정했습니다.'};}
 async setupPin(member:string,pin:string,identityProof?:string){await requireBeanPayoutMember(this.db,member);if(!/^\d{6}$/.test(pin))reject(400,'INVALID_PIN','숫자 6자리를 입력해주세요.');if(weakPin(pin))reject(400,'WEAK_PIN',WEAK_PIN_MESSAGE);if(!identityProof)reject(403,'IDENTITY_VERIFICATION_REQUIRED','PASS 본인인증 후 간편비밀번호를 설정할 수 있습니다.');const hash=await hashPassword(`withdrawal-pin:${pin}`);await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;const proof=await tx.identityProof.findFirst({where:{token_hash:digest(identityProof),member_id:member,purpose:'withdrawal-pin',consumed_at:null,expires_at:{gt:new Date()}}});if(!proof)reject(403,'IDENTITY_VERIFICATION_REQUIRED','본인인증이 만료되었거나 일치하지 않습니다.');const used=await tx.identityProof.updateMany({where:{id:proof.id,consumed_at:null},data:{consumed_at:new Date()}});if(used.count!==1)reject(409,'PROOF_USED','이미 사용한 본인인증입니다.');const replaced=!!await tx.withdrawalCredential.findUnique({where:{creator_id:member}});await tx.withdrawalCredential.upsert({where:{creator_id:member},create:{creator_id:member,pin_hash:hash},update:{pin_hash:hash}});await noticePinChanged(tx,member,replaced);await tx.withdrawalAuthorization.deleteMany({where:{creator_id:member}});await tx.beanWithdrawalAuthorization.deleteMany({where:{creator_id:member}});});return{message:'간편비밀번호를 설정했습니다.'};}
 // paid is the part of amount already paid out; the rest is only held by a withdrawal not yet paid (requested/processing),
 // which the notice must not call paid income (2026-11-07). The receivable row keeps the whole shortfall as before.
 private async recordReceivable(tx:any,creator:string,orderId:string,amount:number,entry:any,paid=amount){if(await tx.creatorReceivable.findUnique({where:{kind_source_id_creator_id:{kind:'membership',source_id:orderId,creator_id:creator}}}))return;await tx.creatorReceivable.create({data:{creator_id:creator,kind:'membership',source_id:orderId,amount}});const origin=`(원거래: ${dateOnly(entry.created_at)} ${entry.title} 결제)`,won=(n:number)=>`${n.toLocaleString('ko-KR')}원`;await tx.memberNotification.create({data:{member_id:creator,type:'settlement',text:paid>=amount?`결제 취소로 이미 지급된 멤버십 수익 ${won(amount)}이 미수금으로 기록되었습니다${origin}. 이후 정산에서 차감됩니다. 이의가 있으면 고객센터로 알려 주세요.`:`결제 취소로 멤버십 수익이 취소되어${origin} 아직 지급되지 않은 출금 신청 금액이 출금 가능 수익보다 ${won(amount-paid)} 많아졌습니다. 해당 출금 신청은 운영 확인이 필요하며, 반려되면 남은 금액으로 다시 신청할 수 있습니다.${paid>0?` 이미 지급된 수익 ${won(paid)}은 미수금으로 기록되어 이후 정산에서 차감됩니다.`:''} 이의가 있으면 고객센터로 알려 주세요.`,path:'/studio/finance'}});}
 // Membership receivables settle by themselves once later income covers them (available back at zero or above).
 async settleReceivables(){const open=await this.db.creatorReceivable.findMany({where:{kind:'membership',status:'open'},select:{creator_id:true},distinct:['creator_id'],take:100});let count=0;for(const {creator_id} of open){if((await this.finance(creator_id)).summary.available>=0){const r=await this.db.creatorReceivable.updateMany({where:{creator_id,kind:'membership',status:'open'},data:{status:'settled',settled_by:'system',settled_at:new Date(),note:'이후 정산에서 차감 완료'}});count+=r.count;}}return count;}
 async review(member:string,input:any,tx:any=this.db){let minimum=(await withdrawalTerms(tx,member)).minimumWithdrawalKrw;
  // A creator leaving the service may withdraw the whole remainder below the minimum (2026-10-30).
  if(input.closing===true){await this.service.assertClosingReady(tx,member);const f=await this.finance(member,tx);if(f.summary.pending>0||f.summary.requested>0)reject(409,'EARNINGS_PENDING','보류 중이거나 처리 중인 수익이 있어 아직 전액 출금할 수 없습니다.');if(input.amount!==f.summary.available)reject(409,'CLOSING_WITHDRAWAL_ALL','탈퇴 전 출금은 남은 수익 전체로 신청해주세요.');minimum=1;}
  if(!Number.isSafeInteger(input.amount)||input.amount<minimum)reject(400,'INVALID_AMOUNT',`최소 출금 금액은 ${minimum.toLocaleString('ko-KR')}원입니다.`);const a=await tx.settlementAccount.findFirst({where:{id:input.accountId,creator_id:member,verified:true}});if(!a)reject(409,'ACCOUNT_NOT_VERIFIED','확인된 계좌를 선택해주세요.');const finance=await this.finance(member,tx);if(input.amount>finance.summary.available)reject(409,'INSUFFICIENT_BALANCE','출금 가능 잔액이 부족합니다.');return{amount:input.amount,account:this.accountView(a),availableAfterRequest:finance.summary.available-input.amount};}
 async verifyPin(member:string,input:any){await this.service.requireCreator(member);await requirePartnerCreator(this.db,member);const pin=text(input.pin,6);const result=await this.db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;const error=await checkWithdrawalPin(tx,member,pin);if(error)return{error};
  const quote=await this.review(member,input,tx),account=await tx.settlementAccount.findUniqueOrThrow({where:{id:quote.account.id}});const authorization=await tx.withdrawalAuthorization.create({data:{creator_id:member,account_id:account.id,account_version:account.version,amount:input.amount,expires_at:new Date(Date.now()+120000)}});return{authorizationId:authorization.id};
 });if(result.error)reject(pinCheckStatus(result.error),result.error,pinCheckMessage[result.error]);return{authorizationId:result.authorizationId};}
 async requestWithdrawal(member:string,input:any){await this.service.requireCreator(member);const key=text(input.requestId,100);return this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${member} FOR UPDATE`;const prior=await tx.withdrawalRequest.findUnique({where:{request_key:key}});if(prior){if(prior.creator_id!==member||prior.amount!==input.amount||prior.account_id!==input.accountId)reject(409,'IDEMPOTENCY_CONFLICT','다른 출금에 사용된 요청입니다.');return{withdrawal:this.withdrawalView(prior),message:'출금 신청을 접수했습니다.'};}
   await requirePartnerCreator(tx,member);
   const authorization=await tx.withdrawalAuthorization.findFirst({where:{id:input.authorizationId,creator_id:member,amount:input.amount,account_id:input.accountId,consumed_at:null,expires_at:{gt:new Date()}}});if(!authorization)reject(403,'AUTHORIZATION_EXPIRED','출금 인증이 만료되었거나 일치하지 않습니다.');const quote=await this.review(member,input,tx);const account=await tx.settlementAccount.findUniqueOrThrow({where:{id:input.accountId}});if(account.version!==authorization.account_version)reject(403,'ACCOUNT_CHANGED','계좌 정보가 변경되었습니다. 다시 인증해주세요.');await tx.withdrawalAuthorization.update({where:{id:authorization.id},data:{consumed_at:new Date()}});const w=await tx.withdrawalRequest.create({data:{creator_id:member,request_key:key,account_id:quote.account.id,account_label:`${quote.account.bank} · •••• ${quote.account.lastFour}`,amount:input.amount}});await this.audit(tx,'withdrawal.requested',w.id,{creatorId:member,amount:w.amount,status:w.status});return{withdrawal:this.withdrawalView(w),message:'출금 신청을 접수했습니다.'};});}

 async refundEligibility(member:string,id:string){
  const row=await this.db.checkoutOrder.findFirst({where:{id,member_id:member}});if(!row)reject(404,'ORDER_NOT_FOUND','결제를 찾을 수 없습니다.');
  const reason=unusedRefundReason(row);
  return{eligible:reason===null,reason,amount:reason===null?row.amount:0,currency:'KRW'};
 }
 async refund(member:string,id:string){
  const o=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const row=await tx.checkoutOrder.findFirst({where:{id,member_id:member}});if(!row)reject(404,'ORDER_NOT_FOUND','결제를 찾을 수 없습니다.');if(row.status==='refunded')return row;
   if(row.subscription_id&&await tx.checkoutOrder.count({where:{subscription_id:row.subscription_id,status:'processing',NOT:{id}}}))reject(409,'PAYMENT_IN_PROGRESS','진행 중인 결제 확인 후 환불해주세요.');
   if(!['paid','refunding'].includes(row.status)||!row.payment_key)reject(409,'INVALID_ORDER_STATE','환불할 수 없는 결제입니다.');
   if(row.locked_until&&row.locked_until>new Date())reject(409,'REFUND_IN_PROGRESS','환불 결과를 확인 중입니다.');
   if(row.status==='paid'){const reason=unusedRefundReason(row);if(reason)reject(409,reason,reason==='REFUND_WINDOW_EXPIRED'?'결제 후 7일이 지나 자동 환불할 수 없습니다. 법정 환불·청약철회 또는 별도 검토는 고객센터로 문의해주세요.':reason==='CONTENT_ALREADY_ACCESSED'?'구독 콘텐츠 이용 이력이 있어 자동 환불할 수 없습니다. 고객센터로 문의해주세요.':'이용 기록 확인이 필요한 결제입니다. 고객센터로 문의해주세요.');}
   const p=await tx.membershipItem.findUniqueOrThrow({where:{id:row.membership_id}});await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${p.creator_id} FOR UPDATE`;
   const updated=await tx.checkoutOrder.update({where:{id},data:{status:'refunding',locked_until:new Date(Date.now()+90000)}});await this.audit(tx,'refund.requested',id,{memberId:member,amount:row.amount,previousStatus:row.status,status:'refunding'});return updated;
  });if(o.status==='refunded')return{message:'환불이 완료되었습니다.'};
  return this.sendRefund(o,'사용자 환불 요청','member');
 }
 // Provider half of a full membership refund, shared by the member 7-day refund and the console refund.
 private async sendRefund(o:any,cancelReason:string,source:'member'|'admin'){
  const id=o.id;
  try{
   let result=await this.provider.lookup(providerOrderId(o));
   if(!result||!['DONE','CANCELED'].includes(result.status)||result.orderId!==providerOrderId(o)||result.paymentKey!==o.payment_key||result.totalAmount!==o.amount)reject(503,'REFUND_UNCERTAIN','환불할 결제 확인이 필요합니다.');
   if(result.status==='DONE'){
    // 2026-11-02 user decision: a refused refund is retried under a new idempotency key; reusing the old one could replay the refusal for 15 days.
    const refundAttempt=Number((o.snapshot as any).refundAttempt)||0;
    try{result=await this.provider.cancel(o.payment_key,cancelReason,`refund-${id}${refundAttempt?`_r${refundAttempt}`:''}`);}catch(error:any){
     if(error.getResponse?.().code==='PAYMENT_FAILED')await this.db.checkoutOrder.updateMany({where:{id,status:'refunding'},data:{status:'paid',locked_until:null,snapshot:{...(o.snapshot as any),refundAttempt:refundAttempt+1}}});
     throw error;
    }
   }
   if(result?.status!=='CANCELED'||result.orderId!==providerOrderId(o)||result.paymentKey!==o.payment_key||result.totalAmount!==o.amount||result.balanceAmount!==0)reject(503,'REFUND_UNCERTAIN','환불 결과 확인이 필요합니다.');
   await this.completeRefund(o,source);
   return{message:'환불이 완료되었습니다.'};
  }finally{await this.db.checkoutOrder.updateMany({where:{id,status:'refunding'},data:{locked_until:null}});}
 }
 // Shared by member refunds and provider-side cancels: revenue reversal and access removal happen once.
 // 2026-11-06 user decision: SUPER_ADMIN can fully refund a subscription's latest paid order from the console, which
 // also ends the subscription now. The 7-day/unused rule that limits member self-refunds does not apply; the reason is required.
 async adminRefund(admin:any,subscriptionId:string,input:any){
  requireSuperAdmin(admin);const sid=text(subscriptionId,64),reason=text(input?.reason,500);
  const owner=await this.db.subscription.findUnique({where:{id:sid},select:{subscriber_id:true}});if(!owner)reject(404,'SUBSCRIPTION_NOT_FOUND','구독을 찾을 수 없습니다.');
  const o=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${owner.subscriber_id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${sid} FOR UPDATE`;
   if(await tx.checkoutOrder.count({where:{subscription_id:sid,status:'processing'}}))reject(409,'PAYMENT_IN_PROGRESS','진행 중인 결제 확인 후 환불해주세요.');
   const row=await tx.checkoutOrder.findFirst({where:{subscription_id:sid,status:{in:['paid','refunding']},payment_key:{not:null}},orderBy:[{paid_at:'desc'},{created_at:'desc'}]});
   if(!row)reject(409,'NO_REFUNDABLE_PAYMENT','환불할 결제가 없습니다.');
   if(row.locked_until&&row.locked_until>new Date())reject(409,'REFUND_IN_PROGRESS','환불 결과를 확인 중입니다.');
   // The console makes the operator type the amount (TypedConfirmDialog); the server checks the same text so a stale screen cannot refund another amount.
   if(input?.confirmation!==`${Number(row.amount).toLocaleString('ko-KR')}원`)reject(400,'CONFIRMATION_REQUIRED','환불 금액을 정확히 입력해주세요.');
   const p=await tx.membershipItem.findUniqueOrThrow({where:{id:row.membership_id}});await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${p.creator_id} FOR UPDATE`;
   const updated=await tx.checkoutOrder.update({where:{id:row.id},data:{status:'refunding',locked_until:new Date(Date.now()+90000)}});await this.audit(tx,'refund.requested',row.id,{memberId:row.member_id,amount:row.amount,previousStatus:row.status,status:'refunding'});return updated;
  });
  await this.sendRefund(o,'운영자 환불','admin');
  await this.db.$transaction(async tx=>{
   const sub=await tx.subscription.findUniqueOrThrow({where:{id:sid},select:{status:true,auto_renew:true}});
   await tx.subscription.update({where:{id:sid},data:{cancel_reason:reason,cancelled_by:admin.user_sub}});
   await appendAudit(tx,{category:'admin',action:'admin.subscription.refunded',entityId:sid,data:auditChange(null,{status:sub.status,auto_renew:sub.auto_renew})});
  });
  const after=await this.db.subscription.findUniqueOrThrow({where:{id:sid},select:{status:true,ended_at:true}});
  return{message:'전액 환불하고 구독을 종료했습니다.',id:sid,orderId:o.id,amount:o.amount,status:after.status,endedAt:after.ended_at,refunded:true};
 }
 async completeRefund(o:any,source:'member'|'admin'|'provider'){
  const id=o.id,member=o.member_id;
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const p=await tx.membershipItem.findUniqueOrThrow({where:{id:o.membership_id}});await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${p.creator_id} FOR UPDATE`;
   const current=await tx.checkoutOrder.findUniqueOrThrow({where:{id}});if(current.status==='refunded')return;
   // A provider-side cancel applies only to an order still paid here; a member refund in flight owns the rest.
   if(source==='provider'&&current.status!=='paid')return;
   const entry=await tx.revenueEntry.findUnique({where:{order_id:id}});await tx.checkoutOrder.update({where:{id},data:{status:'refunded',locked_until:null}});await tx.revenueEntry.update({where:{order_id:id},data:{reversals:o.amount,fees:0,net:0}});await clawBackReferralReward(tx,'checkout',id);
   // D4: when the reversed income was already paid out, the shortfall becomes a receivable taken from later settlements.
   const after=(await this.finance(p.creator_id,tx)).summary,shortfall=-after.available;if(shortfall>0&&entry?.net>0){const amount=Math.min(entry.net,shortfall);await this.recordReceivable(tx,p.creator_id,id,amount,entry,Math.min(amount,Math.max(0,shortfall-after.requested)));}await this.audit(tx,source==='provider'?'refund.external_cancel':'refund.completed',id,{memberId:member,subscriptionId:o.subscription_id,amount:o.amount,previousStatus:current.status,status:'refunded'});
   if(o.subscription_id){
    const newer=await tx.checkoutOrder.count({where:{subscription_id:o.subscription_id,status:{in:['paid','refunding','processing']},NOT:{id},OR:[{period_start:{gt:o.period_start||o.created_at}},{paid_at:{gt:o.paid_at||o.created_at}},{paid_at:null,created_at:{gt:o.created_at}}]}});
    if(!newer){await tx.subscription.update({where:{id:o.subscription_id},data:{auto_renew:false,status:'EXPIRED',ended_at:new Date(),next_billing_date:null}});await tx.checkoutOrder.updateMany({where:{subscription_id:o.subscription_id,status:{in:['pending','failed']}},data:{status:'cancelled',retry_at:null}});}
    await noticeRefunded(tx,o,source,!newer);
   }else await noticeRefunded(tx,o,source,false);
   if(source==='provider')await enqueueOperation(tx,'payment.external_cancel',{memberId:member,orderId:id,subscriptionId:o.subscription_id||undefined,status:'refunded',previousStatus:'paid'},`external-cancel:${id}`);
  });
 }
 // FIN-04: a paid membership cancelled outside the service (PG console, card company) is found by an
 // authenticated lookup, never by trusting an event body. Full cancels are applied; anything else is escalated.
 async reconcilePaid(id:string){
  const o=await this.db.checkoutOrder.findUniqueOrThrow({where:{id}});if(o.status!=='paid'||!o.payment_key)return 0;
  const result=await this.provider.lookup(providerOrderId(o));
  const same=result&&result.orderId===providerOrderId(o)&&result.paymentKey===o.payment_key&&result.totalAmount===o.amount;
  if(same&&result.status==='DONE')return 0;
  if(same&&result.status==='CANCELED'&&result.balanceAmount===0){await this.completeRefund(o,'provider');return 1;}
  const state=typeof result?.status==='string'?result.status:'NOT_FOUND';
  await this.db.$transaction(tx=>enqueueOperation(tx,'payment.reconciliation_required',{memberId:o.member_id,orderId:o.id,status:state,previousStatus:'paid'},`reconcile-paid:${o.id}:${state}:${result?.balanceAmount??''}`));
  return 0;
 }
 async reconcile(id:string){const order=await this.db.checkoutOrder.findUniqueOrThrow({where:{id}});if(order.status==='processing'&&(!order.locked_until||order.locked_until<=new Date()))await this.pay(order.member_id,id);}
 async recordPaymentFailure(order:any,code:string,providerCode?:string){
  if(!paymentFailureCodes.has(code))return;
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${order.member_id} FOR UPDATE`;
   const current=await tx.checkoutOrder.findUniqueOrThrow({where:{id:order.id}});
   if(!['pending','processing'].includes(current.status)||current.attempts!==order.attempts)return;
   const requiresUpdate=code!=='PAYMENT_FAILED';
   await tx.checkoutOrder.update({where:{id:current.id},data:{status:'failed',locked_until:null,failure_code:code,retry_at:requiresUpdate?null:new Date(Date.now()+(isBeta(this.config)?betaPolicy.retryHours:Number(this.config.get('RENEWAL_RETRY_HOURS')||24))*3600000)}});
   if(current.billing_method_id&&providerCode&&unusableCardCodes.has(providerCode))await tx.billingMethod.updateMany({where:{id:current.billing_method_id,member_id:current.member_id},data:{unavailable_at:new Date(),unavailable_reason:providerCode}});
   await this.audit(tx,'payment.failed',current.id,{memberId:current.member_id,errorCode:code,providerCode,attempt:current.attempts,status:'failed'});
   if(!current.subscription_id)return;
   const sub=await tx.subscription.findUniqueOrThrow({where:{id:current.subscription_id}});
   if(!sub.auto_renew||sub.status!=='ONGOING')return;
   await tx.subscription.update({where:{id:sub.id},data:{payment_failure_count:current.attempts+1}});
   const noticeKey=`payment-failed:${current.id}`;
   const prior=await tx.billingNotice.findUnique({where:{dedupe_key:noticeKey}});
   if(!prior){
    await tx.memberNotification.create({data:{member_id:sub.subscriber_id,actor_id:(current.snapshot as any).creatorId,type:'subscription',text:requiresUpdate?'멤버십 갱신에 사용할 수 없는 카드입니다. 결제수단을 변경해주세요.':'멤버십 정기결제에 실패했습니다. 결제수단을 확인해주세요.',path:'/payment-methods'}});
    await tx.billingNotice.create({data:{dedupe_key:noticeKey,member_id:sub.subscriber_id,subscription_id:sub.id,order_id:current.id,kind:'payment-failed',action_required:requiresUpdate}});
   }
   await enqueueOperation(tx,'subscription.payment_failed',{memberId:sub.subscriber_id,subscriptionId:sub.id,orderId:current.id,status:requiresUpdate?'action_required':'retrying'},`renewal.failed:${current.id}:${current.attempts}`,{errorCode:code,providerCode,attempt:current.attempts});
  });
 }
 async stopRenewal(tx:any,sub:any,existing:any){
  const status=sub.ended_at&&sub.ended_at>new Date()?'CANCELLED':'EXPIRED';
  await tx.subscription.update({where:{id:sub.id},data:{status,auto_renew:false,next_billing_date:null}});
  if(existing)await tx.checkoutOrder.updateMany({where:{id:existing.id,status:{in:['pending','failed']}},data:{status:'cancelled',retry_at:null}});
  await tx.memberNotification.create({data:{member_id:sub.subscriber_id,type:'subscription',text:'결제가 완료되지 않아 자동 갱신이 종료되었습니다. 결제수단을 확인한 후 멤버십에 다시 가입할 수 있습니다.',path:'/subscriptions'}});
  await tx.billingNotice.upsert({where:{dedupe_key:`renewal-stopped:${sub.id}`},create:{dedupe_key:`renewal-stopped:${sub.id}`,member_id:sub.subscriber_id,subscription_id:sub.id,order_id:existing?.id,kind:'renewal-stopped'},update:{}});
  await enqueueOperation(tx,'subscription.cancelled',{memberId:sub.subscriber_id,subscriptionId:sub.id,status,previousStatus:sub.status},`renewal.stopped:${sub.id}`,{errorCode:'RENEWAL_RECOVERY_ENDED'});
 }
 async renew(id:string){
  const {retries,hours}=renewalPolicy(this.config);
  if((!isBeta(this.config)&&!this.config.get('RENEWAL_MAX_RETRIES'))||!Number.isInteger(retries)||retries<0||retries>10||!Number.isFinite(hours)||hours<1||hours>168)reject(503,'RENEWAL_POLICY_REQUIRED','구독 갱신 재시도 정책 설정이 필요합니다.');
  let processed=0;
  const owner=await this.db.subscription.findUniqueOrThrow({where:{id},select:{subscriber_id:true}});
  const order=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM members WHERE id=${owner.subscriber_id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM subscriptions WHERE id=${id} FOR UPDATE`;
   const sub=await tx.subscription.findUniqueOrThrow({where:{id}});if(!sub.auto_renew||sub.status!=='ONGOING'||!sub.next_billing_date||sub.next_billing_date>new Date())return null;
   const key=`renew-${sub.id}-${sub.next_billing_date.toISOString()}`,existing=await tx.checkoutOrder.findUnique({where:{idempotency_key:key}});
   // Never abandon an uncertain approval or switch its method/idempotency key.
   if(existing?.status==='processing')return existing;
   const p=await tx.membershipItem.findUnique({where:{id:sub.membership_item_id}}),m=await tx.member.findUnique({where:{id:sub.subscriber_id}});
   if(!m?.enabled||!p?.is_active||p.is_deleted||!await tx.creator.findFirst({where:{user_id:p.creator_id,is_active:true}})){await tx.subscription.update({where:{id},data:{auto_renew:false,status:'CANCELLED',next_billing_date:null}});if(existing)await tx.checkoutOrder.update({where:{id:existing.id},data:{status:'cancelled'}});await enqueueOperation(tx,'subscription.cancelled',{memberId:sub.subscriber_id,creatorId:p?.creator_id,subscriptionId:sub.id,status:'CANCELLED',previousStatus:sub.status});if(m?.enabled)await noticeCancelReserved(tx,sub,'unavailable');processed++;return null;}
   if(renewalDeadline(sub,retries,hours)<=new Date()||existing?.status==='failed'&&existing.attempts>=retries){await this.stopRenewal(tx,sub,existing);processed++;return null;}
   if(existing){
    if(existing.status!=='failed')return existing;
    if(existing.retry_at&&existing.retry_at>new Date())return null;
    const method=await tx.billingMethod.findFirst({where:{id:sub.billing_method_id||'',member_id:sub.subscriber_id,deleted_at:null,unavailable_at:null}});
    // A known unusable card must not be attempted again, even if its retry time passed.
    if(!method)return null;
    return tx.checkoutOrder.update({where:{id:existing.id},data:{status:'pending',locked_until:null,attempts:{increment:1},billing_method_id:method.id,failure_code:null,retry_at:null,expires_at:new Date(Date.now()+86400000)}});
   }
   const snapshot=sub.plan_snapshot as any;if(!snapshot)reject(409,'MISSING_SNAPSHOT','기존 구독 조건 확인이 필요합니다.');
   return tx.checkoutOrder.create({data:{member_id:sub.subscriber_id,membership_id:sub.membership_item_id,subscription_id:sub.id,amount:Number(sub.amount),snapshot,billing_method_id:sub.billing_method_id,idempotency_key:key,period_start:sub.next_billing_date,expires_at:new Date(Date.now()+86400000)}});
  });
  if(order&&['pending','processing'].includes(order.status)){
   try{await this.pay(order.member_id,order.id,order.billing_method_id);processed++;}catch(error:any){
    const code=error.getResponse?.()?.code;if(paymentFailureCodes.has(code)){await this.recordPaymentFailure(order,code,error.providerCode);return processed+1;}throw error;
   }
  }
  return processed;
 }
 // Operator-recorded result of a manual bank transfer (MANUAL_PAYOUTS_ENABLED). A requested withdrawal first goes through payout()
 // (same balance/account/payout-day checks, parked as processing); only then is the transfer recorded, once.
 async manualResult(admin:any,id:string,input:any,now=new Date()){
  if(!manualPayouts(this.config))reject(409,'MANUAL_PAYOUTS_DISABLED','수동 지급이 활성화되어 있지 않습니다.');requirePermission(admin,'revenue','create');
  // withdrawal_requests.note is VARCHAR(191) and stores the reason after its prefix, so the reason fits what is left (2026-11-07).
  const result=input?.result,reference=text(input?.reference??'',100,false),reason=text(input?.reason??'',WITHDRAWAL_NOTE_MAX-MANUAL_REJECT_PREFIX.length,false),at=new Date(input?.transferredAt??now);
  if(!['paid','rejected'].includes(result)||(result==='paid'&&!reference)||(result==='rejected'&&!reason)||!Number.isFinite(at.getTime())||at>now)reject(400,'INVALID_MANUAL_RESULT','이체 결과·참조번호·이체 시각을 확인해주세요.');
  const first=await this.db.withdrawalRequest.findUnique({where:{id}});if(!first)reject(404,'WITHDRAWAL_NOT_FOUND','출금 신청을 찾을 수 없습니다.');
  if(result==='paid')await requirePartnerCreator(this.db,first.creator_id);
  if(first.status==='requested')await this.payout(id,now,result==='paid'?'strict':'off');
  return this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${first.creator_id} FOR UPDATE`;const w=await tx.withdrawalRequest.findUniqueOrThrow({where:{id}});
   if(w.status!=='processing')reject(409,'WITHDRAWAL_NOT_PROCESSING','처리 중인 출금만 이체 결과를 기록할 수 있습니다.');
   await tx.withdrawalRequest.update({where:{id},data:{status:result,note:result==='paid'?`수동 이체 완료 · ${reference}`:MANUAL_REJECT_PREFIX+reason}});
   await this.audit(tx,'withdrawal.manual_result',id,{creatorId:w.creator_id,amount:w.amount,previousStatus:'processing',status:result,adminId:admin.id,reference:reference||null,transferredAt:at.toISOString(),reasonDigest:reason?reason.length:0});
   return{message:result==='paid'?'이체 완료를 기록했습니다.':'출금을 반려했습니다.'};});
 }
 // A withdrawal requested before a refund that left the available balance negative can never pass payout() (PAYOUT_BALANCE_CHANGED);
 // the operator rejects it, the amount counts as available again and the creator may request anew (2026-11-07). Only that case,
 // and only before a transfer starts: a processing one is closed by its bank or manual result.
 // Console hint (2026-11-07): marks the rows rejectWithdrawal would accept now, so the button shows only for them.
 async withRejectable(items:any[]){const blocked=new Set<string>();for(const creator of new Set<string>(items.filter(w=>w.status==='requested').map(w=>w.creator_id)))if((await this.finance(creator)).summary.available<0)blocked.add(creator);return items.map(w=>({...w,rejectable:w.status==='requested'&&blocked.has(w.creator_id)}));}
 async rejectWithdrawal(admin:any,id:string,input:any){
  requirePermission(admin,'revenue','create');const reason=text(input?.reason,150);
  const first=await this.db.withdrawalRequest.findUnique({where:{id}});if(!first)reject(404,'WITHDRAWAL_NOT_FOUND','출금 신청을 찾을 수 없습니다.');
  return this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${first.creator_id} FOR UPDATE`;const w=await tx.withdrawalRequest.findUniqueOrThrow({where:{id}});
   if(w.status==='rejected')return{message:'이미 반려된 출금입니다.'};
   if(w.status!=='requested')reject(409,'WITHDRAWAL_NOT_REQUESTED','이체 전 신청 상태의 출금만 반려할 수 있습니다.');
   if((await this.finance(w.creator_id,tx)).summary.available>=0)reject(409,'WITHDRAWAL_NOT_BLOCKED','출금 가능 잔액이 부족해진 신청만 반려할 수 있습니다.');
   await tx.withdrawalRequest.update({where:{id},data:{status:'rejected',note:`운영자 반려 · ${reason}`}});
   await tx.memberNotification.create({data:{member_id:w.creator_id,type:'settlement',text:`결제 취소·환불로 출금 가능 수익이 줄어 ${dateOnly(w.created_at)}에 신청한 출금 ${w.amount.toLocaleString('ko-KR')}원이 반려되었습니다. 출금 가능 금액을 확인한 뒤 다시 신청해 주세요. 이의가 있으면 고객센터로 알려 주세요.`,path:'/studio/finance'}});
   await this.audit(tx,'withdrawal.rejected',id,{creatorId:w.creator_id,amount:w.amount,previousStatus:'requested',status:'rejected',adminId:admin.id,reasonLength:reason.length});
   return{message:'출금 신청을 반려했습니다.'};});
 }
 // Operator check of a settlement account (holder name vs. bank book copy) when no bank verification API is connected.
 // Manual transfer needs the full number (2026-11-10). Only for an account with an open payout the operator may see,
 // never cached, and every reveal is audited (who, which account and version) without storing the number itself.
 async revealAccount(admin:any,id:string){
  if(!manualPayouts(this.config))reject(409,'MANUAL_PAYOUTS_DISABLED','수동 지급이 활성화되어 있지 않습니다.');requirePermission(admin,'revenue','create');
  const a=await this.db.settlementAccount.findUnique({where:{id}});if(!a?.account_encrypted)reject(404,'ACCOUNT_NOT_FOUND','계좌를 찾을 수 없습니다.');
  const open={account_id:id,status:{in:['requested','processing']}},beans=can(admin,'beans','view');
  const count=await this.db.withdrawalRequest.count({where:open})+(beans?await this.db.beanPayout.count({where:open}):0);
  if(!count)reject(409,'NO_OPEN_PAYOUT','이체할 출금이 있는 계좌만 볼 수 있습니다.');
  const accountNumber=this.provider.decrypt(a.account_encrypted);
  await this.db.$transaction(async tx=>this.audit(tx,'account.number_revealed',id,{creatorId:a.creator_id,adminId:admin.id,version:a.version}));
  return{id,bank:a.bank,holder:a.holder_alias,accountNumber,version:a.version};
 }
 async manualVerifyAccount(admin:any,id:string,input:any){
  if(!manualPayouts(this.config))reject(409,'MANUAL_PAYOUTS_DISABLED','수동 지급이 활성화되어 있지 않습니다.');requirePermission(admin,'revenue','create');
  const reason=text(input?.reason??'',500);const a=await this.db.settlementAccount.findUnique({where:{id}});if(!a)reject(404,'ACCOUNT_NOT_FOUND','계좌를 찾을 수 없습니다.');
  if(input?.expectedVersion!==a.version)reject(409,'ACCOUNT_CHANGED','계좌 정보가 바뀌었습니다. 새로고침 후 다시 확인해주세요.');
  return this.db.$transaction(async tx=>{const saved=await tx.settlementAccount.updateMany({where:{id,version:a.version,verified:false},data:{verified:true}});if(saved.count!==1)reject(409,'ACCOUNT_CHANGED','이미 확인되었거나 계좌가 바뀌었습니다.');
   await this.audit(tx,'account.manual_verified',id,{creatorId:a.creator_id,adminId:admin.id,version:a.version,reasonLength:reason.length});return{message:'계좌 확인을 기록했습니다.'};});
 }
 async payout(id:string,now=new Date(),partner:PartnerCheck='quiet'){if(isBeta(this.config)&&!manualPayouts(this.config))reject(409,'BETA_PAYOUT_DISABLED','베타 테스트에서는 실제 출금을 처리하지 않습니다.');const w=await this.db.withdrawalRequest.findUniqueOrThrow({where:{id}});
  // A request from a creator without the partner badge is held: the worker leaves it as requested, an operator gets the reason.
  if(w.status==='requested'&&partner!=='off'&&!await isPartnerCreator(this.db,w.creator_id)){if(partner==='strict')reject(403,'PARTNER_CONTRACT_REQUIRED',PARTNER_REQUIRED_MESSAGE);return;}if(w.status==='requested'&&!inPayoutBatch(w.created_at,now))reject(409,'PAYOUT_SCHEDULED',PAYOUT_SCHEDULE_MESSAGE);if(!['requested','processing'].includes(w.status))return;const account=await this.db.settlementAccount.findUniqueOrThrow({where:{id:w.account_id}});if(!account.verified||!account.account_encrypted)reject(409,'ACCOUNT_NOT_VERIFIED','계좌를 확인해주세요.');await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${w.creator_id} FOR UPDATE`;const current=await tx.withdrawalRequest.findUniqueOrThrow({where:{id}});if(current.status==='requested'){if((await this.finance(w.creator_id,tx)).summary.available<0)reject(409,'PAYOUT_BALANCE_CHANGED','환불로 출금 가능 잔액이 변경되어 운영 확인이 필요합니다.');await tx.withdrawalRequest.update({where:{id},data:{status:'processing'}});await this.audit(tx,'withdrawal.processing',id,{creatorId:w.creator_id,amount:w.amount,previousStatus:current.status,status:'processing'});}});const result=await this.bank.transfer(account.bank,this.provider.decrypt(account.account_encrypted),(await this.db.member.findUniqueOrThrow({where:{id:w.creator_id}})).name,w.amount,w.id);if(!['paid','pending','rejected'].includes(result.status))reject(502,'INVALID_PROVIDER_RESPONSE','은행 응답 확인이 필요합니다.');if(result.status!=='pending')await this.db.$transaction(async tx=>{const changed=await tx.withdrawalRequest.updateMany({where:{id,status:'processing'},data:{status:result.status==='paid'?'paid':'rejected',note:result.status==='paid'?'은행 지급 완료':'은행 이체 반려'}});if(changed.count)await this.audit(tx,'withdrawal.result',id,{creatorId:w.creator_id,amount:w.amount,previousStatus:'processing',status:result.status});});}
}
