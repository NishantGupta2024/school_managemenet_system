import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReceiptTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
