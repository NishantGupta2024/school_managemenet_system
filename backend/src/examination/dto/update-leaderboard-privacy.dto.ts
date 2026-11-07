import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateLeaderboardPrivacyDto {
  @IsNotEmpty()
  @IsBoolean()
  showStudentNamesOnLeaderboards: boolean;
}
