import { Controller, Get, Param, Request, UseGuards, Optional, Res } from '@nestjs/common';
import { Response } from 'express';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { MediaAccessService } from './media-access.service';

@Controller('media/access')
export class MediaAccessController {
  constructor(private readonly mediaAccessService: MediaAccessService) {}

  @UseGuards(OptionalAuthGuard) // 로그인 선택적
  @Get(':mediaId')
  async getMediaAccess(
    @Param('mediaId') mediaId: string,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userSub = req.user?.sub; // 비로그인도 허용
    
    try {
      // 1. 미디어가 속한 포스팅 정보 조회
      const mediaInfo = await this.mediaAccessService.getMediaWithPosting(mediaId);
      
      if (!mediaInfo || !mediaInfo.postings || mediaInfo.postings.length === 0) {
        return res.status(404).json({ error: 'Media not found' });
      }

      // 첫 번째 연결된 포스팅 사용 (미디어는 여러 포스팅에 연결될 수 있음)
      const posting = mediaInfo.postings[0].posting;

      // 2. 권한 검증
      const hasAccess = await this.mediaAccessService.checkAccess(
        posting,
        userSub
      );

      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Access denied',
          membershipRequired: posting.is_membership,
          requiredLevel: posting.membership_level
        });
      }

      // 3. S3 Signed URL 생성 (긴 유효기간)
      const signedUrl = await this.mediaAccessService.generateAccessUrl(
        mediaInfo.s3_upload_key,
        '30d' // 30일 유효
      );

      // 4. 리다이렉트 방식으로 미디어 접근
      return res.redirect(signedUrl);

    } catch (error) {
      console.error('Media access error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}