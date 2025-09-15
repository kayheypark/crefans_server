import { Controller, Get } from '@nestjs/common';
import { BoardCategoryService } from './board-category.service';

@Controller('board-categories')
export class BoardCategoryController {
  constructor(private readonly boardCategoryService: BoardCategoryService) {}

  @Get()
  async getCategories() {
    const categories = await this.boardCategoryService.findAll(false);

    return {
      success: true,
      message: '카테고리 목록을 성공적으로 조회했습니다.',
      data: categories,
    };
  }
}