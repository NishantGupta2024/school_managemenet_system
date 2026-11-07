import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAcademicYearDto {
  @IsNotEmpty({ message: 'Academic session name is required' })
  @IsString()
  @MaxLength(50, { message: 'Name must not exceed 50 characters' })
  name!: string; // e.g. "2026-2027"

  @IsNotEmpty({ message: 'Start date is required' })
  @IsDateString({}, { message: 'Start date must be a valid ISO date string (YYYY-MM-DD)' })
  startDate!: string;

  @IsNotEmpty({ message: 'End date is required' })
  @IsDateString({}, { message: 'End date must be a valid ISO date string (YYYY-MM-DD)' })
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
