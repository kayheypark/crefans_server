import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logger/logger.module';
import { MembershipAccessService } from '../common/services/membership-access.service';

@Module({
  imports: [PrismaModule, LoggerModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, MembershipAccessService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}