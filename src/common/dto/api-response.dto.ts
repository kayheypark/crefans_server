export interface BaseApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedApiResponse<T = any> {
  success: boolean;
  message?: string;
  data: {
    items: T[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

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

export class ApiResponseUtil {
  static success<T>(data?: T, message?: string): BaseApiResponse<T> {
    return {
      success: true,
      message,
      data,
    };
  }

  static error(code: string, message: string, details?: any): BaseApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
    };
  }

  static paginated<T>(
    items: T[],
    page: number,
    limit: number,
    totalCount: number,
    message?: string
  ): PaginatedApiResponse<T> {
    const totalPages = Math.ceil(totalCount / limit);
    
    return {
      success: true,
      message,
      data: {
        items,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  }
}