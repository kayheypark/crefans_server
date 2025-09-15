import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { MediaModule } from "../media/media.module";
import { MembershipAccessService } from "../common/services/membership-access.service";
import { LoggerModule } from "../common/logger/logger.module";

@Module({
  imports: [PrismaModule, AuthModule, MediaModule, LoggerModule],
  controllers: [UserController],
  providers: [UserService, MembershipAccessService],
  exports: [UserService],
})
export class UserModule {}
