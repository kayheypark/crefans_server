import {Body,Controller,Get,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {EmailChangeService} from './email-change.service';
import {PlatformService} from './service';
import {PlatformAuthGuard,PlatformOptionalAuthGuard} from './platform-auth.guard';
@Controller()
export class PlatformController {
 constructor(private service:PlatformService,private emailChange:EmailChangeService){}
 @Get('health') async health(){await this.service.db.$queryRaw`SELECT 1`;return{status:'ready',version:'v1'};}
 @Get('session') @UseGuards(PlatformAuthGuard) session(){return{active:true};}
 @Get('bootstrap') @UseGuards(PlatformOptionalAuthGuard) bootstrap(@Req() r:any,@Query('collection') collection:string){return this.service.bootstrap(r.user?.sub,collection);}
 @Get('creators') @UseGuards(PlatformOptionalAuthGuard) creators(@Query('query') query:string,@Query('category') category:string,@Query('cursor') cursor:string,@Req() r:any){return this.service.directory(r.user?.sub,query,category,cursor);}
 @Get('posts') @UseGuards(PlatformOptionalAuthGuard) posts(@Query('creatorId') creator:string,@Query('cursor') cursor:string,@Query('category') category:string,@Req() r:any){return this.service.postPage(r.user?.sub,creator,cursor,category);}
 @Get('posts/:id') @UseGuards(PlatformOptionalAuthGuard) post(@Param('id') id:string,@Req() r:any){return this.service.postDetail(id,r.user?.sub);}
 @Get('profiles/:id') @UseGuards(PlatformOptionalAuthGuard) profileData(@Param('id') id:string,@Req() r:any){return this.service.publicProfile(id,r.user?.sub);}
 @Get('profiles/:id/connections') @UseGuards(PlatformOptionalAuthGuard) profileConnections(@Param('id') id:string,@Query('kind') kind:string,@Query('offset') offset='0',@Req() r:any){return this.service.profileConnections(id,kind,offset,r.user?.sub);}
 @Get('profiles/:id/following') @UseGuards(PlatformOptionalAuthGuard) profileFollowing(@Param('id') id:string,@Req() r:any){return this.service.profileFollowing(id,r.user?.sub);}
 @Get('common') @UseGuards(PlatformOptionalAuthGuard) common(@Req() r:any){return this.service.common(r.user?.sub);}
 @Get('posts/:id/comments-page') @UseGuards(PlatformOptionalAuthGuard) commentPage(@Param('id') id:string,@Query('offset') offset:string,@Req() r:any){return this.service.commentPage(id,r.user?.sub,offset);}
 @Get('posts/:id/comments') @UseGuards(PlatformOptionalAuthGuard) comments(@Param('id') id:string,@Query('parentId') parent:string,@Req() r:any){return this.service.comments(id,r.user?.sub,parent);}
 @Post('posts/:id/comments') @UseGuards(PlatformAuthGuard) comment(@Param('id') id:string,@Body() b:any,@Req() r:any){return this.service.addComment(r.user.sub,id,b);}
 @Put('posts/:id/like') @UseGuards(PlatformAuthGuard) like(@Param('id') id:string,@Body('enabled') enabled:boolean,@Req() r:any){return this.service.reaction(r.user.sub,id,'like',enabled===true);}
 @Put('posts/:id/save') @UseGuards(PlatformAuthGuard) save(@Param('id') id:string,@Body('enabled') enabled:boolean,@Req() r:any){return this.service.reaction(r.user.sub,id,'save',enabled===true);}
 @Put('members/:id/follow') @UseGuards(PlatformAuthGuard) follow(@Param('id') id:string,@Body('enabled') enabled:boolean,@Req() r:any){return this.service.follow(r.user.sub,id,enabled===true);}
 @Put('members/:id/block') @UseGuards(PlatformAuthGuard) block(@Param('id') id:string,@Body('enabled') enabled:boolean,@Req() r:any){return this.service.block(r.user.sub,id,enabled===true);}
 @Post('members/:id/messages') @UseGuards(PlatformAuthGuard) message(@Param('id') id:string,@Body('body') body:string,@Req() r:any){return this.service.sendMessage(r.user.sub,id,body);}
 @Put('members/:id/messages/read') @UseGuards(PlatformAuthGuard) readMessages(@Param('id') id:string,@Body('ids') ids:unknown,@Req() r:any){return this.service.readMessages(r.user.sub,id,ids);}
 @Post('reports') @UseGuards(PlatformAuthGuard) report(@Body() b:any,@Req() r:any){return this.service.report(r.user.sub,b.id,b.kind==='POSTING'?'POSTING':'USER');}
 @Put('notifications/read') @UseGuards(PlatformAuthGuard) async read(@Body('ids') ids:string[],@Req() r:any){await this.service.db.memberNotification.updateMany({where:{member_id:r.user.sub,id:{in:Array.isArray(ids)?ids.slice(0,100):[]}},data:{read_at:new Date()}});return{message:'읽음 처리했습니다.'};}
 @Put('me/profile') @UseGuards(PlatformAuthGuard) profile(@Body() b:any,@Req() r:any){return this.service.profile(r.user.sub,b);}
 @Post('me/email/request') @UseGuards(PlatformAuthGuard) emailRequest(@Body('email') email:string,@Req() r:any){return this.emailChange.request(r.user.sub,email);}
 @Post('me/email/confirm') @UseGuards(PlatformAuthGuard) emailConfirm(@Body() b:any,@Req() r:any){return this.emailChange.confirm(r.user.sub,b.email,b.code);}
 @Put('me/settings') @UseGuards(PlatformAuthGuard) settings(@Body() b:any,@Req() r:any){return this.service.settings(r.user.sub,b);}
 @Post('me/inquiries') @UseGuards(PlatformAuthGuard) inquiry(@Body() b:any,@Req() r:any){return this.service.inquiry(r.user.sub,b);}
 @Post('me/withdraw') @UseGuards(PlatformAuthGuard) withdraw(@Req() r:any){return this.service.withdrawAccount(r.user.sub);}
}
