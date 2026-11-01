import {purgeWithdrawnMembers} from './member-purge';
import {BeansService} from './beans.service';
import {MarketingService} from './marketing.service';
import {isBeta,payoutQueue,manualPayouts} from './beta-policy';
import {pruneAuditLogs} from './audit-retention';
import {randomUUID} from 'node:crypto';
import {requestContext} from './request-context';
import {Injectable,Optional} from '@nestjs/common';
import {BillingNoticesService} from './billing-notices.service';
import {MemberNoticesService} from './member-notices';
import {ConfigService} from '@nestjs/config';
import {unlink} from 'fs/promises';
import {join,resolve} from 'path';
import {PlatformService} from './service';
import {PlatformFinanceService} from './finance.service';
import {PlatformOperationsService} from './operations.service';
import {enqueueOperation} from './operations-events';
import {dateOnly} from './http';
import {PlatformMediaStorage,managedMediaKey} from './media-storage';
import {grantDueReferralRewards} from './referrals';
// Card cancellations and chargebacks are normally raised within months; older orders need manual review.
const PAID_RECHECK_DAYS=120;
@Injectable()
export class PlatformJobsService {
 constructor(private service:PlatformService,private finance:PlatformFinanceService,private config:ConfigService,private operations?:PlatformOperationsService,@Optional() private billingNotices?:BillingNoticesService,@Optional() private mediaStorage?:PlatformMediaStorage,@Optional() private marketing?:MarketingService,@Optional() private beans?:BeansService,@Optional() private memberNotices?:MemberNoticesService){}
 get db(){return this.service.db;}
 async tick(now=new Date()){return requestContext.run({ip:'unknown',peerIp:'unknown',requestId:randomUUID(),jobId:randomUUID()},()=>this.tracedTick(now));}
 private async tracedTick(now:Date){
  const failures:Record<string,number>={},activity:Record<string,number>={};
  try{return await this.execute(now,failures,activity);}catch(error){failures['worker-tick']=(failures['worker-tick']||0)+1;throw error;}finally{await this.operations?.reportRun(now,failures,activity);}
 }
 private async execute(now:Date,failures:Record<string,number>,activity:Record<string,number>){
  const run=async(name:string,work:()=>Promise<unknown>)=>{try{const count=await work();if(typeof count==='number'&&count>0)activity[name]=(activity[name]||0)+count;}catch(error){failures[name]=(failures[name]||0)+1;await this.operations?.error('worker.error',error,{job:name});}};
  await run('scheduled-publication',async()=>{let count=0;const active=await this.db.creator.findMany({where:{is_active:true},select:{user_id:true}});const posts=await this.db.posting.findMany({where:{user_sub:{in:active.map(c=>c.user_id)},status:'DRAFT',is_deleted:false,...(isBeta(this.config)?{is_sensitive:false}:{}),scheduled_at:{lte:now}},select:{id:true}});for(const p of posts){await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM postings WHERE id=${p.id} FOR UPDATE`;const current=await tx.posting.findUniqueOrThrow({where:{id:p.id}});if(current.status!=='DRAFT'||current.is_deleted||!current.scheduled_at||current.scheduled_at>now)return;const published=await tx.posting.update({where:{id:p.id},data:{status:'PUBLISHED',published_at:now,scheduled_at:null}});await this.service.notifyPost(published,tx);await enqueueOperation(tx,'content.updated',{memberId:current.user_sub,creatorId:current.user_sub,postId:p.id,status:'PUBLISHED',previousStatus:'DRAFT'},`content.published:${p.id}`);count++;});}return count;});
  await run('audit-retention',()=>pruneAuditLogs(this.db,now));
  await run('sessions',async()=>{const sessions=await this.db.memberSession.deleteMany({where:{expires_at:{lt:now}}}),adminSessions=await this.db.adminSession.deleteMany({where:{expires_at:{lt:now}}}),buckets=await this.db.authRateBucket.deleteMany({where:{expires_at:{lt:now}}});return sessions.count+adminSessions.count+buckets.count;});
  await run('member-purge',()=>purgeWithdrawnMembers(this.db,now));
  await run('referral-rewards',()=>grantDueReferralRewards(this.db,this.config,now));
  await run('billing-registration-and-revocation',()=>this.finance.retryBilling());
  const renewals=await this.db.subscription.findMany({where:{auto_renew:true,status:'ONGOING',next_billing_date:{lte:now}},select:{id:true},orderBy:{updated_at:'asc'},take:50});for(const s of renewals)await run('renewal',async()=>{try{return await this.finance.renew(s.id);}finally{await this.db.subscription.update({where:{id:s.id},data:{updated_at:now}});}});
  const uncertain=await this.db.checkoutOrder.findMany({where:{status:'processing'},select:{id:true},orderBy:{updated_at:'asc'},take:50});for(const o of uncertain)await run('payment-reconciliation',async()=>{try{await this.finance.reconcile(o.id);return 1;}finally{await this.db.checkoutOrder.update({where:{id:o.id},data:{updated_at:now}});}});
  // Oldest-touched first and touched after each try, so a failing item never starves the ones behind it.
  const refunds=await this.db.checkoutOrder.findMany({where:{status:'refunding'},select:{id:true,member_id:true},orderBy:{updated_at:'asc'},take:50});for(const r of refunds)await run('refund-reconciliation',async()=>{try{await this.finance.refund(r.member_id,r.id);return 1;}finally{await this.db.checkoutOrder.updateMany({where:{id:r.id,status:'refunding'},data:{updated_at:now}});}});
  // Paid memberships are re-checked with the provider in rotation (10 per minute) to catch cancels made outside the service.
  const paid=await this.db.checkoutOrder.findMany({where:{status:'paid',payment_key:{not:null},paid_at:{gte:new Date(now.getTime()-PAID_RECHECK_DAYS*86400000)}},select:{id:true},orderBy:{updated_at:'asc'},take:10});for(const o of paid)await run('paid-reconciliation',async()=>{try{return await this.finance.reconcilePaid(o.id);}finally{await this.db.checkoutOrder.updateMany({where:{id:o.id,status:'paid'},data:{updated_at:now}});}});
  await run('billing-notices',async()=>this.billingNotices?.deliver());
  await run('marketing-mail',async()=>this.marketing?.deliver(now));
  await run('member-notices',async()=>this.memberNotices?.deliver());
  await run('bean-expiry',async()=>this.beans?.expireLots(now));
  await run('receivables',async()=>this.finance.settleReceivables());
  await run('beans-reconciliation',async()=>this.beans?.tick(async(job,error)=>{failures[job]=(failures[job]||0)+1;await this.operations?.error('worker.error',error,{job});}));
  if((this.config.get('BANK_PAYOUTS_ENABLED')==='true'&&!isBeta(this.config))||manualPayouts(this.config)){const payouts=await this.db.withdrawalRequest.findMany({where:payoutQueue(now),select:{id:true},orderBy:{updated_at:'asc'},take:20});for(const p of payouts)await run('payout',async()=>{try{await this.finance.payout(p.id,now);return 1;}finally{await this.db.withdrawalRequest.updateMany({where:{id:p.id,status:{in:['requested','processing']}},data:{updated_at:now}});}});}
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour>=19)await run('media-cleanup',()=>this.cleanup(now));
  const expired=await this.db.subscription.updateMany({where:{auto_renew:false,status:'CANCELLED',ended_at:{lte:now}},data:{status:'EXPIRED'}});if(expired.count)activity['subscription-expired']=expired.count;
  const note=JSON.stringify({failures}),id='worker-health';await this.db.platformJob.upsert({where:{id},create:{id,locked_until:now,completed_at:now,note},update:{completed_at:now,note}});return{failures};
 }
 async cleanup(now:Date){
  const id=`media-cleanup-${dateOnly(now)}`;
  await this.db.platformJob.upsert({where:{id},create:{id,locked_until:new Date(0)},update:{}});
  const claim=await this.db.platformJob.updateMany({where:{id,completed_at:null,locked_until:{lt:now}},data:{locked_until:new Date(now.getTime()+3600000)}});if(!claim.count)return;
  let candidates=0,deleted=0,cursor:string|undefined;const grace=Number(this.config.get('MEDIA_ORPHAN_GRACE_DAYS')),enabled=this.config.get('MEDIA_DELETE_ENABLED')==='true';
  if(Number.isInteger(grace)&&grace>=7){while(true){
   const medias=await this.db.media.findMany({where:{OR:[{s3_upload_key:{startsWith:'local/'}},{s3_upload_key:{startsWith:'platform/'}}],created_at:{lt:new Date(now.getTime()-grace*86400000)}},orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{}),take:500});if(!medias.length)break;cursor=medias[medias.length-1].id;
   for(const media of medias){const removable=await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM medias WHERE id=${media.id} FOR UPDATE`;const current=await tx.media.findUniqueOrThrow({where:{id:media.id}});if(current.is_deleted)return true;
    const referenced=await tx.mediaWatermarkJob.count({where:{OR:[{source_id:media.id},{target_id:media.id}],status:{in:['pending','processing','failed']}}})||await tx.postingMedia.count({where:{media_id:media.id,is_deleted:false}})||await tx.membershipVersion.count({where:{snapshot:{path:'$.image',equals:media.original_url}}})||await tx.membershipItem.count({where:{image:media.original_url}})||await tx.creator.count({where:{OR:[{avatar:media.original_url},{cover:media.original_url}]}})||await tx.member.count({where:{picture:media.original_url}})||await tx.userProfile.count({where:{cover:media.original_url}});
    if(referenced)return false;candidates++;if(enabled)await tx.media.update({where:{id:media.id},data:{is_deleted:true,deleted_at:now}});return enabled;
   });
   if(removable&&enabled){if(managedMediaKey(media.s3_upload_key)){if(!this.mediaStorage)throw Error('Media storage provider unavailable');await this.mediaStorage.remove(media.s3_upload_key);deleted++;}else{try{await unlink(join(resolve(this.config.get('MEDIA_ROOT')||'.local/media'),media.file_name));deleted++;}catch(e:any){if(e.code!=='ENOENT')throw e;}}}
   }
  }}
  await this.db.platformJob.update({where:{id},data:{completed_at:now,note:`candidates=${candidates}; deletion=${enabled}; graceDays=${grace||'unset'}`}});return deleted;
 }
}
