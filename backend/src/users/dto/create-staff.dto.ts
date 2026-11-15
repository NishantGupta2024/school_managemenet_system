import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateStaffDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Staff name must be at least 2 characters long' })
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

  @IsOptional()
  @IsIn([UserRole.FEE_STAFF, UserRole.LIBRARIAN], {
    message: 'Staff role must be either FEE_STAFF or LIBRARIAN',
  })
  role?: UserRole;
}
