import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentLikeController } from './comment-like.controller';
import { CommentService } from './comment.service';
import { CommentLikeService } from './comment-like.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [PrismaModule, AuthModule, LoggerModule],
  controllers: [CommentController, CommentLikeController],
  providers: [CommentService, CommentLikeService],
  exports: [CommentService, CommentLikeService],
})
export class CommentModule {}