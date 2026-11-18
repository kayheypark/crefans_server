import {Body,Controller,Post,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {LocalMemberService} from '../auth/local/local-member.service';
import {PlatformOptionalAuthGuard} from './platform-auth.guard';
import {reportClientError} from './client-errors';
import {reportFunnelStep} from './funnel-stats';
@Controller('telemetry') @UseGuards(PlatformOptionalAuthGuard)
export class PlatformTelemetryController{
 constructor(private db:PrismaService,private limiter:LocalMemberService){}
 @Post('browser-errors') report(@Body() body:any){return reportClientError(this.db,this.limiter,body,'service');}
 // 2026-11-18: allow-listed funnel view steps only (aggregate count, nothing about the visitor is stored).
 @Post('funnel') funnel(@Body() body:any){return reportFunnelStep(this.db,body);}
}
