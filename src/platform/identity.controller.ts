import {Body,Controller,Headers,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityProvider} from './identity-provider';
import {PlatformOptionalAuthGuard} from './platform-auth.guard';
@Controller('identity')
export class IdentityController {
 constructor(private identity:IdentityProvider){}
 @Post('start') @UseGuards(PlatformOptionalAuthGuard) start(@Body('purpose') purpose:string,@Req() req:any){return this.identity.start(purpose,req.user?.sub);}
 @Post('status') status(@Body() body:any){return this.identity.status(body.attemptId,body.state);}
 @Post('callback') callback(@Body() b:any,@Headers('x-pass-signature') signature:string,@Req() req:any){return this.identity.callback(b,signature,req.rawBody);}
}
