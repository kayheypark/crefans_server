import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { MediaModule } from "./media/media.module";
import { WalletModule } from "./wallet/wallet.module";
import { PostingModule } from "./posting/posting.module";
import { PrismaModule } from "./prisma/prisma.module";
import { LoggerModule } from "./common/logger/logger.module";
import awsConfig from "./config/aws.config";
import databaseConfig from "./config/database.config";
import appConfig from "./config/app.config";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [awsConfig, databaseConfig, appConfig],
    }),
    LoggerModule,
    PrismaModule,
    AuthModule,
    MediaModule,
    WalletModule,
    PostingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
