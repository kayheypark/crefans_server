import {createHash,randomUUID} from 'crypto';
import {reject,text} from './http';
import {beanPolicy} from './bean-policy';

export const beanBuckets=['purchased','promotion','earned-paid','earned-promotion','reserved-paid'] as const;
// Internal ledger primitive only. Controllers must enforce event-specific authorization.
// No controller, provider callback or payout path invokes this until the product policy is approved.
export async function ensureBeanWallet(tx:any,memberId:string){
 const wallet=await tx.beanWallet.upsert({where:{owner_key:`member:${memberId}`},create:{id:randomUUID(),owner_key:`member:${memberId}`},update:{}});
 for(const bucket of beanBuckets)await tx.beanAccount.upsert({where:{wallet_id_bucket:{wallet_id:wallet.id,bucket}},create:{id:randomUUID(),wallet_id:wallet.id,bucket},update:{}});
 return wallet;
}
export function beanCashQuote(quantity:number,feeBps:number=beanPolicy.withdrawalFeeBps){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000000)reject(400,'INVALID_BEAN_QUANTITY','콩 수량을 확인해주세요.');
 const gross=BigInt(quantity)*BigInt(beanPolicy.krwPerBean),fee=gross*BigInt(feeBps)/BigInt(10000);
 return{quantity,grossKrw:gross.toString(),feeKrw:fee.toString(),netKrw:(gross-fee).toString(),feeBps};
}
// terms carries a creator's own fee/minimum (signup-invites withdrawalTerms); the platform bean policy applies otherwise.
export function beanWithdrawalQuote(quantity:number,bucket:string,terms:{beanWithdrawalFeeBps:number;minimumWithdrawalBeans:number}={beanWithdrawalFeeBps:beanPolicy.withdrawalFeeBps,minimumWithdrawalBeans:beanPolicy.minimumWithdrawalBeans}){
 const quote=beanCashQuote(quantity,terms.beanWithdrawalFeeBps);
 if(!beanPolicy.withdrawableBuckets.some(allowed=>allowed===bucket))reject(403,'BEAN_NOT_WITHDRAWABLE','후원받은 일반콩과 프로모션콩만 출금할 수 있습니다.');
 if(quantity<terms.minimumWithdrawalBeans)reject(400,'BEAN_WITHDRAWAL_MINIMUM',`최소 출금 신청액은 수수료 차감 전 ${(terms.minimumWithdrawalBeans*beanPolicy.krwPerBean).toLocaleString('ko-KR')}원(${terms.minimumWithdrawalBeans.toLocaleString('ko-KR')}콩)입니다.`);
 return quote;
}
export async function postBeanMovement(db:any,input:{requestKey:string;kind:string;reason:string;actorId:string;referenceId?:string;entries:{accountId:string;delta:number}[]}){
 const requestKey=text(input.requestKey,191),kind=text(input.kind,40),reason=text(input.reason,500),actorId=text(input.actorId,191);
 if(!Array.isArray(input.entries)||input.entries.length<2||input.entries.length>12||input.entries.some(e=>typeof e.accountId!=='string'||!e.accountId||!Number.isSafeInteger(e.delta)||!e.delta||Math.abs(e.delta)>100000000)||new Set(input.entries.map(e=>e.accountId)).size!==input.entries.length||input.entries.reduce((n,e)=>n+BigInt(e.delta),BigInt(0))!==BigInt(0))reject(400,'UNBALANCED_BEAN_MOVEMENT','콩 이동의 출발·도착 수량이 일치해야 합니다.');
 const entries=[...input.entries].sort((a,b)=>a.accountId.localeCompare(b.accountId));
 const fingerprint=createHash('sha256').update(JSON.stringify({kind,reason,actorId,referenceId:input.referenceId||null,entries})).digest('hex');
 try{return await db.$transaction(async tx=>{
  // Wallet locks serialize frozen-state checks and postings. Stable order minimizes deadlocks.
  const initial=await tx.beanAccount.findMany({where:{id:{in:entries.map(e=>e.accountId)}}});
  if(initial.length!==entries.length)reject(404,'BEAN_ACCOUNT_NOT_FOUND','콩 계정을 찾을 수 없습니다.');
  for(const id of [...new Set<string>(initial.map((a:any)=>a.wallet_id))].sort()){
   await tx.$queryRaw`SELECT id FROM bean_wallets WHERE id=${id} FOR UPDATE`;
  }
  const prior=await tx.beanMovement.findUnique({where:{request_key:requestKey}});
  if(prior){if(prior.fingerprint!==fingerprint)reject(409,'BEAN_REQUEST_CONFLICT','이미 사용된 요청 번호입니다.');return prior;}
  for(const id of initial.map((a:any)=>a.wallet_id)){const wallet=await tx.beanWallet.findUniqueOrThrow({where:{id}});if(wallet.status!=='active')reject(409,'BEAN_WALLET_FROZEN','이용이 제한된 콩 지갑입니다.');}
  const movement=await tx.beanMovement.create({data:{id:randomUUID(),request_key:requestKey,fingerprint,kind,reason,actor_id:actorId,reference_id:input.referenceId||null}});
  for(const entry of entries){
   const account=await tx.beanAccount.findUniqueOrThrow({where:{id:entry.accountId}}),after=account.balance+BigInt(entry.delta);
   if(account.bucket==='issued')reject(403,'BEAN_ISSUANCE_LOCKED','초기 발행 원장은 변경할 수 없습니다.');
   if(after<BigInt(0))reject(409,'INSUFFICIENT_BEANS','콩 잔액이 부족합니다.');
   await tx.beanAccount.update({where:{id:account.id},data:{balance:after,version:{increment:1}}});
   await tx.beanEntry.create({data:{id:randomUUID(),movement_id:movement.id,account_id:account.id,delta:BigInt(entry.delta),balance_after:after}});
  }
  return movement;
 },{isolationLevel:'ReadCommitted'});}catch(error){if(error?.code==='P2002'){const prior=await db.beanMovement.findUnique({where:{request_key:requestKey}});if(prior?.fingerprint===fingerprint)return prior;if(prior)reject(409,'BEAN_REQUEST_CONFLICT','이미 사용된 요청 번호입니다.');}throw error;}
}
