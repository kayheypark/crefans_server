import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PlatformService} from './service';
import {PaymentProvider} from './payment-provider';
import {appendAudit} from './audit';
import {enqueueOperation} from './operations-events';
import {livePayments} from './beta-policy';
import {reject,text} from './http';

// 2026-11-16 user decisions: beans, AI 이용권 and advertising can be paid by bank transfer (무통장입금) to the company account the
// operator enters in the console. An order waits 24 hours for the deposit and is cancelled after that; an operator confirms the
// deposit only when the amount matches (mismatches are handled with the buyer by hand). Cash receipts are requested at order time
// and issued by the operator. Refunds of these purchases go to an account the member enters (encrypted) and are transferred by an
// operator within 3 business days (전자상거래법 제18조). PG card payment stays as another method and is shown once live payments open.
export const BANK_TRANSFER_HOURS=24,BANK_TRANSFER_REMIND_HOURS=6,REFUND_BUSINESS_DAYS=3;
export type BankTransferKind='bean'|'ai-shop'|'ad';
export const BANK_TRANSFER_KINDS:BankTransferKind[]=['bean','ai-shop','ad'];
export type BankTransferHandler={
 /** Deposit confirmed by an operator: fulfil the order (credit beans, grant uses, make the ad usable). */
 confirm(tx:any,orderId:string,receivedAt:Date):Promise<void>;
 /** The 24-hour window passed or an operator cancelled before a deposit: release the order. */
 cancel(orderId:string,reason:string):Promise<void>;
 /** The operator transferred a refund: finish the product refund (own transaction; must be idempotent). */
 refunded(refundId:string,orderId:string):Promise<void>;
 /** The operator could not pay the refund (e.g. wrong account): put the product back as it was. */
 refundRejected(refundId:string,orderId:string):Promise<void>;
};
const statusLabels:Record<string,string>={awaiting:'입금 대기',confirmed:'입금 확인',expired:'입금 기한 만료',cancelled:'주문 취소'};
const refundLabels:Record<string,string>={requested:'환불 이체 대기',completed:'환불 완료',rejected:'환불 반려'};
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim():'';
export function depositorName(value:unknown){const name=clean(value,40);if(!name||name.length>20)reject(400,'INVALID_DEPOSITOR_NAME','입금자명을 20자 이내로 입력해 주세요.');return name;}
/** Optional cash receipt: income deduction by phone number (10~11 digits) or expense proof by business number (10 digits). */
export function cashReceiptInput(value:any):{type:'income'|'expense';number:string}|null{
 if(value===undefined||value===null||value===false)return null;
 const type=value?.type,number=typeof value?.number==='string'?value.number.replace(/[^0-9]/g,''):'';
 if(type==='income'&&/^01[016789][0-9]{7,8}$/.test(number))return{type,number};
 if(type==='expense'&&/^[0-9]{10}$/.test(number))return{type,number};
 reject(400,'INVALID_CASH_RECEIPT','현금영수증 번호를 확인해 주세요. 소득공제는 휴대폰 번호, 지출증빙은 사업자번호 10자리예요.');
}
export function refundAccountInput(value:any){
 const bank=clean(value?.bankName,40),holder=clean(value?.holder,40),number=typeof value?.accountNumber==='string'?value.accountNumber.replace(/[^0-9]/g,''):'';
 if(!bank||bank.length>20||!holder||holder.length>20||!/^[0-9]{6,20}$/.test(number))reject(400,'INVALID_REFUND_ACCOUNT','환불받을 은행·계좌번호·예금주를 확인해 주세요.');
 return{bankName:bank,accountNumber:number,holder};
}
/** Adds business days counted on the KST calendar (Saturday/Sunday skipped; public holidays are not known here, so the due time is conservative). */
export function addBusinessDays(from:Date,days:number){let at=new Date(from.getTime()),left=days;while(left>0){at=new Date(at.getTime()+86400000);const day=new Date(at.getTime()+9*3600000).getUTCDay();if(day!==0&&day!==6)left--;}return at;}
const mask=(value:string)=>value.length<=4?'****':`${'*'.repeat(Math.max(0,value.length-4))}${value.slice(-4)}`;

