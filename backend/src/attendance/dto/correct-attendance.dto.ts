import { IsEnum, IsString, MinLength } from 'class-validator';
import { AttendanceStatus } from '../types';

export class CorrectAttendanceDto {
  @IsEnum(AttendanceStatus, {
    message: 'Status must be PRESENT, ABSENT, LATE, HALF_DAY, or EXCUSED',
  })
  status: AttendanceStatus;

  @IsString({ message: 'Correction reason must be provided as text' })
  @MinLength(5, { message: 'Correction reason must be at least 5 characters long for auditability' })
  reason: string;
}
