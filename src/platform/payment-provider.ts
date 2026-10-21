import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import axios from 'axios';
import {createCipheriv,createDecipheriv,randomBytes} from 'crypto';
import {reject} from './http';
export const providerOrderId=(order:any)=>order.attempts?`${order.id}_${order.attempts}`:order.id;
@Injectable()
export class PaymentProvider {
 constructor(private config:ConfigService){}
 configForClient(){const clientKey=this.config.get<string>('TOSS_CLIENT_KEY');if(!clientKey||!this.config.get('TOSS_SECRET_KEY'))reject(503,'PAYMENT_NOT_CONFIGURED','결제 서비스 설정이 필요합니다.');return{clientKey};}
 encrypt(value:string){const key=this.config.get<string>('DATA_ENCRYPTION_KEY');if(!/^[a-f0-9]{64}$/i.test(key||''))reject(503,'ENCRYPTION_NOT_CONFIGURED','암호화 설정이 필요합니다.');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return[iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');}
 decrypt(value:string){const [iv,tag,data]=value.split('.');const key=this.config.get<string>('DATA_ENCRYPTION_KEY');if(!key)reject(503,'ENCRYPTION_NOT_CONFIGURED','암호화 설정이 필요합니다.');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');}
 async request(path:string,body:any,key:string,method:'GET'|'POST'|'DELETE'='POST'){
   this.configForClient();const secret=this.config.get('TOSS_SECRET_KEY');
   try{return(await axios.request({url:`https://api.tosspayments.com/v1${path}`,method,data:body,timeout:65000,headers:{Authorization:`Basic ${Buffer.from(`${secret}:`).toString('base64')}`,'Idempotency-Key':key}})).data;}
   catch(e:any){if(!e.response||e.response.status>=500||[408,409,429].includes(e.response.status)||['ALREADY_PROCESSING_REQUEST','ALREADY_PROCESSED_PAYMENT','DUPLICATED_ORDER_ID','PROVIDER_ERROR'].includes(e.response.data?.code))reject(503,'PAYMENT_UNCERTAIN','결제 결과를 확인 중입니다. 같은 주문으로 다시 확인해주세요.');if(method==='GET'&&e.response.status===404&&e.response.data?.code==='NOT_FOUND_PAYMENT')return null;if([401,403].includes(e.response.status)&&['UNAUTHORIZED_KEY','FORBIDDEN_API_REQUEST','FORBIDDEN_REQUEST','INCORRECT_BASIC_AUTH_FORMAT'].includes(e.response.data?.code))reject(503,'PAYMENT_CONFIGURATION_ERROR','결제 서비스 설정 확인이 필요합니다.');reject(400,'PAYMENT_FAILED','결제에 실패했습니다. 결제수단을 확인해주세요.');}
 }
 confirm(paymentKey:string,order:any){return this.request('/payments/confirm',{paymentKey,orderId:providerOrderId(order),amount:order.amount},`window-${order.id}-${order.attempts||0}`);}
 issue(authKey:string,customerKey:string,key:string){return this.request('/billing/authorizations/issue',{authKey,customerKey},key);}
 charge(billingKey:string,customerKey:string,order:any){return this.request(`/billing/${encodeURIComponent(billingKey)}`,{customerKey,amount:order.amount,orderId:providerOrderId(order),orderName:String((order.snapshot as any).name).slice(0,100)},`${order.id}-${order.attempts||0}`);}
 revoke(billingKey:string,key:string){return this.request(`/billing/${encodeURIComponent(billingKey)}`,undefined,key,'DELETE');}
 lookup(orderId:string){return this.request(`/payments/orders/${encodeURIComponent(orderId)}`,undefined,orderId,'GET');}
 cancel(paymentKey:string,reason:string,key:string){return this.request(`/payments/${encodeURIComponent(paymentKey)}/cancel`,{cancelReason:reason},key);}
}
