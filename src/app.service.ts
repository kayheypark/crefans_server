import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    console.log("=== 환경 변수 설정 ===");
    console.log("API Key 1:", this.configService.get("API_KEY_1"));
    console.log("API Key 2:", this.configService.get("API_KEY_2"));
    console.log("API Key 3:", this.configService.get("API_KEY_3"));
    console.log("Database Host:", this.configService.get("DB_HOST"));
    console.log("Database Port:", this.configService.get("DB_PORT"));
    console.log("Node Environment:", this.configService.get("NODE_ENV"));
    console.log("===================");
  }

  getHello(): string {
    return "Hello World!";
  }
}
