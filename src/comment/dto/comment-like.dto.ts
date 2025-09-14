import { IsInt } from 'class-validator';

export class CommentLikeDto {
  @IsInt()
  comment_id: number;
}