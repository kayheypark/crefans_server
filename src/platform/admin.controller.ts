import {PaymentProvider} from './payment-provider';
import {memberPhoneHash} from './phone-verification';
import {beanPolicy} from './bean-policy';
import {listReservedHandles,reservedHandleHistory,saveReservedHandle,deleteReservedHandle} from './reserved-handles';
import {aiPhotoGrantHistory,grantAiPhoto,listAiPhotoGrants,resetAiPhotoQuota,resetAllAiPhotoQuota,revokeAiPhoto,guestAiQuotaStatus,resetGuestAiQuota} from './ai-photo-grants';
import {aiPhotoConfig} from './ai-photo';
import {grantAiPhotoTickets,listAiPhotoTickets,revokeAiPhotoTickets} from './ai-photo-tickets';
import {ConfigService} from '@nestjs/config';
import {CategoriesService} from './categories.service';
import {Res,UploadedFile,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {BeansService} from './beans.service';
import {PlatformFinanceService} from './finance.service';
import {MarketingService} from './marketing.service';
import {confirmSettlementReceipt} from './settlement-receipts';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reportClientError} from './client-errors';
import {adminLogs,adminLogDetail} from './admin-logs';
import {actorContext,auditChange,contentDigest,appendAudit} from './audit';
import {Body,CanActivate,Controller,Delete,ExecutionContext,Get,Header,HttpCode,Injectable,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {adminPayoutList} from './admin-payout-list';
import {Reflector} from '@nestjs/core';
import {ADMIN_PERMISSION,AdminRule,Permit,effectivePermissions,requirePermission,requireSuperAdmin} from './admin-permissions';
import {changeMyPassword,createOperator,listOperators,myProfile,resetOperatorPassword,updateMyProfile,updateOperator} from './admin-operators';
import {digest} from '../auth/local/credentials';
import {ADMIN_ACCESS_COOKIE,adminFromAccess} from './admin-auth';
import {PlatformService} from './service';
import {policyView,updateFinancialPolicy} from './financial-policy';
import {dateOnly,reject,text} from './http';
import {enqueueOperation} from './operations-events';
import {adminDashboard} from './admin-dashboard';
import {adminReferralLink,adminReferrals,updateReferralSettings} from './admin-referrals';
import {revokeReferralReward} from './referrals';
import {adminRevenue,adminOverview,adminMembers,adminPosts,adminPayments,adminWithdrawals} from './admin-console';
import {adminMemberships,adminSubscriptions,cancelSubscriptionNow} from './admin-memberships';
@Injectable()
export class PlatformAdminGuard implements CanActivate{
 constructor(private service:PlatformService,private reflector:Reflector){}
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();
  // Operator session only; a fan/creator member session never grants console access.
  const admin=await adminFromAccess(this.service.db,req.cookies?.[ADMIN_ACCESS_COOKIE]);if(!admin)reject(401,'UNAUTHORIZED','운영자 로그인이 필요합니다.');req.admin=admin;req.user={sub:admin.user_sub};actorContext(req.user,admin.role);
  // Deny by default: every admin route declares the menu/action it needs.
  // Express middleware (API docs) has no route handler: any active operator with a changed password.
  const handler=ctx.getHandler?.(),rule=handler?this.reflector.getAllAndOverride<AdminRule>(ADMIN_PERMISSION,[handler,ctx.getClass()]):'any';
  if(!rule)reject(403,'ADMIN_PERMISSION_REQUIRED','이 작업을 할 권한이 없습니다.');
  if(rule==='self')return true;
  // Past the 7-day grace an operator without TOTP can only reach their own enrollment ('self') routes.
  if(!admin.totp_enabled_at&&admin.totp_grace_until&&admin.totp_grace_until<new Date())reject(403,'TOTP_ENROLLMENT_REQUIRED','2차 인증(OTP)을 등록해야 콘솔을 쓸 수 있습니다.');
  if(admin.must_change_password)reject(403,'PASSWORD_CHANGE_REQUIRED','임시 비밀번호를 먼저 변경해주세요.');
  if(rule==='any')return true;
  if(rule==='super')requireSuperAdmin(admin);else requirePermission(admin,rule[0],rule[1]);
  return true;}
}
// Module-level, not a controller method: every controller method must be a permitted route (admin-operators test).
async function terminationNotice(db:any,finance:PlatformFinanceService,id:string){
  const f=await finance.finance(id),s=f.summary;
  const beans=(await db.beanLot.aggregate({_sum:{available:true},where:{member_id:id,bucket:{in:[...beanPolicy.withdrawableBuckets]}}}))._sum.available||0;
  const receivables=await db.creatorReceivable.findMany({where:{creator_id:id,status:'open'},select:{amount:true,kind:true}});
  const owed=receivables.reduce((n:number,r:any)=>n+r.amount,0),unsettled=Math.max(0,Number(s.pending)+Number(s.available)+Number(s.requested));
  const due=new Date(Date.now()+30*86400000),won=(n:number)=>`${n.toLocaleString('ko-KR')}원`;
  await db.$transaction(async(tx:any)=>{
   await tx.memberNotification.create({data:{member_id:id,type:'settlement',text:`파트너 계약이 종료되었어요. 미정산 수익 ${won(unsettled)}, 출금 가능 콩 ${beans.toLocaleString('ko-KR')}콩, 미수금 ${won(owed)}이 남아 있어요. ${dateOnly(due)}까지 처리 방법을 정하고, 합의가 없으면 확정 수익 전액을 정산 계좌로 보내 드려요.`.slice(0,191),path:'/studio/revenue'}});
   await enqueueOperation(tx,'creator.partner_ended',{creatorId:id,status:'ended',dueAt:due.toISOString()},`creator.partner_ended:${id}:${dateOnly(new Date())}`,{unsettled,beans,owed,receivables:receivables.length});
  });
 }

