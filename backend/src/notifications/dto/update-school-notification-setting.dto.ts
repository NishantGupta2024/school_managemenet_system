import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSchoolNotificationSettingDto {
  @IsOptional()
  @IsBoolean()
  receiptEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentReversalEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  refundSuccessEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  refundFailureEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  feeReminderEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  studentAdmissionEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  attendanceAbsenceEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  examScheduleEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  examResultsEmailEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Sender display name cannot exceed 100 characters' })
  senderDisplayName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Reply-to must be a valid email address' })
  @MaxLength(255, { message: 'Reply-to email cannot exceed 255 characters' })
  replyToEmail?: string;
}
