import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

export interface MembershipAccess {
  hasAccess: boolean;
  isMember: boolean;
  membershipType?: string;
  membershipLevel?: number;
}

@Injectable()
export class MembershipAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async getUserMemberships(userId: string) {
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          subscriber_id: userId,
          ended_at: null,
          status: 'ONGOING',
        },
        include: {
          membership_item: true,
        },
      });

      return subscriptions.map(subscription => ({
        creatorId: subscription.membership_item.creator_id,
        membershipType: subscription.membership_item.name,
        membershipLevel: subscription.membership_item.level,
        startedAt: subscription.started_at,
      }));
    } catch (error) {
      this.logger.error('Failed to get user memberships', error.stack, {
        service: 'MembershipAccessService',
        method: 'getUserMemberships',
        userId,
      });
      throw error;
    }
  }

  async checkUserSubscriptionToCreator(
    subscriberId: string,
    creatorId: string
  ): Promise<{ hasSubscription: boolean; subscribedMembershipIds: string[] }> {
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          subscriber_id: subscriberId,
          status: 'ONGOING',
          membership_item: {
            creator_id: creatorId,
            is_active: true,
            is_deleted: false,
          },
        },
        include: {
          membership_item: {
            select: {
              id: true,
              name: true,
              level: true,
            }
          },
        },
      });

      const subscribedMembershipIds = subscriptions.map(sub => sub.membership_item.id);

      this.logger.log(`Subscription check for subscriber ${subscriberId} to creator ${creatorId}`, {
        service: 'MembershipAccessService',
        method: 'checkUserSubscriptionToCreator',
        subscriberId,
        creatorId,
        hasSubscription: subscriptions.length > 0,
        subscribedMembershipIds,
      });

      return {
        hasSubscription: subscriptions.length > 0,
        subscribedMembershipIds,
      };
    } catch (error) {
      this.logger.error('Failed to check user subscription to creator', error.stack, {
        service: 'MembershipAccessService',
        method: 'checkUserSubscriptionToCreator',
        subscriberId,
        creatorId,
      });
      throw error;
    }
  }
}