@Controller('admin') @UseGuards(PlatformAdminGuard)
export class PlatformAdminController{
 constructor(private service:PlatformService,private limiter:LocalMemberService,private marketing:MarketingService,private beans:BeansService,private finance:PlatformFinanceService,private categoryManager:CategoriesService,private config:ConfigService){}
 @Post('marketing/campaigns') @Permit('super') campaign(@Body() body:any,@Req() req:any){return this.marketing.queue(req.admin,body);}
 @Post('client-errors') @Permit('self') clientError(@Body() body:any){return reportClientError(this.service.db,this.limiter,body,'console');}
 @Get('logs') @Permit(['logs','view']) logs(@Query() query:any,@Req() req:any){return adminLogs(this.service.db,req.admin,query);}
 @Get('logs/:id') @Header('Cache-Control','private, no-store') @Permit(['logs','view']) logDetail(@Param('id') id:string,@Req() req:any){return adminLogDetail(this.service.db,req.admin,id,this.config);}
 @Get('me') @Permit('self') me(@Req() req:any){return{id:req.admin.id,name:req.admin.name,role:req.admin.role,mustChangePassword:req.admin.must_change_password,totp:{enabled:!!req.admin.totp_enabled_at,graceUntil:req.admin.totp_enabled_at?null:req.admin.totp_grace_until,recoveryCodesLeft:Array.isArray(req.admin.totp_recovery)?req.admin.totp_recovery.length:0},permissions:effectivePermissions(req.admin),beanSupport:this.beans.available(),...this.service.paymentSwitches()};}
 @Get('me/profile') @Permit('self') profile(@Req() req:any){return myProfile(this.service.db,req.admin);}
 @Put('me/profile') @Permit('self') saveProfile(@Body() body:any,@Req() req:any){if(req.admin.must_change_password)reject(403,'PASSWORD_CHANGE_REQUIRED','임시 비밀번호를 먼저 변경해주세요.');return updateMyProfile(this.service.db,req.admin,body);}
 @Post('me/password') @Permit('self') async password(@Body() body:any,@Req() req:any){await this.limiter.limit('admin-password:'+req.admin.id,5,600);return changeMyPassword(this.service.db,req.admin,body,req.cookies?.[ADMIN_ACCESS_COOKIE]?digest(req.cookies[ADMIN_ACCESS_COOKIE]):undefined);}
 @Get('operators') @Permit('super') operators(){return listOperators(this.service.db);}
 @Post('operators') @Permit('super') createOperator(@Body() body:any,@Req() req:any){return createOperator(this.service.db,req.admin,body);}
 @Put('operators/:id') @Permit('super') updateOperator(@Param('id') id:string,@Body() body:any,@Req() req:any){return updateOperator(this.service.db,req.admin,id,body);}
 @Post('operators/:id/password-reset') @Permit('super') resetOperator(@Param('id') id:string,@Req() req:any){return resetOperatorPassword(this.service.db,req.admin,id);}
 @Delete('operators/:id') @Permit('super') deactivateOperator(@Param('id') id:string,@Req() req:any){return updateOperator(this.service.db,req.admin,id,{isActive:false});}
 @Get('dashboard') @Permit(['overview','view']) dashboard(@Query() query:any,@Req() req:any){return adminDashboard(this.service.db,req.admin,query);}
 @Get('overview') @Permit(['overview','view']) overview(){return adminOverview(this.service.db);}
 @Get('revenue') @Permit(['revenue','view']) revenue(@Query() query:any,@Req() req:any){return adminRevenue(this.service.db,req.admin,query);}
 @Get('reserved-handles') @Permit(['reserved-handles','view']) reservedHandles(@Query() query:any,@Req() req:any){return listReservedHandles(this.service.db,req.admin,query);}
 @Get('reserved-handles/:id/history') @Permit(['reserved-handles','view']) reservedHistory(@Param('id') id:string,@Query() query:any,@Req() req:any){return reservedHandleHistory(this.service.db,req.admin,id,query);}
 @Post('reserved-handles') @Permit(['reserved-handles','create']) createReservedHandle(@Body() body:any,@Req() req:any){return saveReservedHandle(this.service.db,req.admin,undefined,body);}
 @Put('reserved-handles/:id') @Permit(['reserved-handles','update']) updateReservedHandle(@Param('id') id:string,@Body() body:any,@Req() req:any){return saveReservedHandle(this.service.db,req.admin,id,body);}
 @Delete('reserved-handles/:id') @Permit(['reserved-handles','delete']) removeReservedHandle(@Param('id') id:string,@Body() body:any,@Req() req:any){return deleteReservedHandle(this.service.db,req.admin,id,body);}
 // Studio AI photo editor allow-list (2026-11-08): members.view lists, members.update grants/revokes with a reason.
 @Get('ai-photo-grants') @Permit(['members','view']) aiPhotoGrants(@Query() query:any,@Req() req:any){return listAiPhotoGrants(this.service.db,req.admin,query,aiPhotoConfig(this.config).perDay);}
 @Post('ai-photo-grants/quota-reset') @Permit(['members','update']) resetAllAiPhotoQuota(@Body() body:any,@Req() req:any){return resetAllAiPhotoQuota(this.service.db,req.admin,body);}
 @Get('ai-photo-grants/:creatorId/tickets') @Permit(['members','view']) aiPhotoTickets(@Param('creatorId') id:string,@Req() req:any){return listAiPhotoTickets(this.service.db,req.admin,id);}
 @Post('ai-photo-grants/:creatorId/tickets') @Permit(['members','update']) grantAiPhotoTickets(@Param('creatorId') id:string,@Body() body:any,@Req() req:any){return grantAiPhotoTickets(this.service.db,req.admin,id,body);}
 @Post('ai-photo-grants/:creatorId/tickets/:ticketId/revoke') @Permit(['members','update']) revokeAiPhotoTickets(@Param('creatorId') id:string,@Param('ticketId') ticketId:string,@Body() body:any,@Req() req:any){return revokeAiPhotoTickets(this.service.db,req.admin,id,ticketId,body);}
 @Post('ai-photo-grants/:creatorId/quota-reset') @Permit(['members','update']) resetAiPhotoQuota(@Param('creatorId') id:string,@Body() body:any,@Req() req:any){return resetAiPhotoQuota(this.service.db,req.admin,id,body);}
 @Get('ai-photo-grants/:creatorId/history') @Permit(['members','view']) aiPhotoGrantHistory(@Param('creatorId') id:string,@Query() query:any,@Req() req:any){return aiPhotoGrantHistory(this.service.db,req.admin,id,query);}
 @Get('ai-photo-guest-quota') @Permit(['members','view']) guestAiQuota(@Req() req:any){return guestAiQuotaStatus(this.service.db,req.admin);}
 @Post('ai-photo-guest-quota/reset') @Permit(['members','update']) resetGuestAiQuota(@Body() body:any,@Req() req:any){return resetGuestAiQuota(this.service.db,req.admin,body);}
 @Post('ai-photo-grants') @Permit(['members','update']) grantAiPhoto(@Body() body:any,@Req() req:any){return grantAiPhoto(this.service.db,req.admin,body);}
 @Delete('ai-photo-grants/:creatorId') @Permit(['members','update']) revokeAiPhoto(@Param('creatorId') id:string,@Body() body:any,@Req() req:any){return revokeAiPhoto(this.service.db,req.admin,id,body);}
 @Get('members') @Permit(['members','view']) members(@Query() query:any){return adminMembers(this.service.db,query,phone=>memberPhoneHash(this.config,phone));}
 // 2026-11-18 user decision (별도 권한 + 사유 + 감사): SUPER_ADMIN only, a 5-200 char reason in the POST body (never in the URL),
 // never cached, 20 reveals/hour per operator, each reveal audited (who, whose, reason hash) without the number itself.
 @Post('members/:id/phone') @HttpCode(200) @Permit('super') @Header('Cache-Control','private, no-store') async memberPhone(@Param('id') id:string,@Body() body:any,@Req() req:any){const reason=typeof body?.reason==='string'?body.reason.trim():'';if(reason.length<5||reason.length>200)reject(400,'REVEAL_REASON_REQUIRED','열람 사유를 5자 이상 200자 이하로 입력해주세요.');await this.limiter.limit('admin-phone-reveal:'+req.admin.id,20,3600);const row=await this.service.db.memberPhone.findUnique({where:{member_id:id}});if(!row?.phone_encrypted)reject(404,'PHONE_NOT_KEPT','보관된 휴대폰 번호가 없습니다.');const phone=new PaymentProvider(this.config).decrypt(row.phone_encrypted);await appendAudit(this.service.db,{category:'admin',action:'admin.member_phone_revealed',entityId:id,data:{changedBy:req.admin.id,after:{status:'revealed',contentHash:contentDigest(reason)}}});return{phone:`${phone.slice(0,3)}-${phone.slice(3,7)}-${phone.slice(7)}`};}
 @Get('referrals') @Permit(['referrals','view']) referrals(@Query() query:any){return adminReferrals(this.service.db,query);}
 @Put('referrals/settings') @Permit(['referrals','update']) referralSettings(@Body() body:any,@Req() req:any){return updateReferralSettings(this.service.db,req.admin,body);}
 @Post('members/:id/referral') @Permit(['referrals','create']) referralLink(@Param('id') id:string){return adminReferralLink(this.service.db,id);}
 @Post('referrals/:id/revoke') @Permit(['referrals','update']) revokeReferral(@Param('id') id:string,@Body() body:any,@Req() req:any){return revokeReferralReward(this.service.db,req.admin.id,id,body);}
 @Get('posts') @Permit(['content','view']) posts(@Query() query:any){return adminPosts(this.service.db,query);}
 @Get('payments') @Permit(['revenue','view']) payments(@Query() query:any,@Req() req:any){return adminPayments(this.service.db,req.admin,query);}
 @Get('memberships') @Permit(['revenue','view']) memberships(@Query() query:any,@Req() req:any){return adminMemberships(this.service.db,req.admin,query);}
 @Get('subscriptions') @Permit(['revenue','view']) subscriptions(@Query() query:any,@Req() req:any){return adminSubscriptions(this.service.db,req.admin,query);}
 @Post('subscriptions/:id/cancel-now') @Permit(['revenue','view']) cancelSubscriptionNow(@Param('id') id:string,@Body() body:any,@Req() req:any){return cancelSubscriptionNow(this.service.db,req.admin,id,body);}
 @Post('subscriptions/:id/refund') @Permit(['revenue','view']) refundSubscription(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.finance.adminRefund(req.admin,id,body);}
 @Get('withdrawals') @Permit(['revenue','view']) async withdrawals(@Query() query:any,@Req() req:any){const result=await adminWithdrawals(this.service.db,req.admin,query);return{...result,items:await this.finance.withRejectable(result.items)};}
 // Manual payout mode: the operator records a bank transfer made outside the app, and confirms settlement accounts by hand.
 @Post('withdrawals/:id/manual-result') @Permit(['revenue','create']) manualResult(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.finance.manualResult(req.admin,id,body);}
 // A requested withdrawal left above the available balance by a later refund (PAYOUT_BALANCE_CHANGED) is rejected by an operator.
 @Post('withdrawals/:id/reject') @Permit(['revenue','create']) rejectWithdrawal(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.finance.rejectWithdrawal(req.admin,id,body);}
 @Get('settlement-accounts') @Permit(['revenue','view']) async settlementAccounts(){const rows=await this.service.db.settlementAccount.findMany({where:{verified:false,account_encrypted:{not:null}},orderBy:{created_at:'asc'},take:100,select:{id:true,creator_id:true,bank:true,holder_alias:true,last_four:true,version:true,created_at:true}});return rows.map((r:any)=>({id:r.id,creatorId:r.creator_id,bank:r.bank,holder:r.holder_alias,lastFour:r.last_four,version:r.version,createdAt:r.created_at}));}
 @Get('payouts/due') @Header('Cache-Control','private, no-store') @Permit(['revenue','view']) payoutsDue(@Req() req:any){return adminPayoutList(this.service.db,req.admin);}
 @Post('settlement-accounts/:id/reveal') @HttpCode(200) @Header('Cache-Control','private, no-store') @Permit(['revenue','create']) revealAccount(@Param('id') id:string,@Req() req:any){return this.finance.revealAccount(req.admin,id);}
 @Post('settlement-accounts/:id/verify') @Permit(['revenue','create']) verifyAccount(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.finance.manualVerifyAccount(req.admin,id,body);}
 @Post('revenue/:id/receipt') @Permit(['revenue','create']) receipt(@Param('id') id:string,@Body() body:any,@Req() req:any){return confirmSettlementReceipt(this.service.db,req.admin,id,body);}
 @Get('financial-policy') @Permit(['settings','view']) async financialPolicy(){return policyView(await this.service.db.financialPolicy.findUnique({where:{id:'platform'}}));}
 @Put('financial-policy') @Permit(['settings','update']) setFinancialPolicy(@Body() body:any,@Req() req:any){return updateFinancialPolicy(this.service.db,req.admin,body);}
 @Get('financial-policy/history') @Permit(['settings','view']) async financialPolicyHistory(){return this.service.db.financialPolicyChange.findMany({orderBy:{version:'desc'},take:100});}

