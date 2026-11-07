-- =============================================================================
-- DBA READ-ONLY PREFLIGHT  (revision 4: endpoint identity gate, history gate, \qecho, index validity, exit status)
-- Migration under review : 20261101010000_harden_assessment_chapters_grade_fk
-- Expected target        : database fee_iso_test, server address loopback (127.0.0.0/8 or ::1), port 5432
--                          (enforced by the identity gate below, not only by procedure)
-- Mode                   : read-only transaction, SELECT statements only.
--                          Nothing here modifies schema, data or migration history.
-- Run with psql          : see DBA_READ_ONLY_PREFLIGHT_INSTRUCTIONS.md
-- NOTE: This file is NOT a migration and must never be executed as one. How Prisma tooling treats
--       extra files inside a migration directory has not been verified, so consider moving this
--       file and its instructions to a separate operations directory before any real deployment.
-- psql requirement       : psql 10 or later (uses \if / \endif). Server: PostgreSQL 12 or later
--                          (uses WITH ORDINALITY, FILTER, indnkeyatts). Not executed or validated by the author.
-- Output                 : all headings use \qecho so they follow the same output channel as query results.
-- Gates                  : (1) database and endpoint identity (name, loopback address, port; an unavailable
--                          address or port fails closed), (2) _prisma_migrations existence and SELECT access.
--                          A failed gate prints a BLOCKED message, raises a deliberate error
--                          (psql exit status 3 under ON_ERROR_STOP), and then quits as a backstop.
-- Completeness           : the 'END OF REPORT' marker is printed only after ROLLBACK succeeds.
--                          If it is absent, the report is incomplete or a gate stopped the run.
-- Exit status            : READY exits 0. Every BLOCKED verdict exits non-zero (status 3) through a
--                          deliberate error raised AFTER the verdict and the END OF REPORT marker.
--                          A complete BLOCKED report therefore ends with an intentional error.
-- =============================================================================

BEGIN READ ONLY;
\set ON_ERROR_STOP on
\pset pager off

\qecho '=== A. DATABASE AND ENDPOINT IDENTITY (required: database fee_iso_test, loopback server address, port 5432) ==='
SELECT (current_database() = 'fee_iso_test')                                    AS ident_db_ok,
       COALESCE(inet_server_port() = 5432, false)                               AS ident_port_ok,
       COALESCE((inet_server_addr() <<= inet '127.0.0.0/8')
                OR (inet_server_addr() <<= inet '::1/128'), false)              AS ident_addr_ok,
       (current_database() = 'fee_iso_test'
        AND COALESCE(inet_server_port() = 5432, false)
        AND COALESCE((inet_server_addr() <<= inet '127.0.0.0/8')
                     OR (inet_server_addr() <<= inet '::1/128'), false))        AS ident_ok,
       current_database()                                                       AS ident_db,
       COALESCE(host(inet_server_addr()), 'unavailable')                        AS ident_addr,
       COALESCE(inet_server_port()::text, 'unavailable')                        AS ident_port
\gset

SELECT current_database()                       AS current_database,
       current_user                             AS current_user,
       current_schema()                         AS current_schema,
       inet_server_addr()                       AS server_addr,
       inet_server_port()                       AS server_port,
       current_setting('server_version')        AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only,
       :'ident_db_ok'::boolean                  AS database_ok,
       :'ident_addr_ok'::boolean                AS loopback_address_ok,
       :'ident_port_ok'::boolean                AS port_ok,
       :'ident_ok'::boolean                     AS identity_ok;

\if :ident_ok
  \qecho 'IDENTITY GATE: PASSED (database fee_iso_test, loopback server address, port 5432).'
\else
  \qecho BLOCKED - DATABASE IDENTITY NOT VERIFIED. Connected database is :ident_db , server address is :ident_addr , port is :ident_port . Required - fee_iso_test on a loopback address, port 5432. An unavailable address or port also blocks.
  \qecho 'No migration-history, foreign-key, orphan or schema inspection was run. Do not send further output.'
  SELECT 1/0 AS deliberate_abort_identity_gate;
  \quit
\endif

\qecho ''
\qecho '=== B. PRISMA MIGRATION HISTORY (public._prisma_migrations) ==='
SELECT (to_regclass('public._prisma_migrations') IS NOT NULL) AS hist_exists,
       COALESCE(has_table_privilege(current_user, to_regclass('public._prisma_migrations'), 'SELECT'), false) AS hist_select,
       (to_regclass('public._prisma_migrations') IS NOT NULL
        AND COALESCE(has_table_privilege(current_user, to_regclass('public._prisma_migrations'), 'SELECT'), false)) AS hist_ready
