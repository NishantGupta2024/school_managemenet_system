import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssessmentMode } from '../types';

export class CreateAssessmentDraftDto {
  @IsNotEmpty({ message: 'Academic year ID is required' })
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId!: string;

  @IsNotEmpty({ message: 'Grade ID is required' })
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId?: string;

  @IsNotEmpty({ message: 'Chapter ID is required' })
  @IsUUID('4', { message: 'chapterId must be a valid UUID' })
  chapterId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'teacherId must be a valid UUID' })
  teacherId?: string;

  @IsNotEmpty({ message: 'Title is required' })
  @IsString()
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must not exceed 2000 characters' })
  description?: string;

  @IsNotEmpty({ message: 'Subject is required' })
  @IsString()
  @MaxLength(100, { message: 'Subject must not exceed 100 characters' })
  subject!: string;

  @IsOptional()
  @IsEnum(AssessmentMode, { message: 'Invalid assessment mode' })
  mode?: AssessmentMode;

  @IsNotEmpty({ message: 'Total marks is required' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'totalMarks must be a valid decimal' })
  @Min(1.0, { message: 'totalMarks must be at least 1.00' })
  @Max(5000.0, { message: 'totalMarks cannot exceed 5000.00' })
  totalMarks!: number;

  @IsNotEmpty({ message: 'Passing marks is required' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'passingMarks must be a valid decimal' })
  @Min(0.0, { message: 'passingMarks cannot be negative' })
  passingMarks!: number;

  @IsNotEmpty({ message: 'Duration in minutes is required' })
  @IsInt({ message: 'durationMinutes must be an integer' })
  @Min(1, { message: 'durationMinutes must be at least 1' })
  @Max(1440, { message: 'durationMinutes cannot exceed 1440 (24 hours)' })
  durationMinutes!: number;

  @IsOptional()
  @IsDateString({}, { message: 'startWindowAt must be an ISO date string' })
  startWindowAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endWindowAt must be an ISO date string' })
  endWindowAt?: string;

  @IsOptional()
  @IsBoolean({ message: 'shuffleQuestions must be a boolean' })
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'shuffleOptions must be a boolean' })
  shuffleOptions?: boolean;
}
