import {PrismaService} from '../prisma/prisma.service';
import {appendAudit,auditChange} from './audit';
import {reject} from './http';

export function foundingBadgeVisible(member:any):boolean{
 return !!(member?.enabled&&!member.withdrawn_at&&member.founding_badge_claimed_at&&member.founding_badge_visible);
}
async function activeMember(db:any,id:string){
 const member=await db.member.findUnique({where:{id}});
 if(!member?.enabled||member.withdrawn_at||!member.email_verified||member.suspended_at&&(!member.suspended_until||member.suspended_until>new Date()))reject(403,'MEMBER_INACTIVE','이 계정으로 혜택을 받을 수 없습니다.');
 return member;
}
export async function foundingBadgeStatus(db:any,id:string){
 const member=await activeMember(db,id);
 if(member.founding_badge_claimed_at)return{status:'claimed' as const,claimedAt:member.founding_badge_claimed_at.toISOString(),visible:member.founding_badge_visible};
 return{status:'available' as const,claimedAt:null,visible:false};
}
export async function claimFoundingBadge(db:PrismaService,id:string,input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)reject(400,'INVALID_EVENT_CLAIM','받기 요청을 확인해주세요.');
 const previous=await foundingBadgeStatus(db,id);
 if(previous.status!=='available')return previous;
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM members WHERE id=${id} FOR UPDATE`;
  const current=await foundingBadgeStatus(tx,id);
  if(current.status!=='available')return current;
  await tx.member.update({where:{id},data:{founding_badge_claimed_at:new Date(),founding_badge_visible:true}});
  await appendAudit(tx,{category:'business',action:'event.founding_badge_claimed',entityId:id});
  return foundingBadgeStatus(tx,id);
 },{isolationLevel:'ReadCommitted',timeout:20000});
}
export async function setFoundingBadgeVisibility(db:PrismaService,id:string,input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.visible!=='boolean')reject(400,'INVALID_INPUT','표시 여부를 확인해주세요.');
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM members WHERE id=${id} FOR UPDATE`;
  const member=await activeMember(tx,id);
  if(!member.founding_badge_claimed_at)reject(409,'BADGE_NOT_CLAIMED','배지를 먼저 받아주세요.');
  if(member.founding_badge_visible!==input.visible){
   await tx.member.update({where:{id},data:{founding_badge_visible:input.visible}});
   await appendAudit(tx,{category:'business',action:'event.founding_badge_visibility',entityId:id,data:auditChange({visible:member.founding_badge_visible},{visible:input.visible})});
  }
  return foundingBadgeStatus(tx,id);
 });
}
