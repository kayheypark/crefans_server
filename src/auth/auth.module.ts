import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ConfigModule } from "@nestjs/config";
import { TokenModule } from "../token/token.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [ConfigModule, TokenModule, PrismaModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
