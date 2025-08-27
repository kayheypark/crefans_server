import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";
import { ConfigService } from "@nestjs/config";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { LoggerService } from "./common/logger/logger.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = app.get(LoggerService);

  // CORS 설정 - credentials: true를 사용할 때는 동적 origin 설정 필요
  const corsConfig = configService.get("app.cors");
  app.enableCors({
    ...corsConfig,
    origin: (origin, callback) => {
      // 허용된 origin 목록
      const allowedOrigins = corsConfig.origins;

      // origin이 없거나 허용된 목록에 있으면 허용
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS 정책에 의해 차단되었습니다."));
      }
    },
  });

  // 쿠키 파서 미들웨어 추가
  app.use(cookieParser());

  // 글로벌 인터셉터 추가
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  // 글로벌 파이프 추가
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  const port = configService.get("app.port");
  await app.listen(port);

  logger.log(`Application is running on port ${port}`, {
    service: "Bootstrap",
    method: "bootstrap",
  });
}
bootstrap();