\gset
\qecho '--- B0. History gate'
SELECT :'hist_exists'::boolean AS table_exists, :'hist_select'::boolean AS select_privilege;

\if :hist_ready
  \qecho 'HISTORY GATE: PASSED (table exists and is readable).'
\else
  \qecho 'BLOCKED - MIGRATION HISTORY ISSUE. public._prisma_migrations is missing or not readable by this role.'
  \qecho 'No query referencing _prisma_migrations, and no later section, was run. Do not send further output.'
  SELECT 1/0 AS deliberate_abort_history_gate;
  \quit
\endif

\qecho '--- B1. Counts'
SELECT count(*)                                                                   AS total_records,
       count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied_ok,
       count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)     AS failed_or_incomplete,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL)                         AS rolled_back
FROM public._prisma_migrations;

\qecho '--- B2. Latest successful migration'
SELECT migration_name, finished_at, applied_steps_count
FROM public._prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
ORDER BY finished_at DESC, migration_name DESC
LIMIT 1;

\qecho '--- B3. Last 5 successful migrations'
SELECT migration_name, finished_at
FROM public._prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
ORDER BY finished_at DESC, migration_name DESC
LIMIT 5;

\qecho '--- B4. Target migration record (zero rows = not yet applied, as expected)'
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations
WHERE migration_name = '20261101010000_harden_assessment_chapters_grade_fk';

\qecho '--- B5. Prerequisite migration 20261031010000_add_chapter_ownership_and_academic_year'
SELECT migration_name, finished_at, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name = '20261031010000_add_chapter_ownership_and_academic_year';

\qecho '--- B6. Failed, incomplete or rolled-back records (zero rows expected)'
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations
WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
ORDER BY started_at;

