import {createHash,createHmac,timingSafeEqual} from 'crypto';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reject} from './http';
import {PaymentProvider} from './payment-provider';

// Operator TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 digits). The 2025 safety-standard amendment requires a second factor
// for staff who reach personal data from outside (art. 6(2), in force 2026-10-31). Unenrolled operators get 7 days.
export const TOTP_GRACE_DAYS=7;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buffer:Buffer){let bits=0,value=0,out='';for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=ALPHABET[(value<<(5-bits))&31];return out;}
function unbase32(text:string){let bits=0,value=0;const out:number[]=[];for(const c of text.replace(/=+$/,'')){const i=ALPHABET.indexOf(c);if(i<0)throw Error('bad base32');value=(value<<5)|i;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totpCode(secret:string,step:number){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',unbase32(secret)).update(counter).digest(),o=h[h.length-1]&15;return String(((h.readUInt32BE(o)&0x7fffffff)%1000000)).padStart(6,'0');}
const currentStep=(now=Date.now())=>Math.floor(now/30000);
// Accepts the current window ±1 (clock drift) and never a window at or before the last one used (replay).
export function verifyTotp(secret:string,code:unknown,lastStep:number|null,now=Date.now()){if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;const step=currentStep(now);for(const s of [step-1,step,step+1]){if(lastStep!==null&&s<=lastStep)continue;const expected=Buffer.from(totpCode(secret,s));if(timingSafeEqual(expected,Buffer.from(code)))return s;}return null;}
export const recoveryDigest=(code:string)=>createHash('sha256').update('admin-totp-recovery:'+code.replace(/[^a-z0-9]/gi,'').toLowerCase()).digest('hex');
// Sign-in check for an enrolled operator: a 6-digit code or one unused recovery code. Returns the row update to apply.
export async function checkSecondFactor(provider:PaymentProvider,limiter:LocalMemberService,admin:any,body:any){
 if(!body?.code&&!body?.recoveryCode)reject(401,'TOTP_REQUIRED','2차 인증 코드를 입력해주세요.');
 await limiter.limit('admin-totp:'+admin.id,5,300);
 if(body.code){const step=verifyTotp(provider.decrypt(admin.totp_secret_encrypted),String(body.code),admin.totp_last_step);if(step===null)reject(401,'TOTP_INVALID','인증 코드가 올바르지 않습니다.');return{totp_last_step:step};}
 const codes:string[]=Array.isArray(admin.totp_recovery)?admin.totp_recovery:[],digest=recoveryDigest(String(body.recoveryCode));if(!codes.includes(digest))reject(401,'TOTP_INVALID','복구 코드가 올바르지 않습니다.');
 return{totp_recovery:codes.filter(c=>c!==digest)};
}

