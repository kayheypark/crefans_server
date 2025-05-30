import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { CognitoException } from "../exceptions/cognito.exception";

@Catch(CognitoException)
export class CognitoExceptionFilter implements ExceptionFilter {
  catch(exception: CognitoException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      code: exception.code,
    });
  }
}
