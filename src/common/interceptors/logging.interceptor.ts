import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { LoggerService } from "../logger/logger.service";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user } = request;
    const now = Date.now();

    this.logger.log(`Incoming Request: ${method} ${url}`, {
      service: "HTTP",
      method: "intercept",
      userSub: user?.sub,
      body: method !== "GET" ? body : undefined,
    });

    return next.handle().pipe(
      tap((data) => {
        const responseTime = Date.now() - now;
        this.logger.log(
          `Outgoing Response: ${method} ${url} - ${responseTime}ms`,
          {
            service: "HTTP",
            method: "intercept",
            userSub: user?.sub,
            responseTime,
            statusCode: context.switchToHttp().getResponse().statusCode,
          }
        );
      })
    );
  }
}
