import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { S3Service } from './s3.service';
import { MediaConvertService } from './media-convert.service';
import { Media, MediaProcessingJob } from './entities/media.entity';
import { CreateMediaDto, CompleteUploadDto } from './dto/media.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  
  // 임시 메모리 저장소 (실제로는 DB 사용)
  private readonly mediaStorage = new Map<string, Media>();
  private readonly processingJobs = new Map<string, MediaProcessingJob>();

  constructor(
    private readonly s3Service: S3Service,
    private readonly mediaConvertService: MediaConvertService,
  ) {}

  async createMedia(userSub: string, createMediaDto: CreateMediaDto): Promise<{
    mediaId: string;
    uploadUrl: string;
    s3Key: string;
  }> {
    const mediaId = uuidv4();
    
    try {
      // Presigned URL 생성
      const { uploadUrl, s3Key } = await this.s3Service.generatePresignedUploadUrl(
        userSub,
        createMediaDto.fileName,
        createMediaDto.contentType,
      );

      // 미디어 정보 생성
      const media: Media = {
        id: mediaId,
        userSub,
        originalUrl: this.s3Service.getPublicUrl(
          process.env.S3_UPLOAD_BUCKET,
          s3Key,
        ),
        status: 'uploading',
        versions: {},
        thumbnails: [],
        metadata: {
          fileSize: createMediaDto.fileSize,
        },
        createdAt: new Date(),
      };

      // 임시 저장 (실제로는 DB에 저장)
      this.mediaStorage.set(mediaId, media);

      this.logger.log(`Media created: ${mediaId} for user: ${userSub}`);

      return {
        mediaId,
        uploadUrl,
        s3Key,
      };
    } catch (error) {
      this.logger.error(`Failed to create media for user: ${userSub}`, error.stack);
      throw error;
    }
  }

  async completeUpload(userSub: string, completeUploadDto: CompleteUploadDto): Promise<Media> {
    const { mediaId, s3Key } = completeUploadDto;
    
    const media = this.mediaStorage.get(mediaId);
    if (!media || media.userSub !== userSub) {
      throw new NotFoundException('Media not found');
    }

    try {
      // 상태를 processing으로 변경
      media.status = 'processing';
      media.originalUrl = this.s3Service.getPublicUrl(
        process.env.S3_UPLOAD_BUCKET,
        s3Key,
      );

      this.mediaStorage.set(mediaId, media);

      // MediaConvert 작업 시작
      const inputS3Uri = `s3://${process.env.S3_UPLOAD_BUCKET}/${s3Key}`;
      const outputPrefix = `processed/${userSub}/${mediaId}/`;

      const jobId = await this.mediaConvertService.createTranscodingJob(
        inputS3Uri,
        outputPrefix,
        mediaId,
      );

      // 처리 작업 정보 저장
      const processingJob: MediaProcessingJob = {
        jobId,
        mediaId,
        status: 'submitted',
        progress: 0,
      };

      this.processingJobs.set(jobId, processingJob);

      this.logger.log(`Upload completed and processing started: ${mediaId}`);

      return media;
    } catch (error) {
      // 실패 시 상태 변경
      media.status = 'failed';
      this.mediaStorage.set(mediaId, media);
      
      this.logger.error(`Failed to complete upload for media: ${mediaId}`, error.stack);
      throw error;
    }
  }

  async handleProcessingWebhook(jobId: string, status: string, progress?: number): Promise<void> {
    const processingJob = this.processingJobs.get(jobId);
    if (!processingJob) {
      this.logger.warn(`Processing job not found: ${jobId}`);
      return;
    }

    const media = this.mediaStorage.get(processingJob.mediaId);
    if (!media) {
      this.logger.warn(`Media not found for job: ${jobId}`);
      return;
    }

    try {
      // 처리 작업 상태 업데이트
      processingJob.status = status as any;
      processingJob.progress = progress;
      this.processingJobs.set(jobId, processingJob);

      if (status === 'complete') {
        // 처리 완료 시 미디어 정보 업데이트
        const outputPrefix = `processed/${media.userSub}/${media.id}/`;
        
        media.status = 'completed';
        media.processedAt = new Date();
        
        // 처리된 비디오 URL들 생성
        media.versions = {
          '1080p': this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}${media.id}_1080p.mp4`,
          ),
          '720p': this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}${media.id}_720p.mp4`,
          ),
          '480p': this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}${media.id}_480p.mp4`,
          ),
        };

        // 썸네일 URL들 생성
        media.thumbnails = Array.from({ length: 5 }, (_, i) =>
          this.s3Service.getPublicUrl(
            process.env.S3_PROCESSED_BUCKET,
            `${outputPrefix}thumbnails/${media.id}_thumbnail.${i.toString().padStart(5, '0')}.jpg`,
          ),
        );

        this.mediaStorage.set(media.id, media);
        
        this.logger.log(`Media processing completed: ${media.id}`);
      } else if (status === 'error') {
        media.status = 'failed';
        this.mediaStorage.set(media.id, media);
        
        this.logger.error(`Media processing failed: ${media.id}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle processing webhook for job: ${jobId}`, error.stack);
    }
  }

  async getMedia(mediaId: string, userSub?: string): Promise<Media> {
    const media = this.mediaStorage.get(mediaId);
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    if (userSub && media.userSub !== userSub) {
      throw new NotFoundException('Media not found');
    }

    return media;
  }

  async getUserMedia(userSub: string, limit: number = 20, offset: number = 0): Promise<Media[]> {
    const userMedia = Array.from(this.mediaStorage.values())
      .filter(media => media.userSub === userSub)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);

    return userMedia;
  }

  async getProcessingStatus(mediaId: string, userSub: string): Promise<{
    status: string;
    progress?: number;
  }> {
    const media = this.mediaStorage.get(mediaId);
    if (!media || media.userSub !== userSub) {
      throw new NotFoundException('Media not found');
    }

    // 처리 중인 작업 찾기
    const processingJob = Array.from(this.processingJobs.values())
      .find(job => job.mediaId === mediaId);

    return {
      status: media.status,
      progress: processingJob?.progress,
    };
  }
}