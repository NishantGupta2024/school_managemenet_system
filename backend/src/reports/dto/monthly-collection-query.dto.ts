import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class MonthlyCollectionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'year must be an integer' })
  @Min(2000, { message: 'year must be at least 2000' })
  @Max(2100, { message: 'year cannot exceed 2100' })
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'month must be an integer between 1 and 12' })
  @Min(1, { message: 'month must be at least 1' })
  @Max(12, { message: 'month cannot exceed 12' })
  month?: number;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod, {
    message: `paymentMethod must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod?: PaymentMethod;
}
