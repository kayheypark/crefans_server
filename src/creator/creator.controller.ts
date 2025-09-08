import { Controller, Post, UseGuards, Req, Body } from "@nestjs/common";
import { CreatorService } from "./creator.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { ApiResponseDto } from "../common/dto/api-response.dto";

@Controller("creator")
export class CreatorController {
  constructor(private readonly creatorService: CreatorService) {}

  @UseGuards(AuthGuard)
  @Post("onboard")
  async onboardCreator(@Req() req: any): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const creator = await this.creatorService.onboardCreator(sub);
    return ApiResponseDto.success(
      "크리에이터로 성공적으로 전환되었습니다.",
      creator
    );
  }
}
