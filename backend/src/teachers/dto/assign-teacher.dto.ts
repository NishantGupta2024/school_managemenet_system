import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AssignTeacherDto {
  @IsNotEmpty({ message: 'Academic year is required' })
  @IsUUID('4', { message: 'academicYearId must be a valid UUID' })
  academicYearId!: string;

  @IsNotEmpty({ message: 'Grade / Class is required' })
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId!: string;

  @IsNotEmpty({ message: 'Section is required' })
  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Subject must not exceed 100 characters' })
  subject?: string;

  @IsOptional()
  @IsBoolean({ message: 'isClassTeacher must be a boolean' })
  isClassTeacher?: boolean;
}
