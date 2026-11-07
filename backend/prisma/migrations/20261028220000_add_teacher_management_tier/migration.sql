-- Migration: 20261028220000_add_teacher_management_tier
-- Unified School ERP Phase 3A: Teacher & Staff Management Tier
-- Strictly multi-tenant isolated with composite foreign keys and single class teacher constraint.

-- 1. Extend UserRole Enum with TEACHER
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TEACHER';

-- 2. Create TeacherStatus Enum
DO $$ BEGIN
  CREATE TYPE "TeacherStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create Teachers Master Table
CREATE TABLE IF NOT EXISTS "teachers" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "department" TEXT,
  "designation" TEXT,
  "joiningDate" TIMESTAMP(3),
  "status" "TeacherStatus" NOT NULL DEFAULT 'ACTIVE',
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "teachers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teachers_schoolId_employeeId_key" UNIQUE ("schoolId", "employeeId"),
  CONSTRAINT "teachers_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "teachers_userId_key" UNIQUE ("userId"),
  CONSTRAINT "fk_teachers_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_teachers_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. Create Teacher Assignments Table
CREATE TABLE IF NOT EXISTS "teacher_assignments" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT 'General',
  "isClassTeacher" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teacher_assignments_unique_subject" UNIQUE ("schoolId", "teacherId", "academicYearId", "sectionId", "subject"),
  CONSTRAINT "fk_teacher_assignments_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_teacher_assignments_teacher" FOREIGN KEY ("schoolId", "teacherId") REFERENCES "teachers"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_teacher_assignments_academic_year" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_teacher_assignments_grade" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grade_classes"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_teacher_assignments_section" FOREIGN KEY ("schoolId", "sectionId") REFERENCES "sections"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Partial Unique Index: At most one Class Teacher per Section per Academic Year within a School
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_assignments_single_class_teacher" 
ON "teacher_assignments"("schoolId", "academicYearId", "sectionId") 
WHERE "isClassTeacher" = true;

-- 6. Performance & Multi-Tenant Query Indexes
CREATE INDEX IF NOT EXISTS "teachers_schoolId_idx" ON "teachers"("schoolId");
CREATE INDEX IF NOT EXISTS "teachers_department_idx" ON "teachers"("department");
CREATE INDEX IF NOT EXISTS "teachers_status_idx" ON "teachers"("status");

CREATE INDEX IF NOT EXISTS "teacher_assignments_schoolId_idx" ON "teacher_assignments"("schoolId");
CREATE INDEX IF NOT EXISTS "teacher_assignments_teacherId_idx" ON "teacher_assignments"("teacherId");
CREATE INDEX IF NOT EXISTS "teacher_assignments_sectionId_idx" ON "teacher_assignments"("sectionId");
CREATE INDEX IF NOT EXISTS "teacher_assignments_gradeId_idx" ON "teacher_assignments"("gradeId");
CREATE INDEX IF NOT EXISTS "teacher_assignments_academicYearId_idx" ON "teacher_assignments"("academicYearId");
