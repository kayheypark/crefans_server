import { IsBoolean, IsInt, IsOptional, IsString, IsEnum, IsDateString, Min, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum PostingStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export class CreatePostingDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(PostingStatus)
  status?: PostingStatus = PostingStatus.DRAFT;

  @IsOptional()
  @IsBoolean()
  is_membership?: boolean = false;

  @IsOptional()
  @IsInt()
  @Min(1)
  membership_level?: number;

  @IsOptional()
  @IsDateString()
  publish_start_at?: string;

  @IsOptional()
  @IsDateString()
  publish_end_at?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media_ids?: string[];

  @IsOptional()
  @IsBoolean()
  allow_individual_purchase?: boolean = false;

  @IsOptional()
  @IsNumber()
  @Min(0)
  individual_purchase_price?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean = true;

  @IsOptional()
  @IsBoolean()
  is_sensitive?: boolean = false;
}

export class UpdatePostingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(PostingStatus)
  status?: PostingStatus;

  @IsOptional()
  @IsBoolean()
  is_membership?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  membership_level?: number;

  @IsOptional()
  @IsDateString()
  publish_start_at?: string;

  @IsOptional()
  @IsDateString()
  publish_end_at?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media_ids?: string[];

  @IsOptional()
  @IsBoolean()
  allow_individual_purchase?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  individual_purchase_price?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsBoolean()
  is_sensitive?: boolean;
}

export class PostingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(PostingStatus)
  status?: PostingStatus;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_membership?: boolean;

  @IsOptional()
  @IsString()
  user_sub?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export interface MediaResponse {
  id: string;
  type: string;
  originalName: string;
  originalUrl: string;
  processedUrls?: any;
  thumbnailUrls?: any;
  processingStatus: string;
  duration?: number;
}

export interface PostingResponse {
  id: string;
  userSub: string;
  title: string;
  content: string;
  status: PostingStatus;
  isMembership: boolean;
  membershipLevel?: number;
  publishStartAt?: string;
  publishEndAt?: string;
  allowIndividualPurchase: boolean;
  individualPurchasePrice?: number;
  isPublic: boolean;
  isSensitive: boolean;
  totalViewCount: number;
  uniqueViewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  medias: MediaResponse[];
  isLiked: boolean;
}

export interface PostingListResponse {
  success: boolean;
  data: {
    postings: PostingResponse[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PostingDetailResponse {
  success: boolean;
  data: PostingResponse;
}

export interface CreatePostingResponse {
  success: boolean;
  data: {
    id: string;
    message: string;
  };
}