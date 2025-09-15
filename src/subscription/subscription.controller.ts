import { Controller, Get, Post, Delete, Param, UseGuards, Req, Query, ParseUUIDPipe, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import {
  SubscribeMembershipDto,
  ConfirmSubscriptionDto,
  SubscriptionResponse,
  MySubscriptionsResponse,
} from './dto/subscription.dto';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('my/list')
  @UseGuards(AuthGuard)
  async getMySubscriptions(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const subscriptions = await this.subscriptionService.getUserSubscriptions(sub);
    
    return ApiResponseDto.success('구독 중인 멤버십 목록을 성공적으로 조회했습니다.', {
      subscriptions
    });
  }


  @Delete('membership/:membershipItemId')
  @UseGuards(AuthGuard)
  async unsubscribeFromMembership(
    @Req() req: any,
    @Param('membershipItemId', ParseUUIDPipe) membershipItemId: string
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    await this.subscriptionService.unsubscribeFromMembership(sub, membershipItemId);
    
    return ApiResponseDto.success('멤버십 구독이 성공적으로 취소되었습니다.', null);
  }

  // === 새로운 빌링 관련 엔드포인트들 ===

  /**
   * 멤버십 구독 신청 (빌링키 발급 준비)
   */
  @Post('billing/prepare')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async prepareBillingSubscription(
    @Req() req: any,
    @Body() subscribeDto: SubscribeMembershipDto,
  ): Promise<SubscriptionResponse> {
    const userId = req.user.sub;
    return this.subscriptionService.subscribeMembershipWithBilling(userId, subscribeDto);
  }

  /**
   * 구독 확인 (빌링키 발급 및 첫 결제)
   */
  @Post('billing/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmBillingSubscription(
    @Body() confirmDto: ConfirmSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return this.subscriptionService.confirmSubscription(confirmDto);
  }

  /**
   * 빌링 구독 해지
   */
  @Delete('billing/:subscriptionId')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelBillingSubscription(
    @Req() req: any,
    @Param('subscriptionId') subscriptionId: string,
  ): Promise<ApiResponseDto<{ success: boolean }>> {
    const userId = req.user.sub;
    const result = await this.subscriptionService.cancelSubscription(userId, subscriptionId);
    return ApiResponseDto.success('구독이 성공적으로 해지되었습니다.', result);
  }

  /**
   * 빌링 구독 목록 조회
   */
  @Get('billing/my')
  @UseGuards(AuthGuard)
  async getMyBillingSubscriptions(@Req() req: any): Promise<MySubscriptionsResponse> {
    const userId = req.user.sub;
    return this.subscriptionService.getMyBillingSubscriptions(userId);
  }

  /**
   * Lambda 함수 테스트용 엔드포인트 (개발/테스트용)
   */
  @Post('billing/process')
  @HttpCode(HttpStatus.OK)
  async processBillingPayments(): Promise<ApiResponseDto<{ message: string }>> {
    try {
      await this.subscriptionService.processBillingPayments();
      return ApiResponseDto.success('빌링 결제 처리가 완료되었습니다.', {
        message: 'Billing payments processed successfully',
      });
    } catch (error) {
      return ApiResponseDto.error(`빌링 결제 처리 중 오류가 발생했습니다: ${error.message}`, null);
    }
  }
}