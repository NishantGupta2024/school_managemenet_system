import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateParentDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Parent name must be at least 2 characters long' })
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
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];

  @IsOptional()
  @IsString()
  relationshipType?: string; // e.g. "FATHER", "MOTHER", "GUARDIAN"
}
