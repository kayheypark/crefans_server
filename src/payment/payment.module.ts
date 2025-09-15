import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TossPaymentsService } from './tosspayments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TokenService } from '../token/token.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    TossPaymentsService,
    TokenService,
  ],
  exports: [PaymentService, TossPaymentsService],
})
export class PaymentModule {}