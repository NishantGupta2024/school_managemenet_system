import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { FeeHeadCategory, FeeHeadStatus } from '@prisma/client';

export class UpdateFeeHeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsOptional()
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Code must contain only uppercase letters, numbers, underscores, or hyphens',
  })
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsEnum(FeeHeadCategory)
  @IsOptional()
  category?: FeeHeadCategory;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;

  @IsEnum(FeeHeadStatus)
  @IsOptional()
  status?: FeeHeadStatus;
}
