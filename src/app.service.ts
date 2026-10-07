import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    console.log("Application environment:", this.configService.get("NODE_ENV"));
  }

  getHello(): string {
    return "Hello World.";
  }
}
