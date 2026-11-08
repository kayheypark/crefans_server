// Studio AI photo editor allow-list (2026-11-08). Operators grant or revoke per creator with a reason;
// the current list is ai_photo_grants, the full history ai_photo_grant_changes, and each change is audited in the same transaction.
import {PrismaClient,Prisma} from '@prisma/client';
import {adminPage} from './admin-console';
import {appendAudit,contentDigest} from './audit';
import {requirePermission} from './admin-permissions';
import {reject,text} from './http';

const reasonOf=(value:unknown)=>{const reason=typeof value==='string'?value.trim():'';if(reason.length<2||reason.length>500)reject(400,'INVALID_REASON','사유를 2~500자로 입력해주세요.');return reason;};
const handleOf=(value:unknown)=>{const handle=typeof value==='string'?value.trim().replace(/^@/,'').toLowerCase():'';if(!/^[a-z0-9_.]{2,30}$/.test(handle))reject(400,'INVALID_HANDLE','크리에이터 핸들을 확인해주세요.');return handle;};
async function names(db:PrismaClient,ids:(string|null)[]){const list=[...new Set(ids.filter((id):id is string=>!!id))];return list.length?db.admin.findMany({where:{id:{in:list}},select:{id:true,name:true}}):[];}
const nameOf=(actors:{id:string;name:string}[],id:string|null)=>id?(actors.find(a=>a.id===id)?.name||'삭제된 운영자'):null;

/** Whether a creator may use the AI photo editor. The studio feature must check this on every request. */
export async function aiPhotoAllowed(db:PrismaClient|Prisma.TransactionClient,creatorUserId:string){return !!await db.aiPhotoGrant.findUnique({where:{creator_user_id:creatorUserId}});}

export async function listAiPhotoGrants(db:PrismaClient,admin:any,query:any){
 requirePermission(admin,'members','view');
 const {page,size,skip}=adminPage(query),search=text(query.search??'',100,false).replace(/^@/,'');
 const matched=search?(await db.creator.findMany({where:{OR:[{handle:{contains:search.toLowerCase()}},{display_name:{contains:search}}]},select:{user_id:true},take:500})).map(c=>c.user_id):null;
 const where:Prisma.AiPhotoGrantWhereInput=matched?{OR:[{creator_user_id:{in:matched}},{reason:{contains:search}}]}:{};
 const [rows,total]=await Promise.all([db.aiPhotoGrant.findMany({where,skip,take:size,orderBy:{created_at:'desc'}}),db.aiPhotoGrant.count({where})]);
 const [creators,actors]=await Promise.all([db.creator.findMany({where:{user_id:{in:rows.map(r=>r.creator_user_id)}},select:{user_id:true,handle:true,display_name:true,is_active:true}}),names(db,rows.map(r=>r.granted_by))]);
 return{items:rows.map(r=>{const c=creators.find(x=>x.user_id===r.creator_user_id);return{creatorId:r.creator_user_id,handle:c?.handle??null,displayName:c?.display_name??null,creatorActive:c?.is_active??false,reason:r.reason,grantedBy:r.granted_by,grantedByName:nameOf(actors,r.granted_by),createdAt:r.created_at};}),total,page,pageSize:size};
}

export async function aiPhotoGrantHistory(db:PrismaClient,admin:any,creatorId:string,query:any){
 requirePermission(admin,'members','view');const {page,size,skip}=adminPage(query),where={creator_user_id:creatorId};
 const [rows,total]=await Promise.all([db.aiPhotoGrantChange.findMany({where,orderBy:{created_at:'desc'},skip,take:size}),db.aiPhotoGrantChange.count({where})]);
 const actors=await names(db,rows.map(r=>r.changed_by));
 return{items:rows.map(r=>({id:r.id,action:r.action,reason:r.reason,changedBy:r.changed_by,changedByName:nameOf(actors,r.changed_by),createdAt:r.created_at})),total,page,pageSize:size};
}

export async function grantAiPhoto(db:PrismaClient,admin:any,input:any){
 requirePermission(admin,'members','update');const handle=handleOf(input?.handle),reason=reasonOf(input?.reason);
 const creatorId=await db.$transaction(async tx=>{
  const creator=await tx.creator.findUnique({where:{handle},select:{user_id:true,is_active:true}});
  if(!creator||!creator.is_active)reject(404,'CREATOR_NOT_FOUND','활성 크리에이터를 찾을 수 없습니다. 핸들을 확인해주세요.');
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creator.user_id} FOR UPDATE`;
  if(await tx.aiPhotoGrant.findUnique({where:{creator_user_id:creator.user_id}}))reject(409,'ALREADY_GRANTED','이미 허용된 크리에이터입니다.');
  await tx.aiPhotoGrant.create({data:{creator_user_id:creator.user_id,reason,granted_by:admin.id}});
  await tx.aiPhotoGrantChange.create({data:{creator_user_id:creator.user_id,action:'granted',reason,changed_by:admin.id}});
  await appendAudit(tx,{category:'admin',action:'admin.ai_photo_granted',entityId:creator.user_id,data:{changedBy:admin.id,before:{status:'none'},after:{status:'granted',contentHash:contentDigest(reason)}}});
  return creator.user_id;
 });
 return{message:`@${handle}에게 AI 사진 편집을 허용했습니다.`,creatorId};
}

export async function revokeAiPhoto(db:PrismaClient,admin:any,creatorId:string,input:any){
 requirePermission(admin,'members','update');const reason=reasonOf(input?.reason);
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${creatorId} FOR UPDATE`;
  const before=await tx.aiPhotoGrant.findUnique({where:{creator_user_id:creatorId}});
  if(!before)reject(404,'GRANT_NOT_FOUND','허용 목록에 없는 크리에이터입니다. 목록을 새로 불러와주세요.');
  await tx.aiPhotoGrant.delete({where:{creator_user_id:creatorId}});
  await tx.aiPhotoGrantChange.create({data:{creator_user_id:creatorId,action:'revoked',reason,changed_by:admin.id}});
  await appendAudit(tx,{category:'admin',action:'admin.ai_photo_revoked',entityId:creatorId,data:{changedBy:admin.id,before:{status:'granted',contentHash:contentDigest(before.reason)},after:{status:'revoked',contentHash:contentDigest(reason)}}});
 });
 return{message:'AI 사진 편집 허용을 해제했습니다.'};
}
