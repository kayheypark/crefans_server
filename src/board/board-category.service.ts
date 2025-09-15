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

}