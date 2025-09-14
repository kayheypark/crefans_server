import { Module } from "@nestjs/common";
import { PostingController } from "./posting.controller";
import { PostingLikeController } from "./posting-like.controller";
import { PostingService } from "./posting.service";
import { PostingLikeService } from "./posting-like.service";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";
import { LoggerModule } from "../common/logger/logger.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, MediaModule, LoggerModule, AuthModule],
  controllers: [PostingController, PostingLikeController],
  providers: [PostingService, PostingLikeService],
  exports: [PostingService, PostingLikeService],
})
export class PostingModule {}
