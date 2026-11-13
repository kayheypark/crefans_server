// Storable AI photo reset tickets (2026-11-13 user decisions): operators grant N tickets to an allow-listed creator with a reason;
// each batch expires 30 days after granting. The creator spends one at any time (no daily cap) to clear today's usage, as long as
// something was used today. The oldest-expiring batch is used first. The service-wide daily cap (ai-photo:total) still applies.
import {PrismaClient,Prisma} from '@prisma/client';
import {randomUUID} from 'crypto';
import {appendAudit,contentDigest} from './audit';
import {requirePermission} from './admin-permissions';
import {reject} from './http';
import {aiPhotoAllowed,aiPhotoUsageId,reasonOf,usedToday} from './ai-photo-grants';

export const AI_PHOTO_TICKET_DAYS=30,AI_PHOTO_TICKET_MAX_GRANT=100;
type Db=PrismaClient|Prisma.TransactionClient;
const valid=(creatorId:string|{in:string[]},now:Date)=>({creator_user_id:creatorId,remaining:{gt:0},revoked_at:null,expires_at:{gt:now}});

export async function ticketSummary(db:Db,creatorId:string,now=new Date()){
 const rows=await db.aiPhotoResetTicket.findMany({where:valid(creatorId,now),select:{remaining:true,expires_at:true},orderBy:{expires_at:'asc'}});
 return{count:rows.reduce((n,r)=>n+r.remaining,0),nextExpiresAt:rows[0]?.expires_at??null};
}
export async function ticketCounts(db:Db,creatorIds:string[],now=new Date()){
 if(!creatorIds.length)return new Map<string,number>();
 const rows=await db.aiPhotoResetTicket.groupBy({by:['creator_user_id'],where:valid({in:creatorIds},now),_sum:{remaining:true}});
 return new Map(rows.map(r=>[r.creator_user_id,r._sum.remaining??0]));
}
const status=(r:{remaining:number;revoked_at:Date|null;expires_at:Date},now:Date)=>r.revoked_at?'revoked':r.remaining<=0?'used':r.expires_at<=now?'expired':'active';

export async function listAiPhotoTickets(db:PrismaClient,admin:any,creatorId:string){
 requirePermission(admin,'members','view');const now=new Date();
 const rows=await db.aiPhotoResetTicket.findMany({where:{creator_user_id:creatorId},orderBy:{created_at:'desc'},take:50});
 const actorIds=[...new Set(rows.flatMap(r=>[r.granted_by,r.revoked_by]).filter((v):v is string=>!!v))];
 const actors=actorIds.length?await db.admin.findMany({where:{id:{in:actorIds}},select:{id:true,name:true}}):[];
 const nameOf=(id:string|null)=>id?(actors.find(a=>a.id===id)?.name||'삭제된 운영자'):null;
 return{summary:await ticketSummary(db,creatorId,now),days:AI_PHOTO_TICKET_DAYS,
  items:rows.map(r=>({id:r.id,quantity:r.quantity,remaining:r.remaining,status:status(r,now),reason:r.reason,grantedByName:nameOf(r.granted_by),createdAt:r.created_at,expiresAt:r.expires_at,revokedAt:r.revoked_at,revokedByName:nameOf(r.revoked_by),revokeReason:r.revoke_reason}))};
}

export async function grantAiPhotoTickets(db:PrismaClient,admin:any,creatorId:string,input:any){
 requirePermission(admin,'members','update');const reason=reasonOf(input?.reason),quantity=Number(input?.quantity);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>AI_PHOTO_TICKET_MAX_GRANT)reject(400,'INVALID_QUANTITY',`지급 수량은 1~${AI_PHOTO_TICKET_MAX_GRANT}장으로 입력해주세요.`);
 const now=new Date(),expiresAt=new Date(now.getTime()+AI_PHOTO_TICKET_DAYS*86400000);
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;
  if(!await tx.aiPhotoGrant.findUnique({where:{creator_user_id:creatorId}}))reject(404,'GRANT_NOT_FOUND','AI 사진 편집 허용 목록에 있는 크리에이터에게만 지급할 수 있습니다.');
  const t=await tx.aiPhotoResetTicket.create({data:{creator_user_id:creatorId,quantity,remaining:quantity,reason,granted_by:admin.id,expires_at:expiresAt,created_at:now}});
  await tx.aiPhotoGrantChange.create({data:{creator_user_id:creatorId,action:'ticket_granted',reason:`리셋권 ${quantity}장 지급: ${reason}`.slice(0,500),changed_by:admin.id}});
  await appendAudit(tx,{category:'admin',action:'admin.ai_photo_tickets_granted',entityId:creatorId,data:{changedBy:admin.id,count:quantity,targetId:t.id,after:{status:'active',contentHash:contentDigest(reason)}}});
 });
 return{message:`리셋권 ${quantity}장을 지급했습니다. ${AI_PHOTO_TICKET_DAYS}일 뒤 만료됩니다.`,expiresAt};
}

