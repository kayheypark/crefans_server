import {reject} from './http';

// 2026-11-12 user decision (ask-me): the verified-creator badge (creators.is_verified) marks a signed Crefans partnership
// contract, and only partners can withdraw. Settlement accounts and the withdrawal PIN stay open to every creator so a
// partner can withdraw right after the badge is granted. Operators can still reject an open request without the badge.
export const PARTNER_REQUIRED_MESSAGE='크레팬스와 파트너 계약을 맺은 크리에이터(인증 배지)만 출금할 수 있습니다. 계약은 고객센터로 문의해주세요.';
export type PartnerCheck='strict'|'quiet'|'off';
export async function isPartnerCreator(db:any,member:string){return (await db.creator.findUnique({where:{user_id:member},select:{is_verified:true}}))?.is_verified===true;}
export async function requirePartnerCreator(db:any,member:string){
 const c=await db.creator.findUnique({where:{user_id:member},select:{is_verified:true}});
 if(!c)reject(403,'CREATOR_REQUIRED','크리에이터만 이용할 수 있습니다.');
 if(!c.is_verified)reject(403,'PARTNER_CONTRACT_REQUIRED',PARTNER_REQUIRED_MESSAGE);
}
