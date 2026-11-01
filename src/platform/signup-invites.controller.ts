import {Body,Controller,Delete,Get,Param,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {PlatformService} from './service';
import {PlatformAdminGuard} from './admin.controller';
import {Permit} from './admin-permissions';
import {listInvites,memberTerms,revokeInvite,saveInvite,saveMemberTerms} from './signup-invites';
// Fee/withdrawal term changes additionally need settings.update and the typed phrase; see signup-invites.ts.
@Controller('admin') @UseGuards(PlatformAdminGuard)
export class SignupInvitesAdminController {
 constructor(private service:PlatformService){}
 @Get('invites') @Permit(['invites','view']) list(@Query() query:any){return listInvites(this.service.db,query);}
 @Post('invites') @Permit(['invites','create']) create(@Req() r:any,@Body() body:any){return saveInvite(this.service.db,r.admin,undefined,body);}
 @Put('invites/:id') @Permit(['invites','update']) update(@Req() r:any,@Param('id') id:string,@Body() body:any){return saveInvite(this.service.db,r.admin,id,body);}
 @Delete('invites/:id') @Permit(['invites','delete']) revoke(@Param('id') id:string,@Body() body:any){return revokeInvite(this.service.db,id,body);}
 @Get('members/:id/terms') @Permit(['members','view']) terms(@Param('id') id:string){return memberTerms(this.service.db,id);}
 @Put('members/:id/terms') @Permit(['members','update']) saveTerms(@Req() r:any,@Param('id') id:string,@Body() body:any){return saveMemberTerms(this.service.db,r.admin,id,body);}
}
