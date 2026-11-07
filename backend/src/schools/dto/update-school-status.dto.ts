import { IsEnum, IsNotEmpty } from 'class-validator';
import { TenantStatus } from '@prisma/client';

export class UpdateSchoolStatusDto {
  @IsEnum(TenantStatus, { message: 'Status must be ACTIVE, INACTIVE, or SUSPENDED' })
  @IsNotEmpty({ message: 'Status is required' })
  status!: TenantStatus;
}
