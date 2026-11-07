import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @IsNotEmpty()
  @IsEnum(UserStatus, { message: 'Status must be either ACTIVE or INACTIVE' })
  status: UserStatus;
}
