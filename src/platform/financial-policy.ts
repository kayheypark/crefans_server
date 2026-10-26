import {appendAudit} from './audit';
import {reject,text} from './http';

export function policyView(row:any){return{version:row?.version??0,platformFeeBps:row?.platform_fee_bps??null,settlementHoldDays:row?.settlement_hold_days??null,configured:Number.isInteger(row?.platform_fee_bps)&&row.platform_fee_bps>=0&&row.platform_fee_bps<=10000&&Number.isInteger(row?.settlement_hold_days)&&row.settlement_hold_days>=0&&row.settlement_hold_days<=365};}
export async function paymentPolicy(db:any){
 const policy=policyView(await db.financialPolicy.findUnique({where:{id:'platform'}}));
 if(!policy.configured)reject(503,'FINANCIAL_POLICY_REQUIRED','DB 수수료·정산 정책 설정이 필요합니다.');
 return{platformFeeBps:policy.platformFeeBps,settlementHoldDays:policy.settlementHoldDays,financialPolicyVersion:policy.version};
}
export async function updateFinancialPolicy(db:any,admin:any,input:any){
 if(admin?.role!=='SUPER_ADMIN'||!admin?.is_active)reject(403,'SUPER_ADMIN_REQUIRED','최고 관리자만 금융 정책을 변경할 수 있습니다.');
 if(!Number.isSafeInteger(input?.expectedVersion)||input.expectedVersion<0||input.expectedVersion>=2147483647||!Number.isInteger(input?.platformFeeBps)||input.platformFeeBps<0||input.platformFeeBps>10000||!Number.isInteger(input?.settlementHoldDays)||input.settlementHoldDays<0||input.settlementHoldDays>365)reject(400,'INVALID_FINANCIAL_POLICY','수수료율·보류 기간·정책 버전을 확인해주세요.');
 const reason=text(input.reason,500),version=input.expectedVersion+1;
 return db.$transaction(async tx=>{
  const updated=await tx.financialPolicy.updateMany({where:{id:'platform',version:input.expectedVersion},data:{version,platform_fee_bps:input.platformFeeBps,settlement_hold_days:input.settlementHoldDays}});
  if(updated.count!==1)reject(409,'POLICY_VERSION_CONFLICT','정책이 변경되었습니다. 최신 값을 확인해주세요.');
  await tx.financialPolicyChange.create({data:{version,platform_fee_bps:input.platformFeeBps,settlement_hold_days:input.settlementHoldDays,changed_by:admin.user_sub,reason}});
  await appendAudit(tx,{category:'admin',action:'admin.financial_policy.updated',entityId:'platform',data:{version,previousVersion:input.expectedVersion,platformFeeBps:input.platformFeeBps,settlementHoldDays:input.settlementHoldDays}});
  return policyView(await tx.financialPolicy.findUnique({where:{id:'platform'}}));
 });
}
