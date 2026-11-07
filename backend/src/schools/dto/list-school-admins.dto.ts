import { IsOptional, IsString, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus, UserRole } from '@prisma/client';

export class ListSchoolAdminsDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
