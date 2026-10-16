import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export enum ImportType {
  STUDENT_MASTER = 'STUDENT_MASTER',
  FEE_ALLOCATION = 'FEE_ALLOCATION',
}

export class PreviewImportDto {
  @IsNotEmpty({ message: 'Academic year ID is required' })
  @IsUUID('4', { message: 'Academic year ID must be a valid UUID' })
  academicYearId: string;

  @IsOptional()
  @IsEnum(ImportType, { message: 'Import type must be STUDENT_MASTER or FEE_ALLOCATION' })
  importType?: ImportType;

  @IsOptional()
  @IsEnum(ImportType, { message: 'Import type must be STUDENT_MASTER or FEE_ALLOCATION' })
  type?: ImportType;
}
