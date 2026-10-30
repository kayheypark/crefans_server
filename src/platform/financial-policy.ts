import {can} from './admin-permissions';
export const POLICY_CONFIRMATION='정책 변경';
import {appendAudit} from './audit';
import {reject,text} from './http';

export function policyView(row:any){return{version:row?.version??0,platformFeeBps:row?.platform_fee_bps??null,settlementHoldDays:row?.settlement_hold_days??null,configured:Number.isInteger(row?.platform_fee_bps)&&row.platform_fee_bps>=0&&row.platform_fee_bps<=10000&&Number.isInteger(row?.settlement_hold_days)&&row.settlement_hold_days>=0&&row.settlement_hold_days<=365};}
// A creator's own fee/hold (creator_financial_terms) replaces the platform value for new orders only; orders keep this snapshot.
export async function paymentPolicy(db:any,creatorId?:string){
 const policy=policyView(await db.financialPolicy.findUnique({where:{id:'platform'}})),terms=creatorId?await db.creatorFinancialTerms.findUnique({where:{member_id:creatorId}}):null;
 const platformFeeBps=terms?.platform_fee_bps??policy.platformFeeBps,settlementHoldDays=terms?.settlement_hold_days??policy.settlementHoldDays;
 if(!policyView({platform_fee_bps:platformFeeBps,settlement_hold_days:settlementHoldDays}).configured)reject(503,'FINANCIAL_POLICY_REQUIRED','DB 수수료·정산 정책 설정이 필요합니다.');
 return{platformFeeBps,settlementHoldDays,financialPolicyVersion:policy.version,...(terms?{creatorTermsVersion:terms.version}:{})};
}
export async function updateFinancialPolicy(db:any,admin:any,input:any){
 if(!can(admin,'settings','update'))reject(403,'ADMIN_PERMISSION_REQUIRED','금융 정책을 변경할 권한이 없습니다.');
 // The console asks for this exact phrase in a typed-confirmation dialog; the API enforces it too.
 if(input?.confirmation!==POLICY_CONFIRMATION)reject(400,'CONFIRMATION_REQUIRED','확인 문구를 정확히 입력해주세요.');
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
