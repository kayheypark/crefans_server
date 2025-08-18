import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 허용 도메인 함수
  const corsOrigin = (
    origin: string,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // 개발 환경에서는 모든 요청 허용
    if (!origin || process.env.NODE_ENV === "development") {
      return callback(null, true);
    }

    // 허용할 도메인 패턴들
    const allowedDomains = [
      /^https?:\/\/localhost:\d+$/, // localhost (모든 포트)
      /^https?:\/\/(www\.)?crefans\.com(\/.*)?$/, // crefans.com 및 모든 하위 경로
      /^https?:\/\/api\.crefans\.com(\/.*)?$/, // api.crefans.com 및 모든 하위 경로
    ];

    // 도메인 검증
    const isAllowed = allowedDomains.some((pattern) => pattern.test(origin));

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS 차단된 도메인: ${origin}`);
      callback(new Error("CORS 정책에 의해 차단됨"));
    }
  };

  // CORS 설정
  app.enableCors({
    origin: corsOrigin,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "Cache-Control",
      "Pragma",
    ],
    exposedHeaders: ["Content-Length", "Content-Range"],
    credentials: true,
    maxAge: 86400, // 24시간
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
