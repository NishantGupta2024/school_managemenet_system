import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PreflightCompleteDto {
  @IsOptional()
  preflightData?: Record<string, any>;
}

export class StudentExplanationDto {
  @IsNotEmpty({ message: 'Explanation text is required' })
  @IsString()
  @MaxLength(500, { message: 'Explanation cannot exceed 500 characters' })
  explanation!: string;
}

export class UploadSampleDto {
  @IsNotEmpty({ message: 'Upload data payload is required' })
  @IsString()
  @MaxLength(150000, { message: 'Upload sample exceeds maximum diagnostic payload size' })
  data!: string;
}
