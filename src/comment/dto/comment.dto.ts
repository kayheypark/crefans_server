import { IsString, IsOptional, IsNotEmpty, MaxLength, IsUUID } from 'class-validator';

export class CreateCommentDto {
  @IsUUID()
  posting_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;

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