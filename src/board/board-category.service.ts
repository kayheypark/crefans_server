import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoardCategory } from '@prisma/client';

@Injectable()
export class BoardCategoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(includePrivate = false) {
    const where = includePrivate
      ? { is_active: true }
      : { is_active: true, is_public: true };

    return await this.prisma.boardCategory.findMany({
      where,
      orderBy: { sort_order: 'asc' },
    });
  }

  async findOne(id: string) {
    return await this.prisma.boardCategory.findUnique({
      where: { id },
    });
  }

  async findByCode(code: string) {
    return await this.prisma.boardCategory.findUnique({
      where: { code },
    });
  }

  async create(data: {
    code: string;
    name: string;
    description?: string;
    sort_order?: number;
    is_public?: boolean;
  }) {
    return await this.prisma.boardCategory.create({
      data: {
        ...data,
        sort_order: data.sort_order ?? 0,
        is_public: data.is_public ?? true,
      },
    });
  }

  async update(id: string, data: {
    code?: string;
    name?: string;
    description?: string;
    sort_order?: number;
    is_public?: boolean;
    is_active?: boolean;
  }) {
    return await this.prisma.boardCategory.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    // 소프트 삭제 (is_active를 false로 설정)
    return await this.prisma.boardCategory.update({
      where: { id },
      data: { is_active: false },
    });
  }

  async restore(id: string) {
    return await this.prisma.boardCategory.update({
      where: { id },
      data: { is_active: true },
    });
  }

  async initializeDefaultCategories() {
    const existingCategories = await this.prisma.boardCategory.findMany();

    if (existingCategories.length === 0) {
      await this.prisma.boardCategory.createMany({
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            code: 'NOTICE',
            name: '공지사항',
            description: '중요한 공지사항을 게시하는 카테고리입니다.',
            sort_order: 1,
            is_public: true,
            is_active: true,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            code: 'EVENT',
            name: '이벤트',
            description: '다양한 이벤트 소식을 게시하는 카테고리입니다.',
            sort_order: 2,
            is_public: true,
            is_active: true,
          },
        ],
      });
    }
  }
}