 @Get('inquiries') @Permit(['support','view']) inquiries(){return this.service.db.supportTicket.findMany({orderBy:{created_at:'desc'},take:100});}
 @Post('inquiries/:id/reply') @Permit(['support','update']) async reply(@Param('id') id:string,@Body('reply') reply:string,@Req() req:any){const value=text(reply,10000);await this.service.db.$transaction(async tx=>{const before=await tx.supportTicket.findUniqueOrThrow({where:{id}});await tx.supportTicket.update({where:{id},data:{reply:value,status:'answered'}});await enqueueOperation(tx,'admin.inquiry_replied',{memberId:req.admin.user_sub,targetId:id},undefined,auditChange({status:before.status,contentHash:contentDigest(before.reply)},{status:'answered',contentHash:contentDigest(value)}));});return{message:'답변을 저장했습니다.'};}
 @Get('reports') @Permit(['content','view']) async reports(){const rows=await this.service.db.userReport.findMany({where:{status:'PENDING'},orderBy:{created_at:'asc'},take:100});
  // A comment report carries the comment itself so the operator can judge and hide it from the same row.
  const comments=await this.service.db.comment.findMany({where:{id:{in:rows.filter(r=>r.target_type==='COMMENT').map(r=>r.target_id)}},select:{id:true,content:true,posting_id:true,author_id:true,hidden:true,is_deleted:true}});
  return rows.map(r=>r.target_type==='COMMENT'?{...r,comment:comments.find(c=>c.id===r.target_id)||null}:r);}
 @Post('reports/:id/resolve') @Permit(['content','update']) async resolve(@Param('id') id:string,@Body() body:any,@Req() req:any){if(!['RESOLVED','REJECTED'].includes(body.status))reject(400,'INVALID_INPUT','처리 상태를 확인해주세요.');const note=text(body.note,2000);await this.service.db.$transaction(async tx=>{const changed=await tx.userReport.updateMany({where:{id,status:'PENDING'},data:{status:body.status,admin_id:req.admin.id,admin_note:note,resolved_at:new Date()}});if(changed.count!==1)reject(409,'REPORT_ALREADY_PROCESSED','이미 처리되었거나 존재하지 않는 신고입니다.');const report=await tx.userReport.findUniqueOrThrow({where:{id}});// The reporter learns that review finished (terms §8 from 2026-11-30); the internal note and the reporter's identity stay private.
await tx.memberNotification.create({data:{member_id:report.reporter_id,type:'moderation',text:body.status==='RESOLVED'?'신고하신 내용을 검토하고 조치했습니다.':'신고하신 내용을 검토했으며 운영정책 위반을 확인하지 못했습니다.',path:'/notifications'}});await enqueueOperation(tx,'admin.report_resolved',{memberId:req.admin.user_sub,targetId:id,status:body.status,previousStatus:'PENDING'});});return{message:'신고를 처리했습니다.'};}
 @Get('documents') @Permit(['support','view']) documents(){return this.service.db.serviceDocument.findMany({where:{kind:{in:['faq','notice']}},orderBy:{updated_at:'desc'},take:100});}
 @Post('documents') @Permit(['support','view']) async document(@Body() body:any,@Req() req:any){requirePermission(req.admin,'support',body?.id?'update':'create');if(!['faq','notice'].includes(body.kind)||typeof body.published!=='boolean'||!body.content||JSON.stringify(body.content).length>100000)reject(400,'INVALID_DOCUMENT','문서 내용을 확인해주세요.');const data={kind:body.kind,title:text(body.title,200),content:body.content,published:body.published,pinned:body.pinned===true,category:text(body.category||'',50,false)};const d=await this.service.db.$transaction(async tx=>{const before=body.id?await tx.serviceDocument.findUnique({where:{id:body.id}}):null;if(before&&!['faq','notice'].includes(before.kind))reject(400,'CODE_MANAGED_DOCUMENT','약관과 개인정보처리방침은 코드 배포로만 변경합니다.');const saved=body.id?await tx.serviceDocument.update({where:{id:body.id},data}):await tx.serviceDocument.create({data});await enqueueOperation(tx,'admin.document_saved',{memberId:req.admin.user_sub,targetId:saved.id,status:saved.published?'published':'draft'},undefined,auditChange(before?{...before,titleHash:contentDigest(before.title),contentHash:contentDigest(before.content)}:null,{...data,titleHash:contentDigest(data.title),contentHash:contentDigest(data.content)}));return saved;});return{id:d.id,message:'문서를 저장했습니다.'};}
 @Get('categories') @Permit(['content','view']) categories(){return this.categoryManager.list();}
 @Put('categories/order') @Permit(['content','update']) categoryOrder(@Body() body:any){return this.categoryManager.reorder(body);}
 @Put('categories/:id') @Permit(['content','update']) updateCategory(@Param('id') id:string,@Body() body:any){return this.categoryManager.update(id,body);}
 @Get('categories/:id/icon/:version') @Permit(['content','view']) categoryImage(@Param('id') id:string,@Param('version') version:string,@Res() res:any){return this.categoryManager.image(id,version,res);}
 @Post('categories/:id/icon') @Permit(['content','update']) @UseInterceptors(FileInterceptor('file',{limits:{fileSize:2*1024*1024,files:1,fields:0}}))
 async categoryIcon(@Param('id') id:string,@UploadedFile() file:any,@Req() req:any){await this.limiter.limit('category-icon:'+req.admin.id,30,600);return this.categoryManager.upload(id,file);}
 @Delete('categories/:id/icon') @Permit(['content','update']) resetCategoryIcon(@Param('id') id:string){return this.categoryManager.resetIcon(id);}
 @Post('categories') @Permit(['content','view']) async category(@Body() body:any,@Req() req:any){
  const creating=body?.active===undefined;
  requirePermission(req.admin,'content',creating?'create':'update');
  const name=text(body?.name,40);
  if(!creating&&typeof body.active!=='boolean')reject(400,'INVALID_INPUT','활성 상태는 true 또는 false여야 합니다.');
  try{await this.service.db.$transaction(async tx=>{
   // Serialize status changes; creation uses the unique name constraint, never an upsert.
   if(!creating)await tx.$queryRaw`SELECT id FROM creator_categories WHERE name=${name} FOR UPDATE`;
   const before=await tx.creatorCategory.findUnique({where:{name}});
   if(creating&&before)reject(409,'CATEGORY_EXISTS','이미 등록된 분야 이름입니다. 다른 이름을 입력해주세요.');
   if(!creating&&(!before||before.is_deleted))reject(404,'CATEGORY_NOT_FOUND','활동 분야를 찾을 수 없습니다.');
   if(!creating&&before.is_active===body.active)return;
   const last=creating?await tx.creatorCategory.aggregate({_max:{sort_order:true}}):null;
   const saved=creating?await tx.creatorCategory.create({data:{name,sort_order:(last?._max.sort_order??-1)+1}}):await tx.creatorCategory.update({where:{id:before.id},data:{is_active:body.active}});
   await appendAudit(tx,{category:'admin',action:'admin.category_saved',entityId:saved.id,data:auditChange(before?{is_active:before.is_active}:null,{is_active:saved.is_active})});
  });}catch(error){
   if((error as {code?:string})?.code==='P2002')reject(409,'CATEGORY_EXISTS','이미 등록된 분야 이름입니다. 다른 이름을 입력해주세요.');
   throw error;
  }
  return{message:creating?'활동 분야를 추가했습니다.':'분야 상태를 저장했습니다.'};
 }
 @Put('creators/:id/verification') @Permit(['members','update']) async verification(@Param('id') id:string,@Body('isVerified') isVerified:boolean,@Req() req:any){
  if(typeof isVerified!=='boolean')reject(400,'INVALID_INPUT','인증 여부를 확인해주세요.');
  let paused=0;
  await this.service.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${id} FOR UPDATE`;
   const before=await tx.creator.findUnique({where:{user_id:id}});
   if(!before)reject(404,'CREATOR_NOT_FOUND','크리에이터를 찾을 수 없습니다.');
   if(before.is_verified===isVerified)return;
   await tx.creator.update({where:{user_id:id},data:{is_verified:isVerified}});
   // 2026-11-16 user decision (contract article 12(2)): ending the partnership pauses the memberships on sale. Paid periods
   // continue; the renewal job stops renewing a paused membership and tells the subscriber (membership-notices 'unavailable').
   if(!isVerified)paused=(await tx.membershipItem.updateMany({where:{creator_id:id,is_active:true,is_deleted:false},data:{is_active:false}})).count;
   await appendAudit(tx,{category:'admin',action:'admin.creator_verification_changed',entityId:id,data:{...auditChange({is_verified:before.is_verified},{is_verified:isVerified}),...(isVerified?{}:{membershipsPaused:paused})}});
  });
  // 2026-11-17 user decision (signed contract article 12(2)): ending the partnership tells the creator the unsettled revenue and
  // receivables (amounts and items) and starts the 30-day consultation; operators get the 30-day date to pay if no agreement.
  if(!isVerified)await terminationNotice(this.service.db,this.finance,id);
  return{message:isVerified?'인증 배지를 부여했습니다.':`인증 배지를 해제했습니다.${paused?` 판매 중이던 멤버십 ${paused}개를 중지했어요(기존 구독자는 이용 기간까지, 다음 갱신은 없음).`:''}`,isVerified,...(isVerified?{}:{membershipsPaused:paused})};
 }
 @Get('creators/:id/closing-payout') @Permit(['revenue','create']) closingPayout(@Param('id') id:string,@Req() req:any){return this.finance.closingPayoutPreview(req.admin,id);}
 @Post('creators/:id/closing-payout') @Permit(['revenue','create']) startClosingPayout(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.finance.startClosingPayout(req.admin,id,body);}
 @Post('creators/:id/promotion') @Permit(['members','update']) async promotion(@Param('id') id:string,@Body('promoted') promoted:boolean,@Req() req:any){if(typeof promoted!=='boolean')reject(400,'INVALID_INPUT','광고 설정 값을 확인해주세요.');await this.service.db.$transaction(async tx=>{const before=await tx.creator.findUniqueOrThrow({where:{user_id:id}});await tx.creator.update({where:{user_id:id},data:{promoted}});await appendAudit(tx,{category:'admin',action:'admin.promotion_changed',entityId:id,data:auditChange(before,{promoted})});});return{message:'노출 설정을 저장했습니다.'};}
}
