export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationOptions {
  maxLimit?: number;
  defaultLimit?: number;
  defaultPage?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  skip: number;
}

export class PaginationUtil {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  static validateAndNormalize(
    page?: number,
    limit?: number,
    options: PaginationOptions = {}
  ): PaginationParams {
    const {
      maxLimit = PaginationUtil.MAX_LIMIT,
      defaultLimit = PaginationUtil.DEFAULT_LIMIT,
      defaultPage = PaginationUtil.DEFAULT_PAGE,
    } = options;

    const normalizedPage = Math.max(page || defaultPage, 1);
    const normalizedLimit = Math.min(
      Math.max(limit || defaultLimit, 1),
      maxLimit
    );

    return {
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  static calculateMeta(
    page: number,
    limit: number,
    totalCount: number
  ): PaginationMeta {
    const totalPages = Math.ceil(totalCount / limit);
    const skip = (page - 1) * limit;

    return {
      page,
      limit,
      totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      skip,
    };
  }

  static getPrismaParams(
    page: number,
    limit: number
  ): { skip: number; take: number } {
    return {
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  static createPaginatedResponse<T>(
    items: T[],
    page: number,
    limit: number,
    totalCount: number
  ) {
    const meta = PaginationUtil.calculateMeta(page, limit, totalCount);

    return {
      items,
      pagination: {
        page: meta.page,
        limit: meta.limit,
        totalCount: meta.totalCount,
        totalPages: meta.totalPages,
        hasNext: meta.hasNext,
        hasPrev: meta.hasPrev,
      },
    };
  }
}