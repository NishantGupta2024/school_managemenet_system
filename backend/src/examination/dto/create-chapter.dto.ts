import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateChapterDto {
  @IsNotEmpty({ message: 'Grade ID is required' })
  @IsUUID('4', { message: 'gradeId must be a valid UUID' })
  gradeId!: string;

  @IsNotEmpty({ message: 'Subject is required' })
  @IsString()
  @MaxLength(100, { message: 'Subject must not exceed 100 characters' })
  subject!: string;

  @IsNotEmpty({ message: 'Chapter code is required' })
  @IsString()
  @MaxLength(50, { message: 'Chapter code must not exceed 50 characters' })
  chapterCode!: string;

  @IsNotEmpty({ message: 'Chapter title is required' })
  @IsString()
  @MaxLength(200, { message: 'Chapter title must not exceed 200 characters' })
  title!: string;

  @IsOptional()
  @IsInt({ message: 'orderIndex must be an integer' })
  @Min(0, { message: 'orderIndex cannot be negative' })
  orderIndex?: number;
}
