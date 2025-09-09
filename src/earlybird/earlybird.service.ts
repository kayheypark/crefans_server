import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EarlybirdService {
  private readonly logger = new Logger(EarlybirdService.name);

  constructor(private prisma: PrismaService) {}

  async joinEarlybird(userSub: string) {
    try {
      // 이미 등록된 사용자인지 확인
      const existingEarlybird = await this.prisma.earlybird.findUnique({
        where: { user_sub: userSub }
      });

      if (existingEarlybird) {
        throw new ConflictException('이미 얼리버드에 등록된 사용자입니다.');
      }

      // 새로운 얼리버드 등록
      const earlybird = await this.prisma.earlybird.create({
        data: {
          user_sub: userSub,
          joined_at: new Date(),
        }
      });

      this.logger.log(`New earlybird joined: ${userSub}`, {
        service: 'EarlybirdService',
        method: 'joinEarlybird',
        userSub,
        earlybirdId: earlybird.id
      });

      return {
        success: true,
        message: '얼리버드 등록이 완료되었습니다! 추후 특별한 혜택을 받아보세요.',
        data: {
          id: earlybird.id,
          joinedAt: earlybird.joined_at
        }
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error('Failed to join earlybird', {
        service: 'EarlybirdService',
        method: 'joinEarlybird',
        userSub,
        error: error.message,
        stack: error.stack
      });

      throw new Error('얼리버드 등록 중 오류가 발생했습니다.');
    }
  }

  async checkEarlybirdStatus(userSub: string) {
    try {
      const earlybird = await this.prisma.earlybird.findUnique({
        where: { user_sub: userSub }
      });

      return {
        success: true,
        data: {
          isEarlybird: !!earlybird,
          joinedAt: earlybird?.joined_at || null,
          rewarded: earlybird?.rewarded || false,
          rewardedAt: earlybird?.rewarded_at || null
        }
      };
    } catch (error) {
      this.logger.error('Failed to check earlybird status', {
        service: 'EarlybirdService',
        method: 'checkEarlybirdStatus',
        userSub,
        error: error.message
      });

      return {
        success: false,
        message: '얼리버드 상태 확인 중 오류가 발생했습니다.',
        data: {
          isEarlybird: false,
          joinedAt: null,
          rewarded: false,
          rewardedAt: null
        }
      };
    }
  }

  async checkEarlybirdStatusByEmail(email: string) {
    try {
      // 먼저 Cognito에서 이메일로 사용자 찾기
      const { CognitoIdentityProviderClient, ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');
      
      const cognitoClient = new CognitoIdentityProviderClient({
        region: process.env.AWS_REGION || 'ap-northeast-2',
      });

      const listUsersCommand = new ListUsersCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Filter: `email = "${email}"`,
        Limit: 1,
      });

      const result = await cognitoClient.send(listUsersCommand);
      
      if (!result.Users || result.Users.length === 0) {
        return {
          success: true,
          data: {
            isEarlybird: false,
            joinedAt: null,
            rewarded: false,
            rewardedAt: null
          }
        };
      }

      const userSub = result.Users[0].Username;
      return this.checkEarlybirdStatus(userSub);
    } catch (error) {
      this.logger.error('Failed to check earlybird status by email', {
        service: 'EarlybirdService',
        method: 'checkEarlybirdStatusByEmail',
        email,
        error: error.message
      });

      return {
        success: false,
        message: '얼리버드 상태 확인 중 오류가 발생했습니다.',
        data: {
          isEarlybird: false,
          joinedAt: null,
          rewarded: false,
          rewardedAt: null
        }
      };
    }
  }

  async getEarlybirdStats() {
    try {
      const totalCount = await this.prisma.earlybird.count();
      const rewardedCount = await this.prisma.earlybird.count({
        where: { rewarded: true }
      });

      return {
        success: true,
        data: {
          totalCount,
          rewardedCount,
          pendingCount: totalCount - rewardedCount
        }
      };
    } catch (error) {
      this.logger.error('Failed to get earlybird stats', {
        service: 'EarlybirdService',
        method: 'getEarlybirdStats',
        error: error.message
      });

      throw new Error('얼리버드 통계 조회 중 오류가 발생했습니다.');
    }
  }

  // 관리자용: 혜택 지급 처리
  async markAsRewarded(userSub: string) {
    try {
      const earlybird = await this.prisma.earlybird.findUnique({
        where: { user_sub: userSub }
      });

      if (!earlybird) {
        throw new Error('해당 사용자는 얼리버드가 아닙니다.');
      }

      if (earlybird.rewarded) {
        throw new ConflictException('이미 혜택이 지급된 사용자입니다.');
      }

      const updatedEarlybird = await this.prisma.earlybird.update({
        where: { user_sub: userSub },
        data: {
          rewarded: true,
          rewarded_at: new Date()
        }
      });

      this.logger.log(`Earlybird reward marked: ${userSub}`, {
        service: 'EarlybirdService',
        method: 'markAsRewarded',
        userSub
      });

      return {
        success: true,
        message: '혜택 지급 처리가 완료되었습니다.',
        data: {
          rewardedAt: updatedEarlybird.rewarded_at
        }
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error('Failed to mark as rewarded', {
        service: 'EarlybirdService',
        method: 'markAsRewarded',
        userSub,
        error: error.message
      });

      throw new Error('혜택 지급 처리 중 오류가 발생했습니다.');
    }
  }
}