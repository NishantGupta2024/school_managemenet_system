import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssessmentMode } from '../types';

export class UpdateAssessmentDraftDto {
  @IsOptional()
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'chapterId must be a valid UUID' })
  chapterId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must not exceed 2000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Subject must not exceed 100 characters' })
  subject?: string;

  @IsOptional()
  @IsEnum(AssessmentMode, { message: 'Invalid assessment mode' })
  mode?: AssessmentMode;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'totalMarks must be a valid decimal' })
  @Min(1.0, { message: 'totalMarks must be at least 1.00' })
  @Max(5000.0, { message: 'totalMarks cannot exceed 5000.00' })
  totalMarks?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'passingMarks must be a valid decimal' })
  @Min(0.0, { message: 'passingMarks cannot be negative' })
  passingMarks?: number;

  @IsOptional()
  @IsInt({ message: 'durationMinutes must be an integer' })
  @Min(1, { message: 'durationMinutes must be at least 1' })
  @Max(1440, { message: 'durationMinutes cannot exceed 1440 (24 hours)' })
  durationMinutes?: number;

  @IsOptional()
  @IsDateString({}, { message: 'startWindowAt must be an ISO date string' })
  startWindowAt?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'endWindowAt must be an ISO date string' })
  endWindowAt?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'shuffleQuestions must be a boolean' })
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'shuffleOptions must be a boolean' })
  shuffleOptions?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'enableProctoring must be a boolean' })
  enableProctoring?: boolean;

  @IsOptional()
  monitoringConfig?: Record<string, any>;
}
