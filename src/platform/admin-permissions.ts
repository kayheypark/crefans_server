import {SetMetadata} from '@nestjs/common';
import {reject} from './http';

// Console menus and the actions each one actually has. Anything not listed is denied.
export const ADMIN_MENUS={
 overview:['view'],
 advertising:['view','create','update','delete'],
 members:['view','update'],
 invites:['view','create','update','delete'],
 referrals:['view','create','update'],
 content:['view','create','update'],
 revenue:['view','create'],
 beans:['view','create','update'],
 support:['view','create','update'],
 settings:['view','update'],
 logs:['view'],
} as const;
export type AdminMenu=keyof typeof ADMIN_MENUS;
export type AdminAction='view'|'create'|'update'|'delete';
export type AdminPermissions=Partial<Record<AdminMenu,Partial<Record<AdminAction,boolean>>>>;

// Rows created before per-menu permissions keep their previous role behavior.
const legacy:Record<string,AdminPermissions>={
 ADMIN:{overview:{view:true},members:{view:true,update:true},content:{view:true,create:true,update:true},revenue:{view:true},beans:{view:true},support:{view:true,create:true,update:true},logs:{view:true}},
 MODERATOR:{overview:{view:true},members:{view:true},content:{view:true,update:true},support:{view:true,update:true}},
};

export function normalizePermissions(input:any):AdminPermissions{
 if(!input||typeof input!=='object'||Array.isArray(input))reject(400,'INVALID_PERMISSIONS','권한 설정을 확인해주세요.');
 const out:AdminPermissions={};
 for(const [menu,actions] of Object.entries(input)){
  const allowed=ADMIN_MENUS[menu as AdminMenu] as readonly string[]|undefined;
  if(!allowed||!actions||typeof actions!=='object'||Array.isArray(actions))reject(400,'INVALID_PERMISSIONS','권한 설정을 확인해주세요.');
  const row:Partial<Record<AdminAction,boolean>>={};
  for(const [action,value] of Object.entries(actions as object)){
   if(!allowed.includes(action)||typeof value!=='boolean')reject(400,'INVALID_PERMISSIONS','권한 설정을 확인해주세요.');
   if(value)row[action as AdminAction]=true;
  }
  // Any other action on a menu requires being able to enter it.
  if(Object.keys(row).length&&!row.view)reject(400,'INVALID_PERMISSIONS','조회 권한 없이 다른 권한을 줄 수 없습니다.');
  if(Object.keys(row).length)out[menu as AdminMenu]=row;
 }
 return out;
}
export function effectivePermissions(admin:any):AdminPermissions{
 if(!admin||admin.is_active===false)return{};
 if(admin.role==='SUPER_ADMIN')return Object.fromEntries(Object.entries(ADMIN_MENUS).map(([menu,actions])=>[menu,Object.fromEntries(actions.map(a=>[a,true]))]));
 if(admin.permissions&&typeof admin.permissions==='object')return admin.permissions;
 return legacy[admin.role]||{};
}
export function can(admin:any,menu:AdminMenu,action:AdminAction){return effectivePermissions(admin)[menu]?.[action]===true;}
export function requirePermission(admin:any,menu:AdminMenu,action:AdminAction){if(!can(admin,menu,action))reject(403,'ADMIN_PERMISSION_REQUIRED','이 작업을 할 권한이 없습니다.');}
export function requireSuperAdmin(admin:any){if(!admin?.is_active||admin.role!=='SUPER_ADMIN')reject(403,'SUPER_ADMIN_REQUIRED','최고 관리자 권한이 필요합니다.');}

// Route metadata read by PlatformAdminGuard. Routes without it are denied.
export const ADMIN_PERMISSION='crefans:admin-permission';
export type AdminRule=[AdminMenu,AdminAction]|'self'|'super'|'any';
export const Permit=(rule:AdminRule)=>SetMetadata(ADMIN_PERMISSION,rule);
