import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum QueueStatusFilter {
  ALL = 'ALL',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}

export class ReconciliationQueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(QueueStatusFilter, {
    message: `status must be one of: ${Object.values(QueueStatusFilter).join(', ')}`,
  })
  status?: QueueStatusFilter = QueueStatusFilter.PENDING;
}
