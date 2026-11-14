-- Migration: 20261113233500_add_object_detected_to_violation_event_type
-- Purpose: Add Examination Proctoring & Integrity Monitoring schema (ViolationEventType enum including OBJECT_DETECTED, Assessment & AssessmentAttempt proctoring fields, and assessment_violation_events table).
-- Safety: Strictly additive and idempotent. Zero data deletion or modification.

-- 1. Create ViolationEventType enum if it does not exist, and ensure OBJECT_DETECTED is present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ViolationEventType') THEN
        CREATE TYPE "ViolationEventType" AS ENUM (
            'FULLSCREEN_EXIT',
            'TAB_BLUR',
            'VISIBILITY_HIDDEN',
            'MULTIPLE_FACES',
            'NO_FACE',
            'SUSPICIOUS_AUDIO',
            'NETWORK_ANOMALY',
            'OBJECT_DETECTED'
        );
    END IF;
END $$;

ALTER TYPE "ViolationEventType" ADD VALUE IF NOT EXISTS 'OBJECT_DETECTED';

-- 2. Add proctoring configuration columns to assessments
ALTER TABLE "assessments"
    ADD COLUMN IF NOT EXISTS "enableProctoring" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "monitoringConfig" JSONB;

-- 3. Add proctoring status and explanation columns to assessment_attempts
ALTER TABLE "assessment_attempts"
    ADD COLUMN IF NOT EXISTS "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "preflightData" JSONB,
    ADD COLUMN IF NOT EXISTS "proctoringPassed" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "studentExplanation" VARCHAR(500);

-- 4. Create assessment_violation_events table
CREATE TABLE IF NOT EXISTS "assessment_violation_events" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" "ViolationEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_violation_events_pkey" PRIMARY KEY ("id")
);

-- 5. Create indexes on assessment_violation_events
CREATE INDEX IF NOT EXISTS "assessment_violation_events_attemptId_timestamp_idx"
    ON "assessment_violation_events"("attemptId", "timestamp");

CREATE INDEX IF NOT EXISTS "assessment_violation_events_assessmentId_eventType_idx"
    ON "assessment_violation_events"("assessmentId", "eventType");

CREATE INDEX IF NOT EXISTS "assessment_violation_events_schoolId_studentId_idx"
    ON "assessment_violation_events"("schoolId", "studentId");

-- 6. Add foreign key constraints on assessment_violation_events
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assessment_violation_events_schoolId_fkey'
    ) THEN
        ALTER TABLE "assessment_violation_events"
            ADD CONSTRAINT "assessment_violation_events_schoolId_fkey"
            FOREIGN KEY ("schoolId") REFERENCES "schools"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assessment_violation_events_schoolId_assessmentId_fkey'
    ) THEN
        ALTER TABLE "assessment_violation_events"
            ADD CONSTRAINT "assessment_violation_events_schoolId_assessmentId_fkey"
            FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assessment_violation_events_schoolId_attemptId_fkey'
    ) THEN
        ALTER TABLE "assessment_violation_events"
            ADD CONSTRAINT "assessment_violation_events_schoolId_attemptId_fkey"
            FOREIGN KEY ("schoolId", "attemptId") REFERENCES "assessment_attempts"("schoolId", "id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assessment_violation_events_schoolId_studentId_fkey'
    ) THEN
        ALTER TABLE "assessment_violation_events"
            ADD CONSTRAINT "assessment_violation_events_schoolId_studentId_fkey"
            FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
