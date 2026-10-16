import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ImportType } from './preview-import.dto';

export class ConfirmImportDto {
  @IsNotEmpty({ message: 'Academic year ID is required' })
  @IsUUID('4', { message: 'Academic year ID must be a valid UUID' })
  academicYearId: string;

  @IsOptional()
  @IsEnum(ImportType, { message: 'Import type must be STUDENT_MASTER or FEE_ALLOCATION' })
  importType?: ImportType;

  @IsOptional()
  @IsEnum(ImportType, { message: 'Import type must be STUDENT_MASTER or FEE_ALLOCATION' })
  type?: ImportType;

  @IsArray({ message: 'Rows must be provided as an array' })
  @IsNotEmpty({ message: 'Rows cannot be empty' })
  @ArrayMinSize(1, { message: 'At least one row is required for import confirmation' })
  @ArrayMaxSize(1000, { message: 'Cannot confirm more than 1,000 rows in a single batch' })
  rows: Record<string, any>[];
}

