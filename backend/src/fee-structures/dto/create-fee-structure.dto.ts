import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeeFrequency } from '@prisma/client';

export class CreateFeeStructureItemDto {
  @IsUUID('4', { message: 'feeHeadId must be a valid UUID' })
  @IsNotEmpty()
  feeHeadId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount!: number;

  @IsEnum(FeeFrequency, { message: 'Invalid fee frequency' })
  frequency!: FeeFrequency;

  @IsOptional()
  isOptional?: boolean;
}

export class CreateFeeStructureDto {
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  @IsNotEmpty()
  academicYearId!: string;

  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  @IsNotEmpty()
  gradeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFeeStructureItemDto)
  items!: CreateFeeStructureItemDto[];
}
