import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StudentStatus } from '@prisma/client';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Admission number must not exceed 50 characters' })
  admissionNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  lastName?: string;

  @IsOptional()
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Roll number must not exceed 50 characters' })
  rollNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date (YYYY-MM-DD)' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'Guardian name must not exceed 150 characters' })
  guardianName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Guardian phone must not exceed 30 characters' })
  guardianPhone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Guardian email must be a valid email address' })
  guardianEmail?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Admission date must be a valid date (YYYY-MM-DD)' })
  admissionDate?: string;

  @IsOptional()
  @IsEnum(StudentStatus, { message: 'Status must be ACTIVE, PROMOTED, TRANSFERRED, or ALUMNI' })
  status?: StudentStatus;
}
