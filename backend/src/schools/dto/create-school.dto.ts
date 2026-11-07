import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSchoolDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'School code is required' })
  @MinLength(2, { message: 'School code must be at least 2 characters' })
  @MaxLength(20, { message: 'School code must not exceed 20 characters' })
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'School code must contain only uppercase letters, numbers, underscores, or hyphens',
  })
  code!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'School name is required' })
  @MinLength(2, { message: 'School name must be at least 2 characters' })
  @MaxLength(120, { message: 'School name must not exceed 120 characters' })
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsOptional()
  @MaxLength(10)
  country?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;
}
