import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CognitoService } from "../auth/cognito.service";
import {
  CreatorCategoryResponseDto,
  CreatorResponseDto,
  NewCreatorsResponseDto,
  CreatorsByCategoryResponseDto,
} from "./dto/explore.dto";

@Injectable()
export class ExploreService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cognitoService: CognitoService
  ) {}

  private parseUserAttributes(userAttributes: any[]): any {
    const attributes = userAttributes?.reduce((acc, attr) => {
      acc[attr.Name] = attr.Value;
      return acc;
    }, {} as Record<string, string>) || {};

    return {
      nickname: attributes.nickname || "Unknown User",
      handle: attributes.preferred_username || `@user${Date.now()}`,
      profileImageUrl: attributes.picture || "/profile-90.png",
      bio: attributes.custom_bio || "",
      bannerImageUrl: attributes.custom_banner || null,
    };
  }

  async getCreatorCategories(): Promise<CreatorCategoryResponseDto[]> {
    const categories = await this.prismaService.creatorCategory.findMany({
      where: {
        is_active: true,
        is_deleted: false,
      },
      orderBy: {
        sort_order: "asc",
      },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description || "",
      color_code: category.color_code || "#666666",
      icon: category.icon || "📁",
      sort_order: category.sort_order,
      is_active: category.is_active,
    }));
  }

  async getNewCreators(
    limit: number = 20,
    cursor?: string
  ): Promise<NewCreatorsResponseDto> {
    // 최근 30일 이내 생성된 크리에이터를 '신규'로 간주
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const whereClause: any = {
      is_active: true,
      created_at: {
        gte: thirtyDaysAgo,
      },
    };

    if (cursor) {
      whereClause.created_at = {
        ...whereClause.created_at,
        lt: new Date(cursor),
      };
    }

    const creators = await this.prismaService.creator.findMany({
      where: whereClause,
      include: {
        category: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: limit + 1, // 다음 페이지 확인을 위해 하나 더 가져옴
    });

    const hasMore = creators.length > limit;
    const creatorsToReturn = hasMore ? creators.slice(0, -1) : creators;

    // Cognito에서 사용자 정보 가져오기
    const creatorsWithProfiles = await Promise.all(
      creatorsToReturn.map(async (creator) => {
        try {
          const cognitoUserData = await this.cognitoService.getUserBySub(
            creator.user_id
          );

          if (!cognitoUserData) {
            return null;
          }

          const userInfo = this.parseUserAttributes(cognitoUserData.UserAttributes);

          // 팔로워 수 계산
          const followerCount = await this.prismaService.userFollow.count({
            where: {
              following_id: creator.user_id,
              deleted_at: null,
            },
          });

          // 포스트 수 계산
          const postCount = await this.prismaService.posting.count({
            where: {
              user_sub: creator.user_id,
              is_deleted: false,
              status: "PUBLISHED",
            },
          });

          return {
            id: creator.id,
            user_id: creator.user_id,
            nickname: userInfo.nickname,
            handle: `@${userInfo.handle}`,
            avatar: userInfo.profileImageUrl,
            bio: userInfo.bio || "새로운 크리에이터입니다.",
            followerCount,
            postCount,
            category: creator.category
              ? {
                  id: creator.category.id,
                  name: creator.category.name,
                  description: creator.category.description || "",
                  color_code: creator.category.color_code || "#666666",
                  icon: creator.category.icon || "📁",
                  sort_order: creator.category.sort_order,
                  is_active: creator.category.is_active,
                }
              : undefined,
            isNew: true,
            bannerImage: userInfo.bannerImageUrl,
            created_at: creator.created_at,
          } as CreatorResponseDto;
        } catch (error) {
          console.error(
            `[DEBUG] Failed to get Cognito user for creator ${creator.id} (user_id: ${creator.user_id}):`,
            error.message
          );
          return null;
        }
      })
    );

    const validCreators = creatorsWithProfiles.filter(
      (creator) => creator !== null
    ) as CreatorResponseDto[];

    const nextCursor = hasMore
      ? creatorsToReturn[creatorsToReturn.length - 1].created_at.toISOString()
      : undefined;

    return {
      creators: validCreators,
      nextCursor,
      hasMore,
    };
  }

  async getCreatorsByCategory(
    categoryId: string,
    limit: number = 20,
    cursor?: string
  ): Promise<CreatorsByCategoryResponseDto> {
    // 카테고리 유효성 검사
    const category = await this.prismaService.creatorCategory.findFirst({
      where: {
        id: categoryId,
        is_active: true,
        is_deleted: false,
      },
    });

    if (!category) {
      throw new NotFoundException("카테고리를 찾을 수 없습니다.");
    }

    const whereClause: any = {
      is_active: true,
      category_id: categoryId,
    };

    if (cursor) {
      whereClause.created_at = {
        lt: new Date(cursor),
      };
    }

    const creators = await this.prismaService.creator.findMany({
      where: whereClause,
      include: {
        category: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: limit + 1,
    });

    console.log(`[DEBUG] Category ${category.name} (${categoryId}):`, {
      totalCreators: creators.length,
      whereClause,
      creatorIds: creators.map(c => ({ id: c.id, user_id: c.user_id, is_active: c.is_active }))
    });

    const hasMore = creators.length > limit;
    const creatorsToReturn = hasMore ? creators.slice(0, -1) : creators;

    // Cognito에서 사용자 정보 가져오기
    const creatorsWithProfiles = await Promise.all(
      creatorsToReturn.map(async (creator) => {
        try {
          const cognitoUserData = await this.cognitoService.getUserBySub(
            creator.user_id
          );

          if (!cognitoUserData) {
            return null;
          }

          const userInfo = this.parseUserAttributes(cognitoUserData.UserAttributes);

          // 팔로워 수 계산
          const followerCount = await this.prismaService.userFollow.count({
            where: {
              following_id: creator.user_id,
              deleted_at: null,
            },
          });

          // 포스트 수 계산
          const postCount = await this.prismaService.posting.count({
            where: {
              user_sub: creator.user_id,
              is_deleted: false,
              status: "PUBLISHED",
            },
          });

          return {
            id: creator.id,
            user_id: creator.user_id,
            nickname: userInfo.nickname,
            handle: `@${userInfo.handle}`,
            avatar: userInfo.profileImageUrl,
            bio: userInfo.bio || "",
            followerCount,
            postCount,
            category: {
              id: creator.category!.id,
              name: creator.category!.name,
              description: creator.category!.description || "",
              color_code: creator.category!.color_code || "#666666",
              icon: creator.category!.icon || "📁",
              sort_order: creator.category!.sort_order,
              is_active: creator.category!.is_active,
            },
            isNew: false,
            bannerImage: userInfo.bannerImageUrl,
            created_at: creator.created_at,
          } as CreatorResponseDto;
        } catch (error) {
          console.error(
            `[DEBUG] Failed to get Cognito user for creator ${creator.id} (user_id: ${creator.user_id}):`,
            error.message
          );
          return null;
        }
      })
    );

    const validCreators = creatorsWithProfiles.filter(
      (creator) => creator !== null
    ) as CreatorResponseDto[];

    console.log(`[DEBUG] ${category.name} final result:`, {
      originalCreators: creators.length,
      creatorsAfterCognito: creatorsWithProfiles.length,
      validCreators: validCreators.length,
      failedCognito: creatorsWithProfiles.filter(c => c === null).length
    });

    const nextCursor = hasMore
      ? creatorsToReturn[creatorsToReturn.length - 1].created_at.toISOString()
      : undefined;

    return {
      creators: validCreators,
      category: {
        id: category.id,
        name: category.name,
        description: category.description || "",
        color_code: category.color_code || "#666666",
        icon: category.icon || "📁",
        sort_order: category.sort_order,
        is_active: category.is_active,
      },
      nextCursor,
      hasMore,
    };
  }
}