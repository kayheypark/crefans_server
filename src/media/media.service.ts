import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Service } from "./s3.service";
import { ImageProcessingService } from "./image-processing.service";
import { CreateMediaDto, CompleteUploadDto } from "./dto/media.dto";
import { Media, ProcessingStatus } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { Response } from "express";
import { Readable } from "stream";

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly imageProcessingService: ImageProcessingService
  ) {}

  async createMedia(
    userSub: string,
    createMediaDto: CreateMediaDto
  ): Promise<{
    mediaId: string;
    uploadUrl: string;
    s3Key: string;
  }> {
    const mediaId = uuidv4();

    try {
      // 크레팬스 업로드 정책 검증
      await this.validateUploadPolicy(userSub, createMediaDto);
      // Presigned URL 생성 (mediaId를 S3 key에 사용)
      const { uploadUrl, s3Key } =
        await this.s3Service.generatePresignedUploadUrl(
          userSub,
          createMediaDto.fileName,
          createMediaDto.contentType,
          mediaId
        );

      // 파일 타입 결정
      const fileExtension = createMediaDto.fileName
        .split(".")
        .pop()
        ?.toLowerCase();
      const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(
        fileExtension || ""
      );
      const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(
        fileExtension || ""
      );

      let mediaType: "IMAGE" | "VIDEO" | "AUDIO";
      if (isImage) {
        mediaType = "IMAGE";
      } else if (isVideo) {
        mediaType = "VIDEO";
      } else {
        mediaType = "AUDIO"; // 기타는 AUDIO로 분류
      }

      // DB에 미디어 정보 저장
      const media = await this.prisma.media.create({
        data: {
          id: mediaId,
          user_sub: userSub,
          type: mediaType,
          original_name: createMediaDto.fileName,
          file_name: createMediaDto.fileName,
          s3_upload_key: s3Key,
          original_url: this.s3Service.getPublicUrl(
            process.env.S3_UPLOAD_BUCKET,
            s3Key
          ),
          file_size: createMediaDto.fileSize,
          mime_type: createMediaDto.contentType,
          processing_status: ProcessingStatus.UPLOADING,
          metadata: {
            fileSize: createMediaDto.fileSize,
          },
        },
      });

      this.logger.log(`Media created: ${mediaId} for user: ${userSub}`);

      return {
        mediaId,
        uploadUrl,
        s3Key,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create media for user: ${userSub}`,
        error.stack
      );
      throw error;
    }
  }

  async completeUpload(
    userSub: string,
    completeUploadDto: CompleteUploadDto
  ): Promise<Media> {
    const { mediaId, s3Key } = completeUploadDto;

    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        user_sub: userSub,
      },
    });

    if (!media) {
      throw new NotFoundException("Media not found");
    }

    try {
      // S3 URL 업데이트
      const originalUrl = this.s3Service.getPublicUrl(
        process.env.S3_UPLOAD_BUCKET,
        s3Key
      );

      // 파일 확장자로 미디어 타입 판단
      const fileExtension = s3Key.split(".").pop()?.toLowerCase();
      const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(
        fileExtension || ""
      );
      const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(
        fileExtension || ""
      );

      if (isImage) {
        // 이미지는 processing 상태로 설정
        const updatedMedia = await this.prisma.media.update({
          where: { id: mediaId },
          data: {
            original_url: originalUrl,
            processing_status: ProcessingStatus.PROCESSING,
          },
        });

        this.logger.log(
          `Image upload completed, starting processing: ${mediaId}`
        );

        // 비동기로 이미지 처리 시작
        this.processImageAsync(userSub, mediaId, s3Key);

        return updatedMedia;
      } else if (isVideo) {
        // 비디오 처리: duration 추출 후 Lambda 처리 시작
        const updatedMedia = await this.prisma.media.update({
          where: { id: mediaId },
          data: {
            original_url: originalUrl,
            processing_status: ProcessingStatus.PROCESSING,
          },
        });

        this.logger.log(
          `Video upload completed, Lambda will process duration: ${mediaId}`
        );

        return updatedMedia;
      } else {
        // 기타 파일은 원본만 사용
        const updatedMedia = await this.prisma.media.update({
          where: { id: mediaId },
          data: {
            original_url: originalUrl,
            processing_status: ProcessingStatus.COMPLETED,
            processed_urls: {
              original: originalUrl,
            },
            processed_at: new Date(),
          },
        });

        this.logger.log(`File upload completed: ${mediaId}`);
        return updatedMedia;
      }
    } catch (error) {
      // 실패 시 상태 변경
      await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          processing_status: ProcessingStatus.FAILED,
        },
      });

      this.logger.error(
        `Failed to complete upload for media: ${mediaId}`,
        error.stack
      );
      throw error;
    }
  }

  async handleProcessingWebhook(
    jobId: string,
    status: string,
    progress?: number,
    mediaId?: string,
    userSub?: string,
    duration?: number
  ): Promise<void> {
    // 상태값 정규화 (대소문자 처리)
    const normalizedStatus = status?.toLowerCase()?.trim();
    
    this.logger.log(`Processing webhook: jobId=${jobId}, status=${normalizedStatus}, mediaId=${mediaId}, userSub=${userSub}, duration=${duration}`);

    // 먼저 처리 중인 작업 ID로 미디어 찾기 시도
    let media = await this.prisma.media.findFirst({
      where: {
        processing_job_id: jobId,
      },
    });

    // 미디어를 찾지 못했고 mediaId와 userSub가 제공된 경우, 이들로 찾기
    if (!media && mediaId && userSub) {
      media = await this.prisma.media.findFirst({
        where: {
          id: mediaId,
          user_sub: userSub,
        },
      });
    }

    if (!media) {
      const warningMsg = `Media not found for job: ${jobId}, mediaId: ${mediaId}, userSub: ${userSub}. This might be a timing issue - webhook arrived before media creation.`;
      this.logger.warn(warningMsg);
      // 미디어를 찾을 수 없는 경우 경고 로그만 남기고 성공 처리 (Lambda 재시도 방지)
      return;
    }

    try {
      if (normalizedStatus === "progressing") {
        // 처리 시작 시 job ID 저장하고 바로 COMPLETED로 변경
        this.logger.log(`Before update: media.id=${media.id}, jobId=${jobId}, current_status=${media.processing_status}`);
        
        const updatedMedia = await this.prisma.media.update({
          where: { id: media.id },
          data: {
            processing_job_id: jobId,
            processing_status: ProcessingStatus.COMPLETED,
            processed_at: new Date(),
          },
        });
        
        this.logger.log(`After update: media.id=${media.id}, jobId=${jobId}, new_status=${updatedMedia.processing_status}`);
        this.logger.log(`MediaConvert job started and completed for media: ${media.id}, jobId: ${jobId}`);
      } else if (normalizedStatus === "complete") {
        // 처리 완료 시 미디어 정보 업데이트
        const outputPrefix = `processed/${media.user_sub}/${media.id}/`;

        // 처리된 비디오 URL들 생성
        const processedUrls = {
          "1080p": this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}${media.id}_1080p.mp4`
          ),
          "720p": this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}${media.id}_720p.mp4`
          ),
          "480p": this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}${media.id}_480p.mp4`
          ),
        };

        // 비디오 플레이어를 위한 해상도 정보
        const videoResolutions = [
          { quality: "1080p", width: 1920, height: 1080, bitrate: 5000000 },
          { quality: "720p", width: 1280, height: 720, bitrate: 2500000 },
          { quality: "480p", width: 640, height: 480, bitrate: 1000000 },
        ];

        // 썸네일 URL들 생성
        const thumbnailUrls = Array.from({ length: 5 }, (_, i) =>
          this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}thumbnails/${media.id}_thumbnail.${i
              .toString()
              .padStart(5, "0")}.jpg`
          )
        );

        const updateData: any = {
          processing_status: ProcessingStatus.COMPLETED,
          processed_urls: processedUrls,
          thumbnail_urls: thumbnailUrls,
          processed_at: new Date(),
          metadata: {
            ...((media.metadata as any) || {}),
            videoResolutions,
            availableQualities: ["1080p", "720p", "480p"],
            thumbnailCount: 5,
          },
        };

        // Lambda에서 duration을 제공한 경우 저장
        if (duration !== undefined) {
          updateData.duration = duration;
          updateData.metadata.duration = duration;
        }

        await this.prisma.media.update({
          where: { id: media.id },
          data: updateData,
        });

        this.logger.log(`Media processing completed: ${media.id}, duration: ${duration}s`);
      } else if (normalizedStatus === "error") {
        await this.prisma.media.update({
          where: { id: media.id },
          data: {
            processing_status: ProcessingStatus.FAILED,
          },
        });

        this.logger.error(`Media processing failed: ${media.id}`);
      } else {
        this.logger.warn(`Unknown status received: ${normalizedStatus} for media: ${media.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle processing webhook for job: ${jobId}, mediaId: ${mediaId}, status: ${normalizedStatus}`,
        error.stack
      );
      
      // DB 업데이트 실패시에도 미디어 상태를 실패로 업데이트 시도
      try {
        if (media) {
          await this.prisma.media.update({
            where: { id: media.id },
            data: {
              processing_status: ProcessingStatus.FAILED,
              processing_job_id: jobId, // job ID가 없었다면 저장
            },
          });
          this.logger.log(`Media status updated to FAILED due to webhook processing error: ${media.id}`);
        }
      } catch (updateError) {
        this.logger.error(
          `Failed to update media status to FAILED for media: ${media?.id}`,
          updateError.stack
        );
      }
      
      // 웹훅 처리 실패는 Lambda 측에서 재시도할 수 있도록 에러를 던짐
      throw error;
    }
  }

  async getMedia(mediaId: string, userSub?: string): Promise<Media> {
    const whereCondition: any = { id: mediaId };
    if (userSub) {
      whereCondition.user_sub = userSub;
    }

    const media = await this.prisma.media.findFirst({
      where: whereCondition,
    });

    if (!media) {
      throw new NotFoundException("Media not found");
    }

    return media;
  }

  async getUserMedia(
    userSub: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Media[]> {
    return this.prisma.media.findMany({
      where: {
        user_sub: userSub,
        is_deleted: false,
      },
      orderBy: {
        created_at: "desc",
      },
      take: limit,
      skip: offset,
    });
  }

  async getProcessingStatus(
    mediaId: string,
    userSub: string
  ): Promise<{
    status: string;
    progress?: number;
  }> {
    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        user_sub: userSub,
      },
    });

    if (!media) {
      throw new NotFoundException("Media not found");
    }

    return {
      status: media.processing_status,
      progress: undefined, // 진행률은 현재 Lambda에서 제공하지 않음
    };
  }


  /**
   * 비동기 이미지 처리
   */
  private async processImageAsync(
    userSub: string,
    mediaId: string,
    s3Key: string
  ): Promise<void> {
    try {
      this.logger.log(`Starting async image processing for media: ${mediaId}`);

      // 이미지 처리 실행
      const { versions, thumbnails } =
        await this.imageProcessingService.processImage(userSub, mediaId, s3Key);

      // DB에서 미디어 정보 업데이트
      await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          processing_status: ProcessingStatus.COMPLETED,
          processed_urls: versions,
          thumbnail_urls: thumbnails,
          processed_at: new Date(),
        },
      });

      this.logger.log(`Image processing completed for media: ${mediaId}`);
    } catch (error) {
      this.logger.error(
        `Image processing failed for media: ${mediaId}`,
        error.stack
      );

      // 실패 시 상태 업데이트
      await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          processing_status: ProcessingStatus.FAILED,
        },
      });
    }
  }

  /**
   * 크레팬스 업로드 정책 검증
   */
  private async validateUploadPolicy(userSub: string, createMediaDto: CreateMediaDto): Promise<void> {
    const { fileName, contentType, fileSize, width, height } = createMediaDto;
    
    // 파일 확장자 검증
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '');
    const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExtension || '');
    
    if (!isImage && !isVideo) {
      throw new BadRequestException('지원하지 않는 파일 형식입니다. (이미지: jpg, png, gif, webp / 동영상: mp4, mov, avi, mkv, webm)');
    }

    // 4K 비디오 업로드 제한 (크레팬스 정책) - 세로/가로 모두 지원
    if (isVideo && width && height) {
      // 가로형(1920x1080) 또는 세로형(1080x1920) 모두 허용, 4K는 제한
      const maxDimension = Math.max(width, height);
      const minDimension = Math.min(width, height);
      
      if (maxDimension > 1920 || minDimension > 1080) {
        throw new BadRequestException('동영상 최대 해상도는 1920x1080 또는 1080x1920입니다. 4K 업로드는 지원하지 않습니다.');
      }
    }

    // 파일 크기 제한
    if (fileSize) {
      const maxImageSize = 50 * 1024 * 1024; // 50MB
      const maxVideoSize = 500 * 1024 * 1024; // 500MB
      
      if (isImage && fileSize > maxImageSize) {
        throw new BadRequestException('이미지 파일 크기는 50MB를 초과할 수 없습니다.');
      }
      
      if (isVideo && fileSize > maxVideoSize) {
        throw new BadRequestException('동영상 파일 크기는 500MB를 초과할 수 없습니다.');
      }
    }

    // 사용자별 일일 업로드 제한 검증
    await this.validateDailyUploadLimits(userSub, isVideo);
  }

  /**
   * 일일 업로드 제한 검증
   */
  private async validateDailyUploadLimits(userSub: string, isVideo: boolean): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 오늘 업로드된 미디어 개수 조회
    const todayUploads = await this.prisma.media.findMany({
      where: {
        user_sub: userSub,
        created_at: {
          gte: today,
          lt: tomorrow,
        },
        is_deleted: false,
      },
    });

    const imageCount = todayUploads.filter(media => media.type === 'IMAGE').length;
    const videoCount = todayUploads.filter(media => media.type === 'VIDEO').length;

    // 크레팬스 정책: 한 포스팅당 최대 사진 10개, 동영상 1개
    if (!isVideo && imageCount >= 10) {
      throw new BadRequestException('일일 이미지 업로드 제한(10개)에 도달했습니다.');
    }

    if (isVideo && videoCount >= 1) {
      throw new BadRequestException('일일 동영상 업로드 제한(1개)에 도달했습니다.');
    }

    // 총 업로드 제한 (구독자 0명 기준: 월 10개)
    if (todayUploads.length >= 50) { // 일일 50개 = 월 1500개 (여유있게 설정)
      throw new BadRequestException('일일 업로드 제한에 도달했습니다.');
    }
  }


  /**
   * 비디오 전용 스트리밍 메서드
   */
  async streamVideoMedia(
    mediaId: string,
    quality?: "480p" | "720p" | "1080p",
    userSub?: string,
    res?: Response
  ): Promise<void> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId, type: 'VIDEO' },
      include: {
        postings: {
          include: {
            posting: true
          }
        }
      }
    });

    if (!media) {
      throw new NotFoundException('비디오를 찾을 수 없습니다');
    }

    // 접근 권한 확인
    const hasAccess = await this.checkMediaAccess(media, userSub);
    if (!hasAccess) {
      throw new UnauthorizedException('접근 권한이 없습니다');
    }

    // 처리 상태 확인
    if (media.processing_status !== ProcessingStatus.COMPLETED) {
      throw new BadRequestException('비디오가 아직 처리 중입니다');
    }

    // 비디오 품질별 스트림 정보 획득
    const { bucket, key } = this.getVideoStreamInfo(media, quality);

    // S3에서 스트리밍
    const { stream, contentType, contentLength } = await this.s3Service.getObjectStream(bucket, key);

    if (!res) {
      throw new BadRequestException('Response object is required for streaming');
    }

    // 비디오 전용 헤더 설정
    res.setHeader('Content-Type', contentType || 'video/mp4');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength.toString());
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Accept-Ranges', 'bytes');

    (stream as Readable).pipe(res);
  }

  /**
   * 이미지 전용 스트리밍 메서드
   */
  async streamImageMedia(
    mediaId: string,
    quality?: "high" | "medium" | "low" | "thumbnail",
    userSub?: string,
    res?: Response
  ): Promise<void> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId, type: 'IMAGE' },
      include: {
        postings: {
          include: {
            posting: true
          }
        }
      }
    });

    if (!media) {
      throw new NotFoundException('이미지를 찾을 수 없습니다');
    }

    // 접근 권한 확인
    const hasAccess = await this.checkMediaAccess(media, userSub);
    if (!hasAccess) {
      throw new UnauthorizedException('접근 권한이 없습니다');
    }

    // 처리 상태 확인
    if (media.processing_status !== ProcessingStatus.COMPLETED) {
      throw new BadRequestException('이미지가 아직 처리 중입니다');
    }

    // 이미지 품질별 스트림 정보 획득
    const { bucket, key } = this.getImageStreamInfo(media, quality);

    // S3에서 스트리밍
    const { stream, contentType, contentLength } = await this.s3Service.getObjectStream(bucket, key);

    if (!res) {
      throw new BadRequestException('Response object is required for streaming');
    }

    // 이미지 전용 헤더 설정
    res.setHeader('Content-Type', contentType || 'image/webp');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength.toString());
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Accept-Ranges', 'bytes');

    (stream as Readable).pipe(res);
  }

  /**
   * 미디어 접근 권한 확인
   */
  private async checkMediaAccess(media: any, userSub?: string): Promise<boolean> {
    // 미디어가 게시물에 포함되어 있는지 확인
    if (media.postings && media.postings.length > 0) {
      for (const postingMedia of media.postings) {
        const posting = postingMedia.posting;
        
        // 공개 게시물이면 접근 허용
        if (!posting.is_membership) {
          return true;
        }

        // 멤버십 게시물인 경우 사용자 확인 필요
        if (userSub) {
          // 작성자 본인이면 접근 허용
          if (posting.user_sub === userSub) {
            return true;
          }

          // 멤버십 구독 확인 로직
          const hasSubscription = await this.checkMembershipAccess(userSub, posting.user_sub, posting.membership_level);
          if (hasSubscription) return true;
        }
      }
      // 게시물이 있지만 접근 권한이 없음
      return false;
    }

    // 게시물에 포함되지 않은 미디어 (업로드 중이거나 개인 미디어)
    // 소유자만 접근 가능
    return userSub === media.user_sub;
  }


  /**
   * 비디오 품질별 스트림 정보 반환
   */
  private getVideoStreamInfo(media: any, quality?: "480p" | "720p" | "1080p"): { bucket: string; key: string } {
    // 품질 지정이 없으면 원본 사용
    if (!quality) {
      return {
        bucket: this.s3Service.getBucketName(false), // upload bucket
        key: media.s3_upload_key
      };
    }

    const processedBucket = this.s3Service.getBucketName(true); // processed bucket

    if (!media.processed_urls) {
      this.logger.warn(`No processed URLs found for video ${media.id}, falling back to original`);
      return {
        bucket: this.s3Service.getBucketName(false),
        key: media.s3_upload_key
      };
    }

    const processedUrls = media.processed_urls as any;
    let targetUrl: string | null = null;

    // 비디오 품질 직접 매핑
    switch (quality) {
      case '1080p':
        targetUrl = processedUrls['1080p'];
        break;
      case '720p':
        targetUrl = processedUrls['720p'];
        break;
      case '480p':
        targetUrl = processedUrls['480p'];
        break;
      default:
        this.logger.warn(`Unsupported video quality '${quality}' for media ${media.id}`);
        break;
    }

    if (targetUrl) {
      const key = this.extractS3KeyFromUrl(targetUrl);
      return { bucket: processedBucket, key };
    }

    // 요청된 품질이 없으면 원본 반환
    this.logger.warn(`Video quality '${quality}' not available for media ${media.id}, falling back to original`);
    return {
      bucket: this.s3Service.getBucketName(false),
      key: media.s3_upload_key
    };
  }

  /**
   * 이미지 품질별 스트림 정보 반환
   */
  private getImageStreamInfo(media: any, quality?: "high" | "medium" | "low" | "thumbnail"): { bucket: string; key: string } {
    // 품질 지정이 없으면 원본 사용
    if (!quality) {
      return {
        bucket: this.s3Service.getBucketName(false), // upload bucket
        key: media.s3_upload_key
      };
    }

    const processedBucket = this.s3Service.getBucketName(true); // processed bucket

    // 썸네일 특별 처리
    if (quality === 'thumbnail' && media.thumbnail_urls) {
      const thumbnailUrls = media.thumbnail_urls;

      if (Array.isArray(thumbnailUrls) && thumbnailUrls.length > 0) {
        // 배열 형태인 경우 첫 번째 썸네일 사용
        const thumbnailKey = this.extractS3KeyFromUrl(thumbnailUrls[0]);
        return { bucket: processedBucket, key: thumbnailKey };
      }
    }

    if (!media.processed_urls) {
      this.logger.warn(`No processed URLs found for image ${media.id}, falling back to original`);
      return {
        bucket: this.s3Service.getBucketName(false),
        key: media.s3_upload_key
      };
    }

    const processedUrls = media.processed_urls as any;
    let targetUrl: string | null = null;

    // 이미지 품질 매핑 (실제 데이터베이스 구조에 맞춘 명확한 매핑)
    switch (quality) {
      case 'high':
        // large가 있으면 large, 없으면 원본으로 폴백
        targetUrl = processedUrls['large'];
        if (!targetUrl) {
          return {
            bucket: this.s3Service.getBucketName(false),
            key: media.s3_upload_key
          };
        }
        break;
      case 'medium':
        targetUrl = processedUrls['small'];
        break;
      case 'low':
        targetUrl = processedUrls['thumb'];
        break;
      case 'thumbnail':
        targetUrl = processedUrls['thumb'];
        break;
      default:
        this.logger.warn(`Unsupported image quality '${quality}' for media ${media.id}`);
        break;
    }

    if (targetUrl) {
      const key = this.extractS3KeyFromUrl(targetUrl);
      return { bucket: processedBucket, key };
    }

    // 요청된 품질이 없으면 원본 반환
    this.logger.warn(`Image quality '${quality}' not available for media ${media.id}, falling back to original`);
    return {
      bucket: this.s3Service.getBucketName(false),
      key: media.s3_upload_key
    };
  }

  /**
   * S3 URL에서 키 추출
   */
  private extractS3KeyFromUrl(url: string): string {
    const match = url.match(/amazonaws\.com\/(.+)$/);
    return match ? match[1] : url;
  }

  /**
   * 멤버십 구독 확인
   */
  private async checkMembershipAccess(
    subscriberId: string,
    creatorId: string,
    requiredLevel?: number
  ): Promise<boolean> {
    try {
      // 해당 크리에이터의 멤버십 상품들 조회
      const membershipItems = await this.prisma.membershipItem.findMany({
        where: {
          creator_id: creatorId,
          ...(requiredLevel && { level: { gte: requiredLevel } }) // 요구 레벨 이상의 멤버십만
        },
        select: {
          id: true,
          level: true
        }
      });

      if (membershipItems.length === 0) {
        return false;
      }

      // 구독자의 해당 크리에이터에 대한 활성 구독 확인
      const activeSubscriptions = await this.prisma.subscription.findMany({
        where: {
          subscriber_id: subscriberId,
          membership_item_id: {
            in: membershipItems.map(item => item.id)
          },
          status: 'ONGOING',
          OR: [
            { ended_at: null },
            { ended_at: { gt: new Date() } }
          ]
        },
        include: {
          membership_item: {
            select: {
              level: true
            }
          }
        }
      });

      // 활성 구독이 있으면서, 요구 레벨을 만족하는 구독이 있는지 확인
      if (activeSubscriptions.length > 0) {
        if (!requiredLevel) {
          // 레벨 요구사항이 없으면 구독만 있으면 됨
          return true;
        }

        // 구독 중인 멤버십 레벨 중 요구 레벨 이상이 있는지 확인
        const hasRequiredLevel = activeSubscriptions.some(
          sub => sub.membership_item.level >= requiredLevel
        );

        return hasRequiredLevel;
      }

      return false;
    } catch (error) {
      this.logger.error('멤버십 접근 권한 확인 중 오류 발생:', error);
      return false;
    }
  }
}
