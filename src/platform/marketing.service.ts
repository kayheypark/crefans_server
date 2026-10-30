import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {createHmac,timingSafeEqual} from 'crypto';
import {PrismaService} from '../prisma/prisma.service';
import {MemberMailService} from '../auth/local/member-mail.service';
import {LegalDocumentsService} from './legal-documents';
import {appendAudit} from './audit';
import {reject,text} from './http';

export async function recordMarketingChoice(tx:any,member:string,enabled:boolean,source:string,document:any,now=new Date()){
 const before=await tx.accountPreference.findUnique({where:{member_id:member}});
 if(before?.marketing_alert===enabled&&(!enabled||before.marketing_consent_id))return;
 const event=await tx.memberConsent.create({data:{member_id:member,kind:enabled?'marketing':'marketing-withdrawn',accepted_at:now,document_id:document?.version||null,document_snapshot:{source,enabled,...(enabled?{document}:{}),at:now.toISOString()}}});
 await tx.accountPreference.upsert({where:{member_id:member},create:{member_id:member,marketing_alert:enabled,marketing_consent_id:enabled?event.id:null},update:{marketing_alert:enabled,marketing_consent_id:enabled?event.id:null}});
 if(!enabled)await tx.marketingDelivery.updateMany({where:{member_id:member,kind:'campaign',status:'queued'},data:{status:'suppressed',completed_at:now}});
 await tx.marketingDelivery.create({data:{member_id:member,kind:'choice',dedupe_key:`choice:${event.id}`,subject:'광고 메일 수신 설정 처리 결과',body:`좋아하는일해야지(크레팬스)\n요청일: ${now.toISOString()}\n광고 메일 ${enabled?'수신 동의':'수신거부'}를 처리했습니다.`}});
 await appendAudit(tx,{category:'auth',action:'marketing.preference_changed',entityId:event.id,data:{memberId:member,source,before:{marketing_alert:before?.marketing_alert??false},after:{marketing_alert:enabled}}});
}
const twoYearsAfter=(value:Date)=>{const date=new Date(value);date.setUTCFullYear(date.getUTCFullYear()+2);return date;};
@Injectable()
export class MarketingService {
 constructor(private db:PrismaService,private mail:MemberMailService,private config:ConfigService,private legal:LegalDocumentsService){}
 private signature(value:string){const secret=this.config.get<string>('MARKETING_UNSUBSCRIBE_SECRET');if(!secret||secret.length<32)reject(503,'MARKETING_NOT_CONFIGURED','광고 수신 설정을 준비 중입니다.');return createHmac('sha256',secret).update(`unsubscribe:v1:${value}`).digest('base64url');}
 token(member:string){const value=Buffer.from(member).toString('base64url');return `${value}.${this.signature(value)}`;}
 memberFromToken(token:string){if(typeof token!=='string'||token.length>500)reject(400,'INVALID_UNSUBSCRIBE_LINK','수신거부 링크를 확인해주세요.');const [value,signature,...rest]=token.split('.');if(!value||!signature||rest.length)reject(400,'INVALID_UNSUBSCRIBE_LINK','수신거부 링크를 확인해주세요.');const expected=this.signature(value),a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))reject(400,'INVALID_UNSUBSCRIBE_LINK','수신거부 링크를 확인해주세요.');return Buffer.from(value,'base64url').toString();}
 private origin(){const url=new URL(this.config.get('MARKETING_PUBLIC_ORIGIN')||'https://beta.crefans.com');if(url.protocol!=='https:'||!['crefans.com','beta.crefans.com'].includes(url.hostname)||url.username||url.password||url.port)reject(503,'MARKETING_NOT_CONFIGURED','발송 주소 설정을 확인해주세요.');return url.origin;}
 async unsubscribe(token:string){const member=this.memberFromToken(token);await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;if(await tx.member.findUnique({where:{id:member}}))await recordMarketingChoice(tx,member,false,'email-unsubscribe',null);});return{message:'크레팬스 광고 메일 수신거부를 처리했습니다. 인증·보안·거래 안내는 별도로 제공됩니다.'};}
 async queue(admin:any,input:any){
  if(admin?.role!=='SUPER_ADMIN'||!admin.is_active)reject(403,'SUPER_ADMIN_REQUIRED','최고 관리자만 광고 발송을 등록할 수 있습니다.');
  this.legal.requirePublished();this.origin();this.signature('configuration-check');
  const id=text(input.campaignId,80),subject=text(input.subject,120),body=text(input.body,10000);
  if(!/^[a-zA-Z0-9_-]+$/.test(id)||!Array.isArray(input.memberIds)||!input.memberIds.length||input.memberIds.length>100||input.memberIds.some((v:any)=>typeof v!=='string'||v.length>191))reject(400,'INVALID_CAMPAIGN','캠페인과 수신 대상 식별자를 확인해주세요.');
  let queued=0,skipped=0;
  await this.db.$transaction(async tx=>{for(const member of [...new Set<string>(input.memberIds)].sort()){
   await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;
   const m=await tx.member.findUnique({where:{id:member}}),pref=await tx.accountPreference.findUnique({where:{member_id:member}});
   if(!m?.enabled||!m.email_verified||!pref?.marketing_alert||!pref.marketing_consent_id){skipped++;continue;}
   const key=`campaign:${id}:${member}`,prior=await tx.marketingDelivery.findUnique({where:{dedupe_key:key}});
   if(prior){if(prior.subject!==subject||prior.body!==body)reject(409,'CAMPAIGN_CONFLICT','같은 캠페인의 내용이 다릅니다.');skipped++;continue;}
   await tx.marketingDelivery.create({data:{member_id:member,kind:'campaign',dedupe_key:key,consent_id:pref.marketing_consent_id,subject,body}});queued++;
  }await appendAudit(tx,{category:'admin',action:'marketing.queued',entityId:id,data:{queued,skipped,changedBy:admin.user_sub}});});return{queued,skipped,message:'동의한 대상의 광고 메일을 발송 대기열에 등록했습니다.'};
 }
 async deliver(now=new Date()){
  if(this.config.get('MARKETING_MAIL_ENABLED')!=='true')return 0;
  this.legal.requirePublished();this.origin();this.signature('configuration-check');
  const interrupted=await this.db.marketingDelivery.updateMany({where:{status:'sending',OR:[{started_at:{lt:new Date(now.getTime()-15*60000)}},{started_at:null}]},data:{status:'uncertain'}});
  if(interrupted.count)reject(503,'MARKETING_DELIVERY_UNCERTAIN','중단된 광고 메일 발송 결과를 확인해야 합니다. 자동 재발송하지 않습니다.');
  // Notify before the two-year deadline. Campaigns are held if a due notice was not accepted.
  const preferences=await this.db.accountPreference.findMany({where:{marketing_alert:true,marketing_consent_id:{not:null}}});
  for(const pref of preferences){const consent=await this.db.memberConsent.findUnique({where:{id:pref.marketing_consent_id}});if(!consent)continue;const last=await this.db.marketingDelivery.findFirst({where:{member_id:pref.member_id,kind:'reminder',consent_id:consent.id,status:'accepted'},orderBy:{completed_at:'desc'}}),base=last?.completed_at||consent.accepted_at;if(twoYearsAfter(base).getTime()>now.getTime()+7*86400000)continue;await this.db.marketingDelivery.upsert({where:{dedupe_key:`reminder:${consent.id}:${base.toISOString()}`},create:{member_id:pref.member_id,kind:'reminder',consent_id:consent.id,dedupe_key:`reminder:${consent.id}:${base.toISOString()}`,subject:'광고 메일 수신 동의 확인 안내',body:`좋아하는일해야지(크레팬스)\n동의일: ${consent.accepted_at.toISOString()}\n이벤트·프로모션 이메일 수신에 동의한 상태입니다. 아래 링크에서 무료로 수신거부할 수 있습니다. 별도 의사표시가 없으면 기존 동의를 유지합니다.`},update:{}});}
  // Consent notices and choice confirmations go first: campaigns held for a due notice must not fill the batch
  // and keep that notice from ever being sent.
  const notices=await this.db.marketingDelivery.findMany({where:{status:'queued',kind:{not:'campaign'}},orderBy:{created_at:'asc'},take:30});
  const rows=[...notices,...await this.db.marketingDelivery.findMany({where:{status:'queued',kind:'campaign'},orderBy:{created_at:'asc'},take:30-notices.length})];let sent=0;
  for(const row of rows){
   const claim=await this.db.marketingDelivery.updateMany({where:{id:row.id,status:'queued'},data:{status:'sending',started_at:new Date()}});if(!claim.count)continue;
   try{await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM members WHERE id=${row.member_id} FOR UPDATE`;
    const member=await tx.member.findUnique({where:{id:row.member_id}}),pref=await tx.accountPreference.findUnique({where:{member_id:row.member_id}});
    if(!member?.enabled||!member.email_verified||(row.kind!=='choice'&&(!pref?.marketing_alert||pref.marketing_consent_id!==row.consent_id))){await tx.marketingDelivery.updateMany({where:{id:row.id,status:'sending'},data:{status:'suppressed',completed_at:now}});return;}
    if(row.kind==='campaign'){const consent=await tx.memberConsent.findUnique({where:{id:row.consent_id}}),last=await tx.marketingDelivery.findFirst({where:{member_id:row.member_id,kind:'reminder',consent_id:row.consent_id,status:'accepted'},orderBy:{completed_at:'desc'}});if(!consent||twoYearsAfter(last?.completed_at||consent.accepted_at)<=now){await tx.marketingDelivery.update({where:{id:row.id},data:{status:'queued'}});return;}}
    // Member lock serializes last consent check with unsubscribe. No blind retry after SMTP uncertainty.
    const url=`${this.origin()}/api/v1/marketing/unsubscribe?token=${this.token(row.member_id)}`;
    await this.mail.sendMarketing(member.email,row.subject,row.body,url,row.kind==='campaign',row.id);
    await tx.marketingDelivery.update({where:{id:row.id},data:{status:'accepted',completed_at:new Date()}});sent++;
   },{timeout:45000});}catch(error){await this.db.marketingDelivery.updateMany({where:{id:row.id,status:{in:['queued','sending']}},data:{status:'uncertain'}});throw error;}
  }
  return sent;
 }
}
