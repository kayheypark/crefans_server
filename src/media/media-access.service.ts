import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from './s3.service';

@Injectable()
export class MediaAccessService {
  private readonly logger = new Logger(MediaAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async getMediaWithPosting(mediaId: string) {
    return await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        postings: {
          include: {
            posting: {
              select: {
                id: true,
                is_public: true,
                is_membership: true,
                membership_level: true,
                user_sub: true,
              }
            }
          }
        }
      }
    });
  }

  async checkAccess(posting: any, userSub?: string): Promise<boolean> {
    // 공개 게시물이고 멤버십이 아닌 경우 - 누구나 접근 가능
    if (posting.is_public && !posting.is_membership) {
      return true;
    }

    // 로그인하지 않은 사용자는 비공개나 멤버십 콘텐츠 접근 불가
    if (!userSub) {
      return false;
    }

    // 본인이 작성한 게시물은 항상 접근 가능
    if (posting.user_sub === userSub) {
      return true;
    }

    // 비공개 게시물은 작성자만 접근 가능
    if (!posting.is_public) {
      return false;
    }

    // 멤버십 게시물인 경우 구독 상태 확인
    if (posting.is_membership) {
      // TODO: subscription 테이블이 생성되면 활성화
      // const subscription = await this.prisma.subscription.findFirst({
      //   where: {
      //     subscriber_sub: userSub,
      //     creator_sub: posting.user_sub,
      //     status: 'ACTIVE',
      //     level: {
      //       gte: posting.membership_level
      //     }
      //   }
      // });
      
      // return !!subscription;
      
      // 현재는 멤버십 콘텐츠도 로그인한 사용자는 접근 가능하게 설정
      return true;
    }

    return true;
  }

  async generateAccessUrl(s3Key: string, expiresIn: string): Promise<string> {
    // S3Service의 getObjectUrl 메서드를 사용하여 Signed URL 생성
    // expiresIn을 초 단위로 변환
    let expirationSeconds: number;
    
    if (expiresIn.endsWith('d')) {
      const days = parseInt(expiresIn.slice(0, -1));
      expirationSeconds = days * 24 * 3600;
    } else if (expiresIn.endsWith('h')) {
      const hours = parseInt(expiresIn.slice(0, -1));
      expirationSeconds = hours * 3600;
    } else {
      expirationSeconds = parseInt(expiresIn);
    }

    // S3Service에 새로운 메서드 추가 필요
    return await this.s3Service.getSignedUrl(s3Key, expirationSeconds);
  }

  async getMediaStream(s3Key: string) {
    // S3에서 스트림 반환 (대용량 파일용)
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: process.env.S3_UPLOAD_BUCKET,
      Key: s3Key,
    });

    const response = await this.s3Service.s3Client.send(command);
    return response.Body as NodeJS.ReadableStream;
  }
}