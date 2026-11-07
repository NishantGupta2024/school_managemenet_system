import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateQuestionDto {
  @IsNotEmpty({ message: 'Question text is required' })
  @IsString({ message: 'Question text must be a string' })
  @MaxLength(5000, { message: 'Question text must not exceed 5000 characters' })
  questionText!: string;

  @IsArray({ message: 'Options must be an array of strings' })
  @ArrayMinSize(4, { message: 'Options must contain exactly 4 choices' })
  @ArrayMaxSize(4, { message: 'Options must contain exactly 4 choices' })
  @IsString({ each: true, message: 'Each option must be a string' })
  @MaxLength(1000, { each: true, message: 'Each option must not exceed 1000 characters' })
  options!: string[];

  @IsNotEmpty({ message: 'Correct option index is required' })
  @IsInt({ message: 'Correct option must be an integer index' })
  @Min(0, { message: 'Correct option index must be between 0 and 3' })
  @Max(3, { message: 'Correct option index must be between 0 and 3' })
  correctOption!: number;

  @IsNotEmpty({ message: 'Marks is required' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Marks must be a valid number with up to 2 decimal places' })
  @Min(0.01, { message: 'Marks must be greater than 0.00' })
  @Max(500.0, { message: 'Marks cannot exceed 500.00' })
  marks!: number;

  @IsOptional()
  @IsInt({ message: 'orderIndex must be an integer' })
  @Min(0, { message: 'orderIndex must be non-negative' })
  orderIndex?: number;

  @IsOptional()
  @IsUUID('4', { message: 'sectionId must be a valid UUID' })
  sectionId?: string;

  @IsOptional()
  @IsString({ message: 'Explanation must be a string' })
  @MaxLength(2000, { message: 'Explanation must not exceed 2000 characters' })
  explanation?: string;
}
