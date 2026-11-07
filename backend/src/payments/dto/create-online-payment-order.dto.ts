import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateOnlinePaymentOrderDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  /**
   * Optional payment amount in INR.
   * If omitted, defaults to the exact server-recomputed outstanding invoice balance.
   * If provided, must be positive, max 2 decimal places, and <= outstanding balance.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  /**
   * Optional idempotency key in payload body.
   * Can also be passed via HTTP header 'idempotency-key'.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
