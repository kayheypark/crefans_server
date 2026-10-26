import {BeansService} from './beans.service';
import {MarketingService} from './marketing.service';
import {confirmSettlementReceipt} from './settlement-receipts';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reportClientError} from './client-errors';
import {adminLogs,adminLogDetail} from './admin-logs';
import {actorContext,auditChange,contentDigest,appendAudit} from './audit';
import {Body,CanActivate,Controller,ExecutionContext,Get,Injectable,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformService} from './service';
import {policyView,updateFinancialPolicy} from './financial-policy';
import {reject,text} from './http';
import {enqueueOperation} from './operations-events';
import {adminDashboard} from './admin-dashboard';
import {adminRevenue,adminOverview,adminMembers,adminPosts,adminPayments,adminWithdrawals} from './admin-console';
@Injectable()
export class PlatformAdminGuard implements CanActivate{
 constructor(private service:PlatformService){}
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();const admin=await this.service.db.admin.findUnique({where:{user_sub:req.user.sub}});if(!admin?.is_active)reject(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');req.admin=admin;actorContext(req.user,admin.role);return true;}
}
@Controller('admin') @UseGuards(PlatformAuthGuard,PlatformAdminGuard)
export class PlatformAdminController{
 constructor(private service:PlatformService,private limiter:LocalMemberService,private marketing:MarketingService,private beans:BeansService){}
 @Post('marketing/campaigns') campaign(@Body() body:any,@Req() req:any){return this.marketing.queue(req.admin,body);}
 @Post('client-errors') clientError(@Body() body:any){return reportClientError(this.service.db,this.limiter,body,'console');}
 @Get('logs') logs(@Query() query:any,@Req() req:any){return adminLogs(this.service.db,req.admin,query);}
 @Get('logs/:id') logDetail(@Param('id') id:string,@Req() req:any){return adminLogDetail(this.service.db,req.admin,id);}
 @Get('me') me(@Req() req:any){return{id:req.admin.id,name:req.admin.name,role:req.admin.role,beanSupport:this.beans.available()};}
 @Get('dashboard') dashboard(@Query() query:any,@Req() req:any){return adminDashboard(this.service.db,req.admin,query);}
 @Get('overview') overview(){return adminOverview(this.service.db);}
 @Get('revenue') revenue(@Query() query:any,@Req() req:any){return adminRevenue(this.service.db,req.admin,query);}
 @Get('members') members(@Query() query:any){return adminMembers(this.service.db,query);}
 @Get('posts') posts(@Query() query:any){return adminPosts(this.service.db,query);}
 @Get('payments') payments(@Query() query:any,@Req() req:any){return adminPayments(this.service.db,req.admin,query);}
 @Get('withdrawals') withdrawals(@Query() query:any,@Req() req:any){return adminWithdrawals(this.service.db,req.admin,query);}
 @Post('revenue/:id/receipt') receipt(@Param('id') id:string,@Body() body:any,@Req() req:any){return confirmSettlementReceipt(this.service.db,req.admin,id,body);}
 @Get('financial-policy') async financialPolicy(@Req() req:any){if(req.admin.role!=='SUPER_ADMIN')reject(403,'SUPER_ADMIN_REQUIRED','최고 관리자만 금융 정책을 조회할 수 있습니다.');return policyView(await this.service.db.financialPolicy.findUnique({where:{id:'platform'}}));}
 @Put('financial-policy') setFinancialPolicy(@Body() body:any,@Req() req:any){return updateFinancialPolicy(this.service.db,req.admin,body);}
 @Get('financial-policy/history') async financialPolicyHistory(@Req() req:any){if(req.admin.role!=='SUPER_ADMIN')reject(403,'SUPER_ADMIN_REQUIRED','최고 관리자만 금융 정책 이력을 조회할 수 있습니다.');return this.service.db.financialPolicyChange.findMany({orderBy:{version:'desc'},take:100});}

