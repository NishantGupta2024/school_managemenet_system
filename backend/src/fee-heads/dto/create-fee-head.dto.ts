import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { FeeHeadCategory } from '@prisma/client';

export class CreateFeeHeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Code must contain only uppercase letters, numbers, underscores, or hyphens',
  })
  code!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsEnum(FeeHeadCategory, { message: 'Invalid category' })
  @IsOptional()
  category?: FeeHeadCategory;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;
}
