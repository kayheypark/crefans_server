import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Service } from "./s3.service";
import { ImageProcessingService } from "./image-processing.service";
import { CreateMediaDto, CompleteUploadDto } from "./dto/media.dto";
import { Media, ProcessingStatus } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

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
      // Presigned URL 생성
      const { uploadUrl, s3Key } =
        await this.s3Service.generatePresignedUploadUrl(
          userSub,
          createMediaDto.fileName,
          createMediaDto.contentType
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
        // 비디오는 S3 업로드만 완료, Lambda가 처리할 예정
        const updatedMedia = await this.prisma.media.update({
          where: { id: mediaId },
          data: {
            original_url: originalUrl,
            processing_status: ProcessingStatus.PROCESSING,
          },
        });

        this.logger.log(
          `Video upload completed, starting Lambda processing: ${mediaId}`
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
    userSub?: string
  ): Promise<void> {
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
      this.logger.warn(`Media not found for job: ${jobId}, mediaId: ${mediaId}, userSub: ${userSub}`);
      return;
    }

    try {
      if (status === "progressing") {
        // 처리 시작 시 job ID 저장
        await this.prisma.media.update({
          where: { id: media.id },
          data: {
            processing_job_id: jobId,
            processing_status: ProcessingStatus.PROCESSING,
          },
        });

        this.logger.log(`MediaConvert job started for media: ${media.id}, jobId: ${jobId}`);
      } else if (status === "complete") {
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

        await this.prisma.media.update({
          where: { id: media.id },
          data: {
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
          },
        });

        this.logger.log(`Media processing completed: ${media.id}`);
      } else if (status === "error") {
        await this.prisma.media.update({
          where: { id: media.id },
          data: {
            processing_status: ProcessingStatus.FAILED,
          },
        });

        this.logger.error(`Media processing failed: ${media.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle processing webhook for job: ${jobId}`,
        error.stack
      );
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
}
