import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Section name must not exceed 20 characters' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Capacity must be an integer' })
  @Min(1, { message: 'Capacity must be at least 1' })
  @Max(200, { message: 'Capacity must not exceed 200' })
  capacity?: number;
}
