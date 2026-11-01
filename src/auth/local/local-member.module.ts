import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { LocalMemberService } from "./local-member.service";
import { MemberMailService } from "./member-mail.service";

@Global()
@Module({ imports: [ConfigModule, PrismaModule], providers: [LocalMemberService, MemberMailService], exports: [LocalMemberService] })
export class LocalMemberModule {}
