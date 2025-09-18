import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { S3Service } from "./s3.service";
import { ImageProcessingService } from "./image-processing.service";
import { AdminService } from "../admin/admin.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { OptionalAuthGuard } from "../common/guards/optional-auth.guard";
import { LoggerModule } from "../common/logger/logger.module";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";
import { CognitoService } from "../auth/cognito.service";
import { AuthModule } from "../auth/auth.module";
import { TokenModule } from "../token/token.module";

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule, JwtModule, AuthModule, TokenModule],
  controllers: [MediaController],
  providers: [MediaService, S3Service, ImageProcessingService, AdminService, CognitoService, AuthGuard, OptionalAuthGuard],
  exports: [MediaService, S3Service, ImageProcessingService],
})
export class MediaModule {}
