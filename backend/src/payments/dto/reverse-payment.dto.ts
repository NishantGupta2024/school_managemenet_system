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
import { ReversalType } from '@prisma/client';

export class ReversalAllocationItemDto {
  @IsUUID()
  @IsNotEmpty()
  allocationId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Reversal allocation amount must be greater than zero' })
  amount: number;
}

export class ReversePaymentDto {
  @IsEnum(ReversalType, {
    message: 'reversalType must be one of: VOID, BOUNCE, CORRECTION',
  })
  @IsNotEmpty()
  reversalType: ReversalType;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Reversal reason must be at least 10 characters for audit compliance' })
  reason: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReversalAllocationItemDto)
  allocations?: ReversalAllocationItemDto[];
}
