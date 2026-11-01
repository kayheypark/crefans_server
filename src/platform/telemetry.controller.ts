import {Body,Controller,Post,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {LocalMemberService} from '../auth/local/local-member.service';
import {PlatformOptionalAuthGuard} from './platform-auth.guard';
import {reportClientError} from './client-errors';
@Controller('telemetry') @UseGuards(PlatformOptionalAuthGuard)
export class PlatformTelemetryController{
 constructor(private db:PrismaService,private limiter:LocalMemberService){}
 @Post('browser-errors') report(@Body() body:any){return reportClientError(this.db,this.limiter,body,'service');}
}