@Injectable()
export class BankTransferService{
 private handlers=new Map<BankTransferKind,BankTransferHandler>();
 constructor(private service:PlatformService,private provider:PaymentProvider,private config:ConfigService){}
 get db(){return this.service.db;}
 register(kind:BankTransferKind,handler:BankTransferHandler){this.handlers.set(kind,handler);}
 private handler(kind:string){const h=this.handlers.get(kind as BankTransferKind);if(!h)reject(500,'BANK_TRANSFER_HANDLER_MISSING','주문 종류를 처리할 수 없습니다.');return h;}
 async account(){const row=await this.db.bankTransferAccount.findUnique({where:{id:'default'}});return row?.enabled?{bankName:row.bank_name,accountNumber:row.account_number,holder:row.holder}:null;}
 /** Methods offered at checkout: bank transfer once the account is set; PG card only while live payments are open. */
 async methods(){return{bankTransfer:!!await this.account(),card:livePayments(this.config),deadlineHours:BANK_TRANSFER_HOURS,refundBusinessDays:REFUND_BUSINESS_DAYS};}
 async requireOpen(){const account=await this.account();if(!account)reject(503,'BANK_TRANSFER_UNAVAILABLE','무통장입금 계좌를 준비 중이에요. 잠시 후 다시 시도해 주세요.');return account;}
 /** Creates the deposit wait for a just-created order inside the caller's transaction. */
 async open(tx:any,kind:BankTransferKind,orderId:string,member:string,amount:number,input:any,account:{bankName:string;accountNumber:string;holder:string}){
  const name=depositorName(input?.depositorName),receipt=cashReceiptInput(input?.cashReceipt);
  const row=await tx.bankTransferPayment.create({data:{kind,order_id:orderId,member_id:member,amount,depositor_name:name,account_snapshot:account,cash_receipt_type:receipt?.type??null,cash_receipt_number_encrypted:receipt?this.provider.encrypt(receipt.number):null,expires_at:new Date(Date.now()+BANK_TRANSFER_HOURS*3600000)}});
  await appendAudit(tx,{category:'finance',action:'bank_transfer.opened',entityId:row.id,data:{kind,orderId,amount,cashReceipt:receipt?.type||'none'}});
  // 2026-11-16: operators learn of every deposit wait right away (Telegram outbox, same transaction; no depositor name or account).
  await enqueueOperation(tx,'bank_transfer.opened',{targetId:row.id,kind,amount,dueAt:row.expires_at.toISOString()});
  return row;
 }
 view(row:any){if(!row)return null;return{id:row.id,kind:row.kind,orderId:row.order_id,amount:row.amount,status:row.status,statusLabel:statusLabels[row.status]||row.status,depositorName:row.depositor_name,account:row.account_snapshot,expiresAt:row.expires_at,confirmedAt:row.confirmed_at,cashReceipt:row.cash_receipt_type?{type:row.cash_receipt_type,issued:!!row.cash_receipt_issued_at}:null};}
 /** The buyer's own deposit instructions for one order. */
 async forMember(member:string,kind:string,orderId:string){if(!BANK_TRANSFER_KINDS.includes(kind as BankTransferKind))reject(404,'BANK_TRANSFER_NOT_FOUND','입금 안내를 찾을 수 없어요.');const row=await this.db.bankTransferPayment.findFirst({where:{kind,order_id:orderId,member_id:member}});if(!row)reject(404,'BANK_TRANSFER_NOT_FOUND','입금 안내를 찾을 수 없어요.');return this.view(row);}
 async paymentFor(kind:BankTransferKind,orderId:string){return this.db.bankTransferPayment.findUnique({where:{kind_order_id:{kind,order_id:orderId}}});}
 /** Opens a manual refund (account encrypted) inside the product's refund transaction. */
 async openRefund(tx:any,kind:BankTransferKind,refundId:string,orderId:string,member:string,amount:number,input:any,actor:string){
  const account=refundAccountInput(input);
  const row=await tx.manualRefund.create({data:{kind,refund_id:refundId,order_id:orderId,member_id:member,amount,bank_name:account.bankName,account_encrypted:this.provider.encrypt(account.accountNumber),holder_encrypted:this.provider.encrypt(account.holder),due_at:addBusinessDays(new Date(),REFUND_BUSINESS_DAYS),actor_id:actor}});
  await appendAudit(tx,{category:'finance',action:'manual_refund.requested',entityId:row.id,data:{kind,orderId,amount}});
  await enqueueOperation(tx,'manual_refund.requested',{targetId:row.id,kind,amount,dueAt:row.due_at.toISOString()});
  return row;
 }
 refundView(row:any){if(!row)return null;return{id:row.id,kind:row.kind,refundId:row.refund_id,orderId:row.order_id,memberId:row.member_id,amount:row.amount,status:row.status,statusLabel:refundLabels[row.status]||row.status,bankName:row.bank_name,dueAt:row.due_at,completedAt:row.completed_at,transferReference:row.transfer_reference,rejectReason:row.reject_reason,createdAt:row.created_at};}

