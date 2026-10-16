-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('RECEIPT_ISSUED', 'PAYMENT_REVERSED', 'REFUND_SUCCEEDED', 'REFUND_FAILED');

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "eventType" "NotificationEventType" NOT NULL,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "templateKey" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_attempts" (
    "id" TEXT NOT NULL,
    "notificationOutboxId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "outcome" "NotificationStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "retryScheduled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_notification_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "receiptEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentReversalEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "refundSuccessEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "refundFailureEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "senderDisplayName" TEXT,
    "replyToEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notification_outbox_status_lockedAt_idx" ON "notification_outbox"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "notification_outbox_schoolId_status_idx" ON "notification_outbox"("schoolId", "status");

-- CreateIndex
CREATE INDEX "notification_outbox_schoolId_eventType_idx" ON "notification_outbox"("schoolId", "eventType");

-- CreateIndex
CREATE INDEX "notification_outbox_schoolId_createdAt_idx" ON "notification_outbox"("schoolId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_schoolId_id_key" ON "notification_outbox"("schoolId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_schoolId_idempotencyKey_key" ON "notification_outbox"("schoolId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_notificationOutboxId_created_idx" ON "notification_delivery_attempts"("notificationOutboxId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_attempts_notificationOutboxId_attempt_key" ON "notification_delivery_attempts"("notificationOutboxId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "school_notification_settings_schoolId_key" ON "school_notification_settings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "school_notification_settings_schoolId_id_key" ON "school_notification_settings"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_notificationOutboxId_fkey" FOREIGN KEY ("notificationOutboxId") REFERENCES "notification_outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_notification_settings" ADD CONSTRAINT "school_notification_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
