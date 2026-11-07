import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ProvisionStudentAccountDto {
  @IsNotEmpty()
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;

  @IsOptional()
  @IsString()
  name?: string;
}
