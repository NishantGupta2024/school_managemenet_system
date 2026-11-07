import { IsEnum, IsInt, IsOptional, IsString, IsDateString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel, NotificationEventType, NotificationStatus } from '@prisma/client';

export class QueryNotificationLogsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NotificationEventType)
  eventType?: NotificationEventType;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
