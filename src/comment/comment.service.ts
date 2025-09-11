import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { LoggerService } from '../common/logger/logger.service';
import { CommentLikeService } from './comment-like.service';

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly logger: LoggerService,
    private readonly commentLikeService: CommentLikeService,
  ) {}

  async createComment(authorId: string, createCommentDto: CreateCommentDto) {
    const { posting_id, content, parent_id, tagged_user_id } = createCommentDto;

    // 포스팅 존재 여부 및 댓글 허용 여부 확인
    const posting = await this.prisma.posting.findUnique({
      where: { id: posting_id },
    });

    if (!posting) {
      throw new NotFoundException('포스팅을 찾을 수 없습니다.');
    }

    if (!posting.allow_comments) {
      throw new ForbiddenException('이 포스팅은 댓글 작성이 허용되지 않습니다.');
    }

    // 멤버십 포스팅인 경우 접근 권한 확인
    if (posting.is_membership) {
      const hasAccess = await this.checkMembershipAccess(authorId, posting);
      if (!hasAccess) {
        throw new ForbiddenException('멤버십 포스팅에 댓글을 작성할 권한이 없습니다.');
      }
    }

    // 부모 댓글이 있는 경우 검증
    if (parent_id) {
      const parentComment = await this.prisma.comment.findFirst({
        where: {
          id: parent_id,
          posting_id,
          is_deleted: false,
        },
      });

      if (!parentComment) {
        throw new NotFoundException('부모 댓글을 찾을 수 없습니다.');
      }

      // depth 2까지만 허용 (대댓글의 대댓글은 불가)
      if (parentComment.parent_id) {
        throw new BadRequestException('대댓글의 대댓글은 작성할 수 없습니다.');
      }
    }

    // 태그된 사용자가 있는 경우 유효성 검증
    if (tagged_user_id) {
      const taggedUser = await this.authService.getUserBySub(tagged_user_id);
      if (!taggedUser) {
        throw new NotFoundException('태그된 사용자를 찾을 수 없습니다.');
      }
    }

    // 댓글 생성
    const comment = await this.prisma.comment.create({
      data: {
        posting_id,
        author_id: authorId,
        content,
        parent_id,
        tagged_user_id,
      },
      include: {
        children: {
          where: { is_deleted: false },
          include: {
            children: false, // depth 2까지만
          },
        },
      },
    });

    // 포스팅의 댓글 수 업데이트
    await this.prisma.posting.update({
      where: { id: posting_id },
      data: {
        comment_count: {
          increment: 1,
        },
      },
    });

    this.logger.log('Comment created successfully', {
      service: 'CommentService',
      method: 'createComment',
      commentId: comment.id,
      authorId,
    });

    return comment;
  }

  async getCommentsByPostingId(postingId: string, viewerId?: string) {
    // 포스팅 존재 여부 확인
    const posting = await this.prisma.posting.findUnique({
      where: { id: postingId },
    });

    if (!posting) {
      throw new NotFoundException('포스팅을 찾을 수 없습니다.');
    }

    // 멤버십 포스팅인 경우 접근 권한 확인
    if (posting.is_membership && viewerId) {
      const hasAccess = await this.checkMembershipAccess(viewerId, posting);
      if (!hasAccess) {
        throw new ForbiddenException('멤버십 포스팅의 댓글을 볼 권한이 없습니다.');
      }
    }

    // 최상위 댓글들과 대댓글들을 함께 조회 
    // (삭제되지 않은 댓글 + 답글이 있는 삭제된 댓글만 포함)
    const comments = await this.prisma.comment.findMany({
      where: {
        posting_id: postingId,
        parent_id: null, // 최상위 댓글만
        OR: [
          { is_deleted: false }, // 삭제되지 않은 댓글
          { 
            is_deleted: true,
            children: { 
              some: {} // 답글이 하나라도 있는 삭제된 댓글
            }
          }
        ]
      },
      include: {
        children: {
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // 모든 댓글 ID 수집 (부모 댓글 + 자식 댓글)
    const allCommentIds: string[] = [];
    comments.forEach(comment => {
      allCommentIds.push(comment.id);
      comment.children.forEach(child => {
        allCommentIds.push(child.id);
      });
    });

    // 좋아요 상태 조회
    const likesStatus = await this.commentLikeService.getCommentLikesStatus(viewerId, allCommentIds);

    // 작성자 정보를 추가로 조회하여 포함
    const commentsWithAuthors = await Promise.all(
      comments.map(async (comment) => {
        const author = await this.authService.getUserBySub(comment.author_id);
        const childrenWithAuthors = await Promise.all(
          comment.children.map(async (child) => {
            const childAuthor = await this.authService.getUserBySub(child.author_id);
            let taggedUser = null;
            if (child.tagged_user_id) {
              taggedUser = await this.authService.getUserBySub(child.tagged_user_id);
            }
            return {
              ...child,
              content: child.is_deleted ? null : child.content,
              author: child.is_deleted ? null : (childAuthor ? {
                userId: childAuthor.Username,
                handle: childAuthor.UserAttributes?.find(attr => attr.Name === 'preferred_username')?.Value || '',
                name: childAuthor.UserAttributes?.find(attr => attr.Name === 'nickname')?.Value || '',
                avatar: childAuthor.UserAttributes?.find(attr => attr.Name === 'picture')?.Value || '/profile-90.png',
              } : null),
              taggedUser: child.is_deleted ? null : (taggedUser ? {
                userId: taggedUser.Username,
                handle: taggedUser.UserAttributes?.find(attr => attr.Name === 'preferred_username')?.Value || '',
                name: taggedUser.UserAttributes?.find(attr => attr.Name === 'nickname')?.Value || '',
              } : null),
              likeCount: likesStatus[child.id]?.likeCount || 0,
              isLiked: likesStatus[child.id]?.isLiked || false,
            };
          })
        );

        return {
          ...comment,
          content: comment.is_deleted ? null : comment.content,
          author: comment.is_deleted ? null : (author ? {
            userId: author.Username,
            handle: author.UserAttributes?.find(attr => attr.Name === 'preferred_username')?.Value || '',
            name: author.UserAttributes?.find(attr => attr.Name === 'nickname')?.Value || '',
            avatar: author.UserAttributes?.find(attr => attr.Name === 'picture')?.Value || '/profile-90.png',
          } : null),
          children: childrenWithAuthors,
          likeCount: likesStatus[comment.id]?.likeCount || 0,
          isLiked: likesStatus[comment.id]?.isLiked || false,
        };
      })
    );

    return commentsWithAuthors;
  }

  async updateComment(commentId: string, authorId: string, updateCommentDto: UpdateCommentDto) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    if (comment.author_id !== authorId) {
      throw new ForbiddenException('댓글을 수정할 권한이 없습니다.');
    }

    if (comment.is_deleted) {
      throw new BadRequestException('삭제된 댓글은 수정할 수 없습니다.');
    }

    // 태그된 사용자 유효성 검증
    if (updateCommentDto.tagged_user_id) {
      const taggedUser = await this.authService.getUserBySub(updateCommentDto.tagged_user_id);
      if (!taggedUser) {
        throw new NotFoundException('태그된 사용자를 찾을 수 없습니다.');
      }
    }

    const updatedComment = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        content: updateCommentDto.content,
        tagged_user_id: updateCommentDto.tagged_user_id,
      },
    });

    this.logger.log('Comment updated successfully', {
      service: 'CommentService',
      method: 'updateComment',
      commentId,
      authorId,
    });

    return updatedComment;
  }

  async deleteComment(commentId: string, authorId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        children: {
          where: { is_deleted: false },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    if (comment.author_id !== authorId) {
      throw new ForbiddenException('댓글을 삭제할 권한이 없습니다.');
    }

    if (comment.is_deleted) {
      throw new BadRequestException('이미 삭제된 댓글입니다.');
    }

    // 댓글 삭제 (소프트 삭제) - 대댓글은 유지
    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    // 포스팅의 댓글 수 업데이트 (삭제된 댓글만 차감)
    const deletedCount = 1;
    await this.prisma.posting.update({
      where: { id: comment.posting_id },
      data: {
        comment_count: {
          decrement: deletedCount,
        },
      },
    });

    this.logger.log('Comment deleted successfully', {
      service: 'CommentService',
      method: 'deleteComment',
      commentId,
      authorId,
      deletedCount,
    });

    return { message: '댓글이 삭제되었습니다.' };
  }

  private async checkMembershipAccess(userId: string, posting: any): Promise<boolean> {
    // 작성자 본인인지 확인
    if (posting.user_sub === userId) {
      return true;
    }

    // 구독 여부 확인
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        subscriber_id: userId,
        status: 'ONGOING',
        membership_item: {
          creator_id: posting.user_sub,
          is_active: true,
          is_deleted: false,
        },
      },
      include: {
        membership_item: true,
      },
    });

    const hasSubscription = subscriptions.some(
      (sub) => sub.membership_item.level <= (posting.membership_level || 1)
    );

    return hasSubscription;
  }
}