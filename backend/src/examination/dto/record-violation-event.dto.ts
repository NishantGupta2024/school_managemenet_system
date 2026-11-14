import { IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { ViolationEventType } from '@prisma/client';

export class RecordViolationEventDto {
  @IsNotEmpty({ message: 'eventType is required' })
  @IsEnum(ViolationEventType, { message: 'Invalid violation event type' })
  eventType!: ViolationEventType;

  @IsOptional()
  @IsInt({ message: 'durationMs must be an integer' })
  @Min(0)
  @Max(3600000)
  durationMs?: number;

  @IsOptional()
  metadata?: Record<string, any>;
}
