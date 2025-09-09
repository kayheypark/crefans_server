import { Controller, Post, Get, UseGuards, Request, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { EarlybirdService } from './earlybird.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('earlybird')
export class EarlybirdController {
  constructor(private readonly earlybirdService: EarlybirdService) {}

  @Post('join')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async joinEarlybird(@Request() req: any) {
    const userSub = req.user.sub;
    return this.earlybirdService.joinEarlybird(userSub);
  }

  @Get('status')
  async getEarlybirdStatus(@Request() req: any, @Query('email') email?: string) {
    if (email) {
      // 이메일로 조회 (이메일 인증 페이지에서 사용)
      return this.earlybirdService.checkEarlybirdStatusByEmail(email);
    }
    
    // 인증된 사용자인 경우에만 AuthGuard 적용
    if (req.headers.authorization) {
      // AuthGuard 로직을 수동으로 적용
      try {
        const userSub = req.user?.sub;
        if (userSub) {
          return this.earlybirdService.checkEarlybirdStatus(userSub);
        }
      } catch (error) {
        // 인증 실패 시 기본값 반환
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
    }
    
    // 인증되지 않은 사용자
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

  @Get('stats')
  async getEarlybirdStats() {
    return this.earlybirdService.getEarlybirdStats();
  }

  // 관리자용 엔드포인트 (추후 관리자 권한 체크 추가 가능)
  @Post('reward')
  @UseGuards(AuthGuard)
  async markAsRewarded(@Request() req: any) {
    const userSub = req.user.sub;
    return this.earlybirdService.markAsRewarded(userSub);
  }
}