import { TeacherStatus, Teacher, TeacherAssignment } from '@prisma/client';

export { TeacherStatus, Teacher, TeacherAssignment };

export interface TeacherRecord extends Teacher {
  userAccount?: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
  } | null;
  assignments?: TeacherAssignmentRecord[];
}

export interface TeacherAssignmentRecord extends TeacherAssignment {
  grade?: {
    id: string;
    name: string;
    code: string;
  };
  section?: {
    id: string;
    name: string;
  };
  academicYear?: {
    id: string;
    name: string;
    isCurrent: boolean;
  };
  teacher?: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
  };
}
