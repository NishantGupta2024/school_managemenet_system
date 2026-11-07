import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export class ListUsersDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
