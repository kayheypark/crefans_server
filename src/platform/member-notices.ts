import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PrismaService} from '../prisma/prisma.service';
import {MemberMailService} from '../auth/local/member-mail.service';

// In-app notice plus a queued mail for things a member must hear about outside billing:
// operator actions (D11, with the public reason) and bean expiry (D6, 30 days ahead; 30-day event beans 7 days ahead).
// 2026-11-06 user decision: membership cancel/end/refund also reach the member in the app and by mail (kinds below).
// 2026-11-07 user decision: membership payment success (first payment and renewal) also reaches the member by mail (payment-completed).
export type MemberNoticeKind='moderation'|'bean-expiry'|'event-bean-expiry'|'subscription-cancelled'|'subscription-ended'|'refund-completed'|'payment-completed'|'withdrawal-pin-changed'|'withdrawal-pin-locked'|'password-changed';
const labels:Record<MemberNoticeKind,string>={moderation:'운영 안내','bean-expiry':'콩','event-bean-expiry':'콩','subscription-cancelled':'멤버십','subscription-ended':'멤버십','refund-completed':'멤버십','payment-completed':'멤버십','withdrawal-pin-changed':'출금 보안','withdrawal-pin-locked':'출금 보안','password-changed':'계정 보안'};
// Membership notices are stored as the existing 'subscription' notification type so they sit in the 멤버십 tab.
// Withdrawal PIN notices (2026-11-11) sit with the other payout notices under the existing 'settlement' type.
const notificationType=(kind:MemberNoticeKind)=>labels[kind]==='멤버십'?'subscription':labels[kind]==='출금 보안'?'settlement':kind;
export async function notifyMember(tx:any,input:{dedupeKey:string;memberId:string;kind:MemberNoticeKind;text:string;path:string;rows:Array<[string,string]>;note:string;actorId?:string}){
 if(await tx.memberNotice.findUnique({where:{dedupe_key:input.dedupeKey}}))return;
 await tx.memberNotification.create({data:{member_id:input.memberId,actor_id:input.actorId||null,type:notificationType(input.kind),text:input.text,path:input.path}});
 await tx.memberNotice.create({data:{dedupe_key:input.dedupeKey,member_id:input.memberId,kind:input.kind,rows:input.rows,path:input.path,note:input.note}});
}
export const memberNoticeLabels=labels;
// Welcome mail (user decision 2026-11-18, informational version only): one row per member, written inside the signup
// transaction so a rolled-back signup leaves nothing and a repeated call adds nothing (dedupe key). Earlier members get no row
// (no backfill). WELCOME_MAIL_ENABLED stays off until the front serving /brand/mail/ images is deployed; while it is off no row
// is queued, and a queued row is closed as 'disabled' instead of sent. A failed send retries with the usual backoff, at most
// WELCOME_MAX_ATTEMPTS times and only within WELCOME_TTL_MS of signup, then closes as 'expired'. Signup never waits for SMTP.
export const WELCOME_MAX_ATTEMPTS=5,WELCOME_TTL_MS=72*3600000;
export const welcomeKey=(memberId:string)=>`welcome:v1:${memberId}`;
export const welcomeMailEnabled=(config:ConfigService)=>config.get('WELCOME_MAIL_ENABLED')==='true';
export async function enqueueWelcome(tx:any,memberId:string){
 await tx.memberNotice.createMany({data:[{dedupe_key:welcomeKey(memberId),member_id:memberId,kind:'welcome',rows:[],path:'/landing-ai-image-generation',note:''}],skipDuplicates:true});
}
const joinedDay=(d:Date)=>d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'});

@Injectable()
export class MemberNoticesService {
 constructor(private db:PrismaService,private mail:MemberMailService,private config:ConfigService){}
 async deliver(){
  if(process.env.CREFANS_E2E==='true'&&!['127.0.0.1','localhost','::1','mailpit'].includes(this.config.get('SMTP_HOST')))return 0;
  const now=new Date(),rows=await this.db.memberNotice.findMany({where:{completed_at:null,retry_at:{lte:now},OR:[{locked_until:null},{locked_until:{lte:now}}]},orderBy:{created_at:'asc'},take:20});
  let sent=0,failed=0;
  for(const row of rows){
   const claimed=await this.db.memberNotice.updateMany({where:{id:row.id,completed_at:null,OR:[{locked_until:null},{locked_until:{lte:now}}]},data:{locked_until:new Date(Date.now()+120000),attempts:{increment:1}}});if(!claimed.count)continue;
   try{
    const welcome=row.kind==='welcome';
    if(welcome&&(!welcomeMailEnabled(this.config)||row.attempts>=WELCOME_MAX_ATTEMPTS||Date.now()-new Date(row.created_at).getTime()>WELCOME_TTL_MS)){await this.db.memberNotice.update({where:{id:row.id},data:{completed_at:new Date(),locked_until:null,outcome:welcomeMailEnabled(this.config)?'expired':'disabled'}});continue;}
    // A suspended member still gets the notice (it explains the restriction); a withdrawn or unverified address does not.
    const member=await this.db.member.findUnique({where:{id:row.member_id}});
    if(!member?.email_verified||member.withdrawn_at){await this.db.memberNotice.update({where:{id:row.id},data:{completed_at:new Date(),locked_until:null,outcome:'skipped'}});continue;}
    const origin=new URL(this.config.get('PUBLIC_API_ORIGIN')||'https://crefans.com').origin;
    if(welcome)await this.mail.sendWelcome(member.email,{nickname:member.nickname,joinedAt:joinedDay(member.created_at)},origin+'/service'+row.path,row.id);
    else await this.mail.sendNotice(member.email,row.kind as MemberNoticeKind,row.rows as Array<[string,string]>,origin+'/service'+row.path,row.note,row.id);
    await this.db.memberNotice.update({where:{id:row.id},data:{completed_at:new Date(),locked_until:null,outcome:'accepted'}});sent++;
   }catch{
    failed++;await this.db.memberNotice.update({where:{id:row.id},data:{locked_until:null,outcome:'failed',retry_at:new Date(Date.now()+Math.min(86400000,60000*2**Math.min(row.attempts,10)))}});
   }
  }
  if(failed)throw new Error('Member notice delivery failed');
  return sent;
 }
}