 // ---- Console ----
 async adminAccount(){const row=await this.db.bankTransferAccount.findUnique({where:{id:'default'}});return row?{bankName:row.bank_name,accountNumber:row.account_number,holder:row.holder,enabled:row.enabled,updatedAt:row.updated_at}:null;}
 async saveAccount(admin:any,input:any){const bank=clean(input?.bankName,40),holder=clean(input?.holder,40),number=clean(input?.accountNumber,40);
  if(!bank||bank.length>20||!holder||holder.length>20||!/^[0-9-]{6,30}$/.test(number))reject(400,'INVALID_BANK_ACCOUNT','은행·계좌번호(숫자와 -)·예금주를 확인해 주세요.');
  if(typeof input?.enabled!=='boolean')reject(400,'INVALID_BANK_ACCOUNT','무통장입금 사용 여부를 선택해 주세요.');
  const data={bank_name:bank,account_number:number,holder,enabled:input.enabled,updated_by:admin.user_sub};
  await this.db.$transaction(async(tx:any)=>{await tx.bankTransferAccount.upsert({where:{id:'default'},create:{id:'default',...data},update:data});await appendAudit(tx,{category:'finance',action:'bank_transfer.account_saved',entityId:'default',data:{bankName:bank,account:mask(number.replace(/-/g,'')),enabled:input.enabled}});});
  return this.adminAccount();
 }
 async list(query:any){const status=['awaiting','confirmed','expired','cancelled'].includes(query?.status)?query.status:undefined,page=Math.max(1,Math.min(10000,Number(query?.page)||1));const where={...(status?{status}:{})};
  const [rows,total]=await Promise.all([this.db.bankTransferPayment.findMany({where,orderBy:[{created_at:'desc'},{id:'desc'}],take:30,skip:(page-1)*30}),this.db.bankTransferPayment.count({where})]);
  return{items:rows.map((row:any)=>({...this.view(row),memberId:row.member_id,receivedAt:row.received_at,depositReference:row.deposit_reference,confirmedBy:row.confirmed_by,cancelReason:row.cancel_reason,cashReceiptIssuedAt:row.cash_receipt_issued_at,cashReceiptReference:row.cash_receipt_reference,createdAt:row.created_at})),total,page};}
 /** Confirms one deposit whose amount matches exactly and fulfils the order in the same transaction. */
 async confirm(admin:any,id:string,input:any){const reference=text(input?.reference,191),receivedAt=new Date(input?.receivedAt);
  if(!Number.isFinite(receivedAt.getTime())||receivedAt>new Date(Date.now()+60000))reject(400,'INVALID_DEPOSIT','실제 입금 시각을 확인해 주세요.');
  const first=await this.db.bankTransferPayment.findUnique({where:{id}});if(!first)reject(404,'BANK_TRANSFER_NOT_FOUND','입금 대기 주문이 없습니다.');
  if(input?.amount!==first.amount)reject(400,'DEPOSIT_AMOUNT_MISMATCH','입금액이 주문 금액과 같을 때만 확인할 수 있어요. 다르면 구매자와 확인해 처리해 주세요.');
  if(receivedAt<new Date(first.created_at.getTime()-60000))reject(400,'INVALID_DEPOSIT','주문 전 입금은 확인할 수 없어요.');
  const handler=this.handler(first.kind);
  await this.db.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT id FROM bank_transfer_payments WHERE id=${id} FOR UPDATE`;const row=await tx.bankTransferPayment.findUniqueOrThrow({where:{id}});
   if(row.status==='confirmed')return;if(row.status!=='awaiting')reject(409,'BANK_TRANSFER_CLOSED','기한이 지났거나 취소된 주문이에요. 구매자에게 새 주문을 요청하거나 입금액을 돌려주세요.');
   await handler.confirm(tx,row.order_id,receivedAt);
   await tx.bankTransferPayment.update({where:{id},data:{status:'confirmed',received_at:receivedAt,deposit_reference:reference,confirmed_at:new Date(),confirmed_by:admin.user_sub}});
   await appendAudit(tx,{category:'finance',action:'bank_transfer.confirmed',entityId:id,data:{kind:row.kind,orderId:row.order_id,amount:row.amount,reference}});
  },{timeout:20000});
  return this.view(await this.db.bankTransferPayment.findUnique({where:{id}}));}
 /** Cancels an order still waiting for its deposit (operator) or one whose 24 hours passed (tick). */
 async cancel(id:string,reason:string,status:'cancelled'|'expired',admin?:any){const row=await this.db.bankTransferPayment.findUnique({where:{id}});if(!row)reject(404,'BANK_TRANSFER_NOT_FOUND','입금 대기 주문이 없습니다.');if(row.status!=='awaiting')return this.view(row);
  const changed=await this.db.bankTransferPayment.updateMany({where:{id,status:'awaiting'},data:{status,cancel_reason:reason.slice(0,200)}});if(!changed.count)return this.view(await this.db.bankTransferPayment.findUnique({where:{id}}));
  await this.handler(row.kind).cancel(row.order_id,reason);
  await appendAudit(this.db,{category:'finance',action:`bank_transfer.${status}`,entityId:id,data:{kind:row.kind,orderId:row.order_id,amount:row.amount,actor:admin?.user_sub||'system'}});
  if(status==='expired')await this.db.$transaction(async(tx:any)=>enqueueOperation(tx,'bank_transfer.expired',{targetId:id,kind:row.kind,amount:row.amount},`bank-transfer-expired:${id}`));
  return this.view(await this.db.bankTransferPayment.findUnique({where:{id}}));}
 async adminCancel(admin:any,id:string,input:any){return this.cancel(id,text(input?.reason,200),'cancelled',admin);}
 /** Alerts once per order when 6 hours or less remain and the deposit is still unconfirmed (dedupe key per order). */
 async remind(now=new Date()){const rows=await this.db.bankTransferPayment.findMany({where:{status:'awaiting',expires_at:{gt:now,lte:new Date(now.getTime()+BANK_TRANSFER_REMIND_HOURS*3600000)}},orderBy:{expires_at:'asc'},take:100});
  for(const row of rows)await this.db.$transaction(async(tx:any)=>enqueueOperation(tx,'bank_transfer.expiring',{targetId:row.id,kind:row.kind,amount:row.amount,dueAt:row.expires_at.toISOString()},`bank-transfer-expiring:${row.id}`));return rows.length;}
 async expire(now=new Date()){const rows=await this.db.bankTransferPayment.findMany({where:{status:'awaiting',expires_at:{lt:now}},orderBy:{expires_at:'asc'},take:50});let count=0;for(const row of rows){try{await this.cancel(row.id,'입금 기한 24시간 경과','expired');count++;}catch{/* next tick retries */}}return count;}
 async revealCashReceipt(admin:any,id:string){const row=await this.db.bankTransferPayment.findUnique({where:{id}});if(!row?.cash_receipt_number_encrypted)reject(404,'CASH_RECEIPT_NOT_REQUESTED','현금영수증 신청이 없는 주문이에요.');await appendAudit(this.db,{category:'security',action:'bank_transfer.cash_receipt_revealed',entityId:id,data:{actor:admin.user_sub}});return{type:row.cash_receipt_type,number:this.provider.decrypt(row.cash_receipt_number_encrypted)};}
 async recordCashReceipt(admin:any,id:string,input:any){const reference=text(input?.reference,191),issuedAt=new Date(input?.issuedAt);if(!Number.isFinite(issuedAt.getTime())||issuedAt>new Date(Date.now()+60000))reject(400,'INVALID_CASH_RECEIPT','발급 시각을 확인해 주세요.');
  const row=await this.db.bankTransferPayment.findUnique({where:{id}});if(!row?.cash_receipt_type)reject(404,'CASH_RECEIPT_NOT_REQUESTED','현금영수증 신청이 없는 주문이에요.');if(row.status!=='confirmed')reject(409,'DEPOSIT_NOT_CONFIRMED','입금 확인 후 발급을 기록해 주세요.');
  await this.db.bankTransferPayment.update({where:{id},data:{cash_receipt_issued_at:issuedAt,cash_receipt_reference:reference}});await appendAudit(this.db,{category:'finance',action:'bank_transfer.cash_receipt_issued',entityId:id,data:{reference}});return this.view(await this.db.bankTransferPayment.findUnique({where:{id}}));}
 async refunds(query:any){const status=['requested','completed','rejected'].includes(query?.status)?query.status:undefined;const rows=await this.db.manualRefund.findMany({where:status?{status}:{},orderBy:[{status:'asc'},{due_at:'asc'}],take:100});return rows.map((row:any)=>this.refundView(row));}
 async revealRefundAccount(admin:any,id:string){const row=await this.db.manualRefund.findUnique({where:{id}});if(!row)reject(404,'MANUAL_REFUND_NOT_FOUND','환불 요청이 없습니다.');await appendAudit(this.db,{category:'security',action:'manual_refund.account_revealed',entityId:id,data:{actor:admin.user_sub}});return{bankName:row.bank_name,accountNumber:this.provider.decrypt(row.account_encrypted),holder:this.provider.decrypt(row.holder_encrypted)};}
 async completeRefund(admin:any,id:string,input:any){const reference=text(input?.reference,191),at=new Date(input?.transferredAt);if(!Number.isFinite(at.getTime())||at>new Date(Date.now()+60000))reject(400,'INVALID_TRANSFER','이체 시각을 확인해 주세요.');
  const first=await this.db.manualRefund.findUnique({where:{id}});if(!first)reject(404,'MANUAL_REFUND_NOT_FOUND','환불 요청이 없습니다.');const handler=this.handler(first.kind);
  if(first.status==='completed')return this.refundView(first);if(first.status!=='requested')reject(409,'MANUAL_REFUND_CLOSED','이미 반려된 환불이에요.');
  // The product refund finishes first (idempotent); a crash before the row below is marked completed is repaired by clicking again.
  await handler.refunded(first.refund_id,first.order_id);
  const changed=await this.db.manualRefund.updateMany({where:{id,status:'requested'},data:{status:'completed',completed_at:at,transfer_reference:reference,actor_id:admin.user_sub}});
  if(changed.count)await appendAudit(this.db,{category:'finance',action:'manual_refund.completed',entityId:id,data:{kind:first.kind,orderId:first.order_id,amount:first.amount,reference}});
  return this.refundView(await this.db.manualRefund.findUnique({where:{id}}));}
 async rejectRefund(admin:any,id:string,input:any){const reason=text(input?.reason,200),row=await this.db.manualRefund.findUnique({where:{id}});if(!row)reject(404,'MANUAL_REFUND_NOT_FOUND','환불 요청이 없습니다.');if(row.status!=='requested')return this.refundView(row);
  const changed=await this.db.manualRefund.updateMany({where:{id,status:'requested'},data:{status:'rejected',reject_reason:reason,actor_id:admin.user_sub}});if(changed.count){await this.handler(row.kind).refundRejected(row.refund_id,row.order_id);await appendAudit(this.db,{category:'finance',action:'manual_refund.rejected',entityId:id,data:{kind:row.kind,orderId:row.order_id,reason}});}
  return this.refundView(await this.db.manualRefund.findUnique({where:{id}}));}
 /** Member-facing refund status of one order (latest manual refund). */
 async memberRefund(member:string,kind:BankTransferKind,orderId:string){return this.refundView(await this.db.manualRefund.findFirst({where:{kind,order_id:orderId,member_id:member},orderBy:{created_at:'desc'}}));}
}

