import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {createHmac,randomInt} from 'crypto';
import {PlatformService} from './service';
import {MemberMailService} from '../auth/local/member-mail.service';
import {normalizeEmail} from '../auth/local/credentials';
import {reject,text} from './http';
@Injectable()
export class EmailChangeService {
 constructor(private service:PlatformService,private mail:MemberMailService,private config:ConfigService){}
 hash(member:string,email:string,code:string){return createHmac('sha256',this.config.get('LOCAL_AUTH_SECRET')).update(`${member}:${email}:${code}`).digest('hex');}
 async request(member:string,raw:string){const email=normalizeEmail(text(raw,191));if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reject(400,'INVALID_EMAIL','이메일을 확인해주세요.');if(await this.service.db.member.findUnique({where:{email}}))reject(409,'EMAIL_IN_USE','이미 사용 중인 이메일입니다.');const code=String(randomInt(0,1000000)).padStart(6,'0');await this.service.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${member} FOR UPDATE`;const prior=await tx.memberChallenge.findUnique({where:{member_id_purpose:{member_id:member,purpose:'email-change'}}});if(prior&&Date.now()-prior.sent_at.getTime()<180000)reject(429,'RESEND_COOLDOWN','3분 후 다시 요청해주세요.');const data={target_email:email,digest:this.hash(member,email,code),attempts:0,sent_at:new Date(),expires_at:new Date(Date.now()+600000)};await tx.memberChallenge.upsert({where:{member_id_purpose:{member_id:member,purpose:'email-change'}},create:{member_id:member,purpose:'email-change',...data},update:data});});try{await this.mail.sendCode(email,code,'email-change');}catch{reject(503,'MAIL_UNAVAILABLE','이메일 발송 설정이 필요하거나 발송에 실패했습니다.');}return{message:'새 이메일로 인증 코드를 보냈습니다.'};}
 async confirm(member:string,raw:string,rawCode:string){const email=normalizeEmail(text(raw,191)),code=text(rawCode,6);const attempted=await this.service.db.memberChallenge.updateMany({where:{member_id:member,purpose:'email-change',target_email:email,attempts:{lt:5},expires_at:{gt:new Date()}},data:{attempts:{increment:1}}});if(!attempted.count)reject(400,'CODE_EXPIRED','인증 요청이 만료되었습니다.');await this.service.db.$transaction(async tx=>{const consumed=await tx.memberChallenge.deleteMany({where:{member_id:member,purpose:'email-change',target_email:email,digest:this.hash(member,email,code),expires_at:{gt:new Date()},attempts:{lte:5}}});if(consumed.count!==1)reject(400,'INVALID_CODE','인증 코드가 일치하지 않습니다.');await tx.member.update({where:{id:member},data:{email}});await tx.memberSession.deleteMany({where:{member_id:member}});});return{message:'이메일을 변경했습니다. 다시 로그인해주세요.'};}
}
