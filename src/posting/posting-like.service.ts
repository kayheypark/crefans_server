import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class PostingLikeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async likePosting(userId: string, postingId: string) {
    // 포스팅 존재 여부 확인
    const posting = await this.prisma.posting.findUnique({
      where: { 
        id: postingId,
        is_deleted: false,
      },
    });

    if (!posting) {
      throw new NotFoundException('포스팅을 찾을 수 없습니다.');
    }

    // 이미 좋아요한 경우 확인
    const existingLike = await this.prisma.postingLike.findUnique({
      where: {
        posting_id_user_id: {
          posting_id: postingId,
          user_id: userId,
        },
        is_deleted: false,
      },
    });

    if (existingLike) {
      throw new ConflictException('이미 좋아요한 포스팅입니다.');
    }

    // 이전에 좋아요했다가 취소한 기록이 있는지 확인
    const deletedLike = await this.prisma.postingLike.findFirst({
      where: {
        posting_id: postingId,
        user_id: userId,
        is_deleted: true,
      },
    });

    let postingLike;
    if (deletedLike) {
      // 이전 기록을 복원
      postingLike = await this.prisma.postingLike.update({
        where: { id: deletedLike.id },
        data: {
          is_deleted: false,
          deleted_at: null,
        },
      });
    } else {
      // 새로운 좋아요 생성
      postingLike = await this.prisma.postingLike.create({
        data: {
          posting_id: postingId,
          user_id: userId,
        },
      });
    }

    // 포스팅의 좋아요 수 업데이트
    await this.updatePostingLikeCount(postingId);

    this.logger.log('Posting liked successfully', {
      service: 'PostingLikeService',
      method: 'likePosting',
      postingId,
      userId,
    });

    return postingLike;
  }

  async unlikePosting(userId: string, postingId: string) {
    // 포스팅 존재 여부 확인
    const posting = await this.prisma.posting.findUnique({
      where: { 
        id: postingId,
        is_deleted: false,
      },
    });

    if (!posting) {
      throw new NotFoundException('포스팅을 찾을 수 없습니다.');
    }

    // 좋아요 기록 확인
    const existingLike = await this.prisma.postingLike.findUnique({
      where: {
        posting_id_user_id: {
          posting_id: postingId,
          user_id: userId,
        },
        is_deleted: false,
      },
    });

    if (!existingLike) {
      throw new NotFoundException('좋아요 기록을 찾을 수 없습니다.');
    }

    // 소프트 삭제
    await this.prisma.postingLike.update({
      where: { id: existingLike.id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    // 포스팅의 좋아요 수 업데이트
    await this.updatePostingLikeCount(postingId);

    this.logger.log('Posting unliked successfully', {
      service: 'PostingLikeService',
      method: 'unlikePosting',
      postingId,
      userId,
    });

    return { message: '포스팅 좋아요가 취소되었습니다.' };
  }

  async getPostingLikeCount(postingId: string): Promise<number> {
    return this.prisma.postingLike.count({
      where: {
        posting_id: postingId,
        is_deleted: false,
      },
    });
  }

  async isUserLikedPosting(userId: string, postingId: string): Promise<boolean> {
    const like = await this.prisma.postingLike.findUnique({
      where: {
        posting_id_user_id: {
          posting_id: postingId,
          user_id: userId,
        },
        is_deleted: false,
      },
    });

    return !!like;
  }

  async getPostingLikesStatus(userId: string | null, postingIds: string[]): Promise<Record<string, { likeCount: number; isLiked: boolean }>> {
    // 모든 포스팅의 좋아요 수 조회
    const likeCounts = await this.prisma.postingLike.groupBy({
      by: ['posting_id'],
      where: {
        posting_id: { in: postingIds },
        is_deleted: false,
      },
      _count: {
        id: true,
      },
    });

    // 사용자의 좋아요 상태 조회 (로그인한 경우에만)
    let userLikes: any[] = [];
    if (userId) {
      userLikes = await this.prisma.postingLike.findMany({
        where: {
          posting_id: { in: postingIds },
          user_id: userId,
          is_deleted: false,
        },
        select: {
          posting_id: true,
        },
      });
    }

    const userLikeSet = new Set(userLikes.map(like => like.posting_id));
    const result: Record<number, { likeCount: number; isLiked: boolean }> = {};

    postingIds.forEach(postingId => {
      const likeCountData = likeCounts.find(item => item.posting_id === postingId);
      result[postingId] = {
        likeCount: likeCountData?._count.id || 0,
        isLiked: userLikeSet.has(postingId),
      };
    });

    return result;
  }

  private async updatePostingLikeCount(postingId: string): Promise<void> {
    const likeCount = await this.getPostingLikeCount(postingId);
    await this.prisma.posting.update({
      where: { id: postingId },
      data: { like_count: likeCount },
    });
  }
}