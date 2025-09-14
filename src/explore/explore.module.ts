import { Module } from "@nestjs/common";
import { ExploreController } from "./explore.controller";
import { ExploreService } from "./explore.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ExploreController],
  providers: [ExploreService],
  exports: [ExploreService],
})
export class ExploreModule {}