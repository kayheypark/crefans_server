import {ensureBeanWallet} from './bean-ledger';
import {recordMarketingChoice} from './marketing.service';
import {LegalDocumentsService} from './legal-documents';
import {signupPolicy} from './signup-policy';
import {actorContext,observeAudit,safeError} from './audit';
import {enqueueOperation} from './operations-events';
import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {randomBytes,randomInt,randomUUID,createHmac} from 'crypto';
import {PrismaService} from '../prisma/prisma.service';
import {LocalMemberService} from '../auth/local/local-member.service';
import {MemberMailService} from '../auth/local/member-mail.service';
import {digest,hashPassword,normalizeEmail} from '../auth/local/credentials';
import {reject,text} from './http';
@Injectable()
export class PlatformAuthService {
 constructor(private db:PrismaService,private local:LocalMemberService,private mail:MemberMailService,private config:ConfigService,private legal:LegalDocumentsService=new LegalDocumentsService()){}
 private email(value:unknown){const email=normalizeEmail(text(value,191));if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reject(400,'INVALID_EMAIL','이메일을 확인해주세요.');return email;}
 private codeHash(email:string,code:string){return createHmac('sha256',this.config.get('LOCAL_AUTH_SECRET')).update(`${email}:${code}`).digest('hex');}
 async requestCode(raw:string){
   this.legal.requirePublished();const email=this.email(raw);signupPolicy(this.config).assertEmail(email);await this.local.limit(`signup-email:${email}`,10,3600);
   if(await this.db.member.findUnique({where:{email}}))reject(409,'EMAIL_IN_USE','이미 가입한 이메일입니다.');
   const code=String(randomInt(0,1000000)).padStart(6,'0'),now=new Date();
   await this.db.$transaction(async tx=>{
     await tx.$executeRaw`INSERT IGNORE INTO signup_challenges (email,code_hash,attempts,sent_at,expires_at) VALUES (${email},${''},0,${new Date(0)},${new Date(0)})`;
     const rows:any[]=await tx.$queryRaw`SELECT sent_at FROM signup_challenges WHERE email=${email} FOR UPDATE`;
     if(now.getTime()-new Date(rows[0].sent_at).getTime()<180000)reject(429,'RESEND_COOLDOWN','3분 후 인증 코드를 다시 요청해주세요.');
     await tx.signupChallenge.update({where:{email},data:{code_hash:this.codeHash(email,code),attempts:0,sent_at:now,expires_at:new Date(Date.now()+600000),proof_hash:null,verified_at:null}});
   });
   try{await this.mail.sendCode(email,code,'verify');}catch{reject(503,'MAIL_UNAVAILABLE','이메일 발송 설정이 필요하거나 발송에 실패했습니다.');}
   return{message:'인증 코드를 발송했습니다.'};
 }
 async verifyCode(input:any){const email=this.email(input.email),code=text(input.code,6);
   const attempt=await this.db.signupChallenge.updateMany({where:{email,expires_at:{gt:new Date()},attempts:{lt:5},verified_at:null},data:{attempts:{increment:1}}});
   if(!attempt.count)reject(400,'CODE_EXPIRED','코드가 만료되었거나 시도 횟수를 초과했습니다.');
   const proof=randomBytes(32).toString('base64url');
   const result=await this.db.signupChallenge.updateMany({where:{email,code_hash:this.codeHash(email,code),verified_at:null,expires_at:{gt:new Date()},attempts:{lte:5}},data:{proof_hash:digest(proof),verified_at:new Date(),expires_at:new Date(Date.now()+1800000)}});
   if(!result.count)reject(400,'INVALID_CODE','인증 코드가 일치하지 않습니다.');return{message:'이메일 인증이 완료되었습니다.',proof};
 }
 async identity(){reject(503,'PASS_NOT_CONFIGURED','PASS 본인인증 공급자 설정이 필요합니다.');}
 async signup(input:any){const email=this.email(input.email),password=text(input.password,128),nickname=text(input.nickname,40);
   if(password.length<8||input.terms!==true||input.privacy!==true)reject(400,'INVALID_INPUT','비밀번호와 필수 동의를 확인해주세요.');
   const policy=signupPolicy(this.config);policy.assertEmail(email);
   if(!policy.identityRequired&&input.ageAcknowledged!==true)reject(400,'AGE_ACKNOWLEDGEMENT_REQUIRED','만 19세 이상 가입 조건을 확인해주세요.');
   const password_hash=await hashPassword(password);
   await this.db.$transaction(async tx=>{
     const challenge=await tx.signupChallenge.findUnique({where:{email}});
     if(!challenge?.verified_at||challenge.expires_at<=new Date()||challenge.proof_hash!==digest(text(input.emailProof,100)))reject(403,'EMAIL_VERIFICATION_REQUIRED','이메일 인증이 필요합니다.');
     let identity_hash:string|null=null,verifiedName='';
     if(policy.identityRequired){
       const proof=await tx.identityProof.findUnique({where:{token_hash:digest(text(input.identityProof,100))}});
       if(!proof||proof.purpose!=='signup'||proof.member_id||proof.consumed_at||proof.expires_at<=new Date())reject(403,'IDENTITY_VERIFICATION_REQUIRED','본인인증이 필요합니다.');
       if(proof.adult_verified!==true)reject(403,'MINIMUM_AGE_REQUIRED','만 19세 이상으로 확인된 경우에만 가입할 수 있습니다.');
       const consumed=await tx.identityProof.updateMany({where:{id:proof.id,consumed_at:null},data:{consumed_at:new Date()}});if(consumed.count!==1)reject(409,'PROOF_USED','사용된 본인인증입니다.');
       identity_hash=proof.identity_hash;verifiedName=text(proof.verified_name,80);
     }
     const consents=this.legal.consents(input);const member=await tx.member.create({data:{id:randomUUID(),email,password_hash,name:verifiedName,nickname,preferred_username:randomBytes(7).toString('hex'),email_verified:true,status:'CONFIRMED',identity_hash}});
     if(this.config.get('BEAN_LEDGER_ENABLED')==='true')await ensureBeanWallet(tx,member.id);
     await tx.accountPreference.create({data:{member_id:member.id,marketing_alert:false}});
     await tx.memberConsent.createMany({data:consents.filter(c=>c.kind!=='marketing').map(c=>({...c,member_id:member.id}))});if(input.marketing===true)await recordMarketingChoice(tx,member.id,true,'signup',this.legal.signup().documents.marketing);await tx.signupChallenge.delete({where:{email}});await enqueueOperation(tx,'member.signup',{memberId:member.id},`member.signup:${member.id}`);
   });return{message:'회원가입이 완료되었습니다.'};
 }
 async logout(access?:string,refresh?:string){if(access){try{actorContext(await this.local.validateToken(access));}catch{}}if(access)await this.local.signOut(access);if(refresh){const session=await this.db.memberSession.findUnique({where:{refresh_hash:digest(refresh)}});if(session)await this.db.memberSession.deleteMany({where:{member_id:session.member_id}});}await observeAudit(this.db,{category:'auth',action:'auth.logout',data:{outcome:'completed'}});return{message:'로그아웃했습니다.'};}
 async login(input:any){try{const tokens=await this.local.signIn(this.email(input.email),text(input.password,128),async()=>null,async()=>null,async()=>null);actorContext(await this.local.validateToken(tokens.accessToken));await observeAudit(this.db,{category:'auth',action:'auth.login',data:{outcome:'success'}});return tokens;}catch(error){await observeAudit(this.db,{category:'auth',action:'auth.login',level:'warning',data:{outcome:'failure',...safeError(error)}});throw error;}}
 async refresh(token:string){try{const result=await this.local.refreshToken(token);actorContext(await this.local.validateToken(result.accessToken));await observeAudit(this.db,{category:'auth',action:'auth.refresh',data:{outcome:'success'}});return result;}catch(error){await observeAudit(this.db,{category:'auth',action:'auth.refresh',level:'warning',data:{outcome:'failure',...safeError(error)}});throw error;}}
}
