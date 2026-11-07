import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Name must not exceed 50 characters' })
  name?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO date string (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO date string (YYYY-MM-DD)' })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
