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
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @UseGuards(AuthGuard)
  @Post()
  async createComment(
    @Req() req: any,
    @Body() createCommentDto: CreateCommentDto,
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const comment = await this.commentService.createComment(sub, createCommentDto);
    return ApiResponseDto.success('댓글이 작성되었습니다.', comment);
  }

  @UseGuards(OptionalAuthGuard)
  @Get('posting/:postingId')
  async getCommentsByPostingId(
    @Param('postingId', ParseUUIDPipe) postingId: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    const viewerId = req?.user?.sub || null;
    const comments = await this.commentService.getCommentsByPostingId(postingId, viewerId);
    return ApiResponseDto.success('댓글 목록을 성공적으로 가져왔습니다.', comments);
  }

  @UseGuards(AuthGuard)
  @Put(':id')
  async updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() updateCommentDto: UpdateCommentDto,
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const comment = await this.commentService.updateComment(id, sub, updateCommentDto);
    return ApiResponseDto.success('댓글이 수정되었습니다.', comment);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  async deleteComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const result = await this.commentService.deleteComment(id, sub);
    return ApiResponseDto.success(result.message, null);
  }
}