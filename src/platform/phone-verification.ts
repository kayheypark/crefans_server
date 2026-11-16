import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {createHmac,randomBytes,randomInt} from 'crypto';
import {digest} from '../auth/local/credentials';
import {PlatformService} from './service';
import {LocalMemberService} from '../auth/local/local-member.service';
import {appendAudit} from './audit';
import {reject} from './http';

// 2026-11-16 user decision: before the promotion 100콩, the member proves they hold a phone number with OCTOMO (MO SMS: the member
// texts a one-time code to 1666-3538 and the server asks OCTOMO whether that text arrived). One account per number.
// Official spec (checked 2026-11-16, octomo.octoverse.kr/api-docs): POST https://api.octoverse.kr/octomo/v1/public/message/exists,
// header `Authorization: Octomo {API_KEY}`, body {mobileNum:'010xxxxxxxx', text, withinMinutes 1..60} → {exists:boolean}.
// OCTOMO states it is a number-ownership check, not a designated 본인확인기관: no name, birth date or CI, so it is never age proof.
// The number is sent to OCTOMO only for the check; the service keeps an HMAC of it (unique), never the number itself.
export const OCTOMO_URL='https://api.octoverse.kr/octomo/v1/public/message/exists',OCTOMO_RECEIVER='1666-3538',PHONE_CODE_MINUTES=10;
export const normalizePhone=(value:unknown)=>{const digits=typeof value==='string'?value.replace(/[^0-9]/g,''):'';if(!/^010[0-9]{8}$/.test(digits))reject(400,'INVALID_PHONE','010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.');return digits;};

