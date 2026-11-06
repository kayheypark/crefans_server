import {notifyMember} from './member-notices';

// 2026-11-06 user decision: a member hears about every membership cancel, end and refund in the 알림 center and by mail;
// the creator hears only about refunds (they change settlement). Each notice is sent once per dedupe key.
const won=(n:number)=>`${Number(n).toLocaleString('ko-KR')}원`;
const day=(d:Date|null|undefined)=>d?d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'-';
const at=(d:Date)=>d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
async function plan(tx:any,planId:string){
 const p=await tx.membershipItem.findUnique({where:{id:planId},select:{name:true,creator_id:true}});
 const c=p?await tx.creator.findUnique({where:{user_id:p.creator_id},select:{display_name:true}}):null;
 return{name:p?.name||'멤버십',creatorId:p?.creator_id as string|undefined,creator:c?.display_name||'크리에이터'};
}

// Auto-renewal turned off while access continues to endedAt: the member's own cancel, or a plan/creator that stopped selling.
export async function noticeCancelReserved(tx:any,sub:{id:string;subscriber_id:string;membership_item_id:string;ended_at:Date|null},cause:'member'|'unavailable'){
 const p=await plan(tx,sub.membership_item_id),end=day(sub.ended_at);
 await notifyMember(tx,{dedupeKey:`subscription-cancelled:${sub.id}:${sub.ended_at?.toISOString()||'none'}`,memberId:sub.subscriber_id,actorId:p.creatorId,kind:'subscription-cancelled',
  text:cause==='member'?`${p.creator} 멤버십 해지가 예약되었습니다. ${end}까지 이용할 수 있습니다.`:`${p.creator} 멤버십 판매가 중지되어 자동 갱신이 종료되었습니다.`+(sub.ended_at&&sub.ended_at>new Date()?` ${end}까지 이용할 수 있습니다.`:''),
  path:'/subscriptions',rows:[['멤버십',p.name],['크리에이터',p.creator],['이용 종료일',end],['다음 결제','없음'],...(cause==='unavailable'?[['사유','크리에이터 멤버십 판매 중지'] as [string,string]]:[])],
  note:cause==='member'?'이용 종료일 전에는 내 구독에서 해지를 취소할 수 있습니다.':'이미 결제한 이용 기간은 그대로 이용할 수 있습니다. 궁금한 점은 고객센터로 문의해 주세요.'});
}

// Access cut now by an operator without a refund (console 즉시 해지). The internal reason is not shown to the member.
export async function noticeEndedByOperator(tx:any,sub:{id:string;subscriber_id:string;membership_item_id:string},endedAt:Date){
 const p=await plan(tx,sub.membership_item_id);
 await notifyMember(tx,{dedupeKey:`subscription-ended:${sub.id}`,memberId:sub.subscriber_id,actorId:p.creatorId,kind:'subscription-ended',
  text:`${p.creator} 멤버십 이용이 운영자 조치로 종료되었습니다.`,path:'/subscriptions',
  rows:[['멤버십',p.name],['크리에이터',p.creator],['종료 시각',at(endedAt)]],note:'종료 사유나 환불이 궁금하시면 고객센터로 문의해 주세요.'});
}

// A paid membership order fully refunded: by the member (7-day), by an operator, or cancelled at the payment provider.
export async function noticeRefunded(tx:any,order:{id:string;member_id:string;membership_id:string;amount:number},source:'member'|'admin'|'provider',subscriptionEnded:boolean){
 const p=await plan(tx,order.membership_id),amount=won(order.amount),now=new Date();
 await notifyMember(tx,{dedupeKey:`refund-completed:${order.id}`,memberId:order.member_id,actorId:p.creatorId,kind:'refund-completed',
  text:source==='provider'?`${p.creator} 멤버십 결제 ${amount}이 결제사에서 취소되었습니다.`:`${p.creator} 멤버십 결제 ${amount} 환불이 완료되었습니다.`,path:'/subscriptions',
  rows:[['멤버십',p.name],['크리에이터',p.creator],['환불 금액',amount],['처리 시각',at(now)],...(subscriptionEnded?[['구독','즉시 종료'] as [string,string]]:[])],
  note:'카드사에 따라 결제수단에 환불이 반영되기까지 며칠이 걸릴 수 있습니다.'});
 if(p.creatorId)await tx.memberNotification.create({data:{member_id:p.creatorId,type:'settlement',text:`구독자 결제 1건(${amount})이 환불되어 해당 수익이 정산에서 제외되었습니다.`,path:'/studio/settlements'}});
}
