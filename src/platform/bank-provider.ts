import {PrismaService} from '../prisma/prisma.service';
import {observeAudit} from './audit';
import {randomUUID} from 'node:crypto';
import {Injectable,Optional} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import axios from 'axios';
import {reject} from './http';
/** Configured bank/open-banking adapter contract; vendor credentials stay outside application code. */
@Injectable()
export class BankProvider {
 constructor(private config:ConfigService,@Optional() private db?:PrismaService){}
 async request(path:string,body:any,key:string){const attemptId=randomUUID(),start=Date.now(),data={attemptId,provider:'bank',operation:path==='/transfers'?'bank.transfer':'bank.verify',amount:body?.amount};await observeAudit(this.db,{category:'finance',action:'provider.attempt',entityId:key,data});try{const endpoint=this.config.get<string>('BANK_ADAPTER_URL'),secret=this.config.get<string>('BANK_ADAPTER_SECRET');if(!endpoint||!secret)reject(503,'BANK_NOT_CONFIGURED','은행 서비스 공급자 설정이 필요합니다.');const result=await axios.post(`${endpoint}${path}`,body,{timeout:30000,headers:{Authorization:`Bearer ${secret}`,'Idempotency-Key':key}});await observeAudit(this.db,{category:'finance',action:'provider.result',entityId:key,durationMs:Date.now()-start,data:{...data,httpStatus:result.status,status:result.data?.status,outcome:'response_received'}});return result.data;}catch(error){await observeAudit(this.db,{category:'finance',action:'provider.result',entityId:key,level:'error',durationMs:Date.now()-start,data:{...data,outcome:'unconfirmed',httpStatus:error?.response?.status,providerCode:error?.response?.data?.code}});if(error?.getResponse)throw error;reject(503,'BANK_RESULT_PENDING','은행 처리 결과를 확인할 수 없습니다. 동일 요청으로 다시 확인해주세요.');}}
 // Manual payout mode (MANUAL_PAYOUTS_ENABLED): no bank API. Accounts are confirmed by an operator and transfers are made by
 // an operator outside the app, then recorded in the console; transfer() only parks the request as pending for that record.
 verify(bank:string,account:string,holder:string,key:string){if(this.config.get('MANUAL_PAYOUTS_ENABLED')==='true')reject(409,'MANUAL_ACCOUNT_REVIEW','정산 계좌는 운영자가 예금주를 확인한 뒤 확인 완료로 바뀝니다. 고객센터 안내에 따라 통장 사본을 제출해주세요.');return this.request('/accounts/verify',{bank,account,holder},key);}
 transfer(bank:string,account:string,holder:string,amount:number,key:string){if(this.config.get('MANUAL_PAYOUTS_ENABLED')==='true')return observeAudit(this.db,{category:'finance',action:'provider.manual_pending',entityId:key,data:{provider:'manual',operation:'bank.transfer',amount}}).then(()=>({status:'pending'}));if(this.config.get('BANK_PAYOUTS_ENABLED')!=='true')reject(503,'PAYOUTS_DISABLED','은행 이체가 아직 활성화되지 않았습니다.');return this.request('/transfers',{bank,account,holder,amount},key);}
}
