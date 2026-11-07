-- =============================================================================
-- Migration: 20261031010000_add_chapter_ownership_and_academic_year
-- Module: Examination (Phase 4)
-- Description:
--   1. Wraps all DDL and DML in an explicit PostgreSQL transaction (BEGIN / COMMIT).
--   2. Adds nullable "academicYearId" and "createdByTeacherId" to "assessment_chapters".
--   3. Executes deterministic backfill for unambiguous records (single referencing
--      assessment academic year or unambiguous single active academic year).
--   4. Leaves ambiguous/conflicting records with academicYearId = NULL for manual review.
--   5. Adds foreign keys referencing composite unique keys on academic_years and teachers.
--   6. Executes non-destructive pre-flight duplicate check across all 3 uniqueness partitions.
--   7. Replaces global chapter code unique constraint with 3 case-insensitive partial unique
--      indexes (teacher-owned with year, teacher-owned null-year, and global legacy institutional).
--   8. Replaces old index with Prisma-canonical composite performance indexes.
-- =============================================================================

BEGIN;

-- Step 1: Add new columns as NULLABLE
ALTER TABLE "assessment_chapters"
  ADD COLUMN IF NOT EXISTS "academicYearId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByTeacherId" TEXT;

-- Step 2: Deterministic backfill for chapters with referencing assessments
--         where EVERY referencing assessment has a non-NULL academicYearId
--         and all referencing assessments belong to exactly ONE distinct academic year.
UPDATE "assessment_chapters" ac
SET "academicYearId" = sub.single_year_id
FROM (
  SELECT 
    "chapterId", 
    "schoolId",
    MIN("academicYearId") AS single_year_id
  FROM "assessments"
  WHERE "chapterId" IS NOT NULL
  GROUP BY "chapterId", "schoolId"
  HAVING COUNT(*) = COUNT("academicYearId")
     AND COUNT(DISTINCT "academicYearId") = 1
) sub
WHERE ac."id" = sub."chapterId"
  AND ac."schoolId" = sub."schoolId"
  AND ac."academicYearId" IS NULL;

-- Step 3: Backfill unreferenced chapters ONLY when the school has
--         EXACTLY ONE active academic year (isCurrent = true).
UPDATE "assessment_chapters" ac
SET "academicYearId" = ay."id"
FROM "academic_years" ay
WHERE ac."schoolId" = ay."schoolId"
  AND ay."isCurrent" = true
  AND ac."academicYearId" IS NULL
  AND (
    SELECT COUNT(*) 
    FROM "academic_years" a_check 
    WHERE a_check."schoolId" = ac."schoolId" AND a_check."isCurrent" = true
  ) = 1
  AND NOT EXISTS (
    SELECT 1 FROM "assessments" a 
    WHERE a."chapterId" = ac."id" AND a."schoolId" = ac."schoolId"
  );

-- Note: Chapters referencing assessments across MULTIPLE academic years
-- or unreferenced chapters in schools without exactly one active year
-- remain with academicYearId = NULL for manual review.

