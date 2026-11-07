import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StudentHistoryQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be a valid ISO date string (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate must be a valid ISO date string (YYYY-MM-DD)' })
  endDate?: string;

  @IsOptional()
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId?: string;

  @IsOptional()
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must not exceed 100' })
  @Type(() => Number)
  limit?: number = 30;
}
