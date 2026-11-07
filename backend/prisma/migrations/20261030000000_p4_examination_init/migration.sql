-- Migration: 20261030000000_p4_examination_init
-- Unified School ERP Phase 4: Examination & Assessment Management Tier
-- Strictly additive. Zero modification or deletion of existing financial or academic objects.

-- =========================================================================
-- 1. Create Enums
-- =========================================================================

DO $$ BEGIN
  CREATE TYPE "AssessmentMode" AS ENUM ('NORMAL_QUIZ', 'LIVE_EXAM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'RESULTS_RELEASED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ImageArtifactStatus" AS ENUM ('UPLOADED', 'ATTACHED', 'ORPHANED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProgressionAssessmentStatus" AS ENUM (
    'NOT_CONFIGURED',
    'PENDING_OPEN',
    'RESOLVED_SUBMITTED',
    'RESOLVED_TIMED_OUT',
    'MISSED_UNATTEMPTED',
    'OVERRIDDEN'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =========================================================================
-- 2. Create Core Examination Tables
-- =========================================================================

-- 2.1 Assessment Chapters (Curriculum Structure)
CREATE TABLE "assessment_chapters" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "chapterCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessment_chapters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_chapters_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "assessment_chapters_unique_code" UNIQUE ("schoolId", "gradeId", "subject", "chapterCode"),
  CONSTRAINT "fk_assessment_chapters_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_chapters_grade" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grade_classes"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2.2 Assessments (Header & Configuration)
CREATE TABLE "assessments" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "sectionId" TEXT,
  "teacherId" TEXT NOT NULL,
  "chapterId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "subject" TEXT NOT NULL,
  "mode" "AssessmentMode" NOT NULL DEFAULT 'NORMAL_QUIZ',
  "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "totalMarks" DECIMAL(6,2) NOT NULL,
  "passingMarks" DECIMAL(6,2) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "startWindowAt" TIMESTAMP(3),
  "endWindowAt" TIMESTAMP(3),
  "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
  "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessments_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "fk_assessments_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_assessments_academic_year" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessments_grade" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grade_classes"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessments_section" FOREIGN KEY ("schoolId", "sectionId") REFERENCES "sections"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessments_teacher" FOREIGN KEY ("schoolId", "teacherId") REFERENCES "teachers"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessments_chapter" FOREIGN KEY ("schoolId", "chapterId") REFERENCES "assessment_chapters"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2.3 Assessment Sections (Sub-divisions)
CREATE TABLE "assessment_sections" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "instructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessment_sections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_sections_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "assessment_sections_assessmentId_id_key" UNIQUE ("assessmentId", "id"),
  CONSTRAINT "fk_assessment_sections_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_sections_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2.4 Assessment Questions (MCQ Items & Keys)
CREATE TABLE "assessment_questions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "sectionId" TEXT,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "questionText" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "correctOption" INTEGER NOT NULL,
  "marks" DECIMAL(5,2) NOT NULL,
  "explanation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_questions_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "assessment_questions_assessmentId_id_key" UNIQUE ("assessmentId", "id"),
  CONSTRAINT "fk_assessment_questions_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_questions_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_questions_section" FOREIGN KEY ("assessmentId", "sectionId") REFERENCES "assessment_sections"("assessmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2.5 Question Image Artifacts (Question Diagrams)
CREATE TABLE "question_image_artifacts" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "status" "ImageArtifactStatus" NOT NULL DEFAULT 'UPLOADED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "question_image_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_image_artifacts_questionId_key" UNIQUE ("questionId"),
  CONSTRAINT "question_image_artifacts_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "question_image_artifacts_assessment_question_key" UNIQUE ("assessmentId", "questionId"),
  CONSTRAINT "fk_question_image_artifacts_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_question_image_artifacts_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_question_image_artifacts_question" FOREIGN KEY ("assessmentId", "questionId") REFERENCES "assessment_questions"("assessmentId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2.6 Assessment Attempts (Student Sessions)
CREATE TABLE "assessment_attempts" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_attempts_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "assessment_attempts_student_assessment_key" UNIQUE ("assessmentId", "studentId"),
  CONSTRAINT "assessment_attempts_assessmentId_id_key" UNIQUE ("assessmentId", "id"),
  CONSTRAINT "assessment_attempts_assessment_attempt_student_key" UNIQUE ("assessmentId", "id", "studentId"),
  CONSTRAINT "chk_assessment_attempts_deadline_order" CHECK ("deadlineAt" > "startedAt"),
  CONSTRAINT "fk_assessment_attempts_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_attempts_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_attempts_student" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2.7 Attempt Answers (Question Responses)
CREATE TABLE "attempt_answers" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "selectedOption" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attempt_answers_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "attempt_answers_attempt_question_key" UNIQUE ("attemptId", "questionId"),
  CONSTRAINT "fk_attempt_answers_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attempt_answers_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attempt_answers_attempt" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attempt_answers_question" FOREIGN KEY ("questionId") REFERENCES "assessment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_attempt_answers_attempt_composite" FOREIGN KEY ("assessmentId", "attemptId") REFERENCES "assessment_attempts"("assessmentId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attempt_answers_question_composite" FOREIGN KEY ("assessmentId", "questionId") REFERENCES "assessment_questions"("assessmentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2.8 Assessment Results (Final Immutable Scoring)
CREATE TABLE "assessment_results" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "totalQuestions" INTEGER NOT NULL,
  "attemptedQuestions" INTEGER NOT NULL,
  "correctAnswers" INTEGER NOT NULL,
  "incorrectAnswers" INTEGER NOT NULL,
  "score" DECIMAL(6,2) NOT NULL,
  "percentage" DECIMAL(5,2) NOT NULL,
  "isPassing" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_results_attemptId_key" UNIQUE ("attemptId"),
  CONSTRAINT "assessment_results_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "assessment_results_assessmentId_attemptId_studentId_key" UNIQUE ("assessmentId", "attemptId", "studentId"),
  CONSTRAINT "assessment_results_assessmentId_attemptId_key" UNIQUE ("assessmentId", "attemptId"),
  CONSTRAINT "fk_assessment_results_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_results_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_results_attempt" FOREIGN KEY ("assessmentId", "attemptId", "studentId") REFERENCES "assessment_attempts"("assessmentId", "id", "studentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_assessment_results_student" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2.9 Student Assessment Progressions (Gating State)
CREATE TABLE "student_assessment_progressions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "chapterId" TEXT,
  "status" "ProgressionAssessmentStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "unlockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "student_assessment_progressions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_assessment_progressions_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "student_assessment_progressions_student_assessment_key" UNIQUE ("studentId", "assessmentId"),
  CONSTRAINT "fk_progressions_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_progressions_student" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_progressions_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_progressions_chapter" FOREIGN KEY ("schoolId", "chapterId") REFERENCES "assessment_chapters"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =========================================================================
-- 3. Check Constraints for Numerical & Range Integrity
-- =========================================================================

ALTER TABLE "assessments"
  ADD CONSTRAINT "chk_assessments_total_marks_positive"
  CHECK ("totalMarks" >= 1.00);

ALTER TABLE "assessments"
  ADD CONSTRAINT "chk_assessments_passing_marks_range"
  CHECK ("passingMarks" >= 0.00 AND "passingMarks" <= "totalMarks");

ALTER TABLE "assessments"
  ADD CONSTRAINT "chk_assessments_duration_positive"
  CHECK ("durationMinutes" >= 1 AND "durationMinutes" <= 1440);

ALTER TABLE "assessment_questions"
  ADD CONSTRAINT "chk_questions_marks_positive"
  CHECK ("marks" > 0.00 AND "marks" <= 500.00);

ALTER TABLE "assessment_questions"
  ADD CONSTRAINT "chk_questions_correct_option_valid"
  CHECK ("correctOption" IN (0, 1, 2, 3));

-- =========================================================================
-- 4. Native PostgreSQL Immutability & Lifecycle Triggers
-- =========================================================================

-- 4.1 Trigger: Question Paper Immutability
CREATE OR REPLACE FUNCTION trg_enforce_question_paper_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status "AssessmentStatus";
    v_new_status "AssessmentStatus";
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO v_old_status FROM "assessments" WHERE id = OLD."assessmentId";
        IF v_old_status IS NULL THEN
            RAISE EXCEPTION 'Cannot delete question %: parent assessment % not found', OLD.id, OLD."assessmentId"
                USING ERRCODE = 'check_violation';
        ELSIF v_old_status IS DISTINCT FROM 'DRAFT' THEN
            RAISE EXCEPTION 'Cannot delete question % from assessment % with status %', OLD.id, OLD."assessmentId", v_old_status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW."assessmentId" IS DISTINCT FROM OLD."assessmentId" THEN
            RAISE EXCEPTION 'Reassigning questions between assessments is strictly forbidden'
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT status INTO v_new_status FROM "assessments" WHERE id = NEW."assessmentId";
        IF v_new_status IS DISTINCT FROM 'DRAFT' THEN
            RAISE EXCEPTION 'Cannot update question % for assessment % with status %', NEW.id, NEW."assessmentId", v_new_status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    ELSE -- INSERT
        SELECT status INTO v_new_status FROM "assessments" WHERE id = NEW."assessmentId";
        IF v_new_status IS DISTINCT FROM 'DRAFT' THEN
            RAISE EXCEPTION 'Cannot add questions to assessment % with status %', NEW."assessmentId", v_new_status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_paper_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "assessment_questions"
FOR EACH ROW EXECUTE FUNCTION trg_enforce_question_paper_immutability();

-- 4.2 Trigger: Assessment Structural Immutability & Status Reversal Protection
CREATE OR REPLACE FUNCTION trg_enforce_assessment_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Identity immutability
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW."schoolId" IS DISTINCT FROM OLD."schoolId" THEN
        RAISE EXCEPTION 'Assessment identity (id, schoolId) cannot be altered on assessment %', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Status reversion protection
    IF OLD.status IS DISTINCT FROM 'DRAFT' AND NEW.status = 'DRAFT' THEN
        RAISE EXCEPTION 'Illegal lifecycle transition: cannot revert assessment % from % back to DRAFT', OLD.id, OLD.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'ARCHIVED' AND NEW.status IS DISTINCT FROM 'ARCHIVED' THEN
        RAISE EXCEPTION 'Illegal lifecycle transition: cannot reactivate archived assessment %', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Structural and curricular fields frozen once published
    IF OLD.status IN ('PUBLISHED', 'CLOSED', 'RESULTS_RELEASED', 'ARCHIVED') THEN
        IF NEW."totalMarks" IS DISTINCT FROM OLD."totalMarks" OR
           NEW."passingMarks" IS DISTINCT FROM OLD."passingMarks" OR
           NEW."durationMinutes" IS DISTINCT FROM OLD."durationMinutes" OR
           NEW."subject" IS DISTINCT FROM OLD."subject" OR
           NEW."gradeId" IS DISTINCT FROM OLD."gradeId" OR
           NEW."mode" IS DISTINCT FROM OLD."mode" OR
           NEW."academicYearId" IS DISTINCT FROM OLD."academicYearId" OR
           NEW."chapterId" IS DISTINCT FROM OLD."chapterId" OR
           NEW."teacherId" IS DISTINCT FROM OLD."teacherId" OR
           NEW."sectionId" IS DISTINCT FROM OLD."sectionId" OR
           NEW."shuffleQuestions" IS DISTINCT FROM OLD."shuffleQuestions" OR
           NEW."shuffleOptions" IS DISTINCT FROM OLD."shuffleOptions" THEN
            RAISE EXCEPTION 'Structural and curricular fields cannot be modified on published assessment %', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 4. Start window modification protection while PUBLISHED
    IF OLD.status = 'PUBLISHED' AND NEW."startWindowAt" IS DISTINCT FROM OLD."startWindowAt" THEN
        IF EXISTS (SELECT 1 FROM "assessment_attempts" WHERE "assessmentId" = OLD.id) THEN
            RAISE EXCEPTION 'Cannot modify start window after attempts have begun on assessment %', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 5. Schedule locked once CLOSED, RESULTS_RELEASED, or ARCHIVED
    IF OLD.status IN ('CLOSED', 'RESULTS_RELEASED', 'ARCHIVED') THEN
        IF NEW."startWindowAt" IS DISTINCT FROM OLD."startWindowAt" OR
           NEW."endWindowAt" IS DISTINCT FROM OLD."endWindowAt" THEN
            RAISE EXCEPTION 'Schedule windows cannot be modified once assessment % is %', OLD.id, OLD.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 6. Content metadata locked once RESULTS_RELEASED or ARCHIVED
    IF OLD.status IN ('RESULTS_RELEASED', 'ARCHIVED') THEN
        IF NEW."title" IS DISTINCT FROM OLD."title" OR
           NEW."description" IS DISTINCT FROM OLD."description" THEN
            RAISE EXCEPTION 'Metadata (title, description) cannot be modified once assessment % is %', OLD.id, OLD.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assessment_lifecycle_protection
BEFORE UPDATE ON "assessments"
FOR EACH ROW EXECUTE FUNCTION trg_enforce_assessment_lifecycle();

-- 4.3 Trigger: Assessment Deletion Protection (Non-DRAFT Deletion Forbidden)
CREATE OR REPLACE FUNCTION trg_enforce_assessment_delete_protection()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Cannot delete assessment % with status %. Only DRAFT assessments may be deleted.', OLD.id, OLD.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assessment_delete_protection
BEFORE DELETE ON "assessments"
FOR EACH ROW EXECUTE FUNCTION trg_enforce_assessment_delete_protection();

-- 4.4 Trigger: Assessment Attempt Integrity & Immutability
CREATE OR REPLACE FUNCTION trg_enforce_attempt_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- 1. Initial status must be IN_PROGRESS
        IF NEW.status IS DISTINCT FROM 'IN_PROGRESS' THEN
            RAISE EXCEPTION 'Initial attempt status must be IN_PROGRESS for attempt %', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        -- 2. Reject invalid inception timestamps
        IF NEW."startedAt" IS NULL OR NEW."deadlineAt" IS NULL THEN
            RAISE EXCEPTION 'Inception timestamps (startedAt, deadlineAt) cannot be null for attempt %', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW."deadlineAt" <= NEW."startedAt" THEN
            RAISE EXCEPTION 'deadlineAt must be strictly greater than startedAt for attempt %', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- 1. Identity immutability
        IF NEW.id IS DISTINCT FROM OLD.id OR
           NEW."schoolId" IS DISTINCT FROM OLD."schoolId" OR
           NEW."assessmentId" IS DISTINCT FROM OLD."assessmentId" OR
           NEW."studentId" IS DISTINCT FROM OLD."studentId" THEN
            RAISE EXCEPTION 'Attempt identity fields (id, schoolId, assessmentId, studentId) are immutable for attempt %', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;

        -- 2. Timestamp immutability
        IF NEW."startedAt" IS DISTINCT FROM OLD."startedAt" THEN
            RAISE EXCEPTION 'startedAt is immutable once attempt % is created', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW."deadlineAt" IS DISTINCT FROM OLD."deadlineAt" THEN
            RAISE EXCEPTION 'deadlineAt is immutable once attempt % is created', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;

        -- 3. Terminal state immutability
        IF OLD.status IN ('SUBMITTED', 'TIMED_OUT') THEN
            IF NEW.status IS DISTINCT FROM OLD.status THEN
                RAISE EXCEPTION 'Illegal status transition: cannot change terminal attempt % from % to %', OLD.id, OLD.status, NEW.status
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;

        -- 4. Valid status transitions from IN_PROGRESS
        IF OLD.status = 'IN_PROGRESS' AND NEW.status NOT IN ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT') THEN
            RAISE EXCEPTION 'Invalid status transition for attempt %: % to %', OLD.id, OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assessment_attempt_integrity
BEFORE INSERT OR UPDATE ON "assessment_attempts"
FOR EACH ROW EXECUTE FUNCTION trg_enforce_attempt_integrity();

-- 4.5 Trigger: Attempt Answer Write Protection & Serialization
CREATE OR REPLACE FUNCTION trg_enforce_attempt_answer_protection()
RETURNS TRIGGER AS $$
DECLARE
    v_attempt_status "AttemptStatus";
BEGIN
    -- 1. Reassign protection on UPDATE
    IF TG_OP = 'UPDATE' THEN
        IF NEW."assessmentId" IS DISTINCT FROM OLD."assessmentId" OR
           NEW."attemptId" IS DISTINCT FROM OLD."attemptId" OR
           NEW."questionId" IS DISTINCT FROM OLD."questionId" OR
           NEW."schoolId" IS DISTINCT FROM OLD."schoolId" THEN
            RAISE EXCEPTION 'Cannot reassign answer between assessments, attempts, questions, or schools'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 2. Check parent attempt status with row-level share lock to serialize against finalization
    SELECT status INTO v_attempt_status
    FROM "assessment_attempts"
    WHERE id = NEW."attemptId" AND "assessmentId" = NEW."assessmentId"
    FOR SHARE;

    IF v_attempt_status IS NULL THEN
        RAISE EXCEPTION 'Cannot record answer: parent attempt % not found for assessment %', NEW."attemptId", NEW."assessmentId"
            USING ERRCODE = 'check_violation';
    ELSIF v_attempt_status IS DISTINCT FROM 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'Cannot submit answer for attempt % with status %. Answers are only accepted while attempt is IN_PROGRESS.', NEW."attemptId", v_attempt_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attempt_answer_protection
BEFORE INSERT OR UPDATE ON "attempt_answers"
FOR EACH ROW EXECUTE FUNCTION trg_enforce_attempt_answer_protection();

-- 4.6 Trigger: Assessment Result Strict Immutability
CREATE OR REPLACE FUNCTION trg_enforce_result_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Assessment results are strictly immutable. Score correction or regrading requires an authorized audit workflow.'
            USING ERRCODE = 'check_violation';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Assessment results cannot be deleted. Legal academic records are permanent.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assessment_result_immutability
BEFORE UPDATE OR DELETE ON "assessment_results"
FOR EACH ROW EXECUTE FUNCTION trg_enforce_result_immutability();

-- =========================================================================
-- 5. Performance & Multi-Tenant Query Indexes
-- =========================================================================

CREATE INDEX "assessment_chapters_schoolId_gradeId_subject_idx" ON "assessment_chapters"("schoolId", "gradeId", "subject");
CREATE INDEX "assessments_schoolId_status_idx" ON "assessments"("schoolId", "status");
CREATE INDEX "assessments_schoolId_gradeId_subject_idx" ON "assessments"("schoolId", "gradeId", "subject");
CREATE INDEX "assessments_schoolId_academicYearId_idx" ON "assessments"("schoolId", "academicYearId");
CREATE INDEX "assessment_sections_assessmentId_orderIndex_idx" ON "assessment_sections"("assessmentId", "orderIndex");
CREATE INDEX "assessment_questions_assessmentId_orderIndex_idx" ON "assessment_questions"("assessmentId", "orderIndex");
CREATE INDEX "question_image_artifacts_schoolId_status_idx" ON "question_image_artifacts"("schoolId", "status");
CREATE INDEX "assessment_attempts_schoolId_studentId_idx" ON "assessment_attempts"("schoolId", "studentId");
CREATE INDEX "assessment_attempts_assessmentId_status_idx" ON "assessment_attempts"("assessmentId", "status");
CREATE INDEX "attempt_answers_assessmentId_attemptId_idx" ON "attempt_answers"("assessmentId", "attemptId");
CREATE INDEX "attempt_answers_assessmentId_questionId_idx" ON "attempt_answers"("assessmentId", "questionId");
CREATE INDEX "assessment_results_schoolId_assessmentId_idx" ON "assessment_results"("schoolId", "assessmentId");
CREATE INDEX "assessment_results_schoolId_studentId_idx" ON "assessment_results"("schoolId", "studentId");
CREATE INDEX "student_assessment_progressions_schoolId_studentId_chapterId_idx" ON "student_assessment_progressions"("schoolId", "studentId", "chapterId");
