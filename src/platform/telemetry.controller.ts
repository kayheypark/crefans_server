import {Body,Controller,Headers,Post,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {LocalMemberService} from '../auth/local/local-member.service';
import {PlatformOptionalAuthGuard} from './platform-auth.guard';
import {reportClientError} from './client-errors';
import {reportFunnelStep} from './funnel-stats';
import {PlatformOperationsService} from './operations.service';
@Controller('telemetry') @UseGuards(PlatformOptionalAuthGuard)
export class PlatformTelemetryController{
 constructor(private db:PrismaService,private limiter:LocalMemberService,private operations:PlatformOperationsService){}
 @Post('browser-errors') report(@Body() body:any){return reportClientError(this.db,this.limiter,body,'service');}
 // 2026-11-18: allow-listed funnel view steps only (aggregate count, nothing about the visitor is stored).
 // 2026-11-18: an accepted landing_view also queues the 랜딩 방문 Telegram alert (not awaited; the user agent is read, never stored).
 @Post('funnel') funnel(@Body() body:any,@Headers('user-agent') userAgent?:string){return reportFunnelStep(this.db,body,{operations:this.operations,userAgent});}
}
