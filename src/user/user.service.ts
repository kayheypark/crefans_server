import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { UpdateUserProfileDto } from "./dto/user.dto";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async getUserProfileByHandle(handle: string) {
    // Cognito에서 핸들로 사용자 찾기
    const cognitoUser = await this.authService.getUserByHandle(handle);

    if (!cognitoUser) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    // 프로필 정보 조회
    const userProfile = await this.prisma.userProfile.findUnique({
      where: { user_id: cognitoUser.Username },
    });

    // 크리에이터 정보 조회
    const creator = await this.prisma.creator.findUnique({
      where: { user_id: cognitoUser.Username },
    });

    // 통계 정보 계산
    const postsCount = await this.prisma.posting.count({
      where: {
        creator_id: creator?.user_id,
        deleted_at: null,
      },
    });

    // 미디어 카운트 (향후 구현)
    const mediaCount = 0; // TODO: 실제 미디어 테이블에서 계산

    // 팔로워/팔로잉 수 (향후 구현)
    const followersCount = 0; // TODO: 팔로우 테이블에서 계산
    const followingCount = 0; // TODO: 팔로우 테이블에서 계산

    return {
      id: cognitoUser.Username,
      handle:
        cognitoUser.Attributes.find(
          (attr) => attr.Name === "preferred_username"
        )?.Value || handle,
      name:
        cognitoUser.Attributes.find((attr) => attr.Name === "nickname")
          ?.Value || handle,
      avatar:
        cognitoUser.Attributes.find((attr) => attr.Name === "picture")?.Value ||
        "/profile-90.png",
      bio: userProfile?.bio || "소개글을 준비중입니다",
      isCreator: !!creator,
      isVerified: false, // TODO: Creator 모델에 is_verified 필드 추가 필요
      followersCount,
      followingCount,
      postsCount,
      mediaCount,
    };
  }

  async updateUserProfile(user_id: string, updateUserProfileDto: UpdateUserProfileDto) {
    const { bio } = updateUserProfileDto;

    return this.prisma.userProfile.upsert({
      where: { user_id },
      update: { bio },
      create: { user_id, bio },
    });
  }

  async checkNicknameAvailability(nickname: string): Promise<boolean> {
    return await this.authService.checkNicknameAvailability(nickname);
  }

  async getUserPosts(handle: string, page: number = 1, limit: number = 20) {
    const cognitoUser = await this.authService.getUserByHandle(handle);

    if (!cognitoUser) {
      return {
        posts: [],
        total: 0,
        page,
        limit,
      };
    }

    const creator = await this.prisma.creator.findUnique({
      where: { user_id: cognitoUser.Username },
    });

    if (!creator) {
      return {
        posts: [],
        total: 0,
        page,
        limit,
      };
    }

    const [posts, total] = await Promise.all([
      this.prisma.posting.findMany({
        where: {
          creator_id: creator.user_id,
          deleted_at: null,
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          medias: {
            where: { is_deleted: false },
            orderBy: { sort_order: "asc" },
            include: {
              media: {
                select: {
                  id: true,
                  file_name: true,
                  original_url: true,
                  type: true,
                  processing_status: true,
                  thumbnail_urls: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.posting.count({
        where: {
          creator_id: creator.user_id,
          deleted_at: null,
        },
      }),
    ]);

    return {
      posts: posts.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        created_at: post.created_at,
        media: post.medias.map((pm) => pm.media),
        creator: {
          id: creator.id,
          handle:
            cognitoUser.Attributes.find(
              (attr) => attr.Name === "preferred_username"
            )?.Value || handle,
          name:
            cognitoUser.Attributes.find((attr) => attr.Name === "nickname")
              ?.Value || handle,
          avatar:
            cognitoUser.Attributes.find((attr) => attr.Name === "picture")
              ?.Value || "/profile-90.png",
        },
      })),
      total,
      page,
      limit,
    };
  }

  async becomeCreator(user_id: string) {
    // 이미 크리에이터인지 확인
    const existingCreator = await this.prisma.creator.findUnique({
      where: { user_id },
    });

    if (existingCreator) {
      throw new Error("이미 크리에이터로 등록되어 있습니다.");
    }

    // Creator 테이블에 추가
    const creator = await this.prisma.creator.create({
      data: {
        user_id,
        // 다른 필드들이 있다면 기본값 설정
      },
    });

    return creator;
  }

  async isCreator(user_id: string): Promise<boolean> {
    const creator = await this.prisma.creator.findUnique({
      where: { user_id },
    });

    return !!creator;
  }
}
