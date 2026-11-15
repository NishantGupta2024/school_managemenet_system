import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookCopyCondition, BookCopyStatus } from '@prisma/client';

export class CreateCopyDto {
  @IsString({ message: 'accessionNumber must be a string' })
  @IsNotEmpty({ message: 'accessionNumber is required' })
  accessionNumber: string;

  @IsOptional()
  @IsString({ message: 'barcode must be a string' })
  barcode?: string;

  @IsOptional()
  @IsString({ message: 'rackLocation must be a string' })
  rackLocation?: string;

  @IsOptional()
  @IsString({ message: 'shelfLocation must be a string' })
  shelfLocation?: string;

  @IsOptional()
  @IsEnum(BookCopyCondition, {
    message: 'condition must be NEW, GOOD, FAIR, DAMAGED, LOST, or RETIRED',
  })
  condition?: BookCopyCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'purchasePrice must be a valid number' })
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;
}

export class UpdateCopyDto {
  @IsOptional()
  @IsString({ message: 'rackLocation must be a string' })
  rackLocation?: string;

  @IsOptional()
  @IsString({ message: 'shelfLocation must be a string' })
  shelfLocation?: string;

  @IsOptional()
  @IsEnum(BookCopyCondition, {
    message: 'condition must be NEW, GOOD, FAIR, DAMAGED, LOST, or RETIRED',
  })
  condition?: BookCopyCondition;

  @IsOptional()
  @IsEnum(BookCopyStatus, {
    message: 'status must be AVAILABLE, ISSUED, RESERVED, MAINTENANCE, LOST, or RETIRED',
  })
  status?: BookCopyStatus;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;
}
