import {assertBetaPayment} from './beta-policy';
import {unusableCardCodes} from './billing-failures';
import {PrismaService} from '../prisma/prisma.service';
import {observeAudit} from './audit';
import {HttpException,Injectable,Optional} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import axios from 'axios';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'crypto';
import {reject} from './http';
export const providerOrderId=(order:any)=>order.attempts?`${order.id}_${order.attempts}`:order.id;
// 2026-11-02 user decision: only card payments are accepted. Toss reports a card paid through an easy-pay wallet as '간편결제'
// (docs.tosspayments.com/guides/v2/easypay-response, checked 2026-11-02); any other method (virtual account, phone, transfer...) is held
// as unconfirmed so the stuck-payment watchdog alerts an operator. Toss always returns method; test fixtures that omit it model card payments.
export const acceptedPaymentMethod=(response:any)=>response?.method==null||['카드','간편결제'].includes(response.method);
@Injectable()
export class PaymentProvider {
 constructor(private config:ConfigService,@Optional() private db?:PrismaService){}
 configForClient(){assertBetaPayment(this.config);const clientKey=this.config.get<string>('TOSS_CLIENT_KEY');if(!clientKey||!this.config.get('TOSS_SECRET_KEY'))reject(503,'PAYMENT_NOT_CONFIGURED','결제 서비스 설정이 필요합니다.');return{clientKey};}
 encrypt(value:string){const key=this.config.get<string>('DATA_ENCRYPTION_KEY');if(!/^[a-f0-9]{64}$/i.test(key||''))reject(503,'ENCRYPTION_NOT_CONFIGURED','암호화 설정이 필요합니다.');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return[iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');}
 decrypt(value:string){const [iv,tag,data]=value.split('.');const key=this.config.get<string>('DATA_ENCRYPTION_KEY');if(!key)reject(503,'ENCRYPTION_NOT_CONFIGURED','암호화 설정이 필요합니다.');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');}
 async request(path:string,body:any,key:string,method:'GET'|'POST'|'DELETE'='POST',audit:{operation:string;entityId?:string;amount?:number}={operation:'request'}){
   const attemptId=randomUUID(),start=Date.now(),data={attemptId,operation:audit.operation,amount:audit.amount,provider:'toss'};
   await observeAudit(this.db,{category:'finance',action:'provider.attempt',entityId:audit.entityId,data});
   try{this.configForClient();const secret=this.config.get('TOSS_SECRET_KEY');const result=await axios.request({url:`https://api.tosspayments.com/v1${path}`,method,data:body,timeout:65000,headers:{Authorization:`Basic ${Buffer.from(`${secret}:`).toString('base64')}`,'Idempotency-Key':key}});await observeAudit(this.db,{category:'finance',action:'provider.result',entityId:audit.entityId,durationMs:Date.now()-start,data:{...data,httpStatus:result.status,outcome:'response_received',status:result.data?.status}});return result.data;}
   catch(e:any){await observeAudit(this.db,{category:'finance',action:'provider.result',level:'error',entityId:audit.entityId,durationMs:Date.now()-start,data:{...data,httpStatus:e.response?.status,providerCode:e.response?.data?.code,errorCode:e.code||e.getResponse?.()?.code,outcome:e.response?'provider_error':'unconfirmed'}});if(e?.getResponse)throw e;if(!e.response||e.response.status>=500||[408,409,429].includes(e.response.status)||['ALREADY_PROCESSING_REQUEST','ALREADY_PROCESSED_PAYMENT','DUPLICATED_ORDER_ID','PROVIDER_ERROR'].includes(e.response.data?.code))reject(503,'PAYMENT_UNCERTAIN','결제 결과를 확인 중입니다. 같은 주문으로 다시 확인해주세요.');if(method==='GET'&&e.response.status===404&&e.response.data?.code==='NOT_FOUND_PAYMENT')return null;if([401,403].includes(e.response.status)&&['UNAUTHORIZED_KEY','FORBIDDEN_API_REQUEST','FORBIDDEN_REQUEST','INCORRECT_BASIC_AUTH_FORMAT'].includes(e.response.data?.code))reject(503,'PAYMENT_CONFIGURATION_ERROR','결제 서비스 설정 확인이 필요합니다.');
   // A lookup error (rate limit FORBIDDEN_CONSECUTIVE_REQUEST, auth, 4xx) says nothing about the payment itself;
   // an "already canceled" refusal means the cancel may have happened. Neither may become a failed order or a new charge.
   if(method==='GET'||e.response.data?.code==='ALREADY_CANCELED_PAYMENT')reject(503,'PAYMENT_UNCERTAIN','결제 결과를 확인 중입니다. 같은 주문으로 다시 확인해주세요.');if(audit.operation==='billing.charge'&&unusableCardCodes.has(e.response.data?.code)){const error:any=new HttpException({code:'PAYMENT_METHOD_UNAVAILABLE',message:'사용할 수 없는 카드입니다. 다른 카드를 등록하고 기본 결제수단으로 설정해주세요.'},400);error.providerCode=e.response.data.code;throw error;}reject(400,'PAYMENT_FAILED','결제에 실패했습니다. 결제수단을 확인해주세요.');}
 }
 confirm(paymentKey:string,order:any){return this.request('/payments/confirm',{paymentKey,orderId:providerOrderId(order),amount:order.amount},`window-${order.id}-${order.attempts||0}`,'POST',{operation:'payment.confirm',entityId:order.id,amount:order.amount});}
 issue(authKey:string,customerKey:string,key:string){return this.request('/billing/authorizations/issue',{authKey,customerKey},key,'POST',{operation:'billing.issue',entityId:key});}
 charge(billingKey:string,customerKey:string,order:any){return this.request(`/billing/${encodeURIComponent(billingKey)}`,{customerKey,amount:order.amount,orderId:providerOrderId(order),orderName:String((order.snapshot as any).name).slice(0,100)},`${order.id}-${order.attempts||0}`,'POST',{operation:'billing.charge',entityId:order.id,amount:order.amount});}
 revoke(billingKey:string,key:string){return this.request(`/billing/${encodeURIComponent(billingKey)}`,undefined,key,'DELETE',{operation:'billing.revoke',entityId:key});}
 lookup(orderId:string){return this.request(`/payments/orders/${encodeURIComponent(orderId)}`,undefined,orderId,'GET',{operation:'payment.lookup',entityId:orderId.replace(/_\d+$/,'')});}
 // cancelAmount makes a partial cancel (Toss v1 POST /payments/{paymentKey}/cancel, docs.tosspayments.com/guides/v2/cancel-payment, checked 2026-10-30).
 cancel(paymentKey:string,reason:string,key:string,cancelAmount?:number){return this.request(`/payments/${encodeURIComponent(paymentKey)}/cancel`,cancelAmount===undefined?{cancelReason:reason}:{cancelReason:reason,cancelAmount},key,'POST',{operation:'payment.refund',entityId:key.replace(/^(bean-)?refund-/,'').replace(/_r\d+$/,''),...(cancelAmount===undefined?{}:{amount:cancelAmount})});}
}
