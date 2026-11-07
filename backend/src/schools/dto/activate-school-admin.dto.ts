import { IsOptional, IsString } from 'class-validator';

export class ActivateSchoolAdminDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
