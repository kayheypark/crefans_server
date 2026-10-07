import {Body,CanActivate,Controller,ExecutionContext,Get,Injectable,Param,Post,Req,UseGuards} from '@nestjs/common';
import {PlatformAuthGuard} from './platform-auth.guard';
import {PlatformService} from './service';
import {reject,text} from './http';
@Injectable()
export class PlatformAdminGuard implements CanActivate{
 constructor(private service:PlatformService){}
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();const admin=await this.service.db.admin.findUnique({where:{user_sub:req.user.sub}});if(!admin?.is_active)reject(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');req.admin=admin;return true;}
}
@Controller('admin') @UseGuards(PlatformAuthGuard,PlatformAdminGuard)
export class PlatformAdminController{
 constructor(private service:PlatformService){}
 @Get('inquiries') inquiries(){return this.service.db.supportTicket.findMany({orderBy:{created_at:'desc'},take:100});}
 @Post('inquiries/:id/reply') async reply(@Param('id') id:string,@Body('reply') reply:string){await this.service.db.supportTicket.update({where:{id},data:{reply:text(reply,10000),status:'answered'}});return{message:'답변을 저장했습니다.'};}
 @Get('reports') reports(){return this.service.db.userReport.findMany({where:{status:'PENDING'},orderBy:{created_at:'asc'},take:100});}
 @Post('reports/:id/resolve') async resolve(@Param('id') id:string,@Body() body:any,@Req() req:any){if(!['RESOLVED','REJECTED'].includes(body.status))reject(400,'INVALID_INPUT','처리 상태를 확인해주세요.');await this.service.db.userReport.update({where:{id},data:{status:body.status,admin_id:req.admin.id,admin_note:text(body.note,2000),resolved_at:new Date()}});return{message:'신고를 처리했습니다.'};}
 @Get('documents') documents(){return this.service.db.serviceDocument.findMany({orderBy:{updated_at:'desc'},take:100});}
 @Post('documents') async document(@Body() body:any,@Req() req:any){if(req.admin.role==='MODERATOR')reject(403,'ADMIN_REQUIRED','문서 게시 권한이 필요합니다.');if(!['faq','notice','terms','privacy','policy'].includes(body.kind)||typeof body.published!=='boolean'||!body.content||JSON.stringify(body.content).length>100000)reject(400,'INVALID_DOCUMENT','문서 내용을 확인해주세요.');const data={kind:body.kind,title:text(body.title,200),content:body.content,published:body.published,pinned:body.pinned===true,category:text(body.category||'',50,false)};const d=body.id?await this.service.db.serviceDocument.update({where:{id:body.id},data}):await this.service.db.serviceDocument.create({data});return{id:d.id,message:'문서를 저장했습니다.'};}
 @Post('categories') async category(@Body() body:any,@Req() req:any){if(req.admin.role==='MODERATOR')reject(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');const name=text(body.name,40);await this.service.db.creatorCategory.upsert({where:{name},create:{name},update:{is_active:body.active!==false}});return{message:'분야를 저장했습니다.'};}
 @Post('creators/:id/promotion') async promotion(@Param('id') id:string,@Body('promoted') promoted:boolean,@Req() req:any){if(req.admin.role==='MODERATOR'||typeof promoted!=='boolean')reject(403,'ADMIN_REQUIRED','광고 설정 권한이 필요합니다.');await this.service.db.creator.update({where:{user_id:id},data:{promoted}});return{message:'노출 설정을 저장했습니다.'};}
}
