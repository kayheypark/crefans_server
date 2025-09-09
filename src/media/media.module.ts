import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaAccessController } from "./media-access.controller";
import { MediaService } from "./media.service";
import { MediaAccessService } from "./media-access.service";
import { S3Service } from "./s3.service";
import { ImageProcessingService } from "./image-processing.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OptionalAuthGuard } from "../common/guards/optional-auth.guard";
import { LoggerModule } from "../common/logger/logger.module";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule, JwtModule],
  controllers: [MediaController, MediaAccessController],
  providers: [MediaService, MediaAccessService, S3Service, ImageProcessingService, AuthGuard, OptionalAuthGuard],
  exports: [MediaService, MediaAccessService, S3Service, ImageProcessingService],
})
export class MediaModule {}
