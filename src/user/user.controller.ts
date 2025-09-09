import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
  Put,
  Req,
  Body,
  Post,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { ApiResponseDto } from "../common/dto/api-response.dto";
import { AuthGuard } from "../common/guards/auth.guard";
import { OptionalAuthGuard } from "../common/guards/optional-auth.guard";
import { UpdateUserProfileDto } from "./dto/user.dto";

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

  @UseGuards(AuthGuard)
  @Put("profile")
  async updateUserProfile(
    @Req() req: any,
    @Body() updateUserProfileDto: UpdateUserProfileDto
  ): Promise<ApiResponseDto<any>> {
    console.log("updateUserProfile request body:", updateUserProfileDto);
    const { sub } = req.user; // AuthGuard를 통해 주입된 사용자 정보
    console.log("updateUserProfile user sub:", sub);
    const profile = await this.userService.updateUserProfile(
      sub,
      updateUserProfileDto
    );
    return ApiResponseDto.success(
      "프로필이 성공적으로 업데이트되었습니다.",
      profile
    );
  }

  @Get("check-nickname")
  async checkNickname(
    @Query("nickname") nickname: string
  ): Promise<ApiResponseDto<{ available: boolean }>> {
    const available = await this.userService.checkNicknameAvailability(
      nickname
    );
    return ApiResponseDto.success("닉네임 중복 확인이 완료되었습니다.", {
      available,
    });
  }

  @UseGuards(OptionalAuthGuard)
  @Get("posts/:handle")
  async getUserPosts(
    @Param("handle") handle: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit: string = "20",
    @Req() req?: any
  ): Promise<ApiResponseDto<any>> {
    // 디버깅 로그

    const viewerId = req?.user?.userSub || null;

    const posts = await this.userService.getUserPosts(
      handle,
      cursor,
      parseInt(limit),
      viewerId
    );
    return ApiResponseDto.success(
      "사용자의 포스트를 성공적으로 가져왔습니다.",
      posts
    );
  }

  @UseGuards(AuthGuard)
  @Post("become-creator")
  async becomeCreator(@Req() req: any): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const creator = await this.userService.becomeCreator(sub);
    return ApiResponseDto.success("크리에이터로 전환되었습니다.", creator);
  }

  @UseGuards(AuthGuard)
  @Get("creator-status")
  async getCreatorStatus(
    @Req() req: any
  ): Promise<ApiResponseDto<{ isCreator: boolean }>> {
    const { sub } = req.user;
    const isCreator = await this.userService.isCreator(sub);
    return ApiResponseDto.success("크리에이터 상태를 조회했습니다.", {
      isCreator,
    });
  }
}
