import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RefundStatus } from '@prisma/client';

export class RefundAllocationItemDto {
  @IsUUID()
  @IsNotEmpty()
  allocationId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Refund allocation amount must be greater than zero' })
  amount: number;
}

export class CreatePaymentRefundDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Refund amount must be greater than zero' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Refund reason must be at least 10 characters for audit compliance' })
  reason: string;

  @IsOptional()
  @IsString()
  mode?: string; // CASH, BANK_TRANSFER, UPI, CHEQUE, etc.

  @IsOptional()
  @IsString()
  referenceNumber?: string; // External bank UTR or voucher number

  @IsOptional()
  @IsEnum(RefundStatus, {
    message: 'Initial refund status must be either SUCCEEDED or PENDING',
  })
  status?: RefundStatus; // Defaults to SUCCEEDED for confirmed direct payouts

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundAllocationItemDto)
  allocations?: RefundAllocationItemDto[];
}

export class UpdateRefundStatusDto {
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Reason must be at least 5 characters' })
  reason?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;
}
