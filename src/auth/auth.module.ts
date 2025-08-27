import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CognitoService } from "./cognito.service";
import { ConfigModule } from "@nestjs/config";
import { TokenModule } from "../token/token.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LoggerModule } from "../common/logger/logger.module";

@Module({
  imports: [ConfigModule, TokenModule, PrismaModule, LoggerModule],
  controllers: [AuthController],
  providers: [AuthService, CognitoService],
  exports: [AuthService, CognitoService],
})
export class AuthModule {}
