import {randomBytes} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {reject} from './http';

export function profileHandle(value:unknown){if(typeof value!=='string'||!/^[a-z0-9_]{3,24}$/.test(value.trim()))reject(400,'INVALID_HANDLE','핸들은 영문 소문자, 숫자, 밑줄 3~24자입니다.');return value.trim();}
// Reservation changes and assignments share one durable mutex, including names with no reservation row yet.
// Take it before any transaction snapshot read; never use a pooled connection's GET_LOCK.
export async function lockHandlePolicy(tx:Prisma.TransactionClient){
 const rows=await tx.$queryRaw<any[]>`SELECT \`key\` FROM platform_settings WHERE \`key\`=${'handles.policy'} FOR UPDATE`;
 if(!rows.length)reject(503,'HANDLE_POLICY_UNAVAILABLE','핸들 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
}
export async function handleTaken(db:Prisma.TransactionClient,member:string,handle:string){
 if(await db.member.findFirst({where:{preferred_username:handle,id:{not:member}},select:{id:true}})||await db.creator.findFirst({where:{handle,user_id:{not:member}},select:{id:true}})||await db.retiredHandle.findFirst({where:{handle,OR:[{member_id:null},{member_id:{not:member}}]},select:{handle:true}}))return true;
 const reserved=await db.reservedHandle.findUnique({where:{handle},select:{status:true}});
 if(reserved?.status!=='reserved')return false;
 // Existing account owners may keep their current handle; an old handle is not an exemption.
 return !member||!await db.member.findFirst({where:{id:member,preferred_username:handle},select:{id:true}});
}
export async function availableSignupHandle(tx:Prisma.TransactionClient){
 for(let attempt=0;attempt<10;attempt++){const handle=randomBytes(7).toString('hex');if(!await handleTaken(tx,'',handle))return handle;}
 reject(503,'HANDLE_UNAVAILABLE','핸들을 생성하지 못했습니다. 다시 시도해주세요.');
}
