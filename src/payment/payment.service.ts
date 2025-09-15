import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TossPaymentsService } from './tosspayments.service';
import { TokenService } from '../token/token.service';
import { PaymentStatus, PaymentTransaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  PreparePaymentDto,
  ConfirmPaymentDto,
  PaymentWebhookDto,
  GetPaymentHistoryDto,
  PreparePaymentResponse,
  ConfirmPaymentResponse,
  PaymentHistoryResponse,
  PaymentTransactionResponse,
} from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private tossPaymentsService: TossPaymentsService,
    private tokenService: TokenService,
  ) {}

  /**
   * 결제 준비
   */
  async preparePayment(
    userId: string,
    prepareDto: PreparePaymentDto,
  ): Promise<PreparePaymentResponse> {
    try {
      // 1. 사용자 지갑 조회 또는 생성
      let walletOwnership = await this.prisma.walletOwnership.findFirst({
        where: {
          owner_id: userId,
          ended_at: null,
        },
        include: {
          wallet: true,
        },
      });

      if (!walletOwnership) {
        // 기본 토큰 타입 먼저 생성
        const defaultTokenType = await this.prisma.tokenType.findFirst({
          where: { name: '콩' },
        }) || await this.prisma.tokenType.create({
          data: {
            name: '콩',
            symbol: 'BEAN',
            price: new Decimal(1),
            description: '크리팬즈 플랫폼 기본 토큰',
          },
        });

        // 지갑 생성
        const wallet = await this.prisma.wallet.create({
          data: {
            address: `wallet_${userId}_${Date.now()}`,
            token_type_id: defaultTokenType.id,
            amount: new Decimal(0),
          },
        });

        // 지갑 소유권 생성
        walletOwnership = await this.prisma.walletOwnership.create({
          data: {
            wallet_id: wallet.id,
            owner_id: userId,
          },
          include: {
            wallet: true,
          },
        });
      }

      // 2. 토큰 타입 조회 (지갑이 이미 있으면 해당 토큰 타입 사용)
      const tokenType = await this.prisma.tokenType.findFirst({
        where: { name: '콩' },
      });

      if (!tokenType) {
        throw new NotFoundException('콩 토큰 타입을 찾을 수 없습니다.');
      }

      // 3. 주문번호 생성
      const orderId = this.tossPaymentsService.generateOrderId(userId);

      // 4. 토큰 수량은 상품 정보에서 가져온 콩 개수
      // 1100원 → 10콩, 3300원 → 30콩 등 상품별 고정 수량
      const priceToBeansMap = {
        1100: 10,
        3300: 30,
        5500: 50,
        11000: 100,
        33000: 300,
        55000: 500,
        110000: 1000,
        550000: 5000,
      };
      const tokenAmount = new Decimal(priceToBeansMap[prepareDto.amount] || 0);

      // 5. 결제 거래 기록 생성
      const paymentTransaction = await this.prisma.paymentTransaction.create({
        data: {
          order_id: orderId,
          user_id: userId,
          amount: new Decimal(prepareDto.amount),
          token_amount: tokenAmount,
          token_type_id: tokenType.id,
          status: PaymentStatus.PENDING,
        },
        include: {
          token_type: true,
        },
      });

      this.logger.log(`Payment prepared: orderId=${orderId}, userId=${userId}, amount=${prepareDto.amount}, beans=${Number(tokenAmount)}`);

      return {
        success: true,
        data: {
          orderId,
          amount: prepareDto.amount,
          tokenAmount: Number(tokenAmount),
          clientKey: this.tossPaymentsService.getClientKey(),
          customerName: prepareDto.customerName,
        },
      };
    } catch (error) {
      this.logger.error('Failed to prepare payment', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('결제 준비 중 오류가 발생했습니다.');
    }
  }

  /**
   * 결제 승인
   */
  async confirmPayment(confirmDto: ConfirmPaymentDto): Promise<ConfirmPaymentResponse> {
    try {
      // 1. 결제 거래 기록 조회
      const paymentTransaction = await this.prisma.paymentTransaction.findUnique({
        where: { order_id: confirmDto.orderId },
        include: { token_type: true },
      });

      if (!paymentTransaction) {
        throw new NotFoundException('결제 거래를 찾을 수 없습니다.');
      }

      // 이미 승인된 결제는 성공 응답 반환 (중복 요청 방지)
      if (paymentTransaction.status === PaymentStatus.APPROVED) {
        this.logger.log(`Payment already approved: orderId=${confirmDto.orderId}`);
        return {
          success: true,
          data: {
            ...this.mapToPaymentTransactionResponse(paymentTransaction),
            token: {
              symbol: paymentTransaction.token_type.symbol, // "BEAN"
              amount: Number(paymentTransaction.token_amount), // 충전된 토큰 수량
            },
          },
        };
      }

      if (paymentTransaction.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(`결제 상태가 올바르지 않습니다: ${paymentTransaction.status}`);
      }

      // 2. 금액 검증
      if (Number(paymentTransaction.amount) !== confirmDto.amount) {
        throw new BadRequestException('결제 금액이 일치하지 않습니다.');
      }

      // 3. TossPayments API로 결제 승인
      const tossPaymentResponse = await this.tossPaymentsService.confirmPayment(confirmDto);

      // 4. 결제 승인 성공 시 DB 업데이트 및 토큰 충전
      const result = await this.prisma.$transaction(async (tx) => {
        // 결제 거래 상태 업데이트
        const updatedTransaction = await tx.paymentTransaction.update({
          where: { id: paymentTransaction.id },
          data: {
            payment_key: tossPaymentResponse.paymentKey,
            status: PaymentStatus.APPROVED,
            method: tossPaymentResponse.method,
            approved_at: new Date(tossPaymentResponse.approvedAt || tossPaymentResponse.requestedAt),
            raw_response: tossPaymentResponse as any,
          },
          include: { token_type: true },
        });

        // 사용자 지갑 조회 또는 생성
        let userWallet = await tx.wallet.findFirst({
          where: {
            token_type_id: paymentTransaction.token_type_id,
            ownerships: {
              some: {
                owner_id: paymentTransaction.user_id,
                ended_at: null,
              },
            },
          },
        });

        if (!userWallet) {
          // 지갑이 없으면 생성
          userWallet = await this.tokenService.createWallet(
            paymentTransaction.token_type_id,
            paymentTransaction.user_id,
          );
        }

        // 토큰 충전 (시스템 지갑에서 사용자 지갑으로 전송)
        // 시스템 지갑 조회 (관리자 또는 시스템 계정의 지갑)
        const systemWallet = await tx.wallet.findFirst({
          where: {
            token_type_id: paymentTransaction.token_type_id,
            ownerships: {
              some: {
                owner_id: 'system', // 시스템 계정 ID
                ended_at: null,
              },
            },
          },
        });

        if (!systemWallet) {
          throw new Error('시스템 지갑을 찾을 수 없습니다.');
        }

        // 시스템 지갑에서 사용자 지갑으로 토큰 전송
        const transferReasonId = '8f4e7c2a-9b1d-4e3f-8a5b-6c9d0e1f2a3b'; // 재화 충전 사유 ID

        await this.tokenService.transferToken(
          systemWallet.id,
          userWallet.id,
          Number(paymentTransaction.token_amount),
          transferReasonId,
          paymentTransaction.id,
        );

        return updatedTransaction;
      });

      this.logger.log(`Payment confirmed: orderId=${confirmDto.orderId}, paymentKey=${tossPaymentResponse.paymentKey}`);

      return {
        success: true,
        data: {
          ...this.mapToPaymentTransactionResponse(result),
          token: {
            symbol: result.token_type.symbol, // "BEAN"
            amount: Number(result.token_amount), // 충전된 토큰 수량
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to confirm payment: orderId=${confirmDto.orderId}`, error);

      // 결제 실패 시 거래 상태 업데이트
      try {
        await this.prisma.paymentTransaction.updateMany({
          where: { order_id: confirmDto.orderId },
          data: {
            status: PaymentStatus.FAILED,
            failure_code: error.code || 'UNKNOWN_ERROR',
            failure_message: error.message,
          },
        });
      } catch (updateError) {
        this.logger.error('Failed to update payment transaction status', updateError);
      }

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('결제 승인 중 오류가 발생했습니다.');
    }
  }

  /**
   * 결제 내역 조회
   */
  async getPaymentHistory(
    userId: string,
    queryDto: GetPaymentHistoryDto,
  ): Promise<PaymentHistoryResponse> {
    try {
      const { page = 1, limit = 10, status } = queryDto;
      const skip = (page - 1) * limit;

      const where = {
        user_id: userId,
        ...(status && { status }),
      };

      const [transactions, total] = await Promise.all([
        this.prisma.paymentTransaction.findMany({
          where,
          include: { token_type: true },
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.paymentTransaction.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          transactions: transactions.map(this.mapToPaymentTransactionResponse),
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get payment history for user: ${userId}`, error);
      throw new InternalServerErrorException('결제 내역 조회 중 오류가 발생했습니다.');
    }
  }

  /**
   * 웹훅 처리
   */
  async handleWebhook(webhookDto: PaymentWebhookDto): Promise<void> {
    try {
      this.logger.log(`Processing webhook: eventType=${webhookDto.eventType}`);

      const { eventType, data } = webhookDto;

      switch (eventType) {
        case 'Payment.Paid':
          await this.handlePaymentPaidWebhook(data);
          break;
        case 'Payment.Failed':
          await this.handlePaymentFailedWebhook(data);
          break;
        case 'Payment.Cancelled':
          await this.handlePaymentCancelledWebhook(data);
          break;
        default:
          this.logger.warn(`Unhandled webhook event type: ${eventType}`);
      }
    } catch (error) {
      this.logger.error('Failed to process webhook', error);
      throw new InternalServerErrorException('웹훅 처리 중 오류가 발생했습니다.');
    }
  }

  /**
   * 결제 완료 웹훅 처리
   */
  private async handlePaymentPaidWebhook(data: any): Promise<void> {
    const { orderId, paymentKey } = data;

    const paymentTransaction = await this.prisma.paymentTransaction.findUnique({
      where: { order_id: orderId },
    });

    if (paymentTransaction && paymentTransaction.status === PaymentStatus.PENDING) {
      await this.prisma.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          payment_key: paymentKey,
          status: PaymentStatus.APPROVED,
          approved_at: new Date(),
          raw_response: data as any,
        },
      });
    }
  }

  /**
   * 결제 실패 웹훅 처리
   */
  private async handlePaymentFailedWebhook(data: any): Promise<void> {
    const { orderId, failure } = data;

    await this.prisma.paymentTransaction.updateMany({
      where: { order_id: orderId },
      data: {
        status: PaymentStatus.FAILED,
        failure_code: failure?.code,
        failure_message: failure?.message,
        raw_response: data,
      },
    });
  }

  /**
   * 결제 취소 웹훅 처리
   */
  private async handlePaymentCancelledWebhook(data: any): Promise<void> {
    const { orderId } = data;

    await this.prisma.paymentTransaction.updateMany({
      where: { order_id: orderId },
      data: {
        status: PaymentStatus.CANCELLED,
        cancelled_at: new Date(),
        raw_response: data,
      },
    });
  }

  /**
   * PaymentTransaction을 Response DTO로 변환
   */
  private mapToPaymentTransactionResponse(
    transaction: PaymentTransaction & { token_type: any },
  ): PaymentTransactionResponse {
    return {
      id: transaction.id,
      orderId: transaction.order_id,
      paymentKey: transaction.payment_key,
      amount: Number(transaction.amount),
      tokenAmount: Number(transaction.token_amount),
      tokenType: {
        symbol: transaction.token_type.symbol,
        name: transaction.token_type.name,
        price: Number(transaction.token_type.price),
      },
      status: transaction.status,
      method: transaction.method,
      approvedAt: transaction.approved_at?.toISOString(),
      cancelledAt: transaction.cancelled_at?.toISOString(),
      failureCode: transaction.failure_code,
      failureMessage: transaction.failure_message,
      createdAt: transaction.created_at.toISOString(),
      updatedAt: transaction.updated_at.toISOString(),
    };
  }
}