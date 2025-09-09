import { IsInt } from 'class-validator';

export class CommentLikeDto {
  @IsInt()
  comment_id: number;
}

export class CommentLikeResponseDto {
  id: number;
  comment_id: number;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}