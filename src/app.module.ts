import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { MediaModule } from "./media/media.module";
import { WalletModule } from "./wallet/wallet.module";
import { PostingModule } from "./posting/posting.module";
import { UserModule } from "./user/user.module";
import { MembershipModule } from "./membership/membership.module";
import { SubscriptionModule } from "./subscription/subscription.module";
import { CommentModule } from "./comment/comment.module";
import { FeedModule } from "./feed/feed.module";
import { FollowModule } from "./follow/follow.module";
import { AdminModule } from "./admin/admin.module";
import { ExploreModule } from "./explore/explore.module";
import { PaymentModule } from "./payment/payment.module";
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
    UserModule,
    MembershipModule,
    SubscriptionModule,
    CommentModule,
    FeedModule,
    FollowModule,
    AdminModule,
    ExploreModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
