import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ProvisionTeacherAccountDto {
  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  email?: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}
