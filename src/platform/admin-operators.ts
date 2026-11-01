import {randomBytes,randomUUID} from 'crypto';
import {assertNewPassword,hashPassword,matchesPassword,normalizeEmail} from '../auth/local/credentials';
import {appendAudit,auditChange} from './audit';
import {reject,text} from './http';
import {effectivePermissions,normalizePermissions} from './admin-permissions';

// Operator accounts live in admins/admin_sessions, separate from fan/creator members.
// SUPER_ADMIN creates sub-operators with a one-time temporary password.
const tempPassword=()=>randomBytes(12).toString('base64url');
const phone=(value:unknown)=>{if(value==null||value==='')return '';const v=text(value,32,false);if(v&&!/^[0-9+\-\s]{8,20}$/.test(v))reject(400,'INVALID_PHONE','전화번호를 확인해주세요.');return v;};
function view(admin:any){return{id:admin.id,name:admin.name,email:admin.email,phone:admin.phone||'',role:admin.role,isActive:admin.is_active,mustChangePassword:admin.must_change_password,lastLogin:admin.last_login,createdAt:admin.created_at,permissions:effectivePermissions(admin),customPermissions:admin.role!=='SUPER_ADMIN'&&!!admin.permissions};}

export async function listOperators(db:any){return(await db.admin.findMany({orderBy:[{is_active:'desc'},{created_at:'asc'}]})).map(view);}

export async function createOperator(db:any,actor:any,input:any){
 const name=text(input?.name,60),email=normalizeEmail(input?.email),phoneNumber=phone(input?.phone),permissions=normalizePermissions(input?.permissions);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reject(400,'INVALID_EMAIL','이메일을 확인해주세요.');
 if(await db.admin.findUnique({where:{email}}))reject(409,'EMAIL_IN_USE','이미 운영자로 등록된 이메일입니다.');
 const password=tempPassword(),hash=await hashPassword(password);
 const admin=await db.$transaction(async(tx:any)=>{
  // user_sub is only the operator's audit actor ID; it is not a member account.
  const row=await tx.admin.create({data:{user_sub:randomUUID(),name,email,phone:phoneNumber,password_hash:hash,role:'ADMIN',permissions,must_change_password:true,created_by:actor.user_sub}});
  await appendAudit(tx,{category:'admin',action:'admin.operator.created',entityId:row.id,data:auditChange(null,{role:'ADMIN',permissions})});
  return row;
 });
 // The temporary password is returned once and never stored in plain text or logged.
 return{operator:view(admin),temporaryPassword:password};
}

async function target(db:any,actor:any,id:string){
 const row=await db.admin.findUnique({where:{id}});if(!row)reject(404,'OPERATOR_NOT_FOUND','운영자를 찾을 수 없습니다.');
 if(row.role==='SUPER_ADMIN'||row.id===actor.id)reject(403,'OPERATOR_PROTECTED','최고 관리자와 본인 계정은 여기서 변경할 수 없습니다.');
 return row;
}
export async function updateOperator(db:any,actor:any,id:string,input:any){
 const row=await target(db,actor,id),data:any={};
 if(input?.name!==undefined)data.name=text(input.name,60);
 if(input?.phone!==undefined)data.phone=phone(input.phone);
 if(input?.permissions!==undefined)data.permissions=normalizePermissions(input.permissions);
 if(input?.isActive!==undefined){if(typeof input.isActive!=='boolean')reject(400,'INVALID_INPUT','입력값을 확인해주세요.');data.is_active=input.isActive;}
 const saved=await db.$transaction(async(tx:any)=>{
  const next=await tx.admin.update({where:{id},data});
  if(data.is_active===false)await tx.adminSession.deleteMany({where:{admin_id:id}});
  await appendAudit(tx,{category:'admin',action:data.is_active===false?'admin.operator.deactivated':'admin.operator.updated',entityId:id,data:auditChange({name:row.name,permissions:row.permissions,is_active:row.is_active},{name:next.name,permissions:next.permissions,is_active:next.is_active})});
  return next;
 });
 return view(saved);
}
export async function resetOperatorPassword(db:any,actor:any,id:string){
 const row=await target(db,actor,id);if(!row.is_active)reject(409,'OPERATOR_INACTIVE','비활성 운영자입니다.');
 const password=tempPassword(),hash=await hashPassword(password);
 await db.$transaction(async(tx:any)=>{
  await tx.admin.update({where:{id},data:{password_hash:hash,must_change_password:true}});
  await tx.adminSession.deleteMany({where:{admin_id:id}});
  await appendAudit(tx,{category:'admin',action:'admin.operator.password_reset',entityId:id,data:{mustChangePassword:true}});
 });
 return{temporaryPassword:password};
}

export async function myProfile(_db:any,admin:any){return view(admin);}
export async function updateMyProfile(db:any,admin:any,input:any){
 const name=text(input?.name,60),phoneNumber=phone(input?.phone);
 const saved=await db.$transaction(async(tx:any)=>{
  const next=await tx.admin.update({where:{id:admin.id},data:{name,phone:phoneNumber}});
  await appendAudit(tx,{category:'admin',action:'admin.profile.updated',entityId:admin.id,data:auditChange({name:admin.name,phoneSet:!!admin.phone},{name,phoneSet:!!phoneNumber})});
  return next;
 });
 return view(saved);
}
export async function changeMyPassword(db:any,admin:any,input:any,currentSession?:string){
 if(!admin.password_hash||!await matchesPassword(input?.currentPassword,admin.password_hash))reject(400,'PASSWORD_MISMATCH','현재 비밀번호를 확인해주세요.');
 if(typeof input?.newPassword!=='string'||input.newPassword.length<10)reject(400,'WEAK_PASSWORD','새 비밀번호는 10자 이상이어야 합니다.');
 assertNewPassword(input.newPassword,10);
 if(input.newPassword===input.currentPassword)reject(400,'SAME_PASSWORD','현재와 다른 비밀번호를 입력해주세요.');
 const hash=await hashPassword(input.newPassword);
 await db.$transaction(async(tx:any)=>{
  await tx.admin.update({where:{id:admin.id},data:{password_hash:hash,must_change_password:false}});
  // Other sessions of this operator are signed out; the current one stays.
  await tx.adminSession.deleteMany({where:{admin_id:admin.id,...(currentSession?{NOT:{access_hash:currentSession}}:{})}});
  await appendAudit(tx,{category:'admin',action:'admin.password.changed',entityId:admin.id,data:{forced:admin.must_change_password}});
 });
 return{message:'비밀번호를 변경했습니다.'};
}
