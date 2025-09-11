import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";
import { ConfigService } from "@nestjs/config";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { LoggerService } from "./common/logger/logger.service";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";

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

  // 글로벌 예외 필터 추가
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 글로벌 인터셉터 추가
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  // 글로벌 파이프 추가 - 보안 강화를 위한 입력 검증
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // DTO에 정의되지 않은 속성 제거
      forbidNonWhitelisted: true, // 화이트리스트에 없는 속성 발견 시 에러 발생
      transform: true,           // 자동 타입 변환
      disableErrorMessages: process.env.NODE_ENV === 'production', // 프로덕션에서 상세 에러 메시지 숨김
      validateCustomDecorators: true, // 커스텀 검증 데코레이터 활성화
      stopAtFirstError: true,    // 첫 번째 검증 실패 시 중단 (성능 향상)
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
// Trigger deployment after EC2 restart
