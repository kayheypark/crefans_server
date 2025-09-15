import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface TossPaymentPrepareRequest {
  amount: number;
  orderId: string;
  orderName: string;
  customerName?: string;
  customerEmail?: string;
  successUrl: string;
  failUrl: string;
}

export interface TossPaymentConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  totalAmount: number;
  method: string;
  card?: any;
  virtualAccount?: any;
  approvedAt?: string;
  requestedAt: string;
  receipt?: {
    url: string;
  };
  failure?: {
    code: string;
    message: string;
  };
}

@Injectable()
export class TossPaymentsService {
  private readonly logger = new Logger(TossPaymentsService.name);
  private readonly httpClient: AxiosInstance;
  private readonly secretKey: string;
  private readonly clientKey: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>('TOSSPAYMENTS_SECRET_KEY');
    this.clientKey = this.configService.get<string>('TOSSPAYMENTS_CLIENT_KEY');
    this.apiUrl = this.configService.get<string>('TOSSPAYMENTS_API_URL');

    if (!this.secretKey || !this.clientKey || !this.apiUrl) {
      throw new Error('TossPayments configuration is missing');
    }

    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * 결제 승인
   * @param confirmRequest 결제 승인 요청 데이터
   */
  async confirmPayment(confirmRequest: TossPaymentConfirmRequest): Promise<TossPaymentResponse> {
    try {
      this.logger.log(`Confirming payment for orderId: ${confirmRequest.orderId}`);

      const response = await this.httpClient.post('/v1/payments/confirm', confirmRequest);

      this.logger.log(`Payment confirmation successful for orderId: ${confirmRequest.orderId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Payment confirmation failed for orderId: ${confirmRequest.orderId}`, error.response?.data || error.message);

      if (error.response?.data) {
        const { code, message } = error.response.data;
        throw new BadRequestException(`Payment confirmation failed: ${message} (${code})`);
      }

      throw new InternalServerErrorException('Payment confirmation failed due to internal error');
    }
  }

  /**
   * 결제 정보 조회
   * @param paymentKey 결제 키
   */
  async getPayment(paymentKey: string): Promise<TossPaymentResponse> {
    try {
      this.logger.log(`Fetching payment info for paymentKey: ${paymentKey}`);

      const response = await this.httpClient.get(`/v1/payments/${paymentKey}`);

      this.logger.log(`Payment info fetched successfully for paymentKey: ${paymentKey}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch payment info for paymentKey: ${paymentKey}`, error.response?.data || error.message);

      if (error.response?.data) {
        const { code, message } = error.response.data;
        throw new BadRequestException(`Failed to fetch payment info: ${message} (${code})`);
      }

      throw new InternalServerErrorException('Failed to fetch payment info due to internal error');
    }
  }

  /**
   * 결제 취소
   * @param paymentKey 결제 키
   * @param cancelReason 취소 사유
   */
  async cancelPayment(paymentKey: string, cancelReason: string): Promise<TossPaymentResponse> {
    try {
      this.logger.log(`Cancelling payment for paymentKey: ${paymentKey}`);

      const response = await this.httpClient.post(`/v1/payments/${paymentKey}/cancel`, {
        cancelReason,
      });

      this.logger.log(`Payment cancelled successfully for paymentKey: ${paymentKey}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Payment cancellation failed for paymentKey: ${paymentKey}`, error.response?.data || error.message);

      if (error.response?.data) {
        const { code, message } = error.response.data;
        throw new BadRequestException(`Payment cancellation failed: ${message} (${code})`);
      }

      throw new InternalServerErrorException('Payment cancellation failed due to internal error');
    }
  }

  /**
   * 클라이언트 키 반환 (프론트엔드에서 사용)
   */
  getClientKey(): string {
    return this.clientKey;
  }

  /**
   * 주문번호 생성
   * @param userId 사용자 ID
   */
  generateOrderId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `order_${userId}_${timestamp}_${random}`;
  }

  /**
   * 웹훅 서명 검증
   * @param rawBody 웹훅 원본 바디
   * @param signature 웹훅 서명
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    try {
      // TossPayments 웹훅 서명 검증 로직
      // 실제 구현에서는 TossPayments 문서에 따라 HMAC 검증을 수행
      // 현재는 기본적인 검증만 구현
      return signature && signature.length > 0;
    } catch (error) {
      this.logger.error('Webhook signature verification failed', error);
      return false;
    }
  }
}