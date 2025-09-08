import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { ApiResponseDto } from "../common/dto/api-response.dto";
import { AuthGuard } from "../common/guards/auth.guard";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("profile/:handle")
  async getUserProfileByHandle(
    @Param("handle") handle: string
  ): Promise<ApiResponseDto<any>> {
    const profile = await this.userService.getUserProfileByHandle(handle);
    return ApiResponseDto.success("프로필을 성공적으로 가져왔습니다.", profile);
  }

  @Get("check-nickname")
  async checkNickname(
    @Query("nickname") nickname: string
  ): Promise<ApiResponseDto<{ available: boolean }>> {
    const available = await this.userService.checkNicknameAvailability(nickname);
    return ApiResponseDto.success("닉네임 중복 확인이 완료되었습니다.", {
      available,
    });
  }

  @Get("posts/:handle")
  async getUserPosts(
    @Param("handle") handle: string,
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20"
  ): Promise<ApiResponseDto<any>> {
    const posts = await this.userService.getUserPosts(
      handle,
      parseInt(page),
      parseInt(limit)
    );
    return ApiResponseDto.success("사용자의 포스트를 성공적으로 가져왔습니다.", posts);
  }
}