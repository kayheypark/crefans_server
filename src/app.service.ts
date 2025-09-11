import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    console.log("=== 환경 변수 확인 ===");
    console.log("AWS_REGION:", this.configService.get("AWS_REGION"));
    console.log(
      "AWS_ACCESS_KEY_ID:",
      this.configService.get("AWS_ACCESS_KEY_ID")
    );
    console.log(
      "AWS_SECRET_ACCESS_KEY:",
      this.configService.get("AWS_SECRET_ACCESS_KEY")
    );
    console.log(
      "COGNITO_USER_POOL_ID:",
      this.configService.get("COGNITO_USER_POOL_ID")
    );
    console.log(
      "COGNITO_CLIENT_ID:",
      this.configService.get("COGNITO_CLIENT_ID")
    );
    console.log("Database Host:", this.configService.get("DB_HOST"));
    console.log("Database Port:", this.configService.get("DB_PORT"));
    console.log("Node Environment:", this.configService.get("NODE_ENV"));
    console.log("===================");
  }

  getHello(): string {
    return "Hello World.";
  }
}
