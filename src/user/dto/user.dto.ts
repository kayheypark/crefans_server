import { IsString } from 'class-validator';

export class UpdateUserProfileDto {
  @IsString()
  bio: string;
}
