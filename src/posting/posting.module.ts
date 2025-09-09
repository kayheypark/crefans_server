import { Module } from "@nestjs/common";
import { PostingController } from "./posting.controller";
import { PostingService } from "./posting.service";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaModule } from "../media/media.module";

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [PostingController],
  providers: [PostingService],
  exports: [PostingService],
})
export class PostingModule {}
