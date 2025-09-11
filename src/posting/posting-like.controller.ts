import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PostingLikeService } from './posting-like.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponseDto } from '../common/dto/api-response.dto';

type CurrentUserType = {
  userSub: string;
  email: string;
  username?: string;
  accessToken?: string;
};

@Controller('postings')
export class PostingLikeController {
  constructor(private readonly postingLikeService: PostingLikeService) {}

  @UseGuards(AuthGuard)
  @Post(':id/like')
  async likePosting(
    @Param('id', ParseUUIDPipe) postingId: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.postingLikeService.likePosting(user.userSub, postingId);
    return ApiResponseDto.success('포스팅에 좋아요를 추가했습니다.', result);
  }

  @UseGuards(AuthGuard)
  @Delete(':id/like')
  async unlikePosting(
    @Param('id', ParseUUIDPipe) postingId: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.postingLikeService.unlikePosting(user.userSub, postingId);
    return ApiResponseDto.success('포스팅 좋아요를 취소했습니다.', result);
  }
}