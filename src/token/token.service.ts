import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";
import { Decimal } from "@prisma/client/runtime/library";
import * as crypto from "crypto";
import { CommonStatus } from "@prisma/client";

@Injectable()
export class TokenService {
  constructor(private prisma: PrismaService) {}

  /**
   * 트랜잭션 해시 생성
   * @param fromWalletAddress 송신자 지갑 주소
   * @param toWalletAddress 수신자 지갑 주소
   * @param amount 전송 금액
   * @param reason 전송 사유
   * @param timestamp 타임스탬프
   */
  private generateTransactionHash(
    fromWalletAddress: string,
    toWalletAddress: string,
    amount: Decimal,
    reason: string,
    timestamp: Date
  ): string {
    const data = `${fromWalletAddress}:${toWalletAddress}:${amount.toString()}:${reason}:${timestamp.getTime()}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * 지갑 생성
   * @param tokenTypeId 토큰 타입 ID
   * @param ownerId 소유자 ID (Cognito userSub)
   */
  async createWallet(tokenTypeId: string, ownerId: string) {
    // 1. 토큰 타입 존재 여부 확인
    const tokenType = await this.prisma.tokenType.findUnique({
      where: { id: tokenTypeId },
    });

    if (!tokenType) {
      throw new NotFoundException("토큰 타입이 존재하지 않습니다.");
    }

    // 2. 이미 해당 토큰 타입의 지갑이 있는지 확인
    const existingWallet = await this.prisma.wallet.findFirst({
      where: {
        token_type_id: tokenTypeId,
        ownerships: {
          some: {
            owner_id: ownerId,
            ended_at: null, // 현재 소유 중인 지갑
          },
        },
      },
    });

    if (existingWallet) {
      throw new BadRequestException("이미 해당 토큰 타입의 지갑이 존재합니다.");
    }

    // 3. 지갑 생성 및 소유권 할당
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.create({
        data: {
          address: uuidv4(),
          token_type_id: tokenTypeId,
          amount: new Decimal(0),
          ownerships: {
            create: {
              owner_id: ownerId,
            },
          },
        },
        include: {
          token_type: true,
          ownerships: true,
        },
      });

      return wallet;
    });
  }

  /**
   * 토큰 전송
   * @param fromWalletId 송신 지갑 ID
   * @param toWalletId 수신 지갑 ID
   * @param amount 전송 금액
   * @param reason 전송 사유
   * @param referenceId 참조 ID (선택)
   */
  async transferToken(
    fromWalletId: string,
    toWalletId: string,
    amount: number,
    reason: string,
    referenceId?: string
  ) {
    // 1. 송신 지갑 확인
    const fromWallet = await this.prisma.wallet.findUnique({
      where: { id: fromWalletId },
      include: { token_type: true },
    });

    if (!fromWallet) {
      throw new NotFoundException("송신 지갑이 존재하지 않습니다.");
    }

    // 2. 수신 지갑 확인
    const toWallet = await this.prisma.wallet.findUnique({
      where: { id: toWalletId },
      include: { token_type: true },
    });

    if (!toWallet) {
      throw new NotFoundException("수신 지갑이 존재하지 않습니다.");
    }

    // 3. 토큰 타입 일치 여부 확인
    if (fromWallet.token_type_id !== toWallet.token_type_id) {
      throw new BadRequestException(
        "서로 다른 토큰 타입 간 전송은 불가능합니다."
      );
    }

    // 4. 잔액 확인
    const amountDecimal = new Decimal(amount);
    if (fromWallet.amount.lessThan(amountDecimal)) {
      throw new BadRequestException("잔액이 부족합니다.");
    }

    // 5. 전송 사유 확인
    const transferReason = await this.prisma.transferReason.findUnique({
      where: { id: reason },
    });

    if (!transferReason) {
      throw new NotFoundException("전송 사유가 존재하지 않습니다.");
    }

    // 6. 전송 실행
    return this.prisma.$transaction(async (tx) => {
      const timestamp = new Date();
      const txHash = this.generateTransactionHash(
        fromWallet.address,
        toWallet.address,
        amountDecimal,
        reason,
        timestamp
      );

      // 송신자 잔액 업데이트
      const updatedFromWallet = await tx.wallet.update({
        where: { id: fromWalletId },
        data: { amount: fromWallet.amount.minus(amountDecimal) },
      });

      // 수신자 잔액 업데이트
      const updatedToWallet = await tx.wallet.update({
        where: { id: toWalletId },
        data: { amount: toWallet.amount.plus(amountDecimal) },
      });

      // 전송 기록 생성
      const transfer = await tx.transfer.create({
        data: {
          tx_hash: txHash,
          from_wallet: {
            connect: { id: fromWalletId }
          },
          to_wallet: {
            connect: { id: toWalletId }
          },
          token_type: {
            connect: { id: fromWallet.token_type_id }
          },
          amount: amountDecimal,
          from_balance_before: fromWallet.amount,
          from_balance_after: updatedFromWallet.amount,
          to_balance_before: toWallet.amount,
          to_balance_after: updatedToWallet.amount,
          reason: 1, // Default reason code
          transfer_reason_id: reason,
          reference_id: referenceId,
          status: CommonStatus.SUCCESS,
        },
      });

      return transfer;
    });
  }
}
