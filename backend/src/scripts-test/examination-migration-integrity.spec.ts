import * as fs from 'fs';
import * as path from 'path';

describe('Phase 4 Examination Migration Static Integrity Gate', () => {
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  const migrationPath = path.resolve(
    __dirname,
    '../../prisma/migrations/20261030000000_p4_examination_init/migration.sql',
  );

  let schemaContent: string;
  let migrationSql: string;
  let activeSql: string;

  /**
   * Deterministic, comment-aware SQL sanitizer that strips single-line (--)
   * and block-level (/* ... *\/) comments while preserving SQL string literals.
   */
  function stripSqlComments(sql: string): string {
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;
    let result = '';
    let i = 0;

    while (i < sql.length) {
      const char = sql[i];
      const nextChar = sql[i + 1];

      if (inString) {
        result += char;
        if (char === "'" && nextChar === "'") {
          result += nextChar;
          i += 2;
          continue;
        } else if (char === "'") {
          inString = false;
        }
        i++;
      } else if (inLineComment) {
        if (char === '\n' || char === '\r') {
          inLineComment = false;
          result += char;
        }
        i++;
      } else if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
      } else {
        if (char === "'") {
          inString = true;
          result += char;
          i++;
        } else if (char === '-' && nextChar === '-') {
          inLineComment = true;
          i += 2;
        } else if (char === '/' && nextChar === '*') {
          inBlockComment = true;
          i += 2;
        } else {
          result += char;
          i++;
        }
      }
    }

    return result;
  }

  beforeAll(() => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    expect(fs.existsSync(migrationPath)).toBe(true);

    schemaContent = fs.readFileSync(schemaPath, 'utf8');
    migrationSql = fs.readFileSync(migrationPath, 'utf8');
    activeSql = stripSqlComments(migrationSql);
  });

  // =========================================================================
  // 1. Enum Consistency
  // =========================================================================

  describe('1. Examination Enum Definitions', () => {
    const requiredEnums = [
      'AssessmentMode',
      'AssessmentStatus',
      'AttemptStatus',
      'ImageArtifactStatus',
      'ProgressionAssessmentStatus',
    ];

    it.each(requiredEnums)(
      'should define enum %s in both schema and migration SQL',
      (enumName) => {
        expect(schemaContent).toContain(`enum ${enumName} {`);
        expect(migrationSql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
      },
    );
  });

  // =========================================================================
  // 2. Table Creation & Naming Parity
  // =========================================================================

  describe('2. Nine Core Examination Tables', () => {
    const requiredTables = [
      'assessment_chapters',
      'assessments',
      'assessment_sections',
      'assessment_questions',
      'question_image_artifacts',
      'assessment_attempts',
      'attempt_answers',
      'assessment_results',
      'student_assessment_progressions',
    ];

    it.each(requiredTables)(
      'should create table "%s" using standard CREATE TABLE (not IF NOT EXISTS)',
      (tableName) => {
        expect(migrationSql).toContain(`CREATE TABLE "${tableName}" (`);
        expect(migrationSql).not.toContain(`CREATE TABLE IF NOT EXISTS "${tableName}"`);
      },
    );

    it('should map every table correctly in schema.prisma', () => {
      for (const tableName of requiredTables) {
        expect(schemaContent).toContain(`@@map("${tableName}")`);
      }
    });
  });

  // =========================================================================
  // 3. Destructive Action & Schema Drift Prevention
  // =========================================================================

  describe('3. Non-Destructive Additive Invariants', () => {
    it('should not contain any DROP statements', () => {
      expect(migrationSql).not.toMatch(/\bDROP\s+TABLE\b/i);
      expect(migrationSql).not.toMatch(/\bDROP\s+COLUMN\b/i);
      expect(migrationSql).not.toMatch(/\bDROP\s+TYPE\b/i);
      expect(migrationSql).not.toMatch(/\bDROP\s+DATABASE\b/i);
      expect(migrationSql).not.toMatch(/\bDROP\s+SCHEMA\b/i);
    });

    it('should not alter any existing ERP, financial, or attendance tables', () => {
      const protectedTables = [
        'schools',
        'users',
        'academic_years',
        'grade_classes',
        'sections',
        'students',
        'teachers',
        'teacher_assignments',
        'fee_heads',
        'fee_structures',
        'fee_invoices',
        'invoice_items',
        'payments',
        'receipts',
        'attendance_registers',
        'student_attendance',
      ];

      for (const table of protectedTables) {
        const regex = new RegExp(`ALTER\\s+TABLE\\s+"?${table}"?\\s+`, 'i');
        expect(migrationSql).not.toMatch(regex);
      }
    });
  });

  // =========================================================================
  // 4. Composite Foreign Key & Tenant Isolation
  // =========================================================================

  describe('4. Composite Foreign Keys & Cross-Record Isolation', () => {
    it('should enforce 3-way result-attempt-student identity', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("assessmentId", "attemptId", "studentId") REFERENCES "assessment_attempts"("assessmentId", "id", "studentId")',
      );
    });

    it('should enforce cross-assessment isolation on attempt answers', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("assessmentId", "attemptId") REFERENCES "assessment_attempts"("assessmentId", "id")',
      );
      expect(migrationSql).toContain(
        'FOREIGN KEY ("assessmentId", "questionId") REFERENCES "assessment_questions"("assessmentId", "id")',
      );
    });

    it('should enforce cross-assessment isolation on question image artifacts', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("assessmentId", "questionId") REFERENCES "assessment_questions"("assessmentId", "id")',
      );
    });

    it('should enforce cross-assessment isolation on question sections', () => {
      expect(migrationSql).toContain(
        'FOREIGN KEY ("assessmentId", "sectionId") REFERENCES "assessment_sections"("assessmentId", "id")',
      );
    });

    it('should enforce strict 1-attempt-per-student uniqueness', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "assessment_attempts_student_assessment_key" UNIQUE ("assessmentId", "studentId")',
      );
    });
  });

  // =========================================================================
  // 5. Check Constraints for Numeric Range Safety
  // =========================================================================

  describe('5. Check Constraints', () => {
    const expectedChecks = [
      'chk_assessments_total_marks_positive',
      'chk_assessments_passing_marks_range',
      'chk_assessments_duration_positive',
      'chk_questions_marks_positive',
      'chk_questions_correct_option_valid',
      'chk_assessment_attempts_deadline_order',
    ];

    it.each(expectedChecks)('should define check constraint %s', (chkName) => {
      expect(migrationSql).toContain(`CONSTRAINT "${chkName}"`);
    });

    it('should enforce positive question marks and 0-3 correct options', () => {
      expect(migrationSql).toContain('CHECK ("marks" > 0.00 AND "marks" <= 500.00)');
      expect(migrationSql).toContain('CHECK ("correctOption" IN (0, 1, 2, 3))');
    });

    it('should enforce total marks positive and passing marks bounded', () => {
      expect(migrationSql).toContain('CHECK ("totalMarks" >= 1.00)');
      expect(migrationSql).toContain('CHECK ("passingMarks" >= 0.00 AND "passingMarks" <= "totalMarks")');
    });

    it('should enforce deadlineAt > startedAt on assessment_attempts', () => {
      expect(activeSql).toContain('CHECK ("deadlineAt" > "startedAt")');
    });
  });

  // =========================================================================
  // 6. Native Triggers & Null-Safe Lifecycle Protection
  // =========================================================================

  describe('6. Immutability Triggers', () => {
    it('should define trg_question_paper_immutability on assessment_questions', () => {
      expect(activeSql).toContain('CREATE TRIGGER trg_question_paper_immutability');
      expect(activeSql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "assessment_questions"');
      expect(activeSql).toContain('trg_enforce_question_paper_immutability()');
    });

    it('should define trg_assessment_lifecycle_protection on assessments', () => {
      expect(activeSql).toContain('CREATE TRIGGER trg_assessment_lifecycle_protection');
      expect(activeSql).toContain('BEFORE UPDATE ON "assessments"');
      expect(activeSql).toContain('trg_enforce_assessment_lifecycle()');
    });

    it('should define trg_assessment_delete_protection on assessments', () => {
      expect(activeSql).toContain('CREATE TRIGGER trg_assessment_delete_protection');
      expect(activeSql).toContain('BEFORE DELETE ON "assessments"');
      expect(activeSql).toContain('trg_enforce_assessment_delete_protection()');
    });

    it('should define trg_assessment_attempt_integrity on assessment_attempts for INSERT and UPDATE', () => {
      expect(activeSql).toContain('CREATE TRIGGER trg_assessment_attempt_integrity');
      expect(activeSql).toContain('BEFORE INSERT OR UPDATE ON "assessment_attempts"');
      expect(activeSql).toContain('trg_enforce_attempt_integrity()');
    });

    it('should define trg_attempt_answer_protection on attempt_answers', () => {
      expect(activeSql).toContain('CREATE TRIGGER trg_attempt_answer_protection');
      expect(activeSql).toContain('BEFORE INSERT OR UPDATE ON "attempt_answers"');
      expect(activeSql).toContain('trg_enforce_attempt_answer_protection()');
    });

    it('should define trg_assessment_result_immutability on assessment_results', () => {
      expect(activeSql).toContain('CREATE TRIGGER trg_assessment_result_immutability');
      expect(activeSql).toContain('BEFORE UPDATE OR DELETE ON "assessment_results"');
      expect(activeSql).toContain('trg_enforce_result_immutability()');
    });

    it('should protect all 12 structural, curricular, and delivery fields on Assessment post-publication', () => {
      const protectedFields = [
        'totalMarks',
        'passingMarks',
        'durationMinutes',
        'subject',
        'gradeId',
        'mode',
        'academicYearId',
        'chapterId',
        'teacherId',
        'sectionId',
        'shuffleQuestions',
        'shuffleOptions',
      ];

      for (const field of protectedFields) {
        expect(activeSql).toContain(`NEW."${field}" IS DISTINCT FROM OLD."${field}"`);
      }
    });

    it('should protect Assessment against status reversion to DRAFT and unarchiving', () => {
      expect(activeSql).toContain("OLD.status IS DISTINCT FROM 'DRAFT' AND NEW.status = 'DRAFT'");
      expect(activeSql).toContain("OLD.status = 'ARCHIVED' AND NEW.status IS DISTINCT FROM 'ARCHIVED'");
    });

    it('should enforce schedule and metadata lock when closed, released, or archived', () => {
      expect(activeSql).toContain("OLD.status IN ('CLOSED', 'RESULTS_RELEASED', 'ARCHIVED')");
      expect(activeSql).toContain("OLD.status IN ('RESULTS_RELEASED', 'ARCHIVED')");
      expect(activeSql).toContain('Metadata (title, description) cannot be modified once assessment % is %');
    });

    it('should enforce initial status IN_PROGRESS and inception timestamp validity on attempt INSERT', () => {
      expect(activeSql).toContain("TG_OP = 'INSERT'");
      expect(activeSql).toContain("NEW.status IS DISTINCT FROM 'IN_PROGRESS'");
      expect(activeSql).toContain('Initial attempt status must be IN_PROGRESS');
      expect(activeSql).toContain('NEW."startedAt" IS NULL OR NEW."deadlineAt" IS NULL');
      expect(activeSql).toContain('NEW."deadlineAt" <= NEW."startedAt"');
    });

    it('should enforce Attempt identity, startedAt, deadlineAt, and terminal transition immutability on UPDATE', () => {
      expect(activeSql).toContain("TG_OP = 'UPDATE'");
      expect(activeSql).toContain('NEW."startedAt" IS DISTINCT FROM OLD."startedAt"');
      expect(activeSql).toContain('NEW."deadlineAt" IS DISTINCT FROM OLD."deadlineAt"');
      expect(activeSql).toContain("OLD.status IN ('SUBMITTED', 'TIMED_OUT')");
      expect(activeSql).toContain("OLD.status = 'IN_PROGRESS' AND NEW.status NOT IN ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT')");
      expect(activeSql).toContain('Attempt identity fields (id, schoolId, assessmentId, studentId) are immutable');
    });

    it('should enforce Answer write serialization and status check against parent attempt', () => {
      expect(activeSql).toContain('FOR SHARE');
      expect(activeSql).toContain("v_attempt_status IS DISTINCT FROM 'IN_PROGRESS'");
      expect(activeSql).toContain('v_attempt_status IS NULL');
    });

    it('should enforce Result strict immutability (blocking UPDATE and DELETE)', () => {
      expect(activeSql).toContain("TG_OP = 'UPDATE'");
      expect(activeSql).toContain("TG_OP = 'DELETE'");
      expect(activeSql).toContain('Assessment results are strictly immutable');
      expect(activeSql).toContain('Assessment results cannot be deleted');
    });

    it('should use null-safe comparison IS DISTINCT FROM across all trigger functions', () => {
      const distinctCount = (activeSql.match(/IS DISTINCT FROM/g) || []).length;
      expect(distinctCount).toBeGreaterThanOrEqual(18);
    });

    it('should strip comments reliably while preserving string literals containing comment delimiters', () => {
      const sample = "SELECT '-- not a comment' AS val; -- real comment\n/* block */SELECT 1;";
      const stripped = stripSqlComments(sample);
      expect(stripped).toContain("SELECT '-- not a comment' AS val;");
      expect(stripped).not.toContain('real comment');
      expect(stripped).not.toContain('/* block */');
    });
  });

  // =========================================================================
  // 7. Referential Actions & Deletion Alignment
  // =========================================================================

  describe('7. Referential Actions & Deletion Hierarchy', () => {
    it('should use RESTRICT on AssessmentQuestion -> Assessment to protect immutability', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "fk_assessment_questions_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT',
      );
    });

    it('should use RESTRICT on AssessmentSection -> Assessment', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "fk_assessment_sections_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT',
      );
    });

    it('should use CASCADE on QuestionImageArtifact -> AssessmentQuestion for draft cleanup', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "fk_question_image_artifacts_question" FOREIGN KEY ("assessmentId", "questionId") REFERENCES "assessment_questions"("assessmentId", "id") ON DELETE CASCADE',
      );
    });

    it('should use RESTRICT on QuestionImageArtifact -> Assessment', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "fk_question_image_artifacts_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT',
      );
    });

    it('should use RESTRICT on AssessmentAttempt -> Assessment', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "fk_assessment_attempts_assessment" FOREIGN KEY ("schoolId", "assessmentId") REFERENCES "assessments"("schoolId", "id") ON DELETE RESTRICT',
      );
    });

    it('should use RESTRICT on AssessmentResult -> AssessmentAttempt', () => {
      expect(migrationSql).toContain(
        'CONSTRAINT "fk_assessment_results_attempt" FOREIGN KEY ("assessmentId", "attemptId", "studentId") REFERENCES "assessment_attempts"("assessmentId", "id", "studentId") ON DELETE RESTRICT',
      );
    });
  });
});
