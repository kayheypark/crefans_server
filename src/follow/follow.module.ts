import { Module } from '@nestjs/common';
import { FollowService } from './follow.service';
import { FollowController, PublicFollowController } from './follow.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FollowController, PublicFollowController],
  providers: [FollowService],
  exports: [FollowService],
})
export class FollowModule {}