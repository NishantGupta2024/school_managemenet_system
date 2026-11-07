import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateGradeDto {
  @IsNotEmpty({ message: 'Grade name is required' })
  @IsString()
  @MaxLength(100, { message: 'Grade name must not exceed 100 characters' })
  name!: string; // e.g. "Grade 10"

  @IsNotEmpty({ message: 'Grade code is required' })
  @IsString()
  @MaxLength(20, { message: 'Grade code must not exceed 20 characters' })
  code!: string; // e.g. "G10"
}
