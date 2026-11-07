import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AcademicYearFormat } from '@prisma/client';

export class PreviewReceiptNumberDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Receipt prefix is required' })
  @Matches(/^[A-Z0-9]{2,10}$/, {
    message: 'Receipt prefix must be 2 to 10 alphanumeric characters (uppercase only)',
  })
  prefix: string;

  @IsEnum(AcademicYearFormat, {
    message: 'Academic year format must be SHORT_6DIGIT, FULL_8DIGIT, START_YEAR_4DIGIT, or NONE',
  })
  yearFormat: AcademicYearFormat;

  @IsInt({ message: 'Sequence padding digits must be an integer' })
  @Min(4, { message: 'Sequence padding digits must be at least 4' })
  @Max(8, { message: 'Sequence padding digits cannot exceed 8' })
  paddingDigits: number;

  @IsString()
  @IsIn(['-', '/', ''], {
    message: 'Separator must be hyphen ("-"), slash ("/"), or empty ("")',
  })
  separator: string;

  @IsOptional()
  @IsString()
  sampleYearName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSequence?: number;
}
