import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {unlink} from 'fs/promises';
import {join,resolve} from 'path';
import {PlatformService} from './service';
import {PlatformFinanceService} from './finance.service';
import {dateOnly} from './http';
@Injectable()
export class PlatformJobsService {
 constructor(private service:PlatformService,private finance:PlatformFinanceService,private config:ConfigService){}
 get db(){return this.service.db;}
 async tick(now=new Date()){
  const failures:Record<string,number>={};
  const run=async(name:string,work:()=>Promise<unknown>)=>{try{await work();}catch{failures[name]=(failures[name]||0)+1;}};
  await run('scheduled-publication',async()=>{const active=await this.db.creator.findMany({where:{is_active:true},select:{user_id:true}});const posts=await this.db.posting.findMany({where:{user_sub:{in:active.map(c=>c.user_id)},status:'DRAFT',is_deleted:false,scheduled_at:{lte:now}},select:{id:true}});for(const p of posts){await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM postings WHERE id=${p.id} FOR UPDATE`;const current=await tx.posting.findUniqueOrThrow({where:{id:p.id}});if(current.status!=='DRAFT'||current.is_deleted||!current.scheduled_at||current.scheduled_at>now)return;const published=await tx.posting.update({where:{id:p.id},data:{status:'PUBLISHED',published_at:now,scheduled_at:null}});await this.service.notifyPost(published,tx);});}});
  await run('sessions',async()=>{await this.db.memberSession.deleteMany({where:{expires_at:{lt:now}}});await this.db.authRateBucket.deleteMany({where:{expires_at:{lt:now}}});});
  await run('billing-registration-and-revocation',()=>this.finance.retryBilling());
  const renewals=await this.db.subscription.findMany({where:{auto_renew:true,status:'ONGOING',next_billing_date:{lte:now}},select:{id:true},orderBy:{updated_at:'asc'},take:50});for(const s of renewals)await run('renewal',async()=>{try{await this.finance.renew(s.id);}finally{await this.db.subscription.update({where:{id:s.id},data:{updated_at:now}});}});
  const uncertain=await this.db.checkoutOrder.findMany({where:{status:'processing'},select:{id:true},orderBy:{updated_at:'asc'},take:50});for(const o of uncertain)await run('payment-reconciliation',async()=>{try{await this.finance.reconcile(o.id);}finally{await this.db.checkoutOrder.update({where:{id:o.id},data:{updated_at:now}});}});
  const refunds=await this.db.checkoutOrder.findMany({where:{status:'refunding'},select:{id:true,member_id:true},take:50});for(const r of refunds)await run('refund-reconciliation',()=>this.finance.refund(r.member_id,r.id));
  if(this.config.get('BANK_PAYOUTS_ENABLED')==='true'){const payouts=await this.db.withdrawalRequest.findMany({where:{status:{in:['requested','processing']}},select:{id:true},take:20});for(const p of payouts)await run('payout',()=>this.finance.payout(p.id));}
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour>=19)await run('media-cleanup',()=>this.cleanup(now));
  await this.db.subscription.updateMany({where:{auto_renew:false,status:'CANCELLED',ended_at:{lte:now}},data:{status:'EXPIRED'}});
  const note=JSON.stringify({failures}),id='worker-health';await this.db.platformJob.upsert({where:{id},create:{id,locked_until:now,completed_at:now,note},update:{completed_at:now,note}});return{failures};
 }
 async cleanup(now:Date){
  const id=`media-cleanup-${dateOnly(now)}`;
  await this.db.platformJob.upsert({where:{id},create:{id,locked_until:new Date(0)},update:{}});
  const claim=await this.db.platformJob.updateMany({where:{id,completed_at:null,locked_until:{lt:now}},data:{locked_until:new Date(now.getTime()+3600000)}});if(!claim.count)return;
  let candidates=0,cursor:string|undefined;const grace=Number(this.config.get('MEDIA_ORPHAN_GRACE_DAYS')),enabled=this.config.get('MEDIA_DELETE_ENABLED')==='true';
  if(Number.isInteger(grace)&&grace>=7){while(true){
   const medias=await this.db.media.findMany({where:{s3_upload_key:{startsWith:'local/'},created_at:{lt:new Date(now.getTime()-grace*86400000)}},orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{}),take:500});if(!medias.length)break;cursor=medias[medias.length-1].id;
   for(const media of medias){const removable=await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM medias WHERE id=${media.id} FOR UPDATE`;const current=await tx.media.findUniqueOrThrow({where:{id:media.id}});if(current.is_deleted)return true;
    const referenced=await tx.postingMedia.count({where:{media_id:media.id,is_deleted:false}})||await tx.membershipVersion.count({where:{snapshot:{path:'$.image',equals:media.original_url}}})||await tx.membershipItem.count({where:{image:media.original_url}})||await tx.creator.count({where:{OR:[{avatar:media.original_url},{cover:media.original_url}]}})||await tx.member.count({where:{picture:media.original_url}});
    if(referenced)return false;candidates++;if(enabled)await tx.media.update({where:{id:media.id},data:{is_deleted:true,deleted_at:now}});return enabled;
   });
   if(removable&&enabled){try{await unlink(join(resolve(this.config.get('MEDIA_ROOT')||'.local/media'),media.file_name));}catch(e:any){if(e.code!=='ENOENT')throw e;}}
   }
  }}
  await this.db.platformJob.update({where:{id},data:{completed_at:now,note:`candidates=${candidates}; deletion=${enabled}; graceDays=${grace||'unset'}`}});
 }
}
