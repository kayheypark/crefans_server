import {randomBytes} from 'crypto';
import {Body,Controller,Post,Req,Res} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Response} from 'express';
import {digest,matchesPassword,normalizeEmail} from '../auth/local/credentials';
import {LocalMemberService} from '../auth/local/local-member.service';
import {actorContext,observeAudit} from './audit';
import {reject,text} from './http';
import {PlatformService} from './service';
import {PaymentProvider} from './payment-provider';
import {TOTP_GRACE_DAYS,checkSecondFactor} from './admin-totp-core';

// Console operators sign in with their own credentials and sessions (admins/admin_sessions),
// never with a fan/creator member session.
export const ADMIN_ACCESS_COOKIE='admin_access_token',ADMIN_REFRESH_COOKIE='admin_refresh_token';
// Operator policy (2026-10-29): a session lasts at most 12 hours from sign-in and ends after
// 1 hour without requests. Refresh rotates tokens but never extends the absolute limit.
const IDLE_MS=3600000,ABSOLUTE_MS=12*3600000,SLIDE_AFTER_MS=5*60000;
const token=()=>'aa.'+randomBytes(32).toString('base64url');
// Same scrypt cost for unknown emails so response time does not reveal which operators exist.
const DUMMY_HASH='scrypt-v1$'+'0'.repeat(32)+'$'+'0'.repeat(128);
const valid=(value:unknown)=>typeof value==='string'&&/^aa\.[A-Za-z0-9_-]{43}$/.test(value);

const idleUntil=(now:number,expires:Date)=>new Date(Math.min(now+IDLE_MS,expires.getTime()));
export async function adminFromAccess(db:any,access:unknown){
 if(!valid(access))return null;
 const session=await db.adminSession.findUnique({where:{access_hash:digest(access as string)},include:{admin:true}});
 const now=Date.now();
 if(!session||session.access_until.getTime()<=now||session.expires_at.getTime()<=now||!session.admin.is_active)return null;
 // Activity keeps the idle window open; written at most every few minutes to avoid a write per request.
 const next=idleUntil(now,session.expires_at);
 if(next.getTime()-session.access_until.getTime()>=SLIDE_AFTER_MS)await db.adminSession.updateMany({where:{id:session.id},data:{access_until:next}});
 return session.admin;
}
async function issue(db:any,adminId:string,expires:Date){
 const access=token(),refresh=token(),now=Date.now();
 await db.adminSession.create({data:{admin_id:adminId,access_hash:digest(access),refresh_hash:digest(refresh),access_until:idleUntil(now,expires),expires_at:expires}});
 return{access,refresh,expires};
}
function cookies(res:Response,config:ConfigService,tokens:{access:string;refresh:string;expires:Date}){
 // Host-only, strict cookies: never shared with the fan site's .crefans.com session cookies.
 const base={httpOnly:true,secure:!!config.get('app.cookie')?.secure,sameSite:'strict' as const,path:'/'};
 const remaining=Math.max(0,tokens.expires.getTime()-Date.now());
 res.cookie(ADMIN_ACCESS_COOKIE,tokens.access,{...base,maxAge:remaining});res.cookie(ADMIN_REFRESH_COOKIE,tokens.refresh,{...base,maxAge:remaining});
}
function clear(res:Response){res.clearCookie(ADMIN_ACCESS_COOKIE,{path:'/'});res.clearCookie(ADMIN_REFRESH_COOKIE,{path:'/'});}

@Controller('admin/auth')
export class AdminAuthController{
 constructor(private service:PlatformService,private limiter:LocalMemberService,private config:ConfigService,private provider:PaymentProvider){}
 @Post('login') async login(@Body() body:any,@Res({passthrough:true}) res:Response){
  const email=normalizeEmail(body?.email),password=text(body?.password,256)&&body.password;
  await this.limiter.limit('admin-signin:'+email);
  const admin=await this.service.db.admin.findUnique({where:{email}});
  const matched=await matchesPassword(password,admin?.password_hash||DUMMY_HASH);
  if(!admin?.is_active||!admin.password_hash||!matched){
   await observeAudit(this.service.db,{category:'auth',action:'admin.login',level:'warning',data:{outcome:'failure'}});
   reject(401,'ADMIN_LOGIN_FAILED','이메일 또는 비밀번호를 확인해주세요.');
  }
  // Enrolled operators also give a TOTP or recovery code; an unenrolled one starts the 7-day grace on first sign-in.
  const second=admin.totp_enabled_at?await checkSecondFactor(this.provider,this.limiter,admin,body):admin.totp_grace_until?{}:{totp_grace_until:new Date(Date.now()+TOTP_GRACE_DAYS*86400000)};
  // Same row lock as a password change: a sign-in verified against a replaced password is refused.
  const tokens=await this.service.db.$transaction(async(tx:any)=>{
   const rows:any[]=await tx.$queryRaw`SELECT password_hash,is_active FROM admins WHERE id=${admin.id} FOR UPDATE`;
   if(!rows[0]?.is_active||rows[0].password_hash!==admin.password_hash)reject(401,'ADMIN_LOGIN_FAILED','이메일 또는 비밀번호를 확인해주세요.');
   return issue(tx,admin.id,new Date(Date.now()+ABSOLUTE_MS));
  });
  await this.service.db.admin.update({where:{id:admin.id},data:{last_login:new Date(),...second}});
  actorContext({sub:admin.user_sub},admin.role);await observeAudit(this.service.db,{category:'auth',action:'admin.login',data:{outcome:'success'}});
  cookies(res,this.config,tokens);return{message:'로그인했습니다.'};
 }
 @Post('refresh') async refresh(@Req() req:any,@Res({passthrough:true}) res:Response){
  const value=req.cookies?.[ADMIN_REFRESH_COOKIE];
  const session=valid(value)?await this.service.db.adminSession.findUnique({where:{refresh_hash:digest(value)},include:{admin:true}}):null;
  const now=new Date();
  if(!session||session.expires_at<=now||session.access_until<=now||!session.admin.is_active){clear(res);reject(401,'UNAUTHORIZED','다시 로그인해주세요.');}
  // Rotate both tokens (the old refresh token stops working) and keep the original absolute expiry.
  const removed=await this.service.db.adminSession.deleteMany({where:{id:session.id}});
  if(removed.count!==1){clear(res);reject(401,'UNAUTHORIZED','다시 로그인해주세요.');}
  cookies(res,this.config,await issue(this.service.db,session.admin_id,session.expires_at));return{message:'세션을 갱신했습니다.'};
 }
 @Post('logout') async logout(@Req() req:any,@Res({passthrough:true}) res:Response){
  const access=req.cookies?.[ADMIN_ACCESS_COOKIE],refresh=req.cookies?.[ADMIN_REFRESH_COOKIE];
  const or=[...(valid(access)?[{access_hash:digest(access)}]:[]),...(valid(refresh)?[{refresh_hash:digest(refresh)}]:[])];
  if(or.length)await this.service.db.adminSession.deleteMany({where:{OR:or}});
  clear(res);return{message:'로그아웃했습니다.'};
 }
}
