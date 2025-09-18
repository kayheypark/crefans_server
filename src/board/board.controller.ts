import { Controller, Get, Param, Query, Patch, Req, Ip } from '@nestjs/common';
import { BoardService } from './board.service';
import { Request } from 'express';

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
  async getPost(
    @Param('id') id: string,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    // IP 주소 추출 (프록시 환경 고려)
    const clientIp = req.headers['x-forwarded-for']
      ? (req.headers['x-forwarded-for'] as string).split(',')[0].trim()
      : req.headers['x-real-ip'] as string || ip;

    const post = await this.boardService.getPostById(id, clientIp);

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

  @Patch(':id/views')
  async incrementViews(
    @Param('id') id: string,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    // IP 주소 추출 (프록시 환경 고려)
    const clientIp = req.headers['x-forwarded-for']
      ? (req.headers['x-forwarded-for'] as string).split(',')[0].trim()
      : req.headers['x-real-ip'] as string || ip;

    const result = await this.boardService.incrementViewCount(id, clientIp);

    return {
      success: result.success,
      message: result.message,
    };
  }
}