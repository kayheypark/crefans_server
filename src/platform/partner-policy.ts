import {reject} from './http';
import {appendAudit} from './audit';

// 2026-11-12 user decision (ask-me): the verified-creator badge (creators.is_verified) marks a signed Crefans partnership
// contract, and only partners can withdraw. Settlement accounts and the withdrawal PIN stay open to every creator so a
// partner can withdraw right after the badge is granted. Operators can still reject an open request without the badge.
export const PARTNER_REQUIRED_MESSAGE='크레팬스와 파트너 계약을 맺은 크리에이터(인증 배지)만 출금할 수 있습니다. 출금 화면에서 파트너 계약을 요청해주세요.';
export type PartnerCheck='strict'|'quiet'|'off';
export async function isPartnerCreator(db:any,member:string){return (await db.creator.findUnique({where:{user_id:member},select:{is_verified:true}}))?.is_verified===true;}
export async function requirePartnerCreator(db:any,member:string){
 const c=await db.creator.findUnique({where:{user_id:member},select:{is_verified:true}});
 if(!c)reject(403,'CREATOR_REQUIRED','크리에이터만 이용할 수 있습니다.');
 if(!c.is_verified)reject(403,'PARTNER_CONTRACT_REQUIRED',PARTNER_REQUIRED_MESSAGE);
}
// 2026-11-15 user decision: a creator asks for the partnership contract from the withdrawal screen. The operator gets a
// Telegram alert (no member identifier, per the 2026-11-02 rule), finds the creator in the console log (business
// creator.partner_requested), sends the contract on Modusign, and grants the verified badge after signing.
export const PARTNER_REQUESTED_MESSAGE='파트너 계약을 요청했어요. 운영자가 확인 후 모두싸인 전자계약서를 이메일로 보내 드려요.';
export async function requestPartnerContract(db:any,operations:{record(type:string,data:Record<string,unknown>,dedupeKey?:string):Promise<unknown>},limiter:{limit(key:string,max:number,seconds:number):Promise<unknown>},member:string){
 const c=await db.creator.findUnique({where:{user_id:member},select:{is_verified:true}});
 if(!c)reject(403,'CREATOR_REQUIRED','크리에이터만 이용할 수 있습니다.');
 if(c.is_verified)return{requested:false,message:'이미 파트너 계약을 맺은 크리에이터예요.'};
 try{await limiter.limit('partner-request:'+member,1,86400);}catch(error:any){if(error?.getStatus?.()!==429)throw error;return{requested:true,message:'오늘 이미 요청했어요. '+PARTNER_REQUESTED_MESSAGE};}
 await appendAudit(db,{category:'business',action:'creator.partner_requested',entityId:member,data:{}});
 await operations.record('creator.partner_requested',{status:'requested'},'partner-request:'+member+':'+new Date().toISOString().slice(0,10));
 return{requested:true,message:PARTNER_REQUESTED_MESSAGE};
}
