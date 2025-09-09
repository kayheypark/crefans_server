import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { PeriodUnit } from '@prisma/client';

export class CreateMembershipDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  benefits: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  level: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsEnum(PeriodUnit)
  billing_unit: PeriodUnit;

  @IsNumber()
  @Min(1)
  billing_period: number;

  @IsOptional()
  @IsEnum(PeriodUnit)
  trial_unit?: PeriodUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trial_period?: number;
}