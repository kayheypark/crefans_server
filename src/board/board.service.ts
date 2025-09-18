import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Board, Prisma } from '@prisma/client';

@Injectable()
export class BoardService {
  constructor(private prisma: PrismaService) {}

  async getPosts(category?: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const where: Prisma.BoardWhereInput = {
      is_published: true,
      is_deleted: false,
    };

    if (category) {
      where.category = {
        code: category
      };
    }

    const [posts, total] = await Promise.all([
      this.prisma.board.findMany({
        where,
        orderBy: [
          { is_important: 'desc' },
          { created_at: 'desc' },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          category: {
            select: {
              code: true,
              name: true,
            },
          },
          created_at: true,
          published_at: true,
          views: true,
          is_important: true,
          excerpt: true,
        },
      }),
      this.prisma.board.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const formattedPosts = posts.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category.code.toLowerCase(),
      categoryName: post.category.name,
      created_at: post.created_at.toISOString(),
      published_at: post.published_at ? post.published_at.toISOString() : post.created_at.toISOString(),
      views: post.views,
      is_important: post.is_important,
      excerpt: post.excerpt || '',
      author: '크리팬스 관리자',
    }));

    return {
      posts: formattedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getPostById(id: string, clientIp?: string) {
    const post = await this.prisma.board.findFirst({
      where: {
        id,
        is_published: true,
        is_deleted: false,
      },
      include: {
        category: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!post) {
      return null;
    }

    // 조회수 증가는 별도 메서드로 처리
    if (clientIp) {
      await this.incrementViewCount(id, clientIp);
    }

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      category: post.category.code.toLowerCase(),
      categoryName: post.category.name,
      created_at: post.created_at.toISOString(),
      updated_at: post.updated_at.toISOString(),
      published_at: post.published_at ? post.published_at.toISOString() : post.created_at.toISOString(),
      views: post.views,
      is_important: post.is_important,
      author: post.author,
    };
  }

  async incrementViewCount(boardId: string, ipAddress: string) {
    try {
      // 24시간 이내에 같은 IP로 조회한 기록이 있는지 확인
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const existingView = await this.prisma.boardView.findFirst({
        where: {
          board_id: boardId,
          ip_address: ipAddress,
          viewed_at: {
            gte: oneDayAgo,
          },
        },
      });

      // 24시간 이내 조회 기록이 있으면 조회수 증가하지 않음
      if (existingView) {
        return {
          success: false,
          message: '이미 조회한 게시글입니다.',
        };
      }

      // 트랜잭션으로 조회 기록 추가와 조회수 증가를 동시에 처리
      await this.prisma.$transaction(async (prisma) => {
        // 조회 기록 추가
        await prisma.boardView.create({
          data: {
            board_id: boardId,
            ip_address: ipAddress,
          },
        });

        // 조회수 증가
        await prisma.board.update({
          where: { id: boardId },
          data: { views: { increment: 1 } },
        });
      });

      return {
        success: true,
        message: '조회수가 증가했습니다.',
      };
    } catch (error) {
      console.error('조회수 증가 실패:', error);
      return {
        success: false,
        message: '조회수 증가에 실패했습니다.',
      };
    }
  }
}