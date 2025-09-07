import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import {
  CurrentUser,
  CurrentUser as CurrentUserType,
} from "../common/decorators/current-user.decorator";
import { WalletService } from "./wallet.service";
import { GetUserWalletResponse } from "./dto/wallet.dto";

@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getUserWallet(
    @CurrentUser() user: CurrentUserType
  ): Promise<GetUserWalletResponse> {
    return this.walletService.getUserWallet(user.userSub);
  }

  // 테스트용 엔드포인트 (인증 없음)
  @Get("test")
  async getTestWallet(): Promise<GetUserWalletResponse> {
    // 테스트용으로 하드코딩된 userSub 사용
    return this.walletService.getUserWallet(
      "44a8ed1c-9021-709d-b3f7-dacec1fd90b5"
    );
  }
}
