import { IsIn, IsOptional } from 'class-validator';

export class SaveAnswerDto {
  @IsOptional()
  @IsIn([0, 1, 2, 3, null], {
    message: 'selectedOption must be an integer between 0 and 3, or null to clear',
  })
  selectedOption!: number | null;
}
