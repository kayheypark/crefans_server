import {Body,Controller,Get,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {PlatformStudioService} from './studio.service';
import {PlatformAuthGuard} from './platform-auth.guard';
import {reject,text} from './http';
@Controller('studio') @UseGuards(PlatformAuthGuard)
export class PlatformStudioController {
 constructor(private studio:PlatformStudioService){}
 @Get('overview') overview(@Req() r:any){return this.studio.overview(r.user.sub);}
 @Get('community') community(@Req() r:any){return this.studio.community(r.user.sub);}
 @Post('start') start(@Body() b:any,@Req() r:any){return this.studio.updateProfile(r.user.sub,b,true);}
 @Put('profile') profile(@Body() b:any,@Req() r:any){return this.studio.updateProfile(r.user.sub,b);}
 @Put('activity') async activity(@Body('active') active:boolean,@Req() r:any){if(typeof active!=='boolean')reject(400,'INVALID_INPUT','활동 상태를 확인해주세요.');const c=await this.studio.db.creator.updateMany({where:{user_id:r.user.sub},data:{is_active:active}});if(!c.count)reject(403,'CREATOR_REQUIRED','크리에이터 등록이 필요합니다.');return{message:'활동 상태를 변경했습니다.'};}
 @Put('comments-setting') async comments(@Body('enabled') enabled:boolean,@Req() r:any){if(typeof enabled!=='boolean')reject(400,'INVALID_INPUT','댓글 상태를 확인해주세요.');const c=await this.studio.db.creator.updateMany({where:{user_id:r.user.sub},data:{comments_enabled:enabled}});if(!c.count)reject(403,'CREATOR_REQUIRED','크리에이터 등록이 필요합니다.');return{message:'댓글 설정을 저장했습니다.'};}
 @Post('content') saveContent(@Body() b:any,@Req() r:any){return this.studio.saveContent(r.user.sub,b);}
 @Post('content/:id/delete') deleteContent(@Param('id') id:string,@Req() r:any){return this.studio.deleteContent(r.user.sub,id);}
 @Post('memberships') membership(@Body() b:any,@Req() r:any){return this.studio.saveMembership(r.user.sub,b);}
 @Put('memberships/:id') state(@Param('id') id:string,@Body() b:any,@Req() r:any){return this.studio.membershipState(r.user.sub,id,b);}
 @Put('comments/:id') moderate(@Param('id') id:string,@Body('hidden') hidden:boolean,@Req() r:any){return this.studio.moderate(r.user.sub,id,hidden);}
 @Post('comments/:id/reply') async reply(@Param('id') id:string,@Body('body') body:string,@Req() r:any){const c=await this.studio.db.comment.findUnique({where:{id},include:{posting:true}});if(c?.posting.user_sub!==r.user.sub||c.parent_id)reject(404,'COMMENT_NOT_FOUND','댓글을 찾을 수 없습니다.');await this.studio.db.$transaction([this.studio.db.comment.create({data:{posting_id:c.posting_id,author_id:r.user.sub,parent_id:c.id,content:text(body)}}),this.studio.db.posting.update({where:{id:c.posting_id},data:{comment_count:{increment:1}}})]);return{message:'답글을 등록했습니다.'};}
 @Get('reports/:id') report(@Param('id') id:string,@Query('startDate') start:string,@Query('endDate') end:string,@Req() r:any){return this.studio.report(r.user.sub,id,start,end);}
}
