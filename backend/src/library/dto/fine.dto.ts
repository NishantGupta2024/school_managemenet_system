import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LibraryFineStatus, BorrowerType } from '@prisma/client';

export class FineQueryDto {
  @IsOptional()
  @IsEnum(LibraryFineStatus, {
    message: 'status must be PENDING, PAID, PARTIALLY_PAID, or WAIVED',
  })
  status?: LibraryFineStatus;

  @IsOptional()
  @IsEnum(BorrowerType, { message: 'borrowerType must be STUDENT, TEACHER, or STAFF' })
  borrowerType?: BorrowerType;

  @IsOptional()
  @IsUUID('4', { message: 'studentId must be a valid UUID' })
  studentId?: string;

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

export class CollectFineDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'paidAmount must be a valid number' })
  @Min(0.01, { message: 'paidAmount must be greater than 0' })
  paidAmount?: number;

  @IsOptional()
  @IsString({ message: 'paymentReference must be a string' })
  paymentReference?: string;
}

export class WaiveFineDto {
  @IsString({ message: 'waiveReason must be a string' })
  @IsNotEmpty({ message: 'waiveReason is required' })
  @MinLength(5, { message: 'waiveReason must be at least 5 characters long for auditability' })
  waiveReason: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'waiveAmount must be a valid number' })
  @Min(0.01, { message: 'waiveAmount must be greater than 0' })
  waiveAmount?: number;
}
