import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class PreviewFineCalculationDto {
  @IsNotEmpty({ message: 'Invoice ID is required' })
  @IsUUID('4', { message: 'Invoice ID must be a valid UUID' })
  invoiceId: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID('4', { message: 'Fine rule ID must be a valid UUID' })
  fineRuleId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsDateString({}, { message: 'Evaluation asOfDate must be a valid ISO date string' })
  asOfDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Paid amount must be a valid monetary number with at most 2 decimal places' },
  )
  @Min(0, { message: 'Paid amount cannot be negative' })
  @Max(9999999999.99, { message: 'Paid amount exceeds maximum permitted precision' })
  paidAmount?: number;
}
