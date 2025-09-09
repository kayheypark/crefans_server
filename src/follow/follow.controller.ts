import { 
  Controller, 
  Post, 
  Delete, 
  Get, 
  UseGuards, 
  Request, 
  Param, 
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { FollowService } from './follow.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('follow')
@UseGuards(AuthGuard)
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  // 팔로우하기
  @Post(':userId')
  @HttpCode(HttpStatus.CREATED)
  async followUser(@Request() req: any, @Param('userId') followingId: string) {
    const followerId = req.user.sub;
    return this.followService.followUser(followerId, followingId);
  }

  // 언팔로우하기
  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  async unfollowUser(@Request() req: any, @Param('userId') followingId: string) {
    const followerId = req.user.sub;
    return this.followService.unfollowUser(followerId, followingId);
  }

  // 팔로우 상태 확인
  @Get('status/:userId')
  async checkFollowStatus(@Request() req: any, @Param('userId') followingId: string) {
    const followerId = req.user.sub;
    return this.followService.checkFollowStatus(followerId, followingId);
  }

  // 특정 사용자의 팔로워 목록 조회
  @Get(':userId/followers')
  async getFollowers(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.followService.getFollowers(userId, page, limit);
  }

  // 특정 사용자의 팔로잉 목록 조회
  @Get(':userId/following')
  async getFollowing(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.followService.getFollowing(userId, page, limit);
  }

  // 특정 사용자의 팔로우 통계 조회
  @Get(':userId/stats')
  async getFollowStats(@Param('userId') userId: string) {
    return this.followService.getFollowStats(userId);
  }

  // 내 팔로워 목록 조회
  @Get('my/followers')
  async getMyFollowers(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.sub;
    return this.followService.getFollowers(userId, page, limit);
  }

  // 내 팔로잉 목록 조회
  @Get('my/following')
  async getMyFollowing(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = req.user.sub;
    return this.followService.getFollowing(userId, page, limit);
  }

  // 내 팔로우 통계 조회
  @Get('my/stats')
  async getMyFollowStats(@Request() req: any) {
    const userId = req.user.sub;
    return this.followService.getFollowStats(userId);
  }
}