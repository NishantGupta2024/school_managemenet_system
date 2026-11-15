import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLibrarySettingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBooksStudent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBooksTeacher?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loanDurationDaysStudent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loanDurationDaysTeacher?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRenewals?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  finePerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  allowRenewWithOverdue?: boolean;
}

export class StudentCatalogueQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
