import { IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryChaptersDto {
  @IsOptional()
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId?: string;

  @IsOptional()
  @IsString()
  subject?: string;
}
