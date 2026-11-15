import {Body,Controller,Get,Injectable,Post,Req,Res,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {FileInterceptor} from '@nestjs/platform-express';
import {memoryStorage} from 'multer';
import {randomBytes} from 'node:crypto';
import {PlatformService} from './service';
import {PlatformStudioService} from './studio.service';
import {AiPhotoService} from './ai-photo';
import {PlatformAuthGuard} from './platform-auth.guard';
import {appendAudit} from './audit';
import {reject} from './http';
import {requestContext} from './request-context';
import {LocalMemberService} from '../auth/local/local-member.service';

import {GUEST_AI_LIMIT,GUEST_CONSENT_VERSION,GUEST_COOKIE,GUEST_POST_HOURS,guestCutoff,guestFromRequest,guestIdFromToken,guestIpHash} from './guest-policy';
export * from './guest-policy';
const COOKIE_DAYS=30;

@Injectable()
export class GuestService{
 constructor(private service:PlatformService,private config:ConfigService,private limiter:LocalMemberService){}
 // Spam guard (2026-11-15): a visitor may publish 10 trial posts a day and one IP 20; uploads are capped at 60 per IP a day.
 async guard(kind:'post'|'upload',id:string){const ip=this.ipHash(),limits=kind==='post'?[['guest-post:'+id,10],['guest-post-ip:'+ip,20]]:[['guest-upload-ip:'+ip,60]];
  for(const [key,max] of limits as [string,number][]){try{await this.limiter.limit(key,max,86400);}catch(error:any){if(error?.getStatus?.()!==429)throw error;reject(429,'GUEST_RATE_LIMITED','체험 게시·업로드 횟수를 오늘 모두 썼어요. 회원가입하면 계속 이용할 수 있어요.');}}}
 private cookieOptions(){const cookie=this.config.get('app.cookie')||{};return{httpOnly:true,secure:!!cookie.secure,sameSite:'lax' as const,path:'/',maxAge:COOKIE_DAYS*86400000,...(cookie.domain?{domain:cookie.domain}:{})};}
 require(req:any){const id=guestFromRequest(req);if(!id)reject(401,'GUEST_SESSION_REQUIRED','체험을 시작하려면 안내에 동의해 주세요.');return id;}
 ipHash(){return guestIpHash(this.config,requestContext.getStore()?.ip);}
 async status(req:any,remaining:(id:string)=>Promise<number>){const id=guestFromRequest(req);return{active:!!id,consentVersion:GUEST_CONSENT_VERSION,limit:GUEST_AI_LIMIT,postHours:GUEST_POST_HOURS,remaining:id?await remaining(id):GUEST_AI_LIMIT};}
 async start(req:any,res:any,input:any){
  if(input?.consent!==true||input?.version!==GUEST_CONSENT_VERSION)reject(400,'GUEST_CONSENT_REQUIRED','체험 안내를 확인하고 동의해 주세요.');
  let id=guestFromRequest(req);
  if(!id){const token=randomBytes(32).toString('base64url');id=guestIdFromToken(token);res.cookie(GUEST_COOKIE,token,this.cookieOptions());}
  await appendAudit(this.service.db,{category:'business',action:'guest.consented',entityId:id,data:{version:GUEST_CONSENT_VERSION}});
  return{active:true,consentVersion:GUEST_CONSENT_VERSION};
 }
 // Moves this browser's guest posts and photos to the signed-in account. Posts already past 24 hours stay private (is_public=false).
 async claim(member:string,req:any,res:any){
  await this.service.member(member);const id=guestFromRequest(req);if(!id)return{claimed:0};
  const claimed=await this.service.db.$transaction(async(tx:any)=>{
   await tx.posting.updateMany({where:{user_sub:id,published_at:{lt:guestCutoff()}},data:{is_public:false}});
   const posts=await tx.posting.updateMany({where:{user_sub:id},data:{user_sub:member}});
   await tx.media.updateMany({where:{user_sub:id},data:{user_sub:member}});
   return posts.count;
  });
  res.clearCookie(GUEST_COOKIE,{...this.cookieOptions(),maxAge:undefined});
  if(claimed)await appendAudit(this.service.db,{category:'business',action:'guest.claimed',entityId:member,data:{guest:id,posts:claimed}});
  return{claimed};
 }
}

@Controller('guest')
export class GuestController{
 constructor(private guests:GuestService,private studio:PlatformStudioService,private photos:AiPhotoService){}
 @Get('session') session(@Req() req:any){return this.guests.status(req,id=>this.photos.guestRemaining(id));}
 @Post('session') start(@Req() req:any,@Res({passthrough:true}) res:any,@Body() body:any){return this.guests.start(req,res,body);}
 @Post('content') async content(@Req() req:any,@Body() body:any){const id=this.guests.require(req);await this.guests.guard('post',id);return this.studio.saveContent(id,body,{guest:true});}
 @Post('ai-photo/edit') @UseInterceptors(FileInterceptor('mask',{storage:memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}))
 edit(@Req() req:any,@Body() body:any,@UploadedFile() mask:any){return this.photos.edit(this.guests.require(req),body,mask,{ipHash:this.guests.ipHash()});}
 @Post('claim') @UseGuards(PlatformAuthGuard) claim(@Req() req:any,@Res({passthrough:true}) res:any){return this.guests.claim(req.user.sub,req,res);}
}
