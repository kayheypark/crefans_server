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
  DefaultValuePipe,
} from "@nestjs/common";
import { FollowService } from "./follow.service";
import { AuthGuard } from "../common/guards/auth.guard";

@Controller("follow")
@UseGuards(AuthGuard)
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  // 팔로우하기
  @Post(":userId")
  @HttpCode(HttpStatus.CREATED)
  async followUser(@Request() req: any, @Param("userId") followingId: string) {
    const followerId = req.user.sub;
    return this.followService.followUser(followerId, followingId);
  }

  // 언팔로우하기
  @Delete(":userId")
  @HttpCode(HttpStatus.OK)
  async unfollowUser(
    @Request() req: any,
    @Param("userId") followingId: string
  ) {
    const followerId = req.user.sub;
    return this.followService.unfollowUser(followerId, followingId);
  }


  // 내 팔로잉 목록 조회
  @Get("my-following")
  async getMyFollowing(
    @Request() req: any,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    const userId = req.user.sub;
    return this.followService.getFollowing(userId, page, limit);
  }

  // 내 팔로워 목록 조회
  @Get("my-followers")
  async getMyFollowers(
    @Request() req: any,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    const userId = req.user.sub;
    return this.followService.getFollowers(userId, page, limit);
  }
}

// 공개 API용 별도 컨트롤러 생성
@Controller("follow/public")
export class PublicFollowController {
  constructor(private readonly followService: FollowService) {}

  // 특정 사용자의 팔로잉 목록 조회 (공개)
  @Get("user/:userId/following")
  async getUserFollowing(
    @Param("userId") userId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.followService.getFollowing(userId, page, limit);
  }

  // 특정 사용자의 팔로워 목록 조회 (공개)
  @Get("user/:userId/followers")
  async getUserFollowers(
    @Param("userId") userId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.followService.getFollowers(userId, page, limit);
  }

}
