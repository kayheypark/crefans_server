import {BeansService} from './beans.service';
import {PlatformFinanceService} from './finance.service';
import {MarketingService} from './marketing.service';
import {confirmSettlementReceipt} from './settlement-receipts';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reportClientError} from './client-errors';
import {adminLogs,adminLogDetail} from './admin-logs';
import {actorContext,auditChange,contentDigest,appendAudit} from './audit';
import {Body,CanActivate,Controller,Delete,ExecutionContext,Get,Injectable,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {ADMIN_PERMISSION,AdminRule,Permit,effectivePermissions,requirePermission,requireSuperAdmin} from './admin-permissions';
import {changeMyPassword,createOperator,listOperators,myProfile,resetOperatorPassword,updateMyProfile,updateOperator} from './admin-operators';
import {digest} from '../auth/local/credentials';
import {ADMIN_ACCESS_COOKIE,adminFromAccess} from './admin-auth';
import {PlatformService} from './service';
import {policyView,updateFinancialPolicy} from './financial-policy';
import {reject,text} from './http';
import {enqueueOperation} from './operations-events';
import {adminDashboard} from './admin-dashboard';
import {adminRevenue,adminOverview,adminMembers,adminPosts,adminPayments,adminWithdrawals} from './admin-console';
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
@Controller('admin') @UseGuards(PlatformAdminGuard)
export class PlatformAdminController{
 constructor(private service:PlatformService,private limiter:LocalMemberService,private marketing:MarketingService,private beans:BeansService,private finance:PlatformFinanceService){}
 @Post('marketing/campaigns') @Permit('super') campaign(@Body() body:any,@Req() req:any){return this.marketing.queue(req.admin,body);}
 @Post('client-errors') @Permit('self') clientError(@Body() body:any){return reportClientError(this.service.db,this.limiter,body,'console');}
 @Get('logs') @Permit(['logs','view']) logs(@Query() query:any,@Req() req:any){return adminLogs(this.service.db,req.admin,query);}
 @Get('logs/:id') @Permit(['logs','view']) logDetail(@Param('id') id:string,@Req() req:any){return adminLogDetail(this.service.db,req.admin,id);}
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
 @Get('members') @Permit(['members','view']) members(@Query() query:any){return adminMembers(this.service.db,query);}
 @Get('posts') @Permit(['content','view']) posts(@Query() query:any){return adminPosts(this.service.db,query);}
 @Get('payments') @Permit(['revenue','view']) payments(@Query() query:any,@Req() req:any){return adminPayments(this.service.db,req.admin,query);}
 @Get('withdrawals') @Permit(['revenue','view']) withdrawals(@Query() query:any,@Req() req:any){return adminWithdrawals(this.service.db,req.admin,query);}
 // Manual payout mode: the operator records a bank transfer made outside the app, and confirms settlement accounts by hand.
 @Post('withdrawals/:id/manual-result') @Permit(['revenue','create']) manualResult(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.finance.manualResult(req.admin,id,body);}
 @Get('settlement-accounts') @Permit(['revenue','view']) async settlementAccounts(){const rows=await this.service.db.settlementAccount.findMany({where:{verified:false,account_encrypted:{not:null}},orderBy:{created_at:'asc'},take:100,select:{id:true,creator_id:true,bank:true,holder_alias:true,last_four:true,version:true,created_at:true}});return rows.map((r:any)=>({id:r.id,creatorId:r.creator_id,bank:r.bank,holder:r.holder_alias,lastFour:r.last_four,version:r.version,createdAt:r.created_at}));}
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
 @Post('categories') @Permit(['content','view']) async category(@Body() body:any,@Req() req:any){requirePermission(req.admin,'content',body?.active===undefined?'create':'update');const name=text(body.name,40);await this.service.db.$transaction(async tx=>{const before=await tx.creatorCategory.findUnique({where:{name}});const saved=await tx.creatorCategory.upsert({where:{name},create:{name},update:{is_active:body.active!==false}});await appendAudit(tx,{category:'admin',action:'admin.category_saved',entityId:String(saved.id),data:auditChange(before,{is_active:saved.is_active})});});return{message:'분야를 저장했습니다.'};}
 @Put('creators/:id/verification') @Permit(['members','update']) async verification(@Param('id') id:string,@Body('isVerified') isVerified:boolean,@Req() req:any){
  if(typeof isVerified!=='boolean')reject(400,'INVALID_INPUT','인증 여부를 확인해주세요.');
  await this.service.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM creators WHERE user_id=${id} FOR UPDATE`;
   const before=await tx.creator.findUnique({where:{user_id:id}});
   if(!before)reject(404,'CREATOR_NOT_FOUND','크리에이터를 찾을 수 없습니다.');
   if(before.is_verified===isVerified)return;
   await tx.creator.update({where:{user_id:id},data:{is_verified:isVerified}});
   await appendAudit(tx,{category:'admin',action:'admin.creator_verification_changed',entityId:id,data:auditChange({is_verified:before.is_verified},{is_verified:isVerified})});
  });
  return{message:isVerified?'인증 배지를 부여했습니다.':'인증 배지를 해제했습니다.',isVerified};
 }
 @Post('creators/:id/promotion') @Permit(['members','update']) async promotion(@Param('id') id:string,@Body('promoted') promoted:boolean,@Req() req:any){if(typeof promoted!=='boolean')reject(400,'INVALID_INPUT','광고 설정 값을 확인해주세요.');await this.service.db.$transaction(async tx=>{const before=await tx.creator.findUniqueOrThrow({where:{user_id:id}});await tx.creator.update({where:{user_id:id},data:{promoted}});await appendAudit(tx,{category:'admin',action:'admin.promotion_changed',entityId:id,data:auditChange(before,{promoted})});});return{message:'노출 설정을 저장했습니다.'};}
}
