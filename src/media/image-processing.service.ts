import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from './s3.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import * as sharp from 'sharp';

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {}

  async processImage(
    userSub: string,
    mediaId: string,
    s3Key: string,
  ): Promise<{
    versions: Record<string, string>;
    thumbnails: string[];
  }> {
    try {
      this.logger.log(`Starting image processing for media: ${mediaId}`);

      // S3에서 원본 이미지 다운로드
      const originalImage = await this.downloadImageFromS3(s3Key);

      // 이미지 메타데이터 분석
      const metadata = await sharp(originalImage).metadata();
      this.logger.log(`Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

      // 여러 해상도로 리사이징
      const versions: Record<string, string> = {};
      const sizes = [
        { name: 'thumb', width: 150, quality: 80 },
        { name: 'small', width: 480, quality: 85 },
        { name: 'medium', width: 1080, quality: 85 },
        { name: 'large', width: 1920, quality: 90 },
      ];

      // 원본이 작으면 불필요한 크기는 생성하지 않음
      const maxWidth = metadata.width || 1920;
      const validSizes = sizes.filter(size => size.width <= maxWidth * 1.2); // 20% 여유

      for (const size of validSizes) {
        const resizedKey = `processed/${userSub}/${mediaId}/${size.name}.webp`;
        
        const resizedBuffer = await sharp(originalImage)
          .resize(size.width, null, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .webp({ quality: size.quality })
          .toBuffer();

        // processed 버킷에 업로드
        await this.uploadToProcessedBucket(resizedKey, resizedBuffer, 'image/webp');
        
        versions[size.name] = this.s3Service.getPublicUrl(
          this.configService.get('S3_PROCESSED_BUCKET'),
          resizedKey,
        );

        this.logger.log(`Created ${size.name} version: ${resizedKey}`);
      }

      // 썸네일 생성 (150x150 고정 크기)
      const thumbnails: string[] = [];
      const thumbKey = `processed/${userSub}/${mediaId}/thumbnail.webp`;
      
      const thumbBuffer = await sharp(originalImage)
        .resize(150, 150, { fit: 'cover' })
        .webp({ quality: 75 })
        .toBuffer();

      await this.uploadToProcessedBucket(thumbKey, thumbBuffer, 'image/webp');
      
      thumbnails.push(
        this.s3Service.getPublicUrl(
          this.configService.get('S3_PROCESSED_BUCKET'),
          thumbKey,
        )
      );

      this.logger.log(`Image processing completed for media: ${mediaId}`);
      
      return { versions, thumbnails };
      
    } catch (error) {
      this.logger.error(`Image processing failed for media: ${mediaId}`, error.stack);
      throw new Error('Image processing failed');
    }
  }

  private async downloadImageFromS3(s3Key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.configService.get('S3_UPLOAD_BUCKET'),
      Key: s3Key,
    });

    try {
      // S3Client를 직접 사용
      const s3Client = this.s3Service.s3Client;
      const response = await s3Client.send(command);
      
      // Stream을 Buffer로 변환
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to download image from S3: ${s3Key}`, error.stack);
      throw error;
    }
  }

  private async uploadToProcessedBucket(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    try {
      // S3Service의 uploadBuffer 메서드 사용
      await this.s3Service.uploadBuffer(
        this.configService.get('S3_PROCESSED_BUCKET'),
        key,
        buffer,
        contentType,
      );
    } catch (error) {
      this.logger.error(`Failed to upload processed image: ${key}`, error.stack);
      throw error;
    }
  }
}