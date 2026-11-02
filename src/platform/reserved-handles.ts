import {PrismaClient,Prisma} from '@prisma/client';
import {adminPage} from './admin-console';
import {appendAudit,auditChange,contentDigest} from './audit';
import {requirePermission} from './admin-permissions';
import {lockHandlePolicy,profileHandle} from './handles';
import {reject,text} from './http';

const states=['candidate','reserved','deleted'];
function state(value:unknown,allowDeleted=false){if(!states.slice(0,allowDeleted?3:2).includes(value as string))reject(400,'INVALID_HANDLE_STATUS','예약 상태를 선택해주세요.');return value as string;}
function version(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)reject(400,'INVALID_VERSION','목록을 새로 불러와주세요.');return value as number;}
function view(r:any){return{id:r.id,handle:r.handle,status:r.status,reason:r.reason,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at};}
export async function listReservedHandles(db:PrismaClient,admin:any,query:any){
 requirePermission(admin,'reserved-handles','view');
 const {page,size,skip}=adminPage(query),search=text(query.search??'',100,false),status=query.status?state(query.status,true):undefined;
 const where:Prisma.ReservedHandleWhereInput={...(status?{status}:{status:{not:'deleted'}}),...(search?{OR:[{handle:{contains:search.toLowerCase()}},{reason:{contains:search}}]}:{})};
 const [rows,total]=await Promise.all([db.reservedHandle.findMany({where,skip,take:size,orderBy:[{updated_at:'desc'},{handle:'asc'}]}),db.reservedHandle.count({where})]);
 const handles=rows.map(r=>r.handle),[members,creators,retired]=await Promise.all([db.member.findMany({where:{preferred_username:{in:handles}},select:{preferred_username:true}}),db.creator.findMany({where:{handle:{in:handles}},select:{handle:true}}),db.retiredHandle.findMany({where:{handle:{in:handles}},select:{handle:true}})]);
 return{items:rows.map(r=>({...view(r),usage:members.some(m=>m.preferred_username===r.handle)||creators.some(c=>c.handle===r.handle)?'in_use':retired.some(h=>h.handle===r.handle)?'retired':'unused'})),total,page,pageSize:size};
}
export async function reservedHandleHistory(db:PrismaClient,admin:any,id:string,query:any){
 requirePermission(admin,'reserved-handles','view');const {page,size,skip}=adminPage(query);
 if(!await db.reservedHandle.findUnique({where:{id}}))reject(404,'RESERVED_HANDLE_NOT_FOUND','예약 핸들을 찾을 수 없습니다.');
 const where={reservation_id:id},[items,total]=await Promise.all([db.reservedHandleChange.findMany({where,orderBy:{version:'desc'},skip,take:size}),db.reservedHandleChange.count({where})]);
 const actors=await db.admin.findMany({where:{id:{in:items.flatMap(r=>r.changed_by?[r.changed_by]:[])}},select:{id:true,name:true}});
 return{items:items.map(r=>({id:r.id,changedByName:r.changed_by?(actors.find(a=>a.id===r.changed_by)?.name||'삭제된 운영자'):null,version:r.version,beforeHandle:r.before_handle,handle:r.handle,beforeStatus:r.before_status,status:r.status,reason:r.reason,changedBy:r.changed_by,createdAt:r.created_at})),total,page,pageSize:size};
}
async function record(tx:Prisma.TransactionClient,admin:any,before:any,saved:any){
 await tx.reservedHandleChange.create({data:{reservation_id:saved.id,version:saved.version,before_handle:before?.handle??null,handle:saved.handle,before_status:before?.status??null,status:saved.status,reason:saved.reason,changed_by:admin.id}});
 await appendAudit(tx,{category:'admin',action:'admin.reserved_handle_changed',entityId:saved.id,data:{changedBy:admin.id,...auditChange(before?{status:before.status,version:before.version,titleHash:contentDigest(before.handle),contentHash:contentDigest(before.reason)}:null,{status:saved.status,version:saved.version,titleHash:contentDigest(saved.handle),contentHash:contentDigest(saved.reason)})}});
}
export async function saveReservedHandle(db:PrismaClient,admin:any,id:string|undefined,input:any){
 requirePermission(admin,'reserved-handles',id?'update':'create');
 const handle=profileHandle(typeof input?.handle==='string'?input.handle.trim().toLowerCase():input?.handle),status=state(input?.status),reason=text(input?.reason,500),expected=id?version(input?.expectedVersion):undefined;
 try{return await db.$transaction(async tx=>{
  await lockHandlePolicy(tx);const before=id?await tx.reservedHandle.findUnique({where:{id}}):null;
  if(id&&!before)reject(404,'RESERVED_HANDLE_NOT_FOUND','예약 핸들을 찾을 수 없습니다.');
  if(before&&before.version!==expected)reject(409,'RESERVED_HANDLE_CHANGED','다른 운영자가 변경했습니다. 목록을 새로 불러와주세요.');
  const data={handle,status,reason,updated_by:admin.id};
  const saved=before?await tx.reservedHandle.update({where:{id},data:{...data,version:{increment:1}}}):await tx.reservedHandle.create({data:{...data,created_by:admin.id}});
  await record(tx,admin,before,saved);return{item:view(saved),message:'예약 핸들을 저장했습니다.'};
 });}catch(e){if(e?.code==='P2002')reject(409,'RESERVED_HANDLE_EXISTS','이미 등록된 핸들입니다. 삭제된 항목도 검색해 확인해주세요.');throw e;}
}
export async function deleteReservedHandle(db:PrismaClient,admin:any,id:string,input:any){
 requirePermission(admin,'reserved-handles','delete');const expected=version(input?.expectedVersion),reason=text(input?.reason,500);
 return db.$transaction(async tx=>{
  await lockHandlePolicy(tx);const before=await tx.reservedHandle.findUnique({where:{id}});
  if(!before)reject(404,'RESERVED_HANDLE_NOT_FOUND','예약 핸들을 찾을 수 없습니다.');
  if(before.version!==expected)reject(409,'RESERVED_HANDLE_CHANGED','다른 운영자가 변경했습니다. 목록을 새로 불러와주세요.');
  if(input?.confirmation!==before.handle)reject(400,'HANDLE_CONFIRMATION_REQUIRED','삭제할 핸들을 정확히 입력해주세요.');
  if(before.status==='deleted')return{message:'이미 삭제된 항목입니다.'};
  const saved=await tx.reservedHandle.update({where:{id},data:{status:'deleted',reason,version:{increment:1},updated_by:admin.id}});await record(tx,admin,before,saved);return{message:'예약 핸들을 삭제했습니다.'};
 });
}
