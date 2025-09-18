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

  async getPostById(id: string) {
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

    await this.prisma.board.update({
      where: { id },
      data: { views: { increment: 1 } },
    });

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      category: post.category.code.toLowerCase(),
      categoryName: post.category.name,
      created_at: post.created_at.toISOString(),
      updated_at: post.updated_at.toISOString(),
      published_at: post.published_at ? post.published_at.toISOString() : post.created_at.toISOString(),
      views: post.views + 1,
      is_important: post.is_important,
      author: post.author,
    };
  }
}