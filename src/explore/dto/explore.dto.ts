import { IsOptional, IsUUID, IsInt, Min, Max } from "class-validator";
import { Transform } from "class-transformer";

export class GetCreatorsByCategoryDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  cursor?: string;
}

export class GetNewCreatorsDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  cursor?: string;
}

export interface CreatorCategoryResponseDto {
  id: string;
  name: string;
  description: string;
  color_code: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface CreatorResponseDto {
  id: string;
  user_id: string;
  nickname: string;
  handle: string;
  avatar: string;
  bio: string;
  followerCount: number;
  postCount: number;
  category?: CreatorCategoryResponseDto;
  isNew?: boolean;
  bannerImage?: string;
  created_at: Date;
}

export interface NewCreatorsResponseDto {
  creators: CreatorResponseDto[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface CreatorsByCategoryResponseDto {
  creators: CreatorResponseDto[];
  category: CreatorCategoryResponseDto;
  nextCursor?: string;
  hasMore: boolean;
}