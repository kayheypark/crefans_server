import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
  Body,
} from '@nestjs/common';
import { CommentLikeService } from './comment-like.service';
import { CommentLikeDto } from './dto/comment-like.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('comments')
export class CommentLikeController {
  constructor(private readonly commentLikeService: CommentLikeService) {}

  @UseGuards(AuthGuard)
  @Post(':id/like')
  async likeComment(
    @Param('id', ParseUUIDPipe) commentId: string,
    @Req() req: any,
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const result = await this.commentLikeService.likeComment(sub, commentId);
    return ApiResponseDto.success('댓글에 좋아요를 추가했습니다.', result);
  }

  @UseGuards(AuthGuard)
  @Delete(':id/like')
  async unlikeComment(
    @Param('id', ParseUUIDPipe) commentId: string,
    @Req() req: any,
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const result = await this.commentLikeService.unlikeComment(sub, commentId);
    return ApiResponseDto.success('댓글 좋아요를 취소했습니다.', result);
  }
}