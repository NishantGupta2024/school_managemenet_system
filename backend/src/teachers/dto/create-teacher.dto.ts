import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TeacherStatus } from '../types';

export class CreateTeacherDto {
  @IsNotEmpty({ message: 'Employee ID is required' })
  @IsString()
  @MaxLength(50, { message: 'Employee ID must not exceed 50 characters' })
  employeeId!: string;

  @IsNotEmpty({ message: 'First name is required' })
  @IsString()
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  firstName!: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString()
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  lastName!: string;

  @IsNotEmpty({ message: 'Email address is required' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Phone must not exceed 30 characters' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Department must not exceed 100 characters' })
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Designation must not exceed 100 characters' })
  designation?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Joining date must be a valid date (YYYY-MM-DD)' })
  joiningDate?: string;

  @IsOptional()
  @IsEnum(TeacherStatus, { message: 'Status must be ACTIVE, INACTIVE, or ON_LEAVE' })
  status?: TeacherStatus;
}
