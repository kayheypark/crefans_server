import {createHash} from 'crypto';
import {ConfigService} from '@nestjs/config';
import {reject} from './http';
import type {AiBillingProvider,BillingCharge} from './ai-subscription';

// KG이니시스 빌링 (AI 이용권 구독형), 2026-11-16. Sources (checked 2026-11-16, manual.inicis.com/pay/): bill.html (빌링키발급 카드전용),
// cancel.html (환불), etc-inquiry.html (거래조회). Confirmed from the official pages:
// - Billing approval v1: POST {host}/api/v1/billing, form-urlencoded, type=Billing, paymethod=Card,
//   hashData = SHA512(INIAPIKey + type + paymethod + timestamp + clientIp + mid + moid + price + billKey); success resultCode "00".
// - Refund v1: POST {host}/api/v1/refund, type=Refund (hash: key+type+paymethod+timestamp+clientIp+mid+tid) /
//   type=PartialRefund with price, confirmPrice (hash adds + price + confirmPrice).
// - Billing key window (card only, PC/mobile): POST https://inilitepay.inicis.com/pay/card/billing with
//   hashData = SHA512(price + mid + orderId + timestamp + INILiteKey).
// NOT confirmed on public pages (needs the contracted MID's sample/sales confirmation): how the returned billkey (AES256) is decrypted
// and the response hash algorithm. Until INICIS_BILLKEY_DECRYPT_CONFIRMED is set by the operator after that confirmation, the provider
// reports 'unavailable' and the service shows 'payment preparing' instead of guessing a financial protocol.
export const INICIS_WINDOW_URL='https://inilitepay.inicis.com/pay/card/billing';
const sha512=(value:string)=>createHash('sha512').update(value,'utf8').digest('hex');
const timestamp=(at=new Date())=>{const k=new Date(at.getTime()+9*3600000);const p=(n:number)=>String(n).padStart(2,'0');return `${k.getUTCFullYear()}${p(k.getUTCMonth()+1)}${p(k.getUTCDate())}${p(k.getUTCHours())}${p(k.getUTCMinutes())}${p(k.getUTCSeconds())}`;};
export function billingHash(apiKey:string,f:{type:string;paymethod:string;timestamp:string;clientIp:string;mid:string;moid:string;price:number;billKey:string}){return sha512(apiKey+f.type+f.paymethod+f.timestamp+f.clientIp+f.mid+f.moid+String(f.price)+f.billKey);}
export function refundHash(apiKey:string,f:{type:string;paymethod:string;timestamp:string;clientIp:string;mid:string;tid:string;price?:number;confirmPrice?:number}){return sha512(apiKey+f.type+f.paymethod+f.timestamp+f.clientIp+f.mid+f.tid+(f.type==='PartialRefund'?String(f.price)+String(f.confirmPrice):''));}
export function windowHash(liteKey:string,f:{price:number;mid:string;orderId:string;timestamp:string}){return sha512(String(f.price)+f.mid+f.orderId+f.timestamp+liteKey);}

export class InicisBillingProvider implements AiBillingProvider{
 readonly name='inicis';
 fetcher:typeof fetch=fetch;
 constructor(private config:ConfigService){}
 private get(key:string){return (this.config.get<string>(key)||'').trim();}
 private settings(){return{mid:this.get('INICIS_BILLING_MID'),apiKey:this.get('INICIS_INIAPI_KEY'),liteKey:this.get('INICIS_INILITE_KEY'),host:this.get('INICIS_ENV')==='live'?'https://iniapi.inicis.com':'https://stginiapi.inicis.com',serverIp:this.get('INICIS_SERVER_IP')||'127.0.0.1',siteUrl:this.get('APP_PUBLIC_URL')||'https://crefans.com'};}
 environment(){const s=this.settings();if(!s.mid||!s.apiKey||!s.liteKey||this.get('INICIS_BILLKEY_DECRYPT_CONFIRMED')!=='true')return 'unavailable' as const;return this.get('INICIS_ENV')==='live'?'live' as const:'test' as const;}
 /** Form fields for the card billing-key window (operator-confirmed contract scope only). */
 windowForm(input:{orderId:string;price:number;goodName:string;buyerName:string;buyerEmail:string;buyerTel:string;returnUrl:string}){const s=this.settings(),ts=timestamp();
  return{action:INICIS_WINDOW_URL,fields:{mid:s.mid,buyerTel:input.buyerTel,buyerEmail:input.buyerEmail,buyerName:input.buyerName,goodName:input.goodName,orderId:input.orderId,price:String(input.price),timestamp:ts,returnUrl:input.returnUrl,hashData:windowHash(s.liteKey,{price:input.price,mid:s.mid,orderId:input.orderId,timestamp:ts})}};}
 private async post(path:string,form:Record<string,string>){const s=this.settings();
  const res=await this.fetcher(s.host+path,{method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8'},body:new URLSearchParams(form).toString()});
  const body=await res.json().catch(()=>null);if(!res.ok||!body)reject(502,'BILLING_UNCERTAIN','결제 결과를 확인하지 못했어요.');return body;}
 async charge(input:{billingKey:string;moid:string;amount:number;goodName:string;buyerName:string;buyerEmail?:string}):Promise<BillingCharge>{const s=this.settings(),ts=timestamp();
  const f={type:'Billing',paymethod:'Card',timestamp:ts,clientIp:s.serverIp,mid:s.mid,moid:input.moid,price:input.amount,billKey:input.billingKey};
  const body=await this.post('/api/v1/billing',{type:f.type,paymethod:f.paymethod,timestamp:ts,clientIp:f.clientIp,mid:f.mid,url:s.siteUrl,moid:f.moid,goodName:input.goodName,buyerName:input.buyerName,buyerEmail:input.buyerEmail||'',price:String(f.price),billKey:f.billKey,authentification:'00',hashData:billingHash(s.apiKey,f)});
  if(body.resultCode!=='00'||!body.tid)reject(402,`INICIS_${String(body.resultCode||'FAILED').slice(0,40)}`,'카드 결제가 승인되지 않았어요.');
  if(Number(body.price)!==input.amount)reject(502,'BILLING_UNCERTAIN','결제 금액을 확인해야 해요.');
  const d=String(body.payDate||''),t=String(body.payTime||'');const paidAt=/^\d{8}$/.test(d)&&/^\d{6}$/.test(t)?new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}+09:00`):new Date();
  return{tid:String(body.tid),paidAt};}
 async cancel(input:{tid:string;amount:number;remainingAmount:number;reason:string}){const s=this.settings(),ts=timestamp(),partial=input.remainingAmount>0;
  const f={type:partial?'PartialRefund':'Refund',paymethod:'Card',timestamp:ts,clientIp:s.serverIp,mid:s.mid,tid:input.tid,...(partial?{price:input.amount,confirmPrice:input.remainingAmount}:{})};
  const body=await this.post('/api/v1/refund',{type:f.type,paymethod:f.paymethod,timestamp:ts,clientIp:f.clientIp,mid:f.mid,tid:f.tid,msg:input.reason.slice(0,100),...(partial?{price:String(input.amount),confirmPrice:String(input.remainingAmount)}:{}),hashData:refundHash(s.apiKey,f)});
  if(body.resultCode!=='00')reject(402,`INICIS_${String(body.resultCode||'FAILED').slice(0,40)}`,'결제 취소가 처리되지 않았어요. 운영팀이 확인할게요.');}
}
