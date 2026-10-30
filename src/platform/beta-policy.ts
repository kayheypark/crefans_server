import {ConfigService} from '@nestjs/config';
import {reject} from './http';

// User selections of 2026-10-25; minimum KRW withdrawal raised to 100,000 on 2026-10-27. Financial fee/hold values remain versioned in DB.
export const betaPolicy=Object.freeze({version:'2026-10-25',days:14,platformFeeBps:2000,settlementHoldDays:7,refundDays:7,minimumWithdrawal:100000,retries:3,retryHours:24});
export const isBeta=(config:ConfigService)=>config.get('BETA_MODE')==='true';
export function paymentEnvironment(clientKey:string){return clientKey?.startsWith('test_')?'test':clientKey?.startsWith('live_')?'live':'unknown';}
export function assertBetaPayment(config:ConfigService){
 if(isBeta(config)&&(!/^test_ck_/.test(config.get('TOSS_CLIENT_KEY')||'')||!/^test_sk_/.test(config.get('TOSS_SECRET_KEY')||'')))reject(503,'BETA_TEST_KEYS_REQUIRED','베타에서는 테스트 결제 키만 사용할 수 있습니다.');
}
export function renewalPolicy(config:ConfigService){return isBeta(config)?{retries:betaPolicy.retries,hours:betaPolicy.retryHours}:{retries:Number(config.get('RENEWAL_MAX_RETRIES')),hours:Number(config.get('RENEWAL_RETRY_HOURS'))};}
export function unusedRefundReason(row:any,now=new Date()):string|null{
 if(row.status==='refunded')return 'ALREADY_REFUNDED';
 if(row.status==='refunding')return 'REFUND_IN_PROGRESS';
 if(row.status!=='paid')return 'INVALID_ORDER_STATE';
 if(!row.usage_tracking_started_at)return 'REFUND_USAGE_UNKNOWN';
 if(row.content_accessed_at)return 'CONTENT_ALREADY_ACCESSED';
 // Old contracts without this field retain their original voluntary refund terms.
 if(row.snapshot?.refundWindowDays!==undefined){
  if(row.snapshot.refundWindowDays!==7||!row.paid_at||!Number.isFinite(new Date(row.paid_at).getTime()))return 'REFUND_USAGE_UNKNOWN';
  if(now.getTime()>new Date(row.paid_at).getTime()+7*86400000)return 'REFUND_WINDOW_EXPIRED';
 }
 return null;
}
export const isPayoutDay=(now=new Date())=>new Date(now.getTime()+9*3600000).getUTCDay()===3;