 @Get('inquiries') inquiries(){return this.service.db.supportTicket.findMany({orderBy:{created_at:'desc'},take:100});}
 @Post('inquiries/:id/reply') async reply(@Param('id') id:string,@Body('reply') reply:string,@Req() req:any){const value=text(reply,10000);await this.service.db.$transaction(async tx=>{const before=await tx.supportTicket.findUniqueOrThrow({where:{id}});await tx.supportTicket.update({where:{id},data:{reply:value,status:'answered'}});await enqueueOperation(tx,'admin.inquiry_replied',{memberId:req.admin.user_sub,targetId:id},undefined,auditChange({status:before.status,contentHash:contentDigest(before.reply)},{status:'answered',contentHash:contentDigest(value)}));});return{message:'답변을 저장했습니다.'};}
 @Get('reports') reports(){return this.service.db.userReport.findMany({where:{status:'PENDING'},orderBy:{created_at:'asc'},take:100});}
 @Post('reports/:id/resolve') async resolve(@Param('id') id:string,@Body() body:any,@Req() req:any){if(!['RESOLVED','REJECTED'].includes(body.status))reject(400,'INVALID_INPUT','처리 상태를 확인해주세요.');const note=text(body.note,2000);await this.service.db.$transaction(async tx=>{const changed=await tx.userReport.updateMany({where:{id,status:'PENDING'},data:{status:body.status,admin_id:req.admin.id,admin_note:note,resolved_at:new Date()}});if(changed.count!==1)reject(409,'REPORT_ALREADY_PROCESSED','이미 처리되었거나 존재하지 않는 신고입니다.');await enqueueOperation(tx,'admin.report_resolved',{memberId:req.admin.user_sub,targetId:id,status:body.status,previousStatus:'PENDING'});});return{message:'신고를 처리했습니다.'};}
 @Get('documents') documents(){return this.service.db.serviceDocument.findMany({where:{kind:{in:['faq','notice']}},orderBy:{updated_at:'desc'},take:100});}
 @Post('documents') async document(@Body() body:any,@Req() req:any){if(req.admin.role==='MODERATOR')reject(403,'ADMIN_REQUIRED','문서 게시 권한이 필요합니다.');if(!['faq','notice'].includes(body.kind)||typeof body.published!=='boolean'||!body.content||JSON.stringify(body.content).length>100000)reject(400,'INVALID_DOCUMENT','문서 내용을 확인해주세요.');const data={kind:body.kind,title:text(body.title,200),content:body.content,published:body.published,pinned:body.pinned===true,category:text(body.category||'',50,false)};const d=await this.service.db.$transaction(async tx=>{const before=body.id?await tx.serviceDocument.findUnique({where:{id:body.id}}):null;if(before&&!['faq','notice'].includes(before.kind))reject(400,'CODE_MANAGED_DOCUMENT','약관과 개인정보처리방침은 코드 배포로만 변경합니다.');const saved=body.id?await tx.serviceDocument.update({where:{id:body.id},data}):await tx.serviceDocument.create({data});await enqueueOperation(tx,'admin.document_saved',{memberId:req.admin.user_sub,targetId:saved.id,status:saved.published?'published':'draft'},undefined,auditChange(before?{...before,titleHash:contentDigest(before.title),contentHash:contentDigest(before.content)}:null,{...data,titleHash:contentDigest(data.title),contentHash:contentDigest(data.content)}));return saved;});return{id:d.id,message:'문서를 저장했습니다.'};}
 @Post('categories') async category(@Body() body:any,@Req() req:any){if(req.admin.role==='MODERATOR')reject(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');const name=text(body.name,40);await this.service.db.$transaction(async tx=>{const before=await tx.creatorCategory.findUnique({where:{name}});const saved=await tx.creatorCategory.upsert({where:{name},create:{name},update:{is_active:body.active!==false}});await appendAudit(tx,{category:'admin',action:'admin.category_saved',entityId:String(saved.id),data:auditChange(before,{is_active:saved.is_active})});});return{message:'분야를 저장했습니다.'};}
 @Put('creators/:id/verification') async verification(@Param('id') id:string,@Body('isVerified') isVerified:boolean,@Req() req:any){
  if(!['ADMIN','SUPER_ADMIN'].includes(req.admin.role))reject(403,'ADMIN_REQUIRED','크리에이터 인증 관리 권한이 필요합니다.');
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
 @Post('creators/:id/promotion') async promotion(@Param('id') id:string,@Body('promoted') promoted:boolean,@Req() req:any){if(req.admin.role==='MODERATOR'||typeof promoted!=='boolean')reject(403,'ADMIN_REQUIRED','광고 설정 권한이 필요합니다.');await this.service.db.$transaction(async tx=>{const before=await tx.creator.findUniqueOrThrow({where:{user_id:id}});await tx.creator.update({where:{user_id:id},data:{promoted}});await appendAudit(tx,{category:'admin',action:'admin.promotion_changed',entityId:id,data:auditChange(before,{promoted})});});return{message:'노출 설정을 저장했습니다.'};}
}
