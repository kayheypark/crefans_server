import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum } from 'class-validator';

export class CreateMediaDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  @IsNumber()
  @IsOptional()
  fileSize?: number;

  @IsNumber()
  @IsOptional()
  width?: number;

  @IsNumber()
  @IsOptional()
  height?: number;
}

export class CompleteUploadDto {
  @IsString()
  @IsNotEmpty()
  mediaId: string;

  @IsString()
  @IsNotEmpty()
  s3Key: string;
}

export class MediaProcessingWebhookDto {
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @IsEnum(['submitted', 'progressing', 'complete', 'error'])
  status: 'submitted' | 'progressing' | 'complete' | 'error';

  @IsNumber()
  @IsOptional()
  progress?: number;

  @IsString()
  @IsOptional()
  errorMessage?: string;

  @IsString()
  @IsOptional()
  mediaId?: string;

  @IsString()
  @IsOptional()
  userSub?: string;
}