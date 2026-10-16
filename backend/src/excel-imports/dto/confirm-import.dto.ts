import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
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
  rows: Record<string, any>[];
}
