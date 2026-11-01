// Member suspension state, shared by login/session checks and the moderation console.
export const SUSPENSION_DAYS=[7,30] as const;
export function suspension(member:any,now=new Date()){
 if(!member?.suspended_at)return null;
 if(member.suspended_until&&member.suspended_until<=now)return null;
 return{until:member.suspended_until as Date|null,reason:member.suspension_reason as string|null};
}
export function suspendedMessage(s:{until:Date|null}){
 const until=s.until?`${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(s.until)}까지`:'운영자가 해제할 때까지';
 return `이용이 제한된 계정입니다(${until}). 문의: khpark@crefans.com`;
}
