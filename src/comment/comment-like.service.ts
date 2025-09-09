import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class CommentLikeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async likeComment(userId: string, commentId: number) {
    // 댓글 존재 여부 확인
    const comment = await this.prisma.comment.findUnique({
      where: { 
        id: commentId,
        is_deleted: false,
      },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    // 이미 좋아요한 경우 확인
    const existingLike = await this.prisma.commentLike.findUnique({
      where: {
        comment_id_user_id: {
          comment_id: commentId,
          user_id: userId,
        },
        is_deleted: false,
      },
    });

    if (existingLike) {
      throw new ConflictException('이미 좋아요한 댓글입니다.');
    }

    // 이전에 좋아요했다가 취소한 기록이 있는지 확인
    const deletedLike = await this.prisma.commentLike.findFirst({
      where: {
        comment_id: commentId,
        user_id: userId,
        is_deleted: true,
      },
    });

    let commentLike;
    if (deletedLike) {
      // 이전 기록을 복원
      commentLike = await this.prisma.commentLike.update({
        where: { id: deletedLike.id },
        data: {
          is_deleted: false,
          deleted_at: null,
        },
      });
    } else {
      // 새로운 좋아요 생성
      commentLike = await this.prisma.commentLike.create({
        data: {
          comment_id: commentId,
          user_id: userId,
        },
      });
    }

    this.logger.log('Comment liked successfully', {
      service: 'CommentLikeService',
      method: 'likeComment',
      commentId,
      userId,
    });

    return commentLike;
  }

  async unlikeComment(userId: string, commentId: number) {
    // 댓글 존재 여부 확인
    const comment = await this.prisma.comment.findUnique({
      where: { 
        id: commentId,
        is_deleted: false,
      },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    // 좋아요 기록 확인
    const existingLike = await this.prisma.commentLike.findUnique({
      where: {
        comment_id_user_id: {
          comment_id: commentId,
          user_id: userId,
        },
        is_deleted: false,
      },
    });

    if (!existingLike) {
      throw new NotFoundException('좋아요 기록을 찾을 수 없습니다.');
    }

    // 소프트 삭제
    await this.prisma.commentLike.update({
      where: { id: existingLike.id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    this.logger.log('Comment unliked successfully', {
      service: 'CommentLikeService',
      method: 'unlikeComment',
      commentId,
      userId,
    });

    return { message: '댓글 좋아요가 취소되었습니다.' };
  }

  async getCommentLikeCount(commentId: number): Promise<number> {
    return this.prisma.commentLike.count({
      where: {
        comment_id: commentId,
        is_deleted: false,
      },
    });
  }

  async isUserLikedComment(userId: string, commentId: number): Promise<boolean> {
    const like = await this.prisma.commentLike.findUnique({
      where: {
        comment_id_user_id: {
          comment_id: commentId,
          user_id: userId,
        },
        is_deleted: false,
      },
    });

    return !!like;
  }

  async getCommentLikesStatus(userId: string | null, commentIds: number[]): Promise<Record<number, { likeCount: number; isLiked: boolean }>> {
    // 모든 댓글의 좋아요 수 조회
    const likeCounts = await this.prisma.commentLike.groupBy({
      by: ['comment_id'],
      where: {
        comment_id: { in: commentIds },
        is_deleted: false,
      },
      _count: {
        id: true,
      },
    });

    // 사용자의 좋아요 상태 조회 (로그인한 경우에만)
    let userLikes: any[] = [];
    if (userId) {
      userLikes = await this.prisma.commentLike.findMany({
        where: {
          comment_id: { in: commentIds },
          user_id: userId,
          is_deleted: false,
        },
        select: {
          comment_id: true,
        },
      });
    }

    const userLikeSet = new Set(userLikes.map(like => like.comment_id));
    const result: Record<number, { likeCount: number; isLiked: boolean }> = {};

    commentIds.forEach(commentId => {
      const likeCountData = likeCounts.find(item => item.comment_id === commentId);
      result[commentId] = {
        likeCount: likeCountData?._count.id || 0,
        isLiked: userLikeSet.has(commentId),
      };
    });

    return result;
  }
}