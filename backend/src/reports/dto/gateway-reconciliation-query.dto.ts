import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum ReconciliationFilterStatus {
  ALL = 'ALL',
  UNRESOLVED_ONLY = 'UNRESOLVED_ONLY',
  RESOLVED_ONLY = 'RESOLVED_ONLY',
}

export class GatewayReconciliationQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
  endDate?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsEnum(ReconciliationFilterStatus, {
    message: `status must be one of: ${Object.values(ReconciliationFilterStatus).join(', ')}`,
  })
  status?: ReconciliationFilterStatus;
}
