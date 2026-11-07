import { IsOptional, IsString } from 'class-validator';

export class LinkStudentParentDto {
  @IsOptional()
  @IsString()
  relationshipType?: string; // e.g. "FATHER", "MOTHER", "GUARDIAN"
}
