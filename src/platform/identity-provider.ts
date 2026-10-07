import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import axios from 'axios';
import {randomBytes,createHmac,timingSafeEqual} from 'crypto';
import {PlatformService} from './service';
import {PaymentProvider} from './payment-provider';
import {digest} from '../auth/local/credentials';
import {reject,text} from './http';
/** Provider-neutral PASS adapter boundary. A contracted vendor bridge must implement docs/provider-contracts.md. */
@Injectable()
export class IdentityProvider {
 constructor(private config:ConfigService,private service:PlatformService,private encryption:PaymentProvider){}
 async start(purpose:string,member?:string){
   if(!['signup','withdrawal-pin'].includes(purpose)||purpose==='withdrawal-pin'&&!member)reject(400,'INVALID_PURPOSE','본인인증 목적을 확인해주세요.');
   const endpoint=this.config.get<string>('PASS_ADAPTER_URL'),secret=this.config.get<string>('PASS_ADAPTER_SECRET');
   if(!endpoint||!secret)reject(503,'PASS_NOT_CONFIGURED','PASS 본인인증 공급자 설정이 필요합니다.');
   const state=randomBytes(32).toString('base64url'),attempt=await this.service.db.identityAttempt.create({data:{state_hash:digest(state),purpose,member_id:member||null,expires_at:new Date(Date.now()+600000)}});
   let data:any;try{data=(await axios.post(`${endpoint}/verifications`,{attemptId:attempt.id,purpose,callbackUrl:this.config.get('PUBLIC_API_ORIGIN')+'/api/v1/identity/callback'},{headers:{Authorization:`Bearer ${secret}`},timeout:15000})).data;}catch{reject(503,'IDENTITY_PROVIDER_UNAVAILABLE','본인인증 서비스를 사용할 수 없습니다.');}
   let url:URL;try{url=new URL(data.redirectUrl);}catch{reject(502,'INVALID_PROVIDER_RESPONSE','본인인증 응답이 올바르지 않습니다.');}if(url.protocol!=='https:')reject(502,'INVALID_PROVIDER_RESPONSE','안전한 본인인증 주소가 필요합니다.');
   await this.service.db.identityAttempt.update({where:{id:attempt.id},data:{provider_reference:text(data.reference,191)}});return{attemptId:attempt.id,state,redirectUrl:url.toString()};
 }
 async callback(body:any,signature:string,raw:Buffer){const secret=this.config.get<string>('PASS_CALLBACK_SECRET');if(!secret)reject(503,'PASS_NOT_CONFIGURED','본인인증 설정이 필요합니다.');const expected=createHmac('sha256',secret).update(raw).digest('hex');if(!/^[a-f0-9]{64}$/i.test(signature||'')||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))reject(403,'INVALID_SIGNATURE','본인인증 콜백을 확인할 수 없습니다.');
   const attempt=await this.service.db.identityAttempt.findUnique({where:{id:body.attemptId}});if(!attempt||attempt.expires_at<=new Date()||attempt.provider_reference!==body.reference)reject(403,'INVALID_ATTEMPT','본인인증 요청이 만료되었거나 일치하지 않습니다.');if(attempt.status==='verified')return{message:'이미 확인했습니다.'};if(body.verified!==true)reject(403,'IDENTITY_FAILED','본인인증에 실패했습니다.');
   const identity=createHmac('sha256',this.config.get('LOCAL_AUTH_SECRET')).update(text(body.identity,1000)).digest('hex');if(attempt.member_id){const member=await this.service.member(attempt.member_id);if(member.identity_hash!==identity)reject(403,'IDENTITY_MISMATCH','계정 소유자의 본인인증이 필요합니다.');}
   const proof=randomBytes(32).toString('base64url');await this.service.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM identity_attempts WHERE id=${attempt.id} FOR UPDATE`;const current=await tx.identityAttempt.findUniqueOrThrow({where:{id:attempt.id}});if(current.status==='verified')return;await tx.identityProof.create({data:{token_hash:digest(proof),provider_reference:attempt.provider_reference,identity_hash:identity,verified_name:text(body.name,80),adult_verified:body.adultVerified===true,member_id:attempt.member_id,purpose:attempt.purpose,attempt_id:attempt.id,expires_at:new Date(Date.now()+1800000)}});await tx.identityAttempt.update({where:{id:attempt.id},data:{status:'verified',proof_encrypted:this.encryption.encrypt(proof)}});});return{message:'본인인증 결과를 확인했습니다.'};
 }
 async status(id:string,state:string){const attempt=await this.service.db.identityAttempt.findUnique({where:{id}});if(!attempt||attempt.state_hash!==digest(text(state,100))||attempt.expires_at<=new Date())reject(403,'INVALID_ATTEMPT','본인인증 요청을 확인해주세요.');return{status:attempt.status,proof:attempt.proof_encrypted?this.encryption.decrypt(attempt.proof_encrypted):null,message:attempt.status==='verified'?'본인인증이 완료되었습니다.':'본인인증을 기다리고 있습니다.'};}
}
