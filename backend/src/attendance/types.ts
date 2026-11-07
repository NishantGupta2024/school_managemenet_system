/**
 * Domain types and enums for Attendance Management (Phase 3B MVP)
 */

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  EXCUSED = 'EXCUSED',
}

export type VirtualAttendanceStatus = AttendanceStatus | 'NOT_MARKED';

export enum AttendanceType {
  DAILY = 'DAILY',
  PERIOD = 'PERIOD',
}

export enum RegisterStatus {
  UNMARKED = 'UNMARKED',
  PARTIALLY_MARKED = 'PARTIALLY_MARKED',
  SUBMITTED = 'SUBMITTED',
  LOCKED = 'LOCKED',
}

export interface StudentAttendanceRecord {
  id: string;
  schoolId: string;
  registerId: string | null;
  studentId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  attendanceDate: string; // ISO date YYYY-MM-DD
  attendanceType: AttendanceType;
  periodNumber: number;
  status: AttendanceStatus;
  remarks: string | null;
  markedById: string | null;
  markedAt: Date;
  lastUpdatedBy: string | null;
  updatedAt: Date;
}

export interface AttendanceCorrectionEntry {
  id: string;
  schoolId: string;
  attendanceId: string;
  studentId: string;
  attendanceDate: string;
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  reason: string;
  changedById: string;
  changedAt: Date;
}

export interface AttendanceRegisterHeader {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  attendanceDate: string;
  attendanceType: AttendanceType;
  periodNumber: number;
  status: RegisterStatus;
  totalEnrolled: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalHalfDay: number;
  totalExcused: number;
  submittedById: string | null;
  submittedAt: Date | null;
  lockedById: string | null;
  lockedAt: Date | null;
  remarks: string | null;
}

export interface AttendanceRosterItem {
  studentId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string;
  gradeId: string;
  sectionId: string;
  status: VirtualAttendanceStatus;
  remarks: string | null;
  attendanceRecordId: string | null;
  markedAt: Date | null;
}

export interface RegisterSummary {
  totalEnrolled: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalHalfDay: number;
  totalExcused: number;
  totalUnmarked: number;
  status: RegisterStatus;
  isLocked: boolean;
}

export interface BulkMarkResult {
  registerId: string;
  attendanceDate: string;
  sectionId: string;
  totalSubmitted: number;
  createdCount: number;
  updatedCount: number;
  summary: RegisterSummary;
}

export interface StudentAttendanceStats {
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  excusedDays: number;
  attendanceRate: number; // e.g. 92.5
}
