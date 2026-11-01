import {can} from './admin-permissions';
import {appendAudit,contentDigest} from './audit';
import {reject,text} from './http';

// Why an entry is not withdrawable yet (creator agreement 7⑥): the hold period, the PG deposit reconciliation, or both.
export const settlementHoldReasons=(entry:any,now=new Date()):Array<'period'|'receipt'>=>[...(entry.available_at>now?['period' as const]:[]),...(!entry.receipt_confirmed_at||entry.received_amount<Math.max(0,entry.net)?['receipt' as const]:[])];
export const settlementPending=(entry:any,now=new Date())=>settlementHoldReasons(entry,now).length>0;
// Confirmation is a manual PG/bank reconciliation record, never a claim of a bank API response.
export async function confirmSettlementReceipt(db:any,admin:any,id:string,input:any){
 if(!can(admin,'revenue','create'))reject(403,'ADMIN_PERMISSION_REQUIRED','입금 대사를 기록할 권한이 없습니다.');
 const reference=text(input.reference,191),reason=text(input.reason,500),receivedAt=new Date(input.receivedAt);
 if(!Number.isSafeInteger(input.amount)||input.amount<1||!Number.isFinite(receivedAt.getTime())||receivedAt>new Date())reject(400,'INVALID_RECEIPT','입금 금액과 실제 입금 시각을 확인해주세요.');
 return db.$transaction(async tx=>{
  const initial=await tx.revenueEntry.findUnique({where:{id}});if(!initial)reject(404,'REVENUE_NOT_FOUND','수익 내역을 찾을 수 없습니다.');
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${initial.creator_id} FOR UPDATE`;
  const entry=await tx.revenueEntry.findUniqueOrThrow({where:{id}}),order=await tx.checkoutOrder.findUniqueOrThrow({where:{id:entry.order_id}});
  if((order.snapshot as any).paymentEnvironment!=='live'||order.status!=='paid')reject(409,'RECEIPT_NOT_ELIGIBLE','확정된 실제 결제만 입금 대사할 수 있습니다.');
  if(input.amount<entry.net||input.amount>entry.gross||receivedAt<order.paid_at)reject(400,'INVALID_RECEIPT','입금액과 결제 시각을 대조해주세요.');
  if(entry.receipt_confirmed_at){if(entry.receipt_reference===reference&&entry.received_amount===input.amount&&entry.receipt_confirmed_at.getTime()===receivedAt.getTime())return{message:'이미 기록된 입금 대사입니다.'};reject(409,'RECEIPT_ALREADY_CONFIRMED','입금 대사가 이미 기록되었습니다. 정정은 별도 검토가 필요합니다.');}
  await tx.revenueEntry.update({where:{id},data:{receipt_confirmed_at:receivedAt,receipt_reference:reference,received_amount:input.amount}});
  await appendAudit(tx,{category:'finance',action:'settlement.receipt_confirmed',entityId:id,data:{orderId:entry.order_id,amount:input.amount,fingerprint:contentDigest({receivedAt:receivedAt.toISOString(),reference,reason}),changedBy:admin.user_sub}});
  return{message:'PG 실제 입금 대사를 기록했습니다.'};
 });
}
