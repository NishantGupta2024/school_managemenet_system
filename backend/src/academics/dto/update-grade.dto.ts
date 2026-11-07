import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGradeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Grade name must not exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Grade code must not exceed 20 characters' })
  code?: string;
}