\qecho ''
\qecho '=== C. EXISTING FOREIGN KEY fk_assessment_chapters_grade ==='
\qecho '--- C1. Every constraint with this name, in any schema (exactly one expected)'
SELECT c.conname,
       c.contype                                          AS constraint_type,
       ns1.nspname || '.' || cl1.relname                  AS referencing_table,
       (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS referencing_columns_in_order,
       ns2.nspname || '.' || cl2.relname                  AS referenced_table,
       (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
          FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS referenced_columns_in_order,
       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
                          WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete_action,
       CASE c.confupdtype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
                          WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update_action,
       c.condeferrable                                    AS deferrable,
       c.condeferred                                      AS initially_deferred,
       c.convalidated                                     AS validated
FROM pg_constraint c
JOIN pg_class cl1     ON cl1.oid = c.conrelid
JOIN pg_namespace ns1 ON ns1.oid = cl1.relnamespace
LEFT JOIN pg_class cl2     ON cl2.oid = c.confrelid
LEFT JOIN pg_namespace ns2 ON ns2.oid = cl2.relnamespace
WHERE c.conname = 'fk_assessment_chapters_grade';

\qecho '--- C2. Full definition text'
SELECT conrelid::regclass AS on_table, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'fk_assessment_chapters_grade';

\qecho ''
\qecho '=== D. ORPHAN INSPECTION: assessment_chapters(schoolId, gradeId) -> grade_classes(schoolId, id) ==='
\qecho '--- D1. Totals'
SELECT (SELECT count(*) FROM public.assessment_chapters) AS total_chapters,
       (SELECT count(*)
          FROM public.assessment_chapters ac
          LEFT JOIN public.grade_classes gc
            ON gc."schoolId" = ac."schoolId" AND gc."id" = ac."gradeId"
         WHERE gc."id" IS NULL)                          AS orphaned_chapters;

\qecho '--- D2. Orphans by school (zero rows expected; school ids only, no personal data)'
SELECT ac."schoolId", count(*) AS orphaned_chapters
FROM public.assessment_chapters ac
LEFT JOIN public.grade_classes gc
  ON gc."schoolId" = ac."schoolId" AND gc."id" = ac."gradeId"
WHERE gc."id" IS NULL
GROUP BY ac."schoolId"
ORDER BY ac."schoolId";

\qecho ''
\qecho '=== E. SUPPORTING SCHEMA AND INDEXES ==='
\qecho '--- E1. Required tables (both must be present)'
SELECT t.name AS expected_table,
       to_regclass('public.' || t.name) IS NOT NULL AS present
FROM (VALUES ('assessment_chapters'), ('grade_classes')) AS t(name);

\qecho '--- E2. Required columns (4 rows expected, all present)'
SELECT r.tbl, r.col,
       EXISTS (SELECT 1 FROM information_schema.columns ic
                WHERE ic.table_schema = 'public' AND ic.table_name = r.tbl AND ic.column_name = r.col) AS present
FROM (VALUES ('assessment_chapters','schoolId'), ('assessment_chapters','gradeId'),
             ('grade_classes','schoolId'), ('grade_classes','id')) AS r(tbl, col);

\qecho '--- E3. All constraints on assessment_chapters'
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.assessment_chapters')
ORDER BY contype, conname;

\qecho '--- E4. All indexes on assessment_chapters and grade_classes, with validity and key detail'
\qecho '    key_columns_in_order excludes INCLUDE columns; an expression key column does not appear in the list.'
SELECT cl.relname                                   AS table_name,
       ic.relname                                   AS index_name,
       i.indisvalid                                 AS is_valid,
       i.indisready                                 AS is_ready,
       i.indisunique                                AS is_unique,
       i.indisprimary                               AS is_primary,
       (i.indpred IS NULL)                          AS no_partial_predicate,
       (i.indexprs IS NULL)                         AS no_expression_columns,
       i.indnkeyatts                                AS key_column_count,
       i.indnatts                                   AS total_column_count,
       (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
          FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         WHERE k.ord <= i.indnkeyatts)              AS key_columns_in_order,
       (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
          FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         WHERE k.ord > i.indnkeyatts)               AS include_columns
FROM pg_index i
JOIN pg_class cl      ON cl.oid = i.indrelid
JOIN pg_namespace n   ON n.oid = cl.relnamespace
JOIN pg_class ic      ON ic.oid = i.indexrelid
WHERE n.nspname = 'public' AND cl.relname IN ('assessment_chapters', 'grade_classes')
ORDER BY cl.relname, ic.relname;

\qecho '--- E5. CORRECTNESS REQUIREMENT: unique index backing the composite reference on grade_classes'
\qecho '    Required by schema.prisma: @@unique([schoolId, id]) on GradeClass. Must be valid, ready, unique,'
\qecho '    non-partial, non-expression, exactly 2 key columns in the order schoolId, id.'
SELECT ic.relname AS qualifying_index
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
WHERE i.indrelid = to_regclass('public.grade_classes')
  AND i.indisunique AND i.indisvalid AND i.indisready
  AND i.indpred IS NULL AND i.indexprs IS NULL
  AND i.indnkeyatts = 2
  AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
         FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ord <= i.indnkeyatts) = 'schoolId,id';
\qecho '    Zero rows here means the verdict will be BLOCKED - OTHER SCHEMA DISCREPANCY.'

\qecho '--- E6. PERFORMANCE RECOMMENDATION ONLY (never affects the verdict)'
\qecho '    An index on assessment_chapters whose leading key columns are schoolId, gradeId lets grade deletes'
\qecho '    check references without scanning the table. It is not required for correctness.'
SELECT ic.relname AS referencing_side_index_present
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
WHERE i.indrelid = to_regclass('public.assessment_chapters')
  AND i.indisvalid AND i.indisready
  AND i.indpred IS NULL AND i.indexprs IS NULL
  AND i.indnkeyatts >= 2
  AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
         FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ord <= 2) = 'schoolId,gradeId';
\qecho '    Zero rows = no such index (recommendation only; not a blocker).'

