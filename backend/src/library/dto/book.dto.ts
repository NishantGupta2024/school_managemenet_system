import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookDto {
  @IsString({ message: 'title must be a string' })
  @IsNotEmpty({ message: 'title is required' })
  title: string;

  @IsString({ message: 'author must be a string' })
  @IsNotEmpty({ message: 'author is required' })
  author: string;

  @IsString({ message: 'category must be a string' })
  @IsNotEmpty({ message: 'category is required' })
  category: string;

  @IsOptional()
  @IsString({ message: 'isbn must be a string' })
  isbn?: string;

  @IsOptional()
  @IsString({ message: 'publisher must be a string' })
  publisher?: string;

  @IsOptional()
  @IsString({ message: 'edition must be a string' })
  edition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'publicationYear must be an integer' })
  @Min(1000)
  @Max(2100)
  publicationYear?: number;

  @IsOptional()
  @IsString({ message: 'language must be a string' })
  language?: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'author must be a string' })
  author?: string;

  @IsOptional()
  @IsString({ message: 'category must be a string' })
  category?: string;

  @IsOptional()
  @IsString({ message: 'isbn must be a string' })
  isbn?: string;

  @IsOptional()
  @IsString({ message: 'publisher must be a string' })
  publisher?: string;

  @IsOptional()
  @IsString({ message: 'edition must be a string' })
  edition?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'publicationYear must be an integer' })
  publicationYear?: number;

  @IsOptional()
  @IsString({ message: 'language must be a string' })
  language?: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;
}

export class BookQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
