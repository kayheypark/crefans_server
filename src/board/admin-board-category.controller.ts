import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { BoardCategoryService } from './board-category.service';
import { AdminAuthGuard } from '../admin/guards/admin-auth.guard';
import { UpdateBoardCategoryDto } from './dto/board-category.dto';

@Controller('admin/board-categories')
@UseGuards(AdminAuthGuard)
export class AdminBoardCategoryController {
  constructor(private readonly boardCategoryService: BoardCategoryService) {}

  @Get()
  async getAdminCategories() {
    const categories = await this.boardCategoryService.findAll(true);

    return {
      success: true,
      message: '카테고리 목록을 성공적으로 조회했습니다.',
      data: categories,
    };
  }

  @Get(':id')
  async getCategory(@Param('id') id: string) {
    const category = await this.boardCategoryService.findOne(id);

    if (!category) {
      return {
        success: false,
        message: '카테고리를 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      message: '카테고리를 성공적으로 조회했습니다.',
      data: category,
    };
  }


  @Put(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() updateBoardCategoryDto: UpdateBoardCategoryDto,
  ) {
    try {
      const category = await this.boardCategoryService.update(id, updateBoardCategoryDto);

      if (!category) {
        return {
          success: false,
          message: '카테고리를 찾을 수 없습니다.',
        };
      }

      return {
        success: true,
        message: '카테고리가 성공적으로 수정되었습니다.',
        data: category,
      };
    } catch (error) {
      return {
        success: false,
        message: '카테고리 수정에 실패했습니다.',
      };
    }
  }

  @Delete(':id')
  async deleteCategory(@Param('id') id: string) {
    try {
      const result = await this.boardCategoryService.delete(id);

      if (!result) {
        return {
          success: false,
          message: '카테고리를 찾을 수 없습니다.',
        };
      }

      return {
        success: true,
        message: '카테고리가 성공적으로 비활성화되었습니다.',
      };
    } catch (error) {
      return {
        success: false,
        message: '카테고리 비활성화에 실패했습니다.',
      };
    }
  }

  @Put(':id/restore')
  async restoreCategory(@Param('id') id: string) {
    try {
      const category = await this.boardCategoryService.restore(id);

      if (!category) {
        return {
          success: false,
          message: '카테고리를 찾을 수 없습니다.',
        };
      }

      return {
        success: true,
        message: '카테고리가 성공적으로 복원되었습니다.',
        data: category,
      };
    } catch (error) {
      return {
        success: false,
        message: '카테고리 복원에 실패했습니다.',
      };
    }
  }

}