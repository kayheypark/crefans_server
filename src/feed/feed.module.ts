import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logger/logger.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';

@Module({
  imports: [PrismaModule, LoggerModule, AuthModule, MediaModule],
  controllers: [FeedController],
  providers: [FeedService, OptionalAuthGuard],
  exports: [FeedService],
})
export class FeedModule {}