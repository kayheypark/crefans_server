import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { CognitoException } from "../exceptions/cognito.exception";
import { ApiResponseDto } from "../../common/dto/api-response.dto";

@Catch(CognitoException)
export class CognitoExceptionFilter implements ExceptionFilter {
  catch(exception: CognitoException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = ApiResponseDto.error(exception.message, {
      statusCode: HttpStatus.BAD_REQUEST,
      code: exception.code,
    });

    response.status(HttpStatus.BAD_REQUEST).json(errorResponse);
  }
}
