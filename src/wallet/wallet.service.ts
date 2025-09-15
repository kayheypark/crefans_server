import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Decimal } from "@prisma/client/runtime/library";
import {
  GetUserWalletResponse,
  WalletResponse,
  TokenTypeResponse,
  ChargeTokenRequest,
  ChargeTokenResponse,
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

  /**
   * 토큰 충전을 위한 결제 정보 생성
   * @param userSub 사용자 ID
   * @param chargeRequest 충전 요청 정보
   */
  async prepareTokenCharge(
    userSub: string,
    chargeRequest: ChargeTokenRequest,
  ): Promise<ChargeTokenResponse> {
    // 1. 토큰 타입 조회 및 검증
    const tokenType = await this.prisma.tokenType.findUnique({
      where: { id: chargeRequest.tokenTypeId },
    });

    if (!tokenType) {
      throw new NotFoundException("토큰 타입을 찾을 수 없습니다.");
    }

    // 2. 최소 충전 금액 검증 (1개 이상)
    if (chargeRequest.amount < 1) {
      throw new BadRequestException("최소 1개 이상의 토큰을 충전해야 합니다.");
    }

    // 3. 결제 금액 계산 (토큰 수량 * 토큰 가격)
    const paymentAmount = new Decimal(chargeRequest.amount).mul(tokenType.price);

    // 4. 주문번호 생성
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const orderId = `charge_${userSub}_${timestamp}_${random}`;

    // 5. 클라이언트 키는 환경변수에서 가져와야 하지만, 여기서는 placeholder
    const clientKey = process.env.TOSSPAYMENTS_CLIENT_KEY || '';

    return {
      success: true,
      data: {
        orderId,
        amount: Number(paymentAmount),
        tokenAmount: chargeRequest.amount,
        clientKey,
      },
    };
  }

  /**
   * 사용자의 특정 토큰 지갑 조회 또는 생성
   * @param userSub 사용자 ID
   * @param tokenTypeId 토큰 타입 ID
   */
  async getOrCreateUserWallet(userSub: string, tokenTypeId: string) {
    // 기존 지갑 조회
    let wallet = await this.prisma.wallet.findFirst({
      where: {
        token_type_id: tokenTypeId,
        ownerships: {
          some: {
            owner_id: userSub,
            ended_at: null,
          },
        },
      },
      include: {
        token_type: true,
      },
    });

    // 지갑이 없으면 새로 생성
    if (!wallet) {
      const { v4: uuidv4 } = require('uuid');

      wallet = await this.prisma.wallet.create({
        data: {
          address: uuidv4(),
          token_type_id: tokenTypeId,
          amount: new Decimal(0),
          ownerships: {
            create: {
              owner_id: userSub,
            },
          },
        },
        include: {
          token_type: true,
        },
      });
    }

    return wallet;
  }

  /**
   * 토큰 잔액 업데이트
   * @param walletId 지갑 ID
   * @param amount 추가할 토큰 수량
   */
  async addTokenBalance(walletId: string, amount: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException("지갑을 찾을 수 없습니다.");
    }

    const newAmount = wallet.amount.add(new Decimal(amount));

    return await this.prisma.wallet.update({
      where: { id: walletId },
      data: { amount: newAmount },
    });
  }
}

//.
