import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  public readonly s3Client: S3Client; // public으로 변경
  private readonly uploadBucket: string;
  private readonly processedBucket: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.uploadBucket = this.configService.get('S3_UPLOAD_BUCKET');
    this.processedBucket = this.configService.get('S3_PROCESSED_BUCKET');
  }

  async generatePresignedUploadUrl(
    userSub: string,
    fileName: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    const fileExtension = fileName.split('.').pop();
    const s3Key = `uploads/${userSub}/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.uploadBucket,
      Key: s3Key,
      ContentType: contentType,
      Metadata: {
        'original-filename': fileName,
        'uploaded-by': userSub,
      },
    });

    try {
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600, // 1시간
      });

      this.logger.log(`Generated presigned URL for user ${userSub}: ${s3Key}`);

      return { uploadUrl, s3Key };
    } catch (error) {
      this.logger.error('Failed to generate presigned URL', error.stack);
      throw new Error('Failed to generate upload URL');
    }
  }

  async getObjectUrl(bucket: string, key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: 7 * 24 * 3600, // 7일
      });

      return url;
    } catch (error) {
      this.logger.error(`Failed to get object URL: ${key}`, error.stack);
      throw new Error('Failed to get object URL');
    }
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.uploadBucket,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresIn,
      });

      return url;
    } catch (error) {
      this.logger.error(`Failed to generate signed URL: ${key}`, error.stack);
      throw new Error('Failed to generate signed URL');
    }
  }

  getPublicUrl(bucket: string, key: string): string {
    return `https://${bucket}.s3.${this.configService.get('AWS_REGION')}.amazonaws.com/${key}`;
  }

  generateProcessedKey(userSub: string, mediaId: string, resolution: string, extension: string = 'mp4'): string {
    return `processed/${userSub}/${mediaId}/${resolution}.${extension}`;
  }

  generateThumbnailKey(userSub: string, mediaId: string, index: number = 0): string {
    return `thumbnails/${userSub}/${mediaId}/thumb_${index}.jpg`;
  }

  async uploadBuffer(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Successfully uploaded buffer to s3://${bucket}/${key}`);
    } catch (error) {
      this.logger.error(`Failed to upload buffer to s3://${bucket}/${key}`, error.stack);
      throw error;
    }
  }
}