import {Body,Controller,Delete,Get,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {PlatformStudioService} from './studio.service';
import {PlatformAuthGuard} from './platform-auth.guard';
import {reject} from './http';
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
 @Post('comments/:id/reply') reply(@Param('id') id:string,@Body('body') body:string,@Req() r:any){return this.studio.createReply(r.user.sub,id,body);}
 @Put('comments/:id/replies/:replyId') updateReply(@Param('id') id:string,@Param('replyId') replyId:string,@Body('body') body:string,@Req() r:any){return this.studio.updateReply(r.user.sub,id,replyId,body);}
 @Delete('comments/:id/replies/:replyId') deleteReply(@Param('id') id:string,@Param('replyId') replyId:string,@Req() r:any){return this.studio.deleteReply(r.user.sub,id,replyId);}
 @Get('reports/:id') report(@Param('id') id:string,@Query('startDate') start:string,@Query('endDate') end:string,@Req() r:any){return this.studio.report(r.user.sub,id,start,end);}
}
