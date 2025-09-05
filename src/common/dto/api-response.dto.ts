export class ApiResponseDto<T = any> {
  success: boolean;
  message: string;
  data: T;

  constructor(success: boolean, message: string, data: T) {
    this.success = success;
    this.message = message;
    this.data = data;
  }

  static success<T>(message: string, data: T): ApiResponseDto<T> {
    return new ApiResponseDto(true, message, data);
  }

  static error<T = null>(message: string, data: T = null as T): ApiResponseDto<T> {
    return new ApiResponseDto(false, message, data);
  }
}