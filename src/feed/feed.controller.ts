import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { FeedService, FeedQuery } from './feed.service';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @UseGuards(OptionalAuthGuard)
  @Get()
  async getFeed(@Req() req: any, @Query() query: FeedQuery) {
    const userId = req.user?.sub;
    return await this.feedService.getFeed(userId, query);
  }

  @Get('public')
  async getPublicFeed(@Query() query: FeedQuery) {
    return await this.feedService.getPublicFeed(query);
  }
}