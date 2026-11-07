import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Must be a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email!: string;

  @IsString()
  @IsOptional()
  schoolId?: string;
}
