import {
  AttendanceCorrectionEntry,
  AttendanceRegisterHeader,
  AttendanceStatus,
  BulkMarkResult,
  RegisterSummary,
  StudentAttendanceRecord,
} from './types';
import { AttendanceEntryDto } from './dto/bulk-mark-attendance.dto';

export const ATTENDANCE_REPOSITORY = 'ATTENDANCE_REPOSITORY';

export interface StudentHistoryFilterParams {
  startDate?: string;
  endDate?: string;
  academicYearId?: string;
  page: number;
  limit: number;
}

export interface IAttendanceRepository {
  findMarksForSectionAndDate(
    schoolId: string,
    sectionId: string,
    attendanceDate: string,
  ): Promise<StudentAttendanceRecord[]>;

  findRegisterHeader(
    schoolId: string,
    sectionId: string,
    attendanceDate: string,
  ): Promise<AttendanceRegisterHeader | null>;

  saveBulkMarksInTransaction(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string,
    attendanceDate: string,
    entries: AttendanceEntryDto[],
    userId: string,
    summary: RegisterSummary,
  ): Promise<BulkMarkResult>;

  findRecordById(
    schoolId: string,
    attendanceId: string,
  ): Promise<StudentAttendanceRecord | null>;

  updateRecordAndLogCorrection(
    schoolId: string,
    record: StudentAttendanceRecord,
    newStatus: AttendanceStatus,
    reason: string,
    userId: string,
  ): Promise<{ updatedRecord: StudentAttendanceRecord; correctionLog: AttendanceCorrectionEntry }>;

  findStudentHistory(
    schoolId: string,
    studentId: string,
    params: StudentHistoryFilterParams,
  ): Promise<{ records: StudentAttendanceRecord[]; total: number }>;
}
