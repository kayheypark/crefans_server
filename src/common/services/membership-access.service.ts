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
}