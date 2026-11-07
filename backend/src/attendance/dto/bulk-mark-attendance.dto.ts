import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceStatus } from '../types';

export class AttendanceEntryDto {
  @IsUUID('4', { message: 'studentId must be a valid UUID' })
  studentId: string;

  @IsEnum(AttendanceStatus, {
    message: 'Status must be PRESENT, ABSENT, LATE, HALF_DAY, or EXCUSED',
  })
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkMarkAttendanceDto {
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId: string;

  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId: string;

  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId: string;

  @IsDateString({}, { message: 'attendanceDate must be a valid ISO date string (YYYY-MM-DD)' })
  attendanceDate: string;

  @IsArray({ message: 'entries must be an array of attendance records' })
  @ArrayMinSize(1, { message: 'entries array must contain at least one student attendance record' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}
