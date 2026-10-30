import {Prisma} from '@prisma/client';
import {randomBytes} from 'crypto';
import {appendAudit} from './audit';

// Decision 2026-10-29: 30 days after withdrawal, delete the member's posts and personal data.
// Comments stay but show "탈퇴한 사용자"; orders, subscriptions, payouts and consents stay for legal retention (member ID only).
export const PURGE_GRACE_DAYS=30;
export const WITHDRAWN_NAME='탈퇴한 사용자';
export const INQUIRY_RETENTION_DAYS=3*365;
export async function purgeWithdrawnMembers(db:any,now=new Date()){
 const due=await db.member.findMany({where:{withdrawn_at:{lte:new Date(now.getTime()-PURGE_GRACE_DAYS*86400000)},purged_at:null,enabled:false},select:{id:true,email:true},take:50,orderBy:{withdrawn_at:'asc'}});
 for(const m of due)await db.$transaction((tx:any)=>purgeMember(tx,m.id,m.email,now));
 // Inquiries of purged members are consumer-dispute records: kept 3 years after purge (전자상거래법 시행령 제6조), then deleted.
 const expired=await db.member.findMany({where:{purged_at:{lte:new Date(now.getTime()-INQUIRY_RETENTION_DAYS*86400000)}},select:{id:true},take:200});
 if(expired.length)await db.supportTicket.deleteMany({where:{member_id:{in:expired.map((m:any)=>m.id)}}});
 return due.length;
}
// Also the console's immediate erase (SUPER_ADMIN, 2026-10-30): the same scope without the 30-day wait, so the email is free at once.
export async function purgeMember(tx:any,id:string,email:string,now=new Date()){
  await tx.posting.updateMany({where:{user_sub:id,is_deleted:false},data:{is_deleted:true,deleted_at:now}});
  await tx.creator.updateMany({where:{user_id:id},data:{display_name:WITHDRAWN_NAME,handle:null,bio:null,about:null,links:Prisma.DbNull,avatar:null,cover:null}});
  await tx.userProfile.deleteMany({where:{user_id:id}});
  await tx.settlementAccount.updateMany({where:{creator_id:id},data:{account_encrypted:null,holder_alias:'',verified:false}});
  await tx.withdrawalCredential.deleteMany({where:{creator_id:id}});
  // D8 (2026-10-30): the CI-derived duplicate-signup hash goes with the rest. Messages stay for the other person (the sender
  // now reads as 탈퇴한 사용자) and inquiries stay as dispute records for 3 years (/pilot-work 2026-10-30).
  for(const proof of await tx.identityProof.findMany({where:{member_id:id},select:{id:true}}))await tx.identityProof.update({where:{id:proof.id},data:{verified_name:null,identity_hash:randomBytes(32).toString('hex')}});
  await tx.signupChallenge.deleteMany({where:{email}});
  await tx.memberSession.deleteMany({where:{member_id:id}});
  await tx.member.update({where:{id},data:{email:`withdrawn-${id}@deleted.invalid`,name:'',nickname:WITHDRAWN_NAME,preferred_username:`withdrawn-${id}`,phone_number:'',picture:null,password_hash:null,identity_hash:null,cognito_username:null,purged_at:now}});
  await appendAudit(tx,{category:'admin',action:'member.purged',entityId:id,data:{memberId:id}});
}
