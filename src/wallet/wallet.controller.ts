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

}
