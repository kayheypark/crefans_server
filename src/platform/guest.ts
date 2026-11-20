import {Param,Body,Controller,Get,Injectable,Post,Req,Res,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {FileInterceptor} from '@nestjs/platform-express';
import {memoryStorage} from 'multer';
import {randomBytes} from 'node:crypto';
import {PlatformService} from './service';
import {PlatformStudioService} from './studio.service';
import {AiPhotoService} from './ai-photo';
import {GuestCaptionService} from './guest-caption';
import {PlatformAuthGuard} from './platform-auth.guard';
import {appendAudit} from './audit';
import {recordFunnelStep} from './funnel-stats';
import {reject} from './http';
import {requestContext} from './request-context';
import {LocalMemberService} from '../auth/local/local-member.service';

import {GUEST_AI_LIMIT,GUEST_CONSENT_VERSION,GUEST_COOKIE,GUEST_POST_HOURS,GUEST_POST_REWARD,GUEST_REPLAY_CONSENT_VERSION,GUEST_SHARE_REWARD,grantGuestShareReward,guestCutoff,guestFromRequest,guestIdFromToken,guestIpHash} from './guest-policy';
export * from './guest-policy';
const COOKIE_DAYS=30;

@Injectable()
export class GuestService{
 constructor(private service:PlatformService,private config:ConfigService,private limiter:LocalMemberService){}
 // Spam guard (2026-11-15): a visitor may publish 10 trial posts a day and one IP 20; uploads are capped at 60 per IP a day.
 async guard(kind:'post'|'upload'|'edit',id:string){const ip=this.ipHash(),limits=kind==='post'?[['guest-post:'+id,10],['guest-post-ip:'+ip,20]]:kind==='edit'?[['guest-edit:'+id,30],['guest-edit-ip:'+ip,60]]:[['guest-upload-ip:'+ip,60]];
  for(const [key,max] of limits as [string,number][]){try{await this.limiter.limit(key,max,86400);}catch(error:any){if(error?.getStatus?.()!==429)throw error;reject(429,'GUEST_RATE_LIMITED','체험 게시·업로드 횟수를 오늘 모두 썼어요. 회원가입하면 계속 이용할 수 있어요.');}}}
 private cookieOptions(){const cookie=this.config.get('app.cookie')||{};return{httpOnly:true,secure:!!cookie.secure,sameSite:'lax' as const,path:'/',maxAge:COOKIE_DAYS*86400000,...(cookie.domain?{domain:cookie.domain}:{})};}
 require(req:any){const id=guestFromRequest(req);if(!id)reject(401,'GUEST_SESSION_REQUIRED','체험을 시작하려면 안내에 동의해 주세요.');return id;}
 ipHash(){return guestIpHash(this.config,requestContext.getStore()?.ip);}
 private replayConsentVersion(){
  // 2026-11-19 user decision: part of the single required trial consent (privacy 17항, 2026-11-19.guest-replay.1), always offered.
  return GUEST_REPLAY_CONSENT_VERSION;
 }
 async status(req:any,quota:(id:string)=>Promise<{limit:number;remaining:number;postRewardClaimed:boolean;shareRewardClaimed:boolean}>){
  const id=guestFromRequest(req);
  const replayConsentVersion=this.replayConsentVersion();
  const {limit,remaining,postRewardClaimed,shareRewardClaimed}=id?await quota(id):{limit:GUEST_AI_LIMIT,remaining:GUEST_AI_LIMIT,postRewardClaimed:false,shareRewardClaimed:false};
  // 2026-11-19 user decision: replay unmasking on the trial screens only for a browser that recorded the replay consent (privacy 17항).
  const replayConsented=id?(await this.service.db.platformAuditLog.count({where:{entity_id:id,action:'guest.replay_consented'}}))>0:false;
  return{active:!!id,...(id?{authorId:id}:{}),consentVersion:GUEST_CONSENT_VERSION,postHours:GUEST_POST_HOURS,limit,remaining,postRewardClaimed,postReward:GUEST_POST_REWARD,shareRewardClaimed,replayConsented,...(replayConsentVersion?{replayConsentVersion}:{})};
 }
 async start(req:any,res:any,input:any){
  if(input?.consent!==true||input?.version!==GUEST_CONSENT_VERSION)reject(400,'GUEST_CONSENT_REQUIRED','체험 안내를 확인하고 동의해 주세요.');
  const replayVersion=this.replayConsentVersion(),replay=input?.replayConsent;
  if(replay!==undefined&&(!replayVersion||replay?.agreed!==true||replay?.version!==replayVersion)){
   reject(400,'GUEST_REPLAY_CONSENT_INVALID','선택 동의 안내가 바뀌었어요. 화면을 새로고침해 주세요.');
  }
  const existing=guestFromRequest(req),token=existing?undefined:randomBytes(32).toString('base64url');
  const id=existing??guestIdFromToken(token!);
  await this.service.db.$transaction(async tx=>{
   await appendAudit(tx,{category:'business',action:'guest.consented',entityId:id,data:{version:GUEST_CONSENT_VERSION}});
   if(replay)await appendAudit(tx,{category:'business',action:'guest.replay_consented',entityId:id,data:{policyVersion:replayVersion}});
  });
  if(token)res.cookie(GUEST_COOKIE,token,this.cookieOptions());
  await recordFunnelStep(this.service.db,'guest_consent_agreed');
  return{active:true,consentVersion:GUEST_CONSENT_VERSION};
 }
 // 2026-11-20 user decision: the trial reward is paid at the first share (share sheet finished or link copied), once per
 // browser, for the guest's own completed AI result. Nothing about the share is stored besides the reward bucket.
 async shareDone(req:any,mediaId:unknown){
  const id=this.require(req);
  if(typeof mediaId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(mediaId))reject(400,'GUEST_SHARE_INVALID','공유할 사진을 확인해 주세요.');
  const media=await this.service.db.media.findFirst({where:{id:mediaId as string,user_sub:id,type:'IMAGE',processing_status:'COMPLETED',is_deleted:false,metadata:{path:'$.aiGenerated',equals:true}},select:{id:true}});
  if(!media)reject(404,'GUEST_SHARE_NOT_FOUND','공유할 결과 사진을 찾을 수 없어요.');
  const granted=await this.service.db.$transaction(async tx=>{
   const done=await grantGuestShareReward(tx,id);
   if(done)await appendAudit(tx,{category:'business',action:'guest.ai_result_share_reward',entityId:id,data:{amount:GUEST_SHARE_REWARD,via:'share'}});
   return done;
  });
  return{granted};
 }
 // 2026-11-20 user request: the console trial history links to the PostHog replay of the visit. The browser reports the PostHog
 // session ID (a random UUID, no content) once per ID; the same ID is stored once (source_id), at most 50 per trial a day.
 async replaySession(req:any,sessionId:unknown){
  const id=this.require(req);
  if(typeof sessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId))reject(400,'GUEST_REPLAY_SESSION_INVALID','세션 번호를 확인해 주세요.');
  const session=(sessionId as string).toLowerCase();
  if(await this.service.db.platformAuditLog.findUnique({where:{source_id:`guest-replay:${id}:${session}`},select:{id:true}}))return{recorded:true};
  try{await this.limiter.limit('guest-replay:'+id,50,86400);}catch(error:any){if(error?.getStatus?.()!==429)throw error;return{recorded:false};}
  await appendAudit(this.service.db,{category:'business',action:'guest.replay_session',entityId:id,sourceId:`guest-replay:${id}:${session}`});
  return{recorded:true};
 }
 // 2026-11-16 user decision: signing in no longer links trial posts by itself; the browser first asks. This counts what would move.
 async claimable(member:string,req:any){await this.service.member(member);const id=guestFromRequest(req);if(!id)return{posts:0};return{posts:await this.service.db.posting.count({where:{user_sub:id,is_deleted:false}})};}
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
 constructor(private guests:GuestService,private studio:PlatformStudioService,private photos:AiPhotoService,private captions:GuestCaptionService){}
 @Get('session') session(@Req() req:any){return this.guests.status(req,id=>this.photos.guestQuota(id));}
 @Post('session') start(@Req() req:any,@Res({passthrough:true}) res:any,@Body() body:any){return this.guests.start(req,res,body);}
 @Post('replay-session') replaySession(@Req() req:any,@Body() body:any){return this.guests.replaySession(req,body?.sessionId);}
 @Post('ai-photo/share-done') shareDone(@Req() req:any,@Body() body:any){return this.guests.shareDone(req,body?.mediaId);}
 @Post('content') async content(@Req() req:any,@Body() body:any){const id=this.guests.require(req);await this.guests.guard('post',id);const saved=await this.studio.saveContent(id,body,{guest:true});await recordFunnelStep(this.studio.db,'post_published_guest');return saved;}
 // Writes the empty title/body at publish time; the visitor confirms before posting (2026-11-16).
 @Post('content/caption') async caption(@Req() req:any,@Body() body:any){const result=await this.captions.caption(this.guests.require(req),body,this.guests.ipHash());await recordFunnelStep(this.studio.db,'caption_written');return result;}
 // 2026-11-16 user decision: the signed-out author may edit only the title and body of their own post; deleting stays unavailable.
 // Declared after content/caption so that literal route wins.
 @Post('content/:id') async editContent(@Req() req:any,@Param('id') postId:string,@Body() body:any){const id=this.guests.require(req);await this.guests.guard('edit',id);return this.studio.updateGuestText(id,postId,body);}
 @Post('ai-photo/edit') @UseInterceptors(FileInterceptor('mask',{storage:memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}))
 edit(@Req() req:any,@Body() body:any,@UploadedFile() mask:any){return this.photos.edit(this.guests.require(req),body,mask,{ipHash:this.guests.ipHash()});}
 @Get('claim') @UseGuards(PlatformAuthGuard) claimable(@Req() req:any){return this.guests.claimable(req.user.sub,req);}
 @Post('claim') @UseGuards(PlatformAuthGuard) claim(@Req() req:any,@Res({passthrough:true}) res:any){return this.guests.claim(req.user.sub,req,res);}
}
