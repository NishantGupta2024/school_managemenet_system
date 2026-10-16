import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  FeeHeadCategory,
  FineDayCountPolicy,
  FineRuleStatus,
  FineType,
} from '@prisma/client';

export class CreateFineRuleDto {
  @IsNotEmpty({ message: 'Academic year ID is required' })
  @IsUUID('4', { message: 'Academic year ID must be a valid UUID' })
  academicYearId: string;

  @IsNotEmpty({ message: 'Rule name is required' })
  @IsString({ message: 'Rule name must be a string' })
  @MaxLength(150, { message: 'Rule name cannot exceed 150 characters' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsNotEmpty({ message: 'Fine type is required' })
  @IsEnum(FineType, { message: 'Fine type must be FIXED, PER_DAY, or PERCENTAGE' })
  fineType: FineType;

  @IsNotEmpty({ message: 'Fine value is required' })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Fine value must be a valid monetary number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'Fine value must be greater than 0' })
  @Max(9999999999.99, { message: 'Fine value exceeds maximum permitted precision' })
  fineValue: number;

  @IsOptional()
  @IsInt({ message: 'Grace period days must be an integer' })
  @Min(0, { message: 'Grace period days cannot be negative' })
  @Max(365, { message: 'Grace period days cannot exceed 365 days' })
  gracePeriodDays?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Maximum fine cap must be a valid monetary number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'Maximum fine cap must be greater than 0 when specified' })
  @Max(9999999999.99, { message: 'Maximum fine cap exceeds maximum permitted precision' })
  maxFineCap?: number | null;

  @IsOptional()
  @IsEnum(FineDayCountPolicy, {
    message: 'Day count policy must be CALENDAR_DAYS or WORKING_DAYS',
  })
  dayCountPolicy?: FineDayCountPolicy;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID('4', { message: 'Applicable fee head ID must be a valid UUID' })
  applicableFeeHeadId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsEnum(FeeHeadCategory, {
    message:
      'Applicable category must be ACADEMIC, FACILITY, INSTITUTIONAL, ACTIVITY, or MISCELLANEOUS',
  })
  applicableCategory?: FeeHeadCategory | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsDateString({}, { message: 'Effective start date must be a valid ISO date string' })
  effectiveStartDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsDateString({}, { message: 'Effective end date must be a valid ISO date string' })
  effectiveEndDate?: string | null;

  @IsOptional()
  @IsEnum(FineRuleStatus, { message: 'Status must be ACTIVE or INACTIVE' })
  status?: FineRuleStatus;
}
