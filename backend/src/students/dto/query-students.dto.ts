import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StudentStatus } from '@prisma/client';

export class QueryStudentsDto {
  @IsOptional()
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must not exceed 100' })
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId?: string;

  @IsOptional()
  @IsEnum(StudentStatus, { message: 'Status must be ACTIVE, PROMOTED, TRANSFERRED, or ALUMNI' })
  status?: StudentStatus;
}
