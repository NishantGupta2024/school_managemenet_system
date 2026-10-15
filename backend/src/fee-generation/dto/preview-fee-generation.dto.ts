import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class PreviewFeeGenerationDto {
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  @IsNotEmpty()
  academicYearId!: string;

  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  @IsOptional()
  gradeId?: string;
}
