import { Controller, Get, Param, Query } from '@nestjs/common';
import { BoardService } from './board.service';

@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get()
  async getPosts(
    @Query('category') category?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.boardService.getPosts(category, page, limit);

    return {
      success: true,
      message: '게시글 목록을 성공적으로 조회했습니다.',
      data: result,
    };
  }

  @Get(':id')
  async getPost(@Param('id') id: string) {
    const post = await this.boardService.getPostById(id);

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
}