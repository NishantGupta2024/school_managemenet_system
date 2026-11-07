import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetRegisterQueryDto {
  @IsDateString({}, { message: 'Date must be a valid ISO date string (YYYY-MM-DD)' })
  date: string;

  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId: string;

  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId: string;

  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId: string;

  @IsOptional()
  @IsString()
  search?: string;

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
  limit?: number = 50;
}
