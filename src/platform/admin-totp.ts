import {randomBytes} from 'crypto';
import {Body,Controller,Post,Req,UseGuards} from '@nestjs/common';
import {LocalMemberService} from '../auth/local/local-member.service';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
import {appendAudit} from './audit';
import {reject} from './http';
import {PaymentProvider} from './payment-provider';
import {PlatformService} from './service';
import {base32,recoveryDigest,verifyTotp} from './admin-totp-core';

// Enrollment routes for the operator's own second factor (algorithm and sign-in check live in admin-totp-core).
@Controller('admin/me/totp') @UseGuards(PlatformAdminGuard)
export class AdminTotpController{
 constructor(private service:PlatformService,private provider:PaymentProvider,private limiter:LocalMemberService){}
 @Post('setup') @Permit('self') async setup(@Req() req:any){
  if(req.admin.totp_enabled_at)reject(409,'TOTP_ALREADY_ENABLED','이미 2차 인증을 사용 중입니다.');
  const secret=base32(randomBytes(20));await this.service.db.admin.update({where:{id:req.admin.id},data:{totp_pending_encrypted:this.provider.encrypt(secret)}});
  return{secret,otpauthUri:`otpauth://totp/${encodeURIComponent('crefans 콘솔:'+req.admin.email)}?secret=${secret}&issuer=crefans&algorithm=SHA1&digits=6&period=30`};
 }
 @Post('enable') @Permit('self') async enable(@Req() req:any,@Body() body:any){
  await this.limiter.limit('admin-totp:'+req.admin.id,5,300);
  const pending=req.admin.totp_pending_encrypted;if(!pending)reject(409,'TOTP_SETUP_REQUIRED','먼저 인증 앱 등록을 시작해주세요.');
  const secret=this.provider.decrypt(pending),step=verifyTotp(secret,String(body?.code||''),null);if(step===null)reject(401,'TOTP_INVALID','인증 코드가 올바르지 않습니다.');
  const codes=Array.from({length:8},()=>{const raw=randomBytes(5).toString('hex');return raw.slice(0,5)+'-'+raw.slice(5);});
  await this.service.db.$transaction(async(tx:any)=>{await tx.admin.update({where:{id:req.admin.id},data:{totp_secret_encrypted:pending,totp_pending_encrypted:null,totp_enabled_at:new Date(),totp_last_step:step,totp_recovery:codes.map(recoveryDigest),totp_grace_until:null}});await appendAudit(tx,{category:'admin',action:'admin.totp_enabled',entityId:req.admin.id,data:{adminId:req.admin.id}});});
  return{message:'2차 인증을 켰습니다. 복구 코드는 지금 한 번만 보여 드립니다.',recoveryCodes:codes};
 }
}
