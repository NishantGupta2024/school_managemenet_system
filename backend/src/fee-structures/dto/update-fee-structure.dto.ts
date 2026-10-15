import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeeStructureStatus } from '@prisma/client';
import { CreateFeeStructureItemDto } from './create-fee-structure.dto';

export class UpdateFeeStructureDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsEnum(FeeStructureStatus)
  @IsOptional()
  status?: FeeStructureStatus;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateFeeStructureItemDto)
  items?: CreateFeeStructureItemDto[];
}
