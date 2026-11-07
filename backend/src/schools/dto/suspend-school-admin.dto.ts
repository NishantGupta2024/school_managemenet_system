import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SuspendSchoolAdminDto {
  @IsNotEmpty({ message: 'Suspension reason is required' })
  @IsString()
  @MinLength(3, { message: 'Reason must be at least 3 characters long' })
  reason: string;
}
