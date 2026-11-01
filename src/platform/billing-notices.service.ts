import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PrismaService} from '../prisma/prisma.service';
import {MemberMailService} from '../auth/local/member-mail.service';
import {renewalDeadline} from './billing-failures';

@Injectable()
export class BillingNoticesService {
 constructor(private db:PrismaService,private mail:MemberMailService,private config:ConfigService){}
 async deliver(){
  if(process.env.CREFANS_E2E==='true'&&!['127.0.0.1','localhost','::1','mailpit'].includes(this.config.get('SMTP_HOST')))return 0;
  const now=new Date(),rows=await this.db.billingNotice.findMany({where:{completed_at:null,retry_at:{lte:now},OR:[{locked_until:null},{locked_until:{lte:now}}]},orderBy:{created_at:'asc'},take:20});
  let sent=0,failed=0;
  for(const row of rows){
   const claimed=await this.db.billingNotice.updateMany({where:{id:row.id,completed_at:null,OR:[{locked_until:null},{locked_until:{lte:now}}]},data:{locked_until:new Date(Date.now()+120000),attempts:{increment:1}}});if(!claimed.count)continue;
   try{
    const [member,sub,order]=await Promise.all([this.db.member.findUnique({where:{id:row.member_id}}),this.db.subscription.findUnique({where:{id:row.subscription_id}}),row.order_id?this.db.checkoutOrder.findUnique({where:{id:row.order_id}}):null]);
    // Recovery/cancellation may happen while a queued email is waiting for SMTP.
    const stale=!member?.enabled||!member.email_verified||!sub||(row.kind==='payment-failed'?(!sub.auto_renew||!order||['paid','refunding','refunded','cancelled'].includes(order.status)):(sub.auto_renew||sub.ended_at>now));
    if(stale){await this.db.billingNotice.update({where:{id:row.id},data:{completed_at:new Date(),locked_until:null,outcome:'skipped'}});continue;}
    if(row.kind==='payment-failed'&&order.status!=='failed'){
     await this.db.billingNotice.update({where:{id:row.id},data:{locked_until:null,retry_at:new Date(Date.now()+60000),outcome:'deferred'}});continue;
    }
    const deadline=sub.next_billing_date?renewalDeadline(sub,Number(this.config.get('RENEWAL_MAX_RETRIES')),Number(this.config.get('RENEWAL_RETRY_HOURS'))):null;
    const rows:Array<[string,string]>=[['멤버십',String((sub.plan_snapshot as any)?.name||'멤버십')]];
    let note='자동 갱신이 종료되었습니다. 결제수단을 확인한 후 다시 가입해주세요.';
    if(row.kind==='payment-failed'){
     if(deadline)rows.push(['복구 기한',deadline.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' (한국시간)']);
     note=(order.failure_code!=='PAYMENT_FAILED'?'사용할 수 없는 카드로는 다시 청구하지 않습니다. 다른 카드를 등록하고 기본 결제수단으로 설정해주세요.':'기존 일정에 따라 다시 결제합니다. 결제수단의 한도와 잔액을 확인하거나 다른 카드를 기본으로 설정해주세요.')+' 복구 기한 내 기본 카드를 변경하면 미결제 갱신을 다시 시도합니다. 기한이 지나면 자동 갱신이 종료됩니다. 결제한 이용기간 이후에는 콘텐츠를 볼 수 없습니다. 원하지 않으면 내 구독에서 갱신을 해지할 수 있습니다.';
    }
    const origin=new URL(this.config.get('PUBLIC_API_ORIGIN')||'https://crefans.com').origin;
    await this.mail.sendNotice(member.email,row.kind as 'payment-failed'|'renewal-stopped',rows,origin+'/service/'+(row.kind==='payment-failed'?'payment-methods':'subscriptions'),note,row.id);
    await this.db.billingNotice.update({where:{id:row.id},data:{completed_at:new Date(),locked_until:null,outcome:'accepted'}});sent++;
   }catch{
    failed++;await this.db.billingNotice.update({where:{id:row.id},data:{locked_until:null,outcome:'failed',retry_at:new Date(Date.now()+Math.min(86400000,60000*2**Math.min(row.attempts,10)))}});
   }
  }
  if(failed)throw new Error('Billing notice delivery failed');
  return sent;
 }
}