-- Step 4: Add foreign key constraints referencing verified composite keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_assessment_chapters_academic_year'
  ) THEN
    ALTER TABLE "assessment_chapters"
      ADD CONSTRAINT "fk_assessment_chapters_academic_year"
        FOREIGN KEY ("schoolId", "academicYearId")
        REFERENCES "academic_years"("schoolId", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_assessment_chapters_teacher'
  ) THEN
    ALTER TABLE "assessment_chapters"
      ADD CONSTRAINT "fk_assessment_chapters_teacher"
        FOREIGN KEY ("schoolId", "createdByTeacherId")
        REFERENCES "teachers"("schoolId", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 5: Pre-flight duplicate check matching the 3 case-insensitive partial unique indexes.
--         If any duplicate exists, aborts the transaction cleanly and reports conflicting chapter IDs
--         without deleting, merging, renaming, or reassigning any records.
DO $$
DECLARE
  v_conflict_summary TEXT;
BEGIN
  -- 5a. Teacher-owned chapters with non-NULL academicYearId
  SELECT string_agg(
    format(
      '[schoolId=%s, academicYearId=%s, teacherId=%s, gradeId=%s, subject=%s, code=%s, count=%s, chapterIds={%s}]',
      "schoolId", "academicYearId", "createdByTeacherId", "gradeId",
      norm_subject, norm_code, cnt, chapter_ids
    ),
    '; '
  )
  INTO v_conflict_summary
  FROM (
    SELECT
      "schoolId",
      "academicYearId",
      "createdByTeacherId",
      "gradeId",
      LOWER("subject") AS norm_subject,
      LOWER("chapterCode") AS norm_code,
      COUNT(*) AS cnt,
      array_to_string(array_agg("id" ORDER BY "createdAt" ASC, "id" ASC), ',') AS chapter_ids
    FROM "assessment_chapters"
    WHERE "createdByTeacherId" IS NOT NULL
      AND "academicYearId" IS NOT NULL
    GROUP BY
      "schoolId",
      "academicYearId",
      "createdByTeacherId",
      "gradeId",
      LOWER("subject"),
      LOWER("chapterCode")
    HAVING COUNT(*) > 1
  ) d_teacher_year;

  IF v_conflict_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Migration aborted: duplicate teacher-owned chapters (with academic year) detected: %', v_conflict_summary
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 5b. Teacher-owned chapters with NULL academicYearId (defensive check)
  SELECT string_agg(
    format(
      '[schoolId=%s, teacherId=%s, gradeId=%s, subject=%s, code=%s, count=%s, chapterIds={%s}]',
      "schoolId", "createdByTeacherId", "gradeId",
      norm_subject, norm_code, cnt, chapter_ids
    ),
    '; '
  )
  INTO v_conflict_summary
  FROM (
    SELECT
      "schoolId",
      "createdByTeacherId",
      "gradeId",
      LOWER("subject") AS norm_subject,
      LOWER("chapterCode") AS norm_code,
      COUNT(*) AS cnt,
      array_to_string(array_agg("id" ORDER BY "createdAt" ASC, "id" ASC), ',') AS chapter_ids
    FROM "assessment_chapters"
    WHERE "createdByTeacherId" IS NOT NULL
      AND "academicYearId" IS NULL
    GROUP BY
      "schoolId",
      "createdByTeacherId",
      "gradeId",
      LOWER("subject"),
      LOWER("chapterCode")
    HAVING COUNT(*) > 1
  ) d_teacher_null_year;

  IF v_conflict_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Migration aborted: duplicate teacher-owned chapters (null academic year) detected: %', v_conflict_summary
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 5c. Legacy institutional chapters (globally unique per school, grade, subject, code regardless of academicYearId)
  SELECT string_agg(
    format(
      '[schoolId=%s, gradeId=%s, subject=%s, code=%s, count=%s, chapterIds={%s}]',
      "schoolId", "gradeId",
      norm_subject, norm_code, cnt, chapter_ids
    ),
    '; '
  )
  INTO v_conflict_summary
  FROM (
    SELECT
      "schoolId",
      "gradeId",
      LOWER("subject") AS norm_subject,
      LOWER("chapterCode") AS norm_code,
      COUNT(*) AS cnt,
      array_to_string(array_agg("id" ORDER BY "createdAt" ASC, "id" ASC), ',') AS chapter_ids
    FROM "assessment_chapters"
    WHERE "createdByTeacherId" IS NULL
    GROUP BY
      "schoolId",
      "gradeId",
      LOWER("subject"),
      LOWER("chapterCode")
    HAVING COUNT(*) > 1
  ) d_legacy;

  IF v_conflict_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Migration aborted: duplicate legacy institutional chapters detected: %', v_conflict_summary
      USING ERRCODE = 'unique_violation';
  END IF;
END $$;

-- Step 6: Replace old unique constraint with the 3 case-insensitive partial unique indexes
ALTER TABLE "assessment_chapters"
  DROP CONSTRAINT IF EXISTS "assessment_chapters_unique_code";

DROP INDEX IF EXISTS "assessment_chapters_teacher_unique_code";
DROP INDEX IF EXISTS "assessment_chapters_legacy_unique_code";
DROP INDEX IF EXISTS "assessment_chapters_teacher_year_unique_code";
DROP INDEX IF EXISTS "assessment_chapters_teacher_null_year_unique_code";
DROP INDEX IF EXISTS "assessment_chapters_legacy_year_unique_code";
DROP INDEX IF EXISTS "assessment_chapters_legacy_null_year_unique_code";

-- 6.1 Teacher-owned chapters, non-NULL academic year
CREATE UNIQUE INDEX "assessment_chapters_teacher_year_unique_code"
  ON "assessment_chapters" (
    "schoolId",
    "academicYearId",
    "createdByTeacherId",
    "gradeId",
    LOWER("subject"),
    LOWER("chapterCode")
  )
  WHERE "createdByTeacherId" IS NOT NULL AND "academicYearId" IS NOT NULL;

-- 6.2 Teacher-owned chapters, NULL academic year (defensive uniqueness constraint)
CREATE UNIQUE INDEX "assessment_chapters_teacher_null_year_unique_code"
  ON "assessment_chapters" (
    "schoolId",
    "createdByTeacherId",
    "gradeId",
    LOWER("subject"),
    LOWER("chapterCode")
  )
  WHERE "createdByTeacherId" IS NOT NULL AND "academicYearId" IS NULL;

-- 6.3 Legacy institutional chapters (globally unique per school, grade, subject, and code regardless of academic year)
CREATE UNIQUE INDEX "assessment_chapters_legacy_unique_code"
  ON "assessment_chapters" (
    "schoolId",
    "gradeId",
    LOWER("subject"),
    LOWER("chapterCode")
  )
  WHERE "createdByTeacherId" IS NULL;

-- Step 7: Replace old index with Prisma-canonical composite performance indexes
DROP INDEX IF EXISTS "assessment_chapters_schoolId_gradeId_subject_idx";
DROP INDEX IF EXISTS "assessment_chapters_schoolId_ay_grade_subject_idx";
DROP INDEX IF EXISTS "assessment_chapters_schoolId_teacher_idx";

CREATE INDEX IF NOT EXISTS "assessment_chapters_schoolId_academicYearId_gradeId_subject_idx"
  ON "assessment_chapters" ("schoolId", "academicYearId", "gradeId", "subject");

CREATE INDEX IF NOT EXISTS "assessment_chapters_schoolId_createdByTeacherId_idx"
  ON "assessment_chapters" ("schoolId", "createdByTeacherId");

COMMIT;
