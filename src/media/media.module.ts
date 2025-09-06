import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { S3Service } from "./s3.service";
import { ImageProcessingService } from "./image-processing.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { LoggerModule } from "../common/logger/logger.module";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule],
  controllers: [MediaController],
  providers: [MediaService, S3Service, ImageProcessingService, AuthGuard],
  exports: [MediaService, S3Service, ImageProcessingService],
})
export class MediaModule {}
