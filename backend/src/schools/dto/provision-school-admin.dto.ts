import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ProvisionSchoolAdminDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Administrator name must be at least 2 characters long' })
  name: string;

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
}
