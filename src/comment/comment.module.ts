import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [PrismaModule, AuthModule, LoggerModule],
  controllers: [CommentController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}