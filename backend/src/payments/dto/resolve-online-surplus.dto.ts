import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum SurplusResolutionAction {
  OFFLINE_REFUND_PROCESSED = 'OFFLINE_REFUND_PROCESSED',
  EXTERNAL_GATEWAY_REFUND_PROCESSED = 'EXTERNAL_GATEWAY_REFUND_PROCESSED',
  CREDIT_NEXT_CYCLE_PENDING_MIGRATION = 'CREDIT_NEXT_CYCLE_PENDING_MIGRATION',
  ADMINISTRATIVE_ADJUSTMENT = 'ADMINISTRATIVE_ADJUSTMENT',
}

export class ResolveOnlineSurplusDto {
  @IsEnum(SurplusResolutionAction, {
    message: `action must be one of: ${Object.values(SurplusResolutionAction).join(', ')}`,
  })
  action: SurplusResolutionAction;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Reconciliation notes must be at least 10 characters for audit compliance' })
  @MaxLength(1000, { message: 'Reconciliation notes cannot exceed 1000 characters' })
  notes: string;

  @ValidateIf(
    (o) =>
      o.action === SurplusResolutionAction.OFFLINE_REFUND_PROCESSED ||
      o.action === SurplusResolutionAction.EXTERNAL_GATEWAY_REFUND_PROCESSED,
  )
  @IsNotEmpty({
    message:
      'externalReferenceNumber (e.g. bank UTR, cheque reference, or verified gateway refund ID) is required when resolving with an external or offline refund action',
  })
  @IsString()
  @MaxLength(255)
  externalReferenceNumber?: string;
}
