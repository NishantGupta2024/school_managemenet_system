import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BorrowerType, LoanStatus, BookCopyCondition } from '@prisma/client';

export class IssueBookDto {
  @IsUUID('4', { message: 'copyId must be a valid UUID' })
  @IsNotEmpty({ message: 'copyId is required' })
  copyId: string;

  @IsOptional()
  @IsEnum(BorrowerType, { message: 'borrowerType must be STUDENT, TEACHER, or STAFF' })
  borrowerType?: BorrowerType = BorrowerType.STUDENT;

  @IsOptional()
  @IsUUID('4', { message: 'studentId must be a valid UUID' })
  studentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'teacherId must be a valid UUID' })
  teacherId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dueDate must be a valid ISO date string' })
  dueDate?: string;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;
}

export class ReturnBookDto {
  @IsOptional()
  @IsUUID('4', { message: 'copyId must be a valid UUID' })
  copyId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'loanId must be a valid UUID' })
  loanId?: string;

  @IsOptional()
  @IsEnum(BookCopyCondition, {
    message: 'condition must be NEW, GOOD, FAIR, DAMAGED, LOST, or RETIRED',
  })
  condition?: BookCopyCondition;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;
}

export class RenewBookDto {
  @IsUUID('4', { message: 'loanId must be a valid UUID' })
  @IsNotEmpty({ message: 'loanId is required' })
  loanId: string;
}

export class LoanQueryDto {
  @IsOptional()
  @IsEnum(LoanStatus, { message: 'status must be ACTIVE, RETURNED, OVERDUE, or LOST' })
  status?: LoanStatus;

  @IsOptional()
  @IsEnum(BorrowerType, { message: 'borrowerType must be STUDENT, TEACHER, or STAFF' })
  borrowerType?: BorrowerType;

  @IsOptional()
  @IsUUID('4', { message: 'studentId must be a valid UUID' })
  studentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'teacherId must be a valid UUID' })
  teacherId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'copyId must be a valid UUID' })
  copyId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdueOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
