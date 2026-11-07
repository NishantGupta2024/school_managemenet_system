import { IsNotEmpty, IsString, IsEmail, MinLength } from 'class-validator';

export class CreateSchoolAdminDto {
  @IsNotEmpty({ message: 'Administrator name is required' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email address is required' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
