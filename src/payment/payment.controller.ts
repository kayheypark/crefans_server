import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { TossPaymentsService } from './tosspayments.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  PreparePaymentDto,
  ConfirmPaymentDto,
  PaymentWebhookDto,
  GetPaymentHistoryDto,
  PreparePaymentResponse,
  ConfirmPaymentResponse,
  PaymentHistoryResponse,
  PaymentWebhookResponse,
} from './dto/payment.dto';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private paymentService: PaymentService,
    private tossPaymentsService: TossPaymentsService,
  ) {}

  /**
   * 결제 준비
   * POST /payment/prepare
   */
  @Post('prepare')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async preparePayment(
    @CurrentUser() user: any,
    @Body() prepareDto: PreparePaymentDto,
  ): Promise<PreparePaymentResponse> {
    try {
      const userSub = user.userSub;
      this.logger.log(`Preparing payment for user: ${userSub}`);
      return await this.paymentService.preparePayment(userSub, prepareDto);
    } catch (error) {
      this.logger.error('Failed to prepare payment', error);
      throw error;
    }
  }

  /**
   * 결제 승인
   * POST /payment/confirm
   */
  @Post('confirm')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmPayment(
    @CurrentUser() user: any,
    @Body() confirmDto: ConfirmPaymentDto,
  ): Promise<ConfirmPaymentResponse> {
    try {
      this.logger.log(`Confirming payment for orderId: ${confirmDto.orderId}`);
      return await this.paymentService.confirmPayment(confirmDto);
    } catch (error) {
      this.logger.error('Failed to confirm payment', error);
      throw error;
    }
  }

  /**
   * 결제 내역 조회
   * GET /payment/history
   */
  @Get('history')
  @UseGuards(AuthGuard)
  async getPaymentHistory(
    @CurrentUser() user: any,
    @Query() queryDto: GetPaymentHistoryDto,
  ): Promise<PaymentHistoryResponse> {
    try {
      const userSub = user.userSub;
      this.logger.log(`Getting payment history for user: ${userSub}`);
      return await this.paymentService.getPaymentHistory(userSub, queryDto);
    } catch (error) {
      this.logger.error('Failed to get payment history', error);
      throw error;
    }
  }

  /**
   * TossPayments 웹훅 처리
   * POST /payment/webhook
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('tosspayments-signature') signature: string,
  ): Promise<void> {
    try {
      this.logger.log('Processing TossPayments webhook');

      // 웹훅 서명 검증
      const rawBody = JSON.stringify(req.body);
      const isValidSignature = this.tossPaymentsService.verifyWebhookSignature(rawBody, signature);

      if (!isValidSignature) {
        this.logger.warn('Invalid webhook signature');
        throw new BadRequestException('Invalid webhook signature');
      }

      // 웹훅 데이터 처리
      const webhookDto: PaymentWebhookDto = req.body;
      await this.paymentService.handleWebhook(webhookDto);

      this.logger.log('Webhook processed successfully');
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      this.logger.error('Failed to process webhook', error);

      if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  }

  /**
   * 결제 정보 조회 (디버깅/관리용)
   * GET /payment/info/:paymentKey
   */
  @Get('info/:paymentKey')
  @UseGuards(AuthGuard)
  async getPaymentInfo(@CurrentUser() user: any, @Req() req: Request) {
    try {
      const paymentKey = req.params.paymentKey;
      this.logger.log(`Getting payment info for paymentKey: ${paymentKey}`);

      const paymentInfo = await this.tossPaymentsService.getPayment(paymentKey);

      return {
        success: true,
        data: paymentInfo,
      };
    } catch (error) {
      this.logger.error('Failed to get payment info', error);
      throw error;
    }
  }

  /**
   * 결제 취소 (관리용)
   * POST /payment/cancel/:paymentKey
   */
  @Post('cancel/:paymentKey')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelPayment(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Body('cancelReason') cancelReason: string,
  ) {
    try {
      const paymentKey = req.params.paymentKey;
      this.logger.log(`Cancelling payment for paymentKey: ${paymentKey}`);

      if (!cancelReason) {
        throw new BadRequestException('취소 사유는 필수입니다.');
      }

      const result = await this.tossPaymentsService.cancelPayment(paymentKey, cancelReason);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Failed to cancel payment', error);
      throw error;
    }
  }

  /**
   * 클라이언트 키 조회 (프론트엔드에서 사용)
   * GET /payment/client-key
   */
  @Get('client-key')
  getClientKey() {
    return {
      success: true,
      data: {
        clientKey: this.tossPaymentsService.getClientKey(),
      },
    };
  }

  /**
   * 테스트 엔드포인트 (인증 없음)
   * GET /payment/test
   */
  @Get('test')
  testEndpoint() {
    return {
      success: true,
      message: 'Test endpoint working without authentication',
    };
  }
}