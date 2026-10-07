import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {PrismaModule} from '../prisma/prisma.module';
import {LocalMemberModule} from '../auth/local/local-member.module';
import {MemberMailService} from '../auth/local/member-mail.service';
import {PlatformAuthGuard,PlatformOptionalAuthGuard} from './platform-auth.guard';
import {PlatformAuthService} from './auth.service';
import {PlatformAuthController} from './auth.controller';
import {PlatformController} from './controller';
import {PlatformService} from './service';
import {PlatformStudioService} from './studio.service';
import {PlatformStudioController} from './studio.controller';
import {PlatformFinanceService} from './finance.service';
import {PlatformFinanceController} from './finance.controller';
import {PaymentProvider} from './payment-provider';
import {PlatformMediaController} from './media.controller';
import {IdentityProvider} from './identity-provider';
import {IdentityController} from './identity.controller';
import {BankProvider} from './bank-provider';
import {PlatformAdminController,PlatformAdminGuard} from './admin.controller';
import {EmailChangeService} from './email-change.service';
import {PlatformJobsService} from './jobs.service';
import appConfig from '../config/app.config';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,load:[appConfig]}),PrismaModule,LocalMemberModule],controllers:[PlatformAdminController,IdentityController,PlatformAuthController,PlatformController,PlatformStudioController,PlatformFinanceController,PlatformMediaController],providers:[PlatformJobsService,EmailChangeService,PlatformAdminGuard,IdentityProvider,BankProvider,MemberMailService,PlatformAuthGuard,PlatformOptionalAuthGuard,PlatformAuthService,PlatformService,PlatformStudioService,PlatformFinanceService,PaymentProvider]})
export class PlatformModule{}
