import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AllowedImportCondition {
  NEW = 'NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
}

export class ValidatedCatalogueCopyRowDto {
  @IsInt()
  @Min(2)
  rowNumber: number;

  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Author is required' })
  @MaxLength(255)
  author: string;

  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  @MaxLength(100)
  category: string;

  @IsString()
  @IsNotEmpty({ message: 'Accession Number is required' })
  @MaxLength(100)
  accessionNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  isbn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  publisher?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  edition?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(2100)
  publicationYear?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  language?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rackLocation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shelfLocation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsOptional()
  @IsEnum(AllowedImportCondition, {
    message: 'Condition must be NEW, GOOD, or FAIR (blank defaults to GOOD)',
  })
  condition?: AllowedImportCondition | null;

  @IsOptional()
  @IsNumber({}, { message: 'Purchase Price must be a valid number' })
  @Min(0)
  purchasePrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class ConfirmCatalogueImportDto {
  @IsArray({ message: 'rows must be an array of validated rows' })
  @ValidateNested({ each: true })
  @Type(() => ValidatedCatalogueCopyRowDto)
  rows: ValidatedCatalogueCopyRowDto[];
}

export interface CatalogueImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  newTitlesCount: number;
  existingTitlesCount: number;
  canImport: boolean;
  validRows: ValidatedCatalogueCopyRowDto[];
  invalidRows: { rowNumber: number; data: any; errors: string[] }[];
  duplicateRows: { rowNumber: number; accessionNumber: string; barcode?: string; reason: string; data: any }[];
  summaryMessage: string;
}

export interface CatalogueImportConfirmResult {
  totalSubmitted: number;
  titlesCreated: number;
  copiesInserted: number;
  booksUpdated: number;
  message: string;
}
