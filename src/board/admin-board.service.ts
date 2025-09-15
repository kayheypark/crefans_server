import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateBoardPostDto, UpdateBoardPostDto } from './dto/board.dto';

@Injectable()
export class AdminBoardService {
  constructor(private prisma: PrismaService) {}

  async getAdminPosts(
    category?: string,
    page: number = 1,
    limit: number = 20,
    includeDeleted: boolean = false,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.BoardWhereInput = {};

    if (category) {
      where.category = {
        code: category
      };
    }

    if (!includeDeleted) {
      where.is_deleted = false;
    }

    const [posts, total] = await Promise.all([
      this.prisma.board.findMany({
        where,
        orderBy: [{ is_important: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limit,
        include: {
          category: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.board.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getAdminPostById(id: string) {
    return await this.prisma.board.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });
  }

  async createPost(createBoardPostDto: CreateBoardPostDto) {
    const { publishNow, category, ...postData } = createBoardPostDto;

    // category 코드로 category_id 찾기
    const categoryRecord = await this.prisma.boardCategory.findUnique({
      where: { code: category },
    });

    if (!categoryRecord) {
      throw new Error(`Category with code "${category}" not found`);
    }

    return await this.prisma.board.create({
      data: {
        ...postData,
        category_id: categoryRecord.id,
        is_published: publishNow ?? true,
        published_at: publishNow !== false ? new Date() : null,
      },
    });
  }

  async updatePost(id: string, updateBoardPostDto: UpdateBoardPostDto) {
    const { publishNow, category, ...postData } = updateBoardPostDto;

    const existingPost = await this.prisma.board.findUnique({
      where: { id },
    });

    if (!existingPost) {
      return null;
    }

    let publishData = {};
    if (publishNow !== undefined) {
      publishData = {
        is_published: publishNow,
        published_at: publishNow ? new Date() : null,
      };
    }

    let categoryData = {};
    if (category) {
      // category 코드로 category_id 찾기
      const categoryRecord = await this.prisma.boardCategory.findUnique({
        where: { code: category },
      });

      if (!categoryRecord) {
        throw new Error(`Category with code "${category}" not found`);
      }

      categoryData = {
        category_id: categoryRecord.id,
      };
    }

    return await this.prisma.board.update({
      where: { id },
      data: {
        ...postData,
        ...categoryData,
        ...publishData,
      },
    });
  }

  async deletePost(id: string) {
    const existingPost = await this.prisma.board.findUnique({
      where: { id },
    });

    if (!existingPost) {
      return null;
    }

    await this.prisma.board.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    return true;
  }

  async restorePost(id: string) {
    const existingPost = await this.prisma.board.findUnique({
      where: { id },
    });

    if (!existingPost || !existingPost.is_deleted) {
      return null;
    }

    return await this.prisma.board.update({
      where: { id },
      data: {
        is_deleted: false,
        deleted_at: null,
      },
    });
  }
}