@Injectable()
export class PhoneVerificationService{
 fetcher:typeof fetch=fetch;
 constructor(private service:PlatformService,private config:ConfigService,private limiter:LocalMemberService){}
 get db(){return this.service.db;}
 private key(){return (this.config.get<string>('OCTOMO_API_KEY')||'').trim();}
 /** Off (claims work as before) until the operator sets OCTOMO_API_KEY. */
 enabled(){return !!this.key();}
 hash(phone:string){const secret=this.config.get<string>('LOCAL_AUTH_SECRET')||this.config.get<string>('DATA_ENCRYPTION_KEY');if(!secret)reject(503,'PHONE_VERIFICATION_UNAVAILABLE','잠시 후 다시 시도해 주세요.');return createHmac('sha256',secret).update(`member-phone:${phone}`).digest('hex');}
 async verified(member:string){return !!await this.db.memberPhone.findUnique({where:{member_id:member}});}
 async status(member:string){return{required:this.enabled(),verified:await this.verified(member),receiver:OCTOMO_RECEIVER};}
 /** Issues a code for `key` (a member id, or 'signup:'+email digest before the account exists). */
 private async issue(key:string,phone:string,limitKey:string){if(!this.enabled())reject(503,'PHONE_VERIFICATION_UNAVAILABLE','휴대폰 확인을 준비 중이에요.');
  const phoneHash=this.hash(phone);await this.limiter.limit(limitKey,5,3600);
  const owner=await this.db.memberPhone.findUnique({where:{phone_hash:phoneHash}});if(owner&&owner.member_id!==key)reject(409,'PHONE_IN_USE','이미 다른 계정에서 확인한 번호예요.');
  const code=String(randomInt(100000,1000000)),expires=new Date(Date.now()+PHONE_CODE_MINUTES*60000);
  await this.db.phoneVerification.deleteMany({where:{member_id:key}});
  await this.db.phoneVerification.create({data:{member_id:key,phone_hash:phoneHash,code,expires_at:expires}});
  return{code,receiver:OCTOMO_RECEIVER,smsUri:`sms:${OCTOMO_RECEIVER.replace(/-/g,'')}?&body=${code}`,expiresAt:expires.toISOString()};}
 /** Asks OCTOMO whether the code arrived from that number; a provider failure is never a pass. */
 private async check(key:string,phone:string,limitKey:string){if(!this.enabled())reject(503,'PHONE_VERIFICATION_UNAVAILABLE','휴대폰 확인을 준비 중이에요.');
  const phoneHash=this.hash(phone);await this.limiter.limit(limitKey,20,3600);
  const pending=await this.db.phoneVerification.findFirst({where:{member_id:key,phone_hash:phoneHash,expires_at:{gt:new Date()},verified_at:null},orderBy:{created_at:'desc'}});
  if(!pending)reject(409,'PHONE_CODE_EXPIRED','인증 문자를 다시 받아 주세요.');
  const res=await this.fetcher(OCTOMO_URL,{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Octomo ${this.key()}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({mobileNum:phone,text:pending!.code,withinMinutes:PHONE_CODE_MINUTES})}).catch(()=>null);
  const body=res?await res.json().catch(()=>null):null;
  if(!res||!res.ok||typeof body?.exists!=='boolean')reject(502,'PHONE_CHECK_UNAVAILABLE','문자 확인이 잠시 안 돼요. 잠시 후 다시 시도해 주세요.');
  if(!body.exists)reject(409,'PHONE_SMS_NOT_FOUND','아직 문자가 확인되지 않았어요. 인증 번호를 그대로 보냈는지 확인해 주세요.');
  return{pending:pending!,phoneHash};}
 async start(member:string,input:any){if(!this.enabled())reject(503,'PHONE_VERIFICATION_UNAVAILABLE','휴대폰 확인을 준비 중이에요.');await this.service.member(member);return this.issue(member,normalizePhone(input?.phone),'phone-start:'+member);}
 async confirm(member:string,input:any){const phone=normalizePhone(input?.phone),{phoneHash}=await this.check(member,phone,'phone-confirm:'+member);
  await this.db.$transaction(async(tx:any)=>{
   const owner=await tx.memberPhone.findUnique({where:{phone_hash:phoneHash}});if(owner&&owner.member_id!==member)reject(409,'PHONE_IN_USE','이미 다른 계정에서 확인한 번호예요.');
   await tx.memberPhone.upsert({where:{member_id:member},create:{member_id:member,phone_hash:phoneHash},update:{phone_hash:phoneHash,verified_at:new Date()}});
   await tx.phoneVerification.deleteMany({where:{member_id:member}});
   await appendAudit(tx,{category:'security',action:'member.phone_verified',entityId:member,data:{provider:'octomo'}});
  }).catch((error:any)=>{if(error?.code==='P2002')reject(409,'PHONE_IN_USE','이미 다른 계정에서 확인한 번호예요.');throw error;});
  return{verified:true};}
 // ---- Signup (2026-11-16 user decision: the phone number is checked at signup, after the email code). ----
 private signupKey(email:string){return 'signup:'+digest(email).slice(0,48);}
 private async verifiedEmail(db:any,email:string,emailProof:unknown){const challenge=await db.signupChallenge.findUnique({where:{email}});
  if(!challenge?.verified_at||challenge.expires_at<=new Date()||challenge.proof_hash!==digest(typeof emailProof==='string'?emailProof.slice(0,100):''))reject(403,'EMAIL_VERIFICATION_REQUIRED','이메일 인증을 먼저 해 주세요.');}
 async signupStart(email:string,input:any){await this.verifiedEmail(this.db,email,input?.emailProof);return this.issue(this.signupKey(email),normalizePhone(input?.phone),'signup-phone-start:'+digest(email));}
 async signupConfirm(email:string,input:any){await this.verifiedEmail(this.db,email,input?.emailProof);const key=this.signupKey(email),{pending}=await this.check(key,normalizePhone(input?.phone),'signup-phone-confirm:'+digest(email));
  const proof=randomBytes(24).toString('base64url');
  await this.db.phoneVerification.update({where:{id:pending.id},data:{verified_at:new Date(),proof_hash:digest(proof),expires_at:new Date(Date.now()+30*60000)}});
  return{verified:true,proof};}
 /** Inside the signup transaction: binds the verified number to the new account (one account per number). */
 async attachSignup(tx:any,email:string,input:any,memberId:string){const phone=normalizePhone(input?.phone),key=this.signupKey(email),phoneHash=this.hash(phone);
  const row=await tx.phoneVerification.findFirst({where:{member_id:key,phone_hash:phoneHash,verified_at:{not:null},expires_at:{gt:new Date()},proof_hash:digest(typeof input?.phoneProof==='string'?input.phoneProof.slice(0,100):'')}});
  if(!row)reject(403,'PHONE_VERIFICATION_REQUIRED','휴대폰 번호 확인이 필요해요.');
  if(await tx.memberPhone.findUnique({where:{phone_hash:phoneHash}}))reject(409,'PHONE_IN_USE','이미 다른 계정에서 확인한 번호예요.');
  await tx.memberPhone.create({data:{member_id:memberId,phone_hash:phoneHash}});await tx.phoneVerification.deleteMany({where:{member_id:key}});
  await appendAudit(tx,{category:'security',action:'member.phone_verified',entityId:memberId,data:{provider:'octomo',stage:'signup'}});}
}