export async function revokeAiPhotoTickets(db:PrismaClient,admin:any,creatorId:string,ticketId:string,input:any){
 requirePermission(admin,'members','update');const reason=reasonOf(input?.reason),now=new Date();
 const count=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;// same lock as useAiPhotoTicket
  const t=await tx.aiPhotoResetTicket.findUnique({where:{id:ticketId}});
  if(!t||t.creator_user_id!==creatorId)reject(404,'TICKET_NOT_FOUND','리셋권 지급 내역을 찾을 수 없습니다.');
  if(status(t,now)!=='active')reject(409,'TICKET_NOT_ACTIVE','남은 리셋권이 없는 지급분입니다(사용 완료·만료·회수).');
  await tx.aiPhotoResetTicket.update({where:{id:t.id},data:{remaining:0,revoked_at:now,revoked_by:admin.id,revoke_reason:reason}});
  await tx.aiPhotoGrantChange.create({data:{creator_user_id:creatorId,action:'ticket_revoked',reason:`리셋권 ${t.remaining}장 회수: ${reason}`.slice(0,500),changed_by:admin.id}});
  await appendAudit(tx,{category:'admin',action:'admin.ai_photo_tickets_revoked',entityId:creatorId,data:{changedBy:admin.id,count:t.remaining,targetId:t.id,after:{status:'revoked',contentHash:contentDigest(reason)}}});
  return t.remaining;
 });
 return{message:`남은 리셋권 ${count}장을 회수했습니다.`};
}

/** Creator spends one ticket: today's usage goes back to 0. Locks the creator row so two taps spend at most one ticket. */
export async function useAiPhotoTicket(db:PrismaClient,creatorId:string){
 const now=new Date();
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;
  if(!await aiPhotoAllowed(tx,creatorId))reject(403,'AI_PHOTO_NOT_ALLOWED','AI 사진 편집을 사용할 수 없는 계정이에요.');
  const used=(await usedToday(tx,[creatorId])).get(creatorId)??0;
  if(used<=0)reject(409,'NOTHING_TO_RESET','오늘은 아직 사용한 횟수가 없어 리셋권을 쓸 필요가 없어요.');
  const t=await tx.aiPhotoResetTicket.findFirst({where:valid(creatorId,now),orderBy:[{expires_at:'asc'},{created_at:'asc'}]});
  if(!t)reject(409,'NO_TICKET','사용할 수 있는 리셋권이 없어요.');
  await tx.aiPhotoResetTicket.update({where:{id:t.id},data:{remaining:{decrement:1}}});
  await tx.authRateBucket.deleteMany({where:{id:aiPhotoUsageId(creatorId)}});
  await tx.aiPhotoResetTicketUse.create({data:{id:randomUUID(),ticket_id:t.id,creator_user_id:creatorId,used_before:used}});
  await tx.aiPhotoGrantChange.create({data:{creator_user_id:creatorId,action:'ticket_used',reason:`크리에이터가 리셋권 1장 사용(오늘 ${used}회 사용분 초기화)`,changed_by:null}});
  await appendAudit(tx,{category:'business',action:'studio.ai_photo_ticket_used',entityId:creatorId,data:{count:used,targetId:t.id}});
  return{usedBefore:used,tickets:await ticketSummary(tx,creatorId,now)};
 });
}
