import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { MembershipAccessService } from '../common/services/membership-access.service';
import { TossPaymentsService } from '../payment/tosspayments.service';
import { AuthService } from '../auth/auth.service';
import { SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  SubscribeMembershipDto,
  ConfirmSubscriptionDto,
  SubscriptionResponse,
  MySubscriptionsResponse,
} from './dto/subscription.dto';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly membershipAccessService: MembershipAccessService,
    private readonly tossPaymentsService: TossPaymentsService,
    private readonly authService: AuthService,
  ) {}

  async getUserSubscriptions(userId: string) {
    try {
      this.logger.log(`Getting subscriptions for user: ${userId}`, {
        service: 'SubscriptionService',
        method: 'getUserSubscriptions',
        userId
      });

      const subscriptions = await this.membershipAccessService.getUserMemberships(userId);

      this.logger.log(`✅ Found ${subscriptions.length} subscriptions for user: ${userId}`, {
        service: 'SubscriptionService',
        method: 'getUserSubscriptions',
        userId,
        count: subscriptions.length
      });

      return subscriptions.map(subscription => ({
        creatorId: subscription.creatorId,
        creatorName: subscription.creatorId, // 임시로 creatorId 사용, 실제로는 크리에이터 정보 조회 필요
        membershipType: subscription.membershipType,
        membershipLevel: subscription.membershipLevel,
        startedAt: subscription.startedAt,
        avatar: '/profile-90.png', // 기본 아바타, 실제로는 크리에이터 정보에서 가져와야 함
        unread: false // 실제로는 새 게시물 여부 확인 필요
      }));
    } catch (error) {
      this.logger.error('Failed to get user subscriptions', error.stack, {
        service: 'SubscriptionService',
        method: 'getUserSubscriptions',
        userId
      });
      throw error;
    }
  }

  async subscribeToMembership(userId: string, membershipItemId: string) {
    try {
      this.logger.log(`User ${userId} subscribing to membership ${membershipItemId}`, {
        service: 'SubscriptionService',
        method: 'subscribeToMembership',
        userId,
        membershipItemId
      });

      // 멤버십 아이템 존재 여부 확인
      const membershipItem = await this.prisma.membershipItem.findUnique({
        where: { 
          id: membershipItemId,
          is_deleted: false,
          is_active: true
        }
      });

      if (!membershipItem) {
        throw new Error('멤버십을 찾을 수 없습니다.');
      }

      // 이미 구독 중인지 확인
      const existingSubscription = await this.prisma.subscription.findFirst({
        where: {
          subscriber_id: userId,
          membership_item_id: membershipItemId,
          ended_at: null,
          status: 'ONGOING'
        }
      });

      if (existingSubscription) {
        throw new Error('이미 구독 중인 멤버십입니다.');
      }

      // 새로운 구독 생성
      const subscription = await this.prisma.subscription.create({
        data: {
          subscriber_id: userId,
          membership_item_id: membershipItemId,
          amount: membershipItem.price,
          status: 'ONGOING',
          auto_renew: true
        },
        include: {
          membership_item: true
        }
      });

      this.logger.log(`✅ Subscription created successfully for user: ${userId}`, {
        service: 'SubscriptionService',
        method: 'subscribeToMembership',
        userId,
        subscriptionId: subscription.id
      });

      return subscription;
    } catch (error) {
      this.logger.error('Failed to create subscription', error.stack, {
        service: 'SubscriptionService',
        method: 'subscribeToMembership',
        userId,
        membershipItemId
      });
      throw error;
    }
  }

  async unsubscribeFromMembership(userId: string, membershipItemId: string) {
    try {
      this.logger.log(`User ${userId} unsubscribing from membership ${membershipItemId}`, {
        service: 'SubscriptionService',
        method: 'unsubscribeFromMembership',
        userId,
        membershipItemId
      });

      const subscription = await this.prisma.subscription.findFirst({
        where: {
          subscriber_id: userId,
          membership_item_id: membershipItemId,
          ended_at: null,
          status: 'ONGOING'
        }
      });

      if (!subscription) {
        throw new Error('구독을 찾을 수 없습니다.');
      }

      // 구독 종료
      const updatedSubscription = await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          ended_at: new Date(),
          status: 'EXPIRED',
          auto_renew: false
        }
      });

      this.logger.log(`✅ Subscription ended successfully for user: ${userId}`, {
        service: 'SubscriptionService',
        method: 'unsubscribeFromMembership',
        userId,
        subscriptionId: subscription.id
      });

      return updatedSubscription;
    } catch (error) {
      this.logger.error('Failed to end subscription', error.stack, {
        service: 'SubscriptionService',
        method: 'unsubscribeFromMembership',
        userId,
        membershipItemId
      });
      throw error;
    }
  }

  // === 새로운 빌링 관련 메서드들 ===

  async subscribeMembershipWithBilling(
    userId: string,
    subscribeDto: SubscribeMembershipDto,
  ): Promise<SubscriptionResponse> {
    try {
      // 1. 멤버십 아이템 조회
      const membershipItem = await this.prisma.membershipItem.findUnique({
        where: { id: subscribeDto.membershipItemId },
      });

      if (!membershipItem) {
        throw new NotFoundException('멤버십 상품을 찾을 수 없습니다.');
      }

      if (!membershipItem.is_active) {
        throw new BadRequestException('비활성화된 멤버십 상품입니다.');
      }

      // 2. 기존 활성 구독 확인
      const existingSubscription = await this.prisma.subscription.findFirst({
        where: {
          subscriber_id: userId,
          membership_item_id: subscribeDto.membershipItemId,
          status: SubscriptionStatus.ONGOING,
          OR: [
            { ended_at: null },
            { ended_at: { gte: new Date() } },
          ],
        },
      });

      if (existingSubscription) {
        throw new BadRequestException('이미 구독 중인 멤버십입니다.');
      }

      // 3. CustomerKey 생성
      const customerKey = this.tossPaymentsService.generateCustomerKey(userId);

      // 4. 빌링 인증 요청 URL 생성
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const successUrl = `${baseUrl}/subscription/billing/success`;
      const failUrl = `${baseUrl}/subscription/billing/fail`;

      this.logger.log(`Subscription request for membershipItemId: ${subscribeDto.membershipItemId}, userId: ${userId}`, {
        service: 'SubscriptionService',
        method: 'subscribeMembershipWithBilling',
        userId,
        membershipItemId: subscribeDto.membershipItemId
      });

      return {
        success: true,
        data: {
          membershipItemId: subscribeDto.membershipItemId,
          membershipName: membershipItem.name,
          price: Number(membershipItem.price),
          billingPeriod: membershipItem.billing_period,
          billingUnit: membershipItem.billing_unit,
          customerKey,
          clientKey: this.tossPaymentsService.getClientKey(),
          successUrl,
          failUrl,
        },
      };
    } catch (error) {
      this.logger.error('Failed to initiate subscription', error.stack, {
        service: 'SubscriptionService',
        method: 'subscribeMembershipWithBilling',
        userId
      });
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('구독 신청 중 오류가 발생했습니다.');
    }
  }

  async confirmSubscription(confirmDto: ConfirmSubscriptionDto): Promise<SubscriptionResponse> {
    try {
      // 1. 빌링키 발급
      const billingKeyResult = await this.tossPaymentsService.issueBillingKey(
        confirmDto.authKey,
        confirmDto.customerKey,
      );

      // 2. 멤버십 아이템 조회
      const membershipItem = await this.prisma.membershipItem.findUnique({
        where: { id: confirmDto.membershipItemId },
      });

      if (!membershipItem) {
        throw new NotFoundException('멤버십 상품을 찾을 수 없습니다.');
      }

      // 3. 구독 레코드 생성 및 첫 번째 결제 실행
      const result = await this.prisma.$transaction(async (tx) => {
        // 3-1. 구독 생성
        const subscription = await tx.subscription.create({
          data: {
            subscriber_id: confirmDto.userId,
            membership_item_id: confirmDto.membershipItemId,
            amount: membershipItem.price,
            billing_key: billingKeyResult.billingKey,
            next_billing_date: this.calculateNextBillingDate(
              membershipItem.billing_period,
              membershipItem.billing_unit,
            ),
            last_payment_date: new Date(),
            status: SubscriptionStatus.ONGOING,
          },
        });

        // 3-2. 첫 번째 결제 실행
        const orderId = this.tossPaymentsService.generateOrderId(confirmDto.userId);

        const paymentResult = await this.tossPaymentsService.requestBillingPayment(
          billingKeyResult.billingKey,
          confirmDto.customerKey,
          Number(membershipItem.price),
          orderId,
        );

        // 3-3. 기본 토큰 타입 조회
        const defaultTokenType = await tx.tokenType.findFirst({
          where: { name: '콩' },
        });

        if (!defaultTokenType) {
          throw new Error('기본 토큰 타입을 찾을 수 없습니다.');
        }

        // 3-4. 결제 거래 기록 생성
        await tx.paymentTransaction.create({
          data: {
            order_id: orderId,
            payment_key: paymentResult.paymentKey,
            user_id: confirmDto.userId,
            amount: membershipItem.price,
            token_amount: new Decimal(0), // 구독은 토큰 지급 없음
            token_type_id: defaultTokenType.id,
            subscription_id: subscription.id,
            billing_key: billingKeyResult.billingKey,
            is_recurring: true,
            status: PaymentStatus.APPROVED,
            method: paymentResult.method,
            approved_at: new Date(),
            raw_response: paymentResult as any,
          },
        });

        return subscription;
      });

      this.logger.log(`Subscription confirmed: subscriptionId=${result.id}, userId=${confirmDto.userId}`, {
        service: 'SubscriptionService',
        method: 'confirmSubscription',
        userId: confirmDto.userId,
        subscriptionId: result.id
      });

      return {
        success: true,
        data: {
          subscriptionId: result.id,
          membershipName: membershipItem.name,
          nextBillingDate: result.next_billing_date?.toISOString(),
          status: result.status,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to confirm subscription: userId=${confirmDto.userId}`, error.stack, {
        service: 'SubscriptionService',
        method: 'confirmSubscription',
        userId: confirmDto.userId
      });

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('구독 확인 중 오류가 발생했습니다.');
    }
  }

  async cancelSubscription(userId: string, subscriptionId: string): Promise<{ success: boolean }> {
    try {
      // 1. 구독 조회
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          subscriber_id: userId,
          status: SubscriptionStatus.ONGOING,
        },
      });

      if (!subscription) {
        throw new NotFoundException('구독을 찾을 수 없습니다.');
      }

      // 2. 빌링키 삭제 및 구독 상태 업데이트
      await this.prisma.$transaction(async (tx) => {
        // 2-1. 빌링키 삭제
        if (subscription.billing_key) {
          const customerKey = this.tossPaymentsService.generateCustomerKey(userId);
          await this.tossPaymentsService.deleteBillingKey(
            subscription.billing_key,
            customerKey,
          );
        }

        // 2-2. 자동 갱신 비활성화 (즉시 해지하지 않고 현재 기간 종료까지 유지)
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            auto_renew: false,
          },
        });
      });

      this.logger.log(`Subscription cancelled: subscriptionId=${subscriptionId}, userId=${userId}`, {
        service: 'SubscriptionService',
        method: 'cancelSubscription',
        userId,
        subscriptionId
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to cancel subscription: subscriptionId=${subscriptionId}, userId=${userId}`, error.stack, {
        service: 'SubscriptionService',
        method: 'cancelSubscription',
        userId,
        subscriptionId
      });

      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('구독 해지 중 오류가 발생했습니다.');
    }
  }

  async getMyBillingSubscriptions(userId: string): Promise<MySubscriptionsResponse> {
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          subscriber_id: userId,
          billing_key: { not: null }, // 빌링 구독만
        },
        include: {
          membership_item: {
            select: {
              name: true,
              description: true,
              benefits: true,
              creator_id: true,
              level: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      return {
        success: true,
        data: subscriptions.map((subscription) => ({
          id: subscription.id,
          membershipName: subscription.membership_item.name,
          creatorId: subscription.membership_item.creator_id,
          creator: {
            id: subscription.membership_item.creator_id,
            handle: subscription.membership_item.creator_id, // 임시로 creator_id를 handle로 사용
            name: 'Creator', // 임시 이름
            avatar: null,
          },
          amount: Number(subscription.amount),
          status: subscription.status,
          nextBillingDate: subscription.next_billing_date?.toISOString(),
          autoRenew: subscription.auto_renew,
          startedAt: subscription.started_at.toISOString(),
          endedAt: subscription.ended_at?.toISOString(),
          isActive: this.isSubscriptionActive(subscription),
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get subscriptions for user: ${userId}`, error.stack, {
        service: 'SubscriptionService',
        method: 'getMyBillingSubscriptions',
        userId
      });
      throw new InternalServerErrorException('구독 목록 조회 중 오류가 발생했습니다.');
    }
  }

  // Lambda 함수에서 호출할 메서드
  async processBillingPayments(): Promise<void> {
    try {
      const now = new Date();

      // 오늘 결제할 구독들 조회
      const subscriptionsToBill = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ONGOING,
          auto_renew: true,
          next_billing_date: {
            lte: now,
          },
          billing_key: {
            not: null,
          },
        },
        include: {
          membership_item: true,
        },
      });

      this.logger.log(`Processing ${subscriptionsToBill.length} subscription payments`, {
        service: 'SubscriptionService',
        method: 'processBillingPayments',
        count: subscriptionsToBill.length
      });

      for (const subscription of subscriptionsToBill) {
        await this.processSingleBillingPayment(subscription);
      }
    } catch (error) {
      this.logger.error('Failed to process billing payments', error.stack, {
        service: 'SubscriptionService',
        method: 'processBillingPayments'
      });
      throw error;
    }
  }

  private async processSingleBillingPayment(subscription: any): Promise<void> {
    try {
      const customerKey = this.tossPaymentsService.generateCustomerKey(subscription.subscriber_id);
      const orderId = this.tossPaymentsService.generateOrderId(subscription.subscriber_id);

      // 정기결제 실행
      const paymentResult = await this.tossPaymentsService.requestBillingPayment(
        subscription.billing_key,
        customerKey,
        Number(subscription.amount),
        orderId,
      );

      await this.prisma.$transaction(async (tx) => {
        // 구독 정보 업데이트
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            last_payment_date: new Date(),
            next_billing_date: this.calculateNextBillingDate(
              subscription.membership_item.billing_period,
              subscription.membership_item.billing_unit,
            ),
            payment_failure_count: 0,
          },
        });

        // 기본 토큰 타입 조회
        const defaultTokenType = await tx.tokenType.findFirst({
          where: { name: '콩' },
        });

        if (!defaultTokenType) {
          throw new Error('기본 토큰 타입을 찾을 수 없습니다.');
        }

        // 결제 거래 기록 생성
        await tx.paymentTransaction.create({
          data: {
            order_id: orderId,
            payment_key: paymentResult.paymentKey,
            user_id: subscription.subscriber_id,
            amount: subscription.amount,
            token_amount: new Decimal(0),
            token_type_id: defaultTokenType.id,
            subscription_id: subscription.id,
            billing_key: subscription.billing_key,
            is_recurring: true,
            status: PaymentStatus.APPROVED,
            method: paymentResult.method,
            approved_at: new Date(),
            raw_response: paymentResult as any,
          },
        });
      });

      this.logger.log(`Billing payment successful: subscriptionId=${subscription.id}`, {
        service: 'SubscriptionService',
        method: 'processSingleBillingPayment',
        subscriptionId: subscription.id
      });
    } catch (error) {
      this.logger.error(`Billing payment failed: subscriptionId=${subscription.id}`, error.stack, {
        service: 'SubscriptionService',
        method: 'processSingleBillingPayment',
        subscriptionId: subscription.id
      });

      // 실패 횟수 증가
      const updatedSubscription = await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          payment_failure_count: { increment: 1 },
        },
      });

      // 3회 실패시 구독 종료
      if (updatedSubscription.payment_failure_count >= 3) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            ended_at: new Date(),
            auto_renew: false,
          },
        });

        this.logger.log(`Subscription cancelled due to payment failures: subscriptionId=${subscription.id}`, {
          service: 'SubscriptionService',
          method: 'processSingleBillingPayment',
          subscriptionId: subscription.id
        });
      }
    }
  }

  private calculateNextBillingDate(period: number, unit: string): Date {
    const now = new Date();

    switch (unit) {
      case 'DAY':
        return new Date(now.getTime() + period * 24 * 60 * 60 * 1000);
      case 'MONTH':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + period);
        return nextMonth;
      case 'YEAR':
        const nextYear = new Date(now);
        nextYear.setFullYear(nextYear.getFullYear() + period);
        return nextYear;
      default:
        // 기본값은 1개월
        const defaultNext = new Date(now);
        defaultNext.setMonth(defaultNext.getMonth() + 1);
        return defaultNext;
    }
  }

  private isSubscriptionActive(subscription: any): boolean {
    const now = new Date();

    if (subscription.status !== SubscriptionStatus.ONGOING) {
      return false;
    }

    if (subscription.ended_at && subscription.ended_at <= now) {
      return false;
    }

    return true;
  }
}