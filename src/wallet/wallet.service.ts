import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  GetUserWalletResponse,
  WalletResponse,
  TokenTypeResponse,
} from "./dto/wallet.dto";

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getUserWallet(userSub: string): Promise<GetUserWalletResponse> {
    const wallets = await this.prisma.walletOwnership.findMany({
      where: {
        owner_id: userSub,
        ended_at: null,
      },
      include: {
        wallet: {
          include: {
            token_type: true,
          },
        },
      },
    });

    const walletResponses: WalletResponse[] = wallets.map((ownership) => {
      const tokenType: TokenTypeResponse = {
        // id: ownership.wallet.token_type.id,
        symbol: ownership.wallet.token_type.symbol,
        name: ownership.wallet.token_type.name,
        price: Number(ownership.wallet.token_type.price),
      };

      return {
        // id: ownership.wallet.id,
        address: ownership.wallet.address,
        tokenType,
        amount: Number(ownership.wallet.amount),
        ownedSince: ownership.started_at.toISOString(),
      };
    });

    const totalValue = walletResponses.reduce(
      (sum, wallet) => sum + wallet.amount * wallet.tokenType.price,
      0
    );

    return {
      success: true,
      data: {
        wallets: walletResponses,
        totalValue,
      },
    };
  }
}
