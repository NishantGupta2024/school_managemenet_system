import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AllocationType, PaymentMethod } from '@prisma/client';

export class ExplicitPaymentAllocationDto {
  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @IsOptional()
  @IsUUID()
  invoiceItemId?: string;

  @IsOptional()
  @IsUUID()
  assessedFineId?: string;

  @IsEnum(AllocationType)
  @IsNotEmpty()
  allocationType: AllocationType; // PRINCIPAL | FINE

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class CollectPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @IsUUID()
  @IsNotEmpty()
  academicYearId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  chequeNumber?: string;

  @IsOptional()
  @IsDateString()
  chequeDate?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExplicitPaymentAllocationDto)
  allocations?: ExplicitPaymentAllocationDto[];
}
