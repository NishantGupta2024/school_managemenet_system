-- =============================================================================
-- Migration: 20261101010000_harden_assessment_chapters_grade_fk
-- Module: Examination (Phase 4) / Academic Setup
-- Description:
--   Hardens the foreign key constraint "fk_assessment_chapters_grade" from
--   ON DELETE CASCADE to ON DELETE RESTRICT.
--
-- Safety Guarantees:
--   1. Transaction-wrapped (BEGIN ... COMMIT).
--   2. Defensive pre‑flight validation: verifies existing constraint is present,
--      is a foreign‑key, matches expected column lists, references the correct tables,
--      and conforms exactly to the expected CASCADE definition before dropping.
--   3. Defensive orphan check: confirms zero orphaned rows exist before modification.
--   4. Re‑creates the constraint preserving composite tenant scoping ("schoolId", "gradeId")
--      referencing ("schoolId", "id") on "grade_classes".
--   5. Enforces ON DELETE RESTRICT and ON UPDATE CASCADE.
-- =============================================================================

BEGIN;

-- Step 1: Verify existing constraint exists and inspect its exact definition
DO $$
DECLARE
  v_con_record RECORD;
BEGIN
  SELECT
    c.conname,
    c.confdeltype,
    c.confupdtype,
    c.contype,
    c.condeferrable,
    c.condeferred,
    c.conkey,
    c.confkey,
    rc.relname   AS ref_table,
    n2.nspname   AS ref_schema
  INTO v_con_record
  FROM pg_constraint c
  JOIN pg_namespace n  ON n.oid = c.connamespace          -- referencing namespace
  JOIN pg_class rc      ON rc.oid = c.confrelid               -- referenced table
  JOIN pg_namespace n2 ON n2.oid = rc.relnamespace           -- referenced namespace
  WHERE c.conname = 'fk_assessment_chapters_grade'
    AND c.conrelid = 'public.assessment_chapters'::regclass
    AND n.nspname = 'public'          -- referencing schema
    AND c.contype = 'f'               -- must be a foreign‑key
    AND rc.relname = 'grade_classes'  -- referenced table name
    AND n2.nspname = 'public';        -- referenced schema

  IF v_con_record.conname IS NULL THEN
    RAISE EXCEPTION 'Migration aborted: Expected foreign key constraint "fk_assessment_chapters_grade" on table "assessment_chapters" does not exist or does not reference the correct table/schema.'
      USING ERRCODE = 'undefined_object';
  END IF;

  -- Verify DELETE action is currently CASCADE
  IF v_con_record.confdeltype <> 'c' THEN
    RAISE EXCEPTION 'Migration aborted: Constraint "fk_assessment_chapters_grade" expected confdeltype = ''c'' (CASCADE), but found ''%''.', v_con_record.confdeltype
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify UPDATE action is currently CASCADE
  IF v_con_record.confupdtype <> 'c' THEN
    RAISE EXCEPTION 'Migration aborted: Constraint "fk_assessment_chapters_grade" expected confupdtype = ''c'' (ON UPDATE CASCADE), but found ''%''.', v_con_record.confupdtype
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify deferrability (expect non‑deferrable)
  IF v_con_record.condeferrable OR v_con_record.condeferred THEN
    RAISE EXCEPTION 'Migration aborted: Constraint "fk_assessment_chapters_grade" is deferrable or initially deferred, which is not expected.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify referencing column list (schoolId, gradeId)
  IF v_con_record.conkey <> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.assessment_chapters'::regclass AND attname = 'schoolId'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.assessment_chapters'::regclass AND attname = 'gradeId')
       ] THEN
    RAISE EXCEPTION 'Migration aborted: Foreign key columns mismatch. Expected (schoolId, gradeId).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify referenced column list (schoolId, id) on grade_classes
  IF v_con_record.confkey <> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.grade_classes'::regclass AND attname = 'schoolId'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.grade_classes'::regclass AND attname = 'id')
       ] THEN
    RAISE EXCEPTION 'Migration aborted: Referenced columns mismatch. Expected (schoolId, id) on grade_classes.'
      USING ERRCODE = 'check_violation';
  END IF;

END $$;

-- Step 2: Defensive pre‑flight orphan check
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_orphan_count
  FROM "public"."assessment_chapters" ac
  LEFT JOIN "public"."grade_classes" gc
    ON gc."schoolId" = ac."schoolId" AND gc."id" = ac."gradeId"
  WHERE gc."id" IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % orphaned assessment_chapters rows detected referencing non‑existent grade_classes.', v_orphan_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END $$;

-- Step 3: Drop existing foreign key constraint
ALTER TABLE "public"."assessment_chapters"
  DROP CONSTRAINT "fk_assessment_chapters_grade";

-- Step 4: Recreate foreign key constraint with ON DELETE RESTRICT and ON UPDATE CASCADE
ALTER TABLE "public"."assessment_chapters"
  ADD CONSTRAINT "fk_assessment_chapters_grade"
    FOREIGN KEY ("schoolId", "gradeId")
    REFERENCES "public"."grade_classes"("schoolId", "id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

COMMIT;
