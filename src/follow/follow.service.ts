import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowService {
  private readonly logger = new Logger(FollowService.name);

  constructor(private prisma: PrismaService) {}

  // 팔로우하기
  async followUser(followerId: string, followingId: string) {
    try {
      // 자기 자신을 팔로우하는 것 방지
      if (followerId === followingId) {
        throw new ConflictException('자기 자신을 팔로우할 수 없습니다.');
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
        throw new ConflictException('이미 팔로우 중인 사용자입니다.');
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
          message: '팔로우가 완료되었습니다.',
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
          message: '팔로우가 완료되었습니다.',
          data: { followId: follow.id, followedAt: follow.followed_at },
        };
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error('Failed to follow user', {
        followerId,
        followingId,
        error: error.message,
        stack: error.stack,
      });

      throw new Error('팔로우 처리 중 오류가 발생했습니다.');
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
        throw new NotFoundException('팔로우 관계를 찾을 수 없습니다.');
      }

      await this.prisma.userFollow.update({
        where: { id: follow.id },
        data: { deleted_at: new Date() },
      });

      this.logger.log(`User ${followerId} unfollowed user ${followingId}`);

      return {
        success: true,
        message: '언팔로우가 완료되었습니다.',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error('Failed to unfollow user', {
        followerId,
        followingId,
        error: error.message,
        stack: error.stack,
      });

      throw new Error('언팔로우 처리 중 오류가 발생했습니다.');
    }
  }

  // 팔로우 상태 확인
  async checkFollowStatus(followerId: string, followingId: string) {
    try {
      const follow = await this.prisma.userFollow.findUnique({
        where: {
          follower_id_following_id: {
            follower_id: followerId,
            following_id: followingId,
          },
        },
      });

      return {
        success: true,
        data: {
          isFollowing: !!follow && !follow.deleted_at,
          followedAt: follow?.followed_at || null,
        },
      };
    } catch (error) {
      this.logger.error('Failed to check follow status', {
        followerId,
        followingId,
        error: error.message,
      });

      return {
        success: false,
        message: '팔로우 상태 확인 중 오류가 발생했습니다.',
        data: {
          isFollowing: false,
          followedAt: null,
        },
      };
    }
  }

  // 팔로워 목록 조회
  async getFollowers(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;

      const followers = await this.prisma.userFollow.findMany({
        where: {
          following_id: userId,
          deleted_at: null,
        },
        select: {
          follower_id: true,
          followed_at: true,
        },
        orderBy: { followed_at: 'desc' },
        skip,
        take: limit,
      });

      const totalCount = await this.prisma.userFollow.count({
        where: {
          following_id: userId,
          deleted_at: null,
        },
      });

      return {
        success: true,
        data: {
          followers: followers.map(f => ({
            userId: f.follower_id,
            followedAt: f.followed_at,
          })),
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to get followers', {
        userId,
        page,
        limit,
        error: error.message,
      });

      throw new Error('팔로워 목록 조회 중 오류가 발생했습니다.');
    }
  }

  // 팔로잉 목록 조회
  async getFollowing(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;

      const following = await this.prisma.userFollow.findMany({
        where: {
          follower_id: userId,
          deleted_at: null,
        },
        select: {
          following_id: true,
          followed_at: true,
        },
        orderBy: { followed_at: 'desc' },
        skip,
        take: limit,
      });

      const totalCount = await this.prisma.userFollow.count({
        where: {
          follower_id: userId,
          deleted_at: null,
        },
      });

      return {
        success: true,
        data: {
          following: following.map(f => ({
            userId: f.following_id,
            followedAt: f.followed_at,
          })),
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to get following', {
        userId,
        page,
        limit,
        error: error.message,
      });

      throw new Error('팔로잉 목록 조회 중 오류가 발생했습니다.');
    }
  }

  // 팔로워/팔로잉 수 통계
  async getFollowStats(userId: string) {
    try {
      const [followerCount, followingCount] = await Promise.all([
        this.prisma.userFollow.count({
          where: {
            following_id: userId,
            deleted_at: null,
          },
        }),
        this.prisma.userFollow.count({
          where: {
            follower_id: userId,
            deleted_at: null,
          },
        }),
      ]);

      return {
        success: true,
        data: {
          followerCount,
          followingCount,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get follow stats', {
        userId,
        error: error.message,
      });

      throw new Error('팔로우 통계 조회 중 오류가 발생했습니다.');
    }
  }
}