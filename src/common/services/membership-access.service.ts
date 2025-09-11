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

  async checkCreatorMembershipAccess(
    userId: string | null,
    creatorId: string
  ): Promise<MembershipAccess> {
    try {
      if (!userId) {
        return {
          hasAccess: false,
          isMember: false,
        };
      }

      const subscription = await this.prisma.subscription.findFirst({
        where: {
          subscriber_id: userId,
          ended_at: null,
          status: 'ONGOING',
          membership_item: {
            creator_id: creatorId,
          },
        },
        include: {
          membership_item: true,
        },
      });

      if (!subscription) {
        return {
          hasAccess: false,
          isMember: false,
        };
      }

      return {
        hasAccess: true,
        isMember: true,
        membershipType: subscription.membership_item.name,
        membershipLevel: subscription.membership_item.level,
      };
    } catch (error) {
      this.logger.error('Failed to check creator membership access', error.stack, {
        service: 'MembershipAccessService',
        method: 'checkCreatorMembershipAccess',
        userId,
        creatorId,
      });
      throw error;
    }
  }

  async validateCreatorMembershipAccess(
    userId: string | null,
    creatorId: string
  ): Promise<void> {
    const access = await this.checkCreatorMembershipAccess(userId, creatorId);
    
    if (!access.hasAccess) {
      throw new ForbiddenException('해당 크리에이터의 콘텐츠에 접근할 권한이 없습니다.');
    }
  }

  async checkPostingAccess(
    userId: string | null,
    postingId: string
  ): Promise<MembershipAccess> {
    try {
      const posting = await this.prisma.posting.findUnique({
        where: { 
          id: postingId,
          is_deleted: false,
        },
      });

      if (!posting) {
        throw new NotFoundException('포스팅을 찾을 수 없습니다.');
      }

      if (!posting.is_membership) {
        return {
          hasAccess: true,
          isMember: false,
        };
      }

      return this.checkCreatorMembershipAccess(userId, posting.user_sub);
    } catch (error) {
      this.logger.error('Failed to check posting access', error.stack, {
        service: 'MembershipAccessService',
        method: 'checkPostingAccess',
        userId,
        postingId,
      });
      throw error;
    }
  }

  async validatePostingAccess(
    userId: string | null,
    postingId: string
  ): Promise<void> {
    const access = await this.checkPostingAccess(userId, postingId);
    
    if (!access.hasAccess) {
      throw new ForbiddenException('해당 포스팅에 접근할 권한이 없습니다.');
    }
  }

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