-- Migration: 20261029010000_add_attendance_management_tier
-- Unified School ERP Phase 3B: Attendance Management Tier
-- Strictly multi-tenant isolated with composite foreign keys, register header lifecycle, and immutable correction log.

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttendanceType" AS ENUM ('DAILY', 'PERIOD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RegisterStatus" AS ENUM ('UNMARKED', 'PARTIALLY_MARKED', 'SUBMITTED', 'LOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "HolidayType" AS ENUM ('PUBLIC_HOLIDAY', 'INSTITUTIONAL_HOLIDAY', 'VACATION', 'EMERGENCY_CLOSURE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create Attendance Registers Table (Section-level workflow header)
CREATE TABLE IF NOT EXISTS "attendance_registers" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "attendanceType" "AttendanceType" NOT NULL DEFAULT 'DAILY',
  "periodNumber" INTEGER NOT NULL DEFAULT 0,
  "status" "RegisterStatus" NOT NULL DEFAULT 'UNMARKED',
  "totalEnrolled" INTEGER NOT NULL DEFAULT 0,
  "totalPresent" INTEGER NOT NULL DEFAULT 0,
  "totalAbsent" INTEGER NOT NULL DEFAULT 0,
  "totalLate" INTEGER NOT NULL DEFAULT 0,
  "totalHalfDay" INTEGER NOT NULL DEFAULT 0,
  "totalExcused" INTEGER NOT NULL DEFAULT 0,
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "lockedById" TEXT,
  "lockedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_registers_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "attendance_registers_unique_session" UNIQUE ("schoolId", "sectionId", "attendanceDate", "attendanceType", "periodNumber"),
  CONSTRAINT "fk_attendance_registers_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_registers_academic_year" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_registers_grade" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grade_classes"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_registers_section" FOREIGN KEY ("schoolId", "sectionId") REFERENCES "sections"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_registers_submitted_by" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_registers_locked_by" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 3. Create Student Attendance Table
CREATE TABLE IF NOT EXISTS "student_attendance" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "registerId" TEXT,
  "studentId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "attendanceType" "AttendanceType" NOT NULL DEFAULT 'DAILY',
  "periodNumber" INTEGER NOT NULL DEFAULT 0,
  "status" "AttendanceStatus" NOT NULL,
  "remarks" TEXT,
  "markedById" TEXT,
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "student_attendance_unique_entry" UNIQUE ("schoolId", "studentId", "attendanceDate", "attendanceType", "periodNumber"),
  CONSTRAINT "fk_student_attendance_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_register" FOREIGN KEY ("schoolId", "registerId") REFERENCES "attendance_registers"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_student" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_academic_year" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_grade" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grade_classes"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_section" FOREIGN KEY ("schoolId", "sectionId") REFERENCES "sections"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_marked_by" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_student_attendance_updated_by" FOREIGN KEY ("lastUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. Create Attendance Correction Logs Table (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS "attendance_correction_logs" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "previousStatus" "AttendanceStatus" NOT NULL,
  "newStatus" "AttendanceStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "changedById" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_correction_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_correction_logs_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "fk_attendance_correction_logs_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_correction_logs_attendance" FOREIGN KEY ("schoolId", "attendanceId") REFERENCES "student_attendance"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_correction_logs_student" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_attendance_correction_logs_changed_by" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 5. Create School Holidays Table (Calendar Working Day Policy)
CREATE TABLE IF NOT EXISTS "school_holidays" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "holidayDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "holidayType" "HolidayType" NOT NULL DEFAULT 'PUBLIC_HOLIDAY',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "school_holidays_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_holidays_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "school_holidays_unique_date" UNIQUE ("schoolId", "holidayDate"),
  CONSTRAINT "fk_school_holidays_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_school_holidays_academic_year" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. Create Performance Indexes
CREATE INDEX IF NOT EXISTS "attendance_registers_schoolId_attendanceDate_idx" ON "attendance_registers"("schoolId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "attendance_registers_schoolId_gradeId_sectionId_attendanceDate_idx" ON "attendance_registers"("schoolId", "gradeId", "sectionId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "attendance_registers_schoolId_status_idx" ON "attendance_registers"("schoolId", "status");

CREATE INDEX IF NOT EXISTS "student_attendance_schoolId_attendanceDate_idx" ON "student_attendance"("schoolId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "student_attendance_schoolId_studentId_attendanceDate_idx" ON "student_attendance"("schoolId", "studentId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "student_attendance_schoolId_sectionId_attendanceDate_status_idx" ON "student_attendance"("schoolId", "sectionId", "attendanceDate", "status");
CREATE INDEX IF NOT EXISTS "student_attendance_schoolId_academicYearId_studentId_idx" ON "student_attendance"("schoolId", "academicYearId", "studentId");

CREATE INDEX IF NOT EXISTS "attendance_correction_logs_schoolId_attendanceId_idx" ON "attendance_correction_logs"("schoolId", "attendanceId");
CREATE INDEX IF NOT EXISTS "attendance_correction_logs_schoolId_studentId_idx" ON "attendance_correction_logs"("schoolId", "studentId");
CREATE INDEX IF NOT EXISTS "attendance_correction_logs_schoolId_changedAt_idx" ON "attendance_correction_logs"("schoolId", "changedAt");

CREATE INDEX IF NOT EXISTS "school_holidays_schoolId_academicYearId_holidayDate_idx" ON "school_holidays"("schoolId", "academicYearId", "holidayDate");
