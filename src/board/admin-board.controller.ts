import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminBoardService } from './admin-board.service';
import { AdminAuthGuard } from '../admin/guards/admin-auth.guard';
import { CreateBoardPostDto, UpdateBoardPostDto } from './dto/board.dto';

@Controller('admin/board')
@UseGuards(AdminAuthGuard)
export class AdminBoardController {
  constructor(private readonly adminBoardService: AdminBoardService) {}

  @Get()
  async getAdminPosts(
    @Query('category') category?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('includeDeleted') includeDeleted: boolean = false,
  ) {
    const result = await this.adminBoardService.getAdminPosts(
      category,
      page,
      limit,
      includeDeleted,
    );

    return {
      success: true,
      message: '게시글 목록을 성공적으로 조회했습니다.',
      data: result,
    };
  }

  @Get(':id')
  async getAdminPost(@Param('id') id: string) {
    const post = await this.adminBoardService.getAdminPostById(id);

    if (!post) {
      return {
        success: false,
        message: '게시글을 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      message: '게시글을 성공적으로 조회했습니다.',
      data: post,
    };
  }

  @Post()
  async createPost(@Body() createBoardPostDto: CreateBoardPostDto) {
    try {
      const post = await this.adminBoardService.createPost(createBoardPostDto);

      return {
        success: true,
        message: '게시글이 성공적으로 생성되었습니다.',
        data: post,
      };
    } catch (error) {
      console.error('Board creation error:', error);
      return {
        success: false,
        message: error.message || '게시글 생성 중 오류가 발생했습니다.',
        error: error.message,
      };
    }
  }

  @Put(':id')
  async updatePost(
    @Param('id') id: string,
    @Body() updateBoardPostDto: UpdateBoardPostDto,
  ) {
    const post = await this.adminBoardService.updatePost(id, updateBoardPostDto);

    if (!post) {
      return {
        success: false,
        message: '게시글을 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      message: '게시글이 성공적으로 수정되었습니다.',
      data: post,
    };
  }

  @Delete(':id')
  async deletePost(@Param('id') id: string) {
    const result = await this.adminBoardService.deletePost(id);

    if (!result) {
      return {
        success: false,
        message: '게시글을 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      message: '게시글이 성공적으로 삭제되었습니다.',
    };
  }

  @Put(':id/restore')
  async restorePost(@Param('id') id: string) {
    const post = await this.adminBoardService.restorePost(id);

    if (!post) {
      return {
        success: false,
        message: '게시글을 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      message: '게시글이 성공적으로 복원되었습니다.',
      data: post,
    };
  }
}