import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logger/logger.module';
import { MembershipAccessService } from '../common/services/membership-access.service';
import { PaymentModule } from '../payment/payment.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, LoggerModule, PaymentModule, AuthModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, MembershipAccessService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}