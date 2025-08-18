import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정 (Signout 포함 모든 요청 허용)
  app.enableCors({
    origin: [
      "http://localhost:3001",
      "https://crefans.com",
      "https://www.crefans.com",
      "https://api.crefans.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "Cookie", // 쿠키 헤더 추가
      "Set-Cookie", // Set-Cookie 헤더 추가
    ],
    exposedHeaders: ["Set-Cookie", "Authorization"], // 클라이언트에 노출할 헤더
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // 쿠키 파서 미들웨어 추가
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );
  await app.listen(3001);
}
bootstrap();
