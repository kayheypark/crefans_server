import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { S3Service } from "../media/s3.service";
import { UpdateUserProfileDto } from "./dto/user.dto";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly s3Service: S3Service,
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

    // 통계 정보 계산 - 직접 cognitoUser.Username으로 조회
    const postsCount = await this.prisma.posting.count({
      where: {
        user_sub: cognitoUser.Username,
        is_deleted: false,
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

  async getUserPosts(handle: string, cursor?: string, limit: number = 20) {
    const cognitoUser = await this.authService.getUserByHandle(handle);

    if (!cognitoUser) {
      return {
        posts: [],
        nextCursor: null,
        hasMore: false,
      };
    }

    const userId = cognitoUser.Username;

    // Cursor 조건 설정 - Creator 테이블을 거치지 않고 직접 user_sub으로 조회
    const whereCondition: any = {
      user_sub: userId,
      is_deleted: false, // deleted_at 대신 is_deleted 사용
    };

    if (cursor) {
      whereCondition.created_at = {
        lt: new Date(cursor),
      };
    }

    // limit + 1을 가져와서 다음 페이지가 있는지 확인
    const posts = await this.prisma.posting.findMany({
      where: whereCondition,
      orderBy: { created_at: "desc" },
      take: limit + 1,
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
                s3_upload_key: true,
                type: true,
                processing_status: true,
                thumbnail_urls: true,
              },
            },
          },
        },
      },
    });

    // 다음 페이지가 있는지 확인
    const hasMore = posts.length > limit;
    const actualPosts = hasMore ? posts.slice(0, limit) : posts;

    // 다음 cursor 설정 (마지막 포스트의 created_at)
    const nextCursor = hasMore && actualPosts.length > 0 
      ? actualPosts[actualPosts.length - 1].created_at.toISOString()
      : null;

    // Creator 정보 조회 (응답 데이터 구성용)
    const creator = await this.prisma.creator.findUnique({
      where: { user_id: userId },
    });

    // 미디어 URL들을 signed URL로 변환
    const postsWithSignedUrls = await Promise.all(
      actualPosts.map(async (post) => {
        const mediaWithSignedUrls = await Promise.all(
          post.medias.map(async (pm) => {
            // 공개 게시글의 미디어는 signed URL로 변환
            const signedUrl = await this.s3Service.getObjectUrl(
              process.env.S3_UPLOAD_BUCKET,
              pm.media.s3_upload_key
            );

            return {
              ...pm.media,
              original_url: signedUrl,
            };
          })
        );

        return {
          id: post.id,
          title: post.title,
          content: post.content,
          created_at: post.created_at,
          media: mediaWithSignedUrls,
          creator: {
            id: creator?.id || 0,
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
        };
      })
    );

    return {
      posts: postsWithSignedUrls,
      nextCursor,
      hasMore,
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
