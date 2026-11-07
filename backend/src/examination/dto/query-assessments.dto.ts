import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AssessmentStatus } from '../types';

export class QueryAssessmentsDto {
  @IsOptional()
  @IsEnum(AssessmentStatus, { message: 'Invalid assessment status filter' })
  status?: AssessmentStatus;

  @IsOptional()
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId?: string;
}
