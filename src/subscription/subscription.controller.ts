import { Controller, Get, Post, Delete, Param, UseGuards, Req, Query, ParseUUIDPipe } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

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

  @Post('membership/:membershipItemId')
  @UseGuards(AuthGuard)
  async subscribeToMembership(
    @Req() req: any,
    @Param('membershipItemId', ParseUUIDPipe) membershipItemId: string
  ): Promise<ApiResponseDto<any>> {
    const { sub } = req.user;
    const subscription = await this.subscriptionService.subscribeToMembership(sub, membershipItemId);
    
    return ApiResponseDto.success('멤버십 구독이 성공적으로 생성되었습니다.', subscription);
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
}