import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  GatewayProvider,
  GatewayEnvironment,
  GatewayStatus,
} from '@prisma/client';

export class ConfigurePaymentGatewayDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(120, { message: 'Merchant name must not exceed 120 characters' })
  merchantName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Razorpay Key ID is required' })
  @MinLength(10, { message: 'Key ID must be at least 10 characters' })
  @MaxLength(64, { message: 'Key ID must not exceed 64 characters' })
  @Matches(/^rzp_(test|live)_[a-zA-Z0-9]+$/, {
    message:
      'Key ID must follow Razorpay format: rzp_test_<alphanumeric> or rzp_live_<alphanumeric>',
  })
  keyId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'Key Secret must be at least 8 characters' })
  @MaxLength(128, { message: 'Key Secret must not exceed 128 characters' })
  keySecret?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(128, { message: 'Webhook Secret must not exceed 128 characters' })
  webhookSecret?: string;

  @IsEnum(GatewayEnvironment, {
    message: 'Environment must be either TEST or LIVE',
  })
  @IsOptional()
  environment?: GatewayEnvironment = GatewayEnvironment.TEST;

  @IsEnum(GatewayStatus, {
    message: 'Status must be DISABLED, PENDING_VERIFICATION, or ACTIVE',
  })
  @IsOptional()
  status?: GatewayStatus;
}

export class PaymentGatewayConfigResponseDto {
  id!: string;
  schoolId!: string;
  provider!: GatewayProvider;
  merchantName!: string | null;
  keyId!: string;
  keySecretMasked!: string;
  hasKeySecret!: boolean;
  hasWebhookSecret!: boolean;
  webhookSecretMasked!: string | null;
  environment!: GatewayEnvironment;
  status!: GatewayStatus;
  lastVerifiedAt!: Date | null;
  lastVerificationError!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class VerifyGatewayResultDto {
  success!: boolean;
  status!: GatewayStatus;
  message!: string;
  testedAt!: Date;
  error?: string | null;
}
