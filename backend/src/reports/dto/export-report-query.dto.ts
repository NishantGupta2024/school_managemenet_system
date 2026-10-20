import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { DuesSortField, SortDirection } from './outstanding-dues-query.dto';

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export class ExportReportQueryDto {
  @IsNotEmpty({ message: 'format query parameter is required (csv, xlsx, or pdf)' })
  @IsString()
  format: string;

  // Daily Collection
  @IsOptional()
  @IsString()
  date?: string;

  // Monthly Collection
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  month?: number;

  // Collection Summary / Class / Fines Date Range
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  // Shared Filters
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod, {
    message: `paymentMethod must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod?: PaymentMethod;

  // Fine Summary
  @IsOptional()
  @IsString()
  fineRuleId?: string;

  // Dues & Defaulters
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOverdueDays?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyWithDues?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number;

  @IsOptional()
  @IsEnum(DuesSortField, {
    message: `sortBy must be one of: ${Object.values(DuesSortField).join(', ')}`,
  })
  sortBy?: DuesSortField;

  @IsOptional()
  @IsEnum(SortDirection, {
    message: `sortOrder must be one of: ${Object.values(SortDirection).join(', ')}`,
  })
  sortOrder?: SortDirection;
}
