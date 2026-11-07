-- AlterEnum: Add new notification event types
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'FEE_DUE_REMINDER';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'STUDENT_ADMITTED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_ABSENT';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'EXAM_SCHEDULE_PUBLISHED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'EXAM_RESULTS_RELEASED';

-- AlterTable: Add school notification preference fields
ALTER TABLE "school_notification_settings" 
    ADD COLUMN IF NOT EXISTS "feeReminderEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "studentAdmissionEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "attendanceAbsenceEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "examScheduleEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "examResultsEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
