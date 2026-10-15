import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AllocationStatus, ConcessionType } from '@prisma/client';

export class UpdateStudentAllocationDto {
  @IsUUID('4', { message: 'feeStructureId must be a valid UUID' })
  @IsOptional()
  feeStructureId?: string;

  @IsEnum(ConcessionType, { message: 'Invalid concession type' })
  @IsOptional()
  concessionType?: ConcessionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Concession value cannot be negative' })
  @IsOptional()
  concessionValue?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  concessionReason?: string;

  @IsArray()
  @IsUUID('4', { each: true, message: 'Each opted fee head ID must be a valid UUID' })
  @IsOptional()
  optedFeeHeadIds?: string[];

  @IsEnum(AllocationStatus)
  @IsOptional()
  status?: AllocationStatus;
}
