import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaginationUtil } from "../common/utils/pagination.util";
import { ApiResponseUtil } from "../common/dto/api-response.dto";
import { CognitoService } from "../auth/cognito.service";
import { UserTransformationUtil } from "../common/utils/user-transformation.util";

@Injectable()
export class FollowService {
  private readonly logger = new Logger(FollowService.name);

  constructor(
    private prisma: PrismaService,
    private cognitoService: CognitoService
  ) {}

  // 팔로우하기
  async followUser(followerId: string, followingId: string) {
    try {
      // 자기 자신을 팔로우하는 것 방지
      if (followerId === followingId) {
        throw new ConflictException("자기 자신을 팔로우할 수 없습니다.");
      }

      // 이미 팔로우 중인지 확인
      const existingFollow = await this.prisma.userFollow.findUnique({
        where: {
          follower_id_following_id: {
            follower_id: followerId,
            following_id: followingId,
          },
        },
      });

      if (existingFollow && !existingFollow.deleted_at) {
        throw new ConflictException("이미 팔로우 중인 사용자입니다.");
      }

      // 이전에 언팔로우한 기록이 있으면 재활성화, 없으면 새로 생성
      if (existingFollow && existingFollow.deleted_at) {
        const follow = await this.prisma.userFollow.update({
          where: { id: existingFollow.id },
          data: {
            deleted_at: null,
            followed_at: new Date(),
          },
        });

        this.logger.log(`User ${followerId} re-followed user ${followingId}`);

        return {
          success: true,
          message: "팔로우가 완료되었습니다.",
          data: { followId: follow.id, followedAt: follow.followed_at },
        };
      } else {
        const follow = await this.prisma.userFollow.create({
          data: {
            follower_id: followerId,
            following_id: followingId,
          },
        });

        this.logger.log(`User ${followerId} followed user ${followingId}`);

        return {
          success: true,
          message: "팔로우가 완료되었습니다.",
          data: { followId: follow.id, followedAt: follow.followed_at },
        };
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error("Failed to follow user", {
        followerId,
        followingId,
        error: error.message,
        stack: error.stack,
      });

      throw new Error("팔로우 처리 중 오류가 발생했습니다.");
    }
  }

  // 언팔로우하기
  async unfollowUser(followerId: string, followingId: string) {
    try {
      const follow = await this.prisma.userFollow.findUnique({
        where: {
          follower_id_following_id: {
            follower_id: followerId,
            following_id: followingId,
          },
        },
      });

      if (!follow || follow.deleted_at) {
        throw new NotFoundException("팔로우 관계를 찾을 수 없습니다.");
      }

      await this.prisma.userFollow.update({
        where: { id: follow.id },
        data: { deleted_at: new Date() },
      });

      this.logger.log(`User ${followerId} unfollowed user ${followingId}`);

      return {
        success: true,
        message: "언팔로우가 완료되었습니다.",
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error("Failed to unfollow user", {
        followerId,
        followingId,
        error: error.message,
        stack: error.stack,
      });

      throw new Error("언팔로우 처리 중 오류가 발생했습니다.");
    }
  }

  // 팔로잉 목록 조회
  async getFollowing(userId: string, page: number = 1, limit: number = 20, requesterId?: string) {
    try {
      const { page: normalizedPage, limit: normalizedLimit } =
        PaginationUtil.validateAndNormalize(page, limit);
      const { skip, take } = PaginationUtil.getPrismaParams(
        normalizedPage,
        normalizedLimit
      );

      const following = await this.prisma.userFollow.findMany({
        where: {
          follower_id: userId,
          deleted_at: null,
        },
        select: {
          following_id: true,
          followed_at: true,
        },
        orderBy: { followed_at: "desc" },
        skip,
        take,
      });

      const totalCount = await this.prisma.userFollow.count({
        where: {
          follower_id: userId,
          deleted_at: null,
        },
      });

      // 사용자 프로필 정보 가져오기
      const userProfiles = await Promise.all(
        following.map(async (f) => {
          const cognitoUser = await this.cognitoService.getUserBySub(
            f.following_id
          );
          const userInfo = UserTransformationUtil.transformCognitoUser(
            cognitoUser,
            f.following_id
          );

          // 요청자가 있는 경우, 요청자가 이 사용자를 팔로우하고 있는지 확인
          let isFollowedByRequester = false;
          if (requesterId && requesterId !== f.following_id) {
            const requesterFollow = await this.prisma.userFollow.findUnique({
              where: {
                follower_id_following_id: {
                  follower_id: requesterId,
                  following_id: f.following_id,
                },
              },
            });
            isFollowedByRequester = !!(requesterFollow && !requesterFollow.deleted_at);
          }

          return {
            userId: f.following_id,
            nickname: userInfo.nickname,
            handle: userInfo.preferred_username,
            avatar: userInfo.avatar_url,
            followedAt: f.followed_at,
            isFollowedByRequester, // 요청자가 이 사용자를 팔로우하고 있는지
          };
        })
      );

      return ApiResponseUtil.paginated(
        userProfiles,
        normalizedPage,
        normalizedLimit,
        totalCount
      );
    } catch (error) {
      this.logger.error("Failed to get following", {
        userId,
        page,
        limit,
        error: error.message,
      });

      throw new Error("팔로잉 목록 조회 중 오류가 발생했습니다.");
    }
  }

  // 팔로워 목록 조회
  async getFollowers(userId: string, page: number = 1, limit: number = 20, requesterId?: string) {
    try {
      const { page: normalizedPage, limit: normalizedLimit } =
        PaginationUtil.validateAndNormalize(page, limit);
      const { skip, take } = PaginationUtil.getPrismaParams(
        normalizedPage,
        normalizedLimit
      );

      const followers = await this.prisma.userFollow.findMany({
        where: {
          following_id: userId,
          deleted_at: null,
        },
        select: {
          follower_id: true,
          followed_at: true,
        },
        orderBy: { followed_at: "desc" },
        skip,
        take,
      });

      const totalCount = await this.prisma.userFollow.count({
        where: {
          following_id: userId,
          deleted_at: null,
        },
      });

      // 사용자 프로필 정보 가져오기
      const userProfiles = await Promise.all(
        followers.map(async (f) => {
          const cognitoUser = await this.cognitoService.getUserBySub(
            f.follower_id
          );
          const userInfo = UserTransformationUtil.transformCognitoUser(
            cognitoUser,
            f.follower_id
          );

          // 요청자가 있는 경우, 요청자가 이 팔로워를 역으로 팔로우하고 있는지 확인
          let isFollowedByRequester = false;
          if (requesterId && requesterId !== f.follower_id) {
            const requesterFollow = await this.prisma.userFollow.findUnique({
              where: {
                follower_id_following_id: {
                  follower_id: requesterId,
                  following_id: f.follower_id,
                },
              },
            });
            isFollowedByRequester = !!(requesterFollow && !requesterFollow.deleted_at);
          }

          return {
            userId: f.follower_id,
            nickname: userInfo.nickname,
            handle: userInfo.preferred_username,
            avatar: userInfo.avatar_url,
            followedAt: f.followed_at,
            isFollowedByRequester, // 요청자가 이 팔로워를 역으로 팔로우하고 있는지
          };
        })
      );

      return ApiResponseUtil.paginated(
        userProfiles,
        normalizedPage,
        normalizedLimit,
        totalCount
      );
    } catch (error) {
      this.logger.error("Failed to get followers", {
        userId,
        page,
        limit,
        error: error.message,
      });

      throw new Error("팔로워 목록 조회 중 오류가 발생했습니다.");
    }
  }
}
