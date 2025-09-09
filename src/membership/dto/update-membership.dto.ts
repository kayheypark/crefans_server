import { PartialType } from '@nestjs/mapped-types';
import { CreateMembershipDto } from './create-membership.dto';
import { IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class UpdateMembershipDto extends PartialType(CreateMembershipDto) {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  level?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}