\qecho ''
\qecho '=== F. MIGRATION READINESS VERDICT (compares state with the migration preconditions) ==='
WITH hist AS (
  SELECT count(*) FILTER (WHERE migration_name = '20261101010000_harden_assessment_chapters_grade_fk') AS target_recorded,
         count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)                       AS bad_records,
         count(*) FILTER (WHERE migration_name = '20261031010000_add_chapter_ownership_and_academic_year'
                            AND finished_at IS NOT NULL AND rolled_back_at IS NULL)                      AS prereq_applied
  FROM public._prisma_migrations
),
fk AS (
  SELECT c.contype, c.confdeltype, c.confupdtype, c.condeferrable, c.condeferred, c.convalidated,
         ns1.nspname || '.' || cl1.relname AS referencing_table,
         ns2.nspname || '.' || cl2.relname AS referenced_table,
         (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)  AS referencing_cols,
         (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
            FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS referenced_cols
  FROM pg_constraint c
  JOIN pg_class cl1     ON cl1.oid = c.conrelid
  JOIN pg_namespace ns1 ON ns1.oid = cl1.relnamespace
  JOIN pg_class cl2     ON cl2.oid = c.confrelid
  JOIN pg_namespace ns2 ON ns2.oid = cl2.relnamespace
  WHERE c.conname = 'fk_assessment_chapters_grade'
),
fkc AS (
  SELECT (SELECT count(*) FROM pg_constraint WHERE conname = 'fk_assessment_chapters_grade') AS name_count,
         (SELECT count(*) FROM fk
           WHERE contype = 'f'
             AND referencing_table = 'public.assessment_chapters'
             AND referenced_table  = 'public.grade_classes'
             AND referencing_cols  = 'schoolId,gradeId'
             AND referenced_cols   = 'schoolId,id'
             AND confdeltype = 'c' AND confupdtype = 'c'
             AND NOT condeferrable AND NOT condeferred
             AND convalidated)                                                                AS exact_match_count
),
sch AS (
  SELECT (to_regclass('public.assessment_chapters') IS NOT NULL
      AND to_regclass('public.grade_classes') IS NOT NULL
      AND (SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public'
              AND ((table_name = 'assessment_chapters' AND column_name IN ('schoolId','gradeId'))
                OR (table_name = 'grade_classes'       AND column_name IN ('schoolId','id')))) = 4) AS schema_ok,
         EXISTS (SELECT 1 FROM pg_index i
                  WHERE i.indrelid = to_regclass('public.grade_classes')
                    AND i.indisunique AND i.indisvalid AND i.indisready
                    AND i.indpred IS NULL AND i.indexprs IS NULL
                    AND i.indnkeyatts = 2
                    AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                           FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                          WHERE k.ord <= i.indnkeyatts) = 'schoolId,id')                         AS unique_index_ok
),
orph AS (
  SELECT count(*) AS orphan_count
  FROM public.assessment_chapters ac
  LEFT JOIN public.grade_classes gc
    ON gc."schoolId" = ac."schoolId" AND gc."id" = ac."gradeId"
  WHERE gc."id" IS NULL
)
SELECT v.*, (v.verdict LIKE 'READY%') AS ready
FROM (
SELECT CASE
         WHEN hist.target_recorded > 0                         THEN 'BLOCKED - MIGRATION ALREADY APPLIED'
         WHEN hist.bad_records > 0 OR hist.prereq_applied <> 1 THEN 'BLOCKED - MIGRATION HISTORY ISSUE'
         WHEN NOT sch.schema_ok OR NOT sch.unique_index_ok     THEN 'BLOCKED - OTHER SCHEMA DISCREPANCY'
         WHEN fkc.name_count <> 1 OR fkc.exact_match_count <> 1 THEN 'BLOCKED - FOREIGN KEY MISMATCH'
         WHEN orph.orphan_count > 0                            THEN 'BLOCKED - ORPHAN RECORDS FOUND'
         ELSE 'READY FOR SEPARATE EXECUTION APPROVAL'
       END                         AS verdict,
       current_database()          AS verified_database,
       hist.target_recorded, hist.bad_records, hist.prereq_applied,
       sch.schema_ok, sch.unique_index_ok, fkc.name_count, fkc.exact_match_count, orph.orphan_count
FROM hist, sch, fkc, orph
) v
\gset v_

\qecho '--- F2. Verdict (displayed from the values captured in psql variables v_*)'
SELECT :'v_verdict'                  AS verdict,
       :'v_verified_database'        AS verified_database,
       :'ident_addr'                 AS verified_server_addr,
       :'ident_port'                 AS verified_server_port,
       :'v_ready'::boolean           AS ready,
       :'v_target_recorded'::bigint  AS target_recorded,
       :'v_bad_records'::bigint      AS bad_records,
       :'v_prereq_applied'::bigint   AS prereq_applied,
       :'v_schema_ok'::boolean       AS schema_ok,
       :'v_unique_index_ok'::boolean AS unique_index_ok,
       :'v_name_count'::bigint       AS name_count,
       :'v_exact_match_count'::bigint AS exact_match_count,
       :'v_orphan_count'::bigint     AS orphan_count;
\qecho '>>> The verdict does not authorize executing the migration.'

ROLLBACK;
\qecho '=== END OF REPORT (printed only after the script completed and the read-only transaction was rolled back) ==='

\qecho '--- EXIT STATUS: READY exits 0. Any BLOCKED verdict exits non-zero (status 3) on purpose, AFTER the marker above.'
\if :v_ready
  \qecho 'RESULT: READY FOR SEPARATE EXECUTION APPROVAL. psql will exit with status 0.'
\else
  \qecho 'RESULT: BLOCKED (see verdict above). The report is complete. psql now exits non-zero (status 3) on purpose; the error that follows is intentional.'
  BEGIN READ ONLY;
  SELECT 1/0 AS deliberate_abort_blocked_verdict;
\endif
