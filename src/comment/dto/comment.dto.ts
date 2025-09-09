import { IsString, IsOptional, IsInt, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsInt()
  posting_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsInt()
  parent_id?: number;

  @IsOptional()
  @IsString()
  tagged_user_id?: string;
}

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsString()
  tagged_user_id?: string;
}