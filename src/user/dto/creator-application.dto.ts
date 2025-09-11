import { IsString, IsNotEmpty } from 'class-validator';

export class CreatorApplicationDto {
  @IsString()
  @IsNotEmpty()
  category_id: string;
}