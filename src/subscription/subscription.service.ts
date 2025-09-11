import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { MembershipAccessService } from '../common/services/membership-access.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly membershipAccessService: MembershipAccessService
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

  async subscribeToMembership(userId: string, membershipItemId: number) {
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

  async unsubscribeFromMembership(userId: string, membershipItemId: number) {
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
}