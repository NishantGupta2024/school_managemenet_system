import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum DuesSortField {
  OUTSTANDING_BALANCE = 'outstandingBalance',
  MAX_OVERDUE_DAYS = 'maxOverdueDays',
  ADMISSION_NUMBER = 'admissionNumber',
  STUDENT_NAME = 'studentName',
  TOTAL_BILLED = 'totalBilled',
  TOTAL_PAID = 'totalPaid',
  OVERDUE_AMOUNT = 'overdueAmount',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class OutstandingDuesQueryDto {
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
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(DuesSortField, {
    message: `sortBy must be one of: ${Object.values(DuesSortField).join(', ')}`,
  })
  sortBy?: DuesSortField = DuesSortField.OUTSTANDING_BALANCE;

  @IsOptional()
  @IsEnum(SortDirection, {
    message: `sortOrder must be one of: ${Object.values(SortDirection).join(', ')}`,
  })
  sortOrder?: SortDirection = SortDirection.DESC;
}
