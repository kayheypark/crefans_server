import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PostingService } from './posting.service';
import {
  CreatePostingDto,
  UpdatePostingDto,
  PostingQueryDto,
  PostingListResponse,
  PostingDetailResponse,
  CreatePostingResponse,
} from './dto/posting.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { CreatorGuard } from '../common/guards/creator.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

type CurrentUserType = {
  userSub: string;
  email: string;
  username?: string;
  accessToken?: string;
};

@Controller('postings')
export class PostingController {
  constructor(private readonly postingService: PostingService) {}

  @Post()
  @UseGuards(AuthGuard, CreatorGuard)
  async createPosting(
    @CurrentUser() user: CurrentUserType,
    @Body() createPostingDto: CreatePostingDto,
  ): Promise<CreatePostingResponse> {
    return this.postingService.createPosting(user.userSub, createPostingDto);
  }

  @Get()
  async getPostings(@Query() query: PostingQueryDto): Promise<PostingListResponse> {
    return this.postingService.getPostings(query);
  }

  @Get(':id')
  async getPostingById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: CurrentUserType,
  ): Promise<PostingDetailResponse> {
    return this.postingService.getPostingById(id, user?.userSub);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, CreatorGuard)
  async updatePosting(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserType,
    @Body() updatePostingDto: UpdatePostingDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.postingService.updatePosting(id, user.userSub, updatePostingDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CreatorGuard)
  async deletePosting(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ success: boolean; message: string }> {
    return this.postingService.deletePosting(id, user.userSub);
  }

  @Get('my/list')
  @UseGuards(AuthGuard, CreatorGuard)
  async getMyPostings(
    @CurrentUser() user: CurrentUserType,
    @Query() query: PostingQueryDto,
  ): Promise<PostingListResponse> {
    const queryWithCreator = { ...query, creator_id: user.userSub };
    return this.postingService.getPostings(queryWithCreator);
  }
}