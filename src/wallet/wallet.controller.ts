import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import {
  CurrentUser,
  CurrentUser as CurrentUserType,
} from "../common/decorators/current-user.decorator";
import { WalletService } from "./wallet.service";
import { GetUserWalletResponse, ChargeTokenRequest, ChargeTokenResponse } from "./dto/wallet.dto";

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

  /**
   * 토큰 충전 준비 (결제 정보 생성)
   */
  @Post('charge/prepare')
  @UseGuards(AuthGuard)
  async prepareTokenCharge(
    @CurrentUser() user: CurrentUserType,
    @Body() chargeRequest: ChargeTokenRequest,
  ): Promise<ChargeTokenResponse> {
    return this.walletService.prepareTokenCharge(user.userSub, chargeRequest);
  }

}
