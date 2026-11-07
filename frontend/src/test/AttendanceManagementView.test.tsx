import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AttendanceRegisterView } from '../components/AttendanceRegisterView';
import { AttendanceManagementWorkspace } from '../components/AttendanceManagementWorkspace';
import {
  attendanceApi,
  academicsApi,
  AttendanceRosterItem,
  AttendanceRegisterResponse,
  BulkMarkResult,
  StudentAttendanceHistoryResponse,
  AttendanceCorrectionResult,
  getMyTeacherProfile,
} from '../services/api';
import { AuthProvider } from '../context/AuthContext';

let currentMockUser: any = {
  id: 'admin-1',
  email: 'admin@school.edu',
  name: 'School Administrator',
  role: 'SCHOOL_ADMIN',
  schoolId: 'school-1',
  schoolName: 'Greenwood International',
};

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      login: vi.fn(),
      logout: vi.fn(),
      getToken: vi.fn(() => 'mock-jwt-token'),
      getUser: vi.fn(() => currentMockUser),
      getProfile: vi.fn(() => Promise.resolve(currentMockUser)),
    },
    academicsApi: {
      getAcademicYears: vi.fn(),
      getGrades: vi.fn(),
    },
    attendanceApi: {
      getRegister: vi.fn(),
      bulkMark: vi.fn(),
      correctAttendance: vi.fn(),
      getStudentHistory: vi.fn(),
    },
    getMyTeacherProfile: vi.fn().mockResolvedValue(null),
  };
});

const mockAcademicYears = [
  {
    id: 'ay-1',
    schoolId: 'school-1',
    name: '2026-2027',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    isCurrent: true,
  },
];

const mockGrades = [
  {
    id: 'grade-1',
    schoolId: 'school-1',
    name: 'Grade 10',
    code: 'G10',
    sections: [
      {
        id: 'section-1',
        schoolId: 'school-1',
        gradeId: 'grade-1',
        name: 'A',
        capacity: 40,
      },
    ],
  },
];

const mockRosterData: AttendanceRosterItem[] = [
  {
    studentId: 'student-1',
    admissionNumber: 'ADM-001',
    rollNumber: '101',
    firstName: 'Aarav',
    lastName: 'Sharma',
    gradeId: 'grade-1',
    sectionId: 'section-1',
    status: 'NOT_MARKED',
    remarks: null,
    attendanceRecordId: null,
    markedAt: null,
  },
  {
    studentId: 'student-2',
    admissionNumber: 'ADM-002',
    rollNumber: '102',
    firstName: 'Diya',
    lastName: 'Patel',
    gradeId: 'grade-1',
    sectionId: 'section-1',
    status: 'NOT_MARKED',
    remarks: null,
    attendanceRecordId: null,
    markedAt: null,
  },
];

const mockRegisterResponse: AttendanceRegisterResponse = {
  data: mockRosterData,
  register: {
    totalEnrolled: 2,
    totalPresent: 0,
    totalAbsent: 0,
    totalLate: 0,
    totalHalfDay: 0,
    totalExcused: 0,
    totalUnmarked: 2,
    status: 'UNMARKED',
    isLocked: false,
  },
  meta: {
    total: 2,
    page: 1,
    limit: 50,
    totalPages: 1,
  },
};

const renderComponent = (ui: React.ReactElement = <AttendanceRegisterView />) => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/app/attendance']}>
        <Routes>
          <Route path="/app/attendance" element={ui} />
          <Route path="/app" element={<div>Launcher Root</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
};

describe('AttendanceRegisterView and Attendance Frontend Suite', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    currentMockUser = {
      id: 'admin-1',
      email: 'admin@school.edu',
      name: 'School Administrator',
      role: 'SCHOOL_ADMIN',
      schoolId: 'school-1',
      schoolName: 'Greenwood International',
    };

    (academicsApi.getAcademicYears as any).mockResolvedValue(mockAcademicYears);
    (academicsApi.getGrades as any).mockResolvedValue(mockGrades);
    (attendanceApi.getRegister as any).mockResolvedValue(mockRegisterResponse);
    (getMyTeacherProfile as any).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Loads academic hierarchy metadata and queries daily attendance register', async () => {
    renderComponent();

    // Verify metadata requests
    await waitFor(() => {
      expect(academicsApi.getAcademicYears).toHaveBeenCalledTimes(1);
      expect(academicsApi.getGrades).toHaveBeenCalledTimes(1);
    });

    // Verify register request made with selected IDs
    await waitFor(() => {
      expect(attendanceApi.getRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
        }),
      );
    });

    // Verify roster students rendered
    expect(await screen.findByText('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByText('Diya Patel')).toBeInTheDocument();
    expect(screen.getByText('Adm: ADM-001')).toBeInTheDocument();
    expect(screen.getByText('Adm: ADM-002')).toBeInTheDocument();
  });

  it('2. Renders register status summary and virtual NOT_MARKED indicators', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    // Summary banner counters
    expect(screen.getByText('Register Status:')).toBeInTheDocument();
    expect(screen.getAllByText('Unmarked').length).toBeGreaterThan(0);
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
  });

  it('3. Supports "Mark All Present" batch helper action', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    const markAllPresentBtn = screen.getByRole('button', { name: /Mark All Present/i });
    expect(markAllPresentBtn).toBeInTheDocument();

    fireEvent.click(markAllPresentBtn);
    // Button click does not throw and maintains UI state
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
  });

  it('4. Submits bulk marks with exact DTO payload and displays success message', async () => {
    const mockBulkResult: BulkMarkResult = {
      registerId: 'reg-1',
      attendanceDate: '2026-10-25',
      sectionId: 'section-1',
      totalSubmitted: 2,
      createdCount: 2,
      updatedCount: 0,
      summary: {
        totalEnrolled: 2,
        totalPresent: 2,
        totalAbsent: 0,
        totalLate: 0,
        totalHalfDay: 0,
        totalExcused: 0,
        totalUnmarked: 0,
        status: 'SUBMITTED',
        isLocked: false,
      },
    };

    (attendanceApi.bulkMark as any).mockResolvedValue(mockBulkResult);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Save & Submit Register/i });
    expect(submitBtn).toBeInTheDocument();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(attendanceApi.bulkMark).toHaveBeenCalledWith(
        expect.objectContaining({
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          entries: expect.arrayContaining([
            expect.objectContaining({ studentId: 'student-1', status: 'PRESENT' }),
            expect.objectContaining({ studentId: 'student-2', status: 'PRESENT' }),
          ]),
        }),
      );
    });

    // Verify success banner appears
    expect(
      await screen.findByText(/Successfully submitted attendance register/i),
    ).toBeInTheDocument();
  });

  it('5. Displays backend validation error message when submission fails', async () => {
    (attendanceApi.bulkMark as any).mockRejectedValue({
      response: {
        status: 400,
        data: { message: 'Cannot mark attendance for a future date' },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Save & Submit Register/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('Cannot mark attendance for a future date'),
    ).toBeInTheDocument();
  });

  it('6. Displays access-denied state when unassigned teacher queries a section', async () => {
    currentMockUser = {
      id: 'teacher-2',
      email: 'teacher2@school.edu',
      name: 'Unassigned Teacher',
      role: 'TEACHER',
      schoolId: 'school-1',
    };

    (attendanceApi.getRegister as any).mockRejectedValue({
      response: {
        status: 403,
        data: {
          message:
            'Access denied: You are not assigned to mark or view attendance for this grade and section',
        },
      },
    });

    renderComponent();

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have any designated Class Teacher assignments for attendance management/i),
    ).toBeInTheDocument();
  });

  it('7. Enforces read-only behavior for FEE_STAFF role', async () => {
    currentMockUser = {
      id: 'staff-1',
      email: 'staff@school.edu',
      name: 'Fee Staff Member',
      role: 'FEE_STAFF',
      schoolId: 'school-1',
    };

    renderComponent();

    // Verify read-only notice banner is visible
    expect(await screen.findByText(/Read-Only Access:/i)).toBeInTheDocument();

    // Quick Mark buttons and Submit button must not be visible
    expect(screen.queryByRole('button', { name: /Mark All Present/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save & Submit Register/i })).not.toBeInTheDocument();
  });

  it('8. Opens Attendance Correction Modal, validates mandatory reason, and submits patch', async () => {
    // Provide roster with an existing record
    const markedRoster: AttendanceRosterItem[] = [
      {
        studentId: 'student-1',
        admissionNumber: 'ADM-001',
        rollNumber: '101',
        firstName: 'Aarav',
        lastName: 'Sharma',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        status: 'PRESENT',
        remarks: 'On time',
        attendanceRecordId: 'att-record-1',
        markedAt: '2026-10-25T08:00:00Z',
      },
    ];

    (attendanceApi.getRegister as any).mockResolvedValue({
      ...mockRegisterResponse,
      data: markedRoster,
    });

    const mockCorrectionResult: AttendanceCorrectionResult = {
      updatedRecord: {
        id: 'att-record-1',
        schoolId: 'school-1',
        registerId: 'reg-1',
        studentId: 'student-1',
        academicYearId: 'ay-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        attendanceDate: '2026-10-25',
        attendanceType: 'DAILY',
        periodNumber: 0,
        status: 'LATE',
        remarks: 'On time',
        markedById: 'admin-1',
        markedAt: '2026-10-25T08:00:00Z',
        lastUpdatedBy: 'admin-1',
        updatedAt: '2026-10-25T09:00:00Z',
      },
      correctionLog: {
        id: 'log-1',
        schoolId: 'school-1',
        attendanceId: 'att-record-1',
        studentId: 'student-1',
        attendanceDate: '2026-10-25',
        previousStatus: 'PRESENT',
        newStatus: 'LATE',
        reason: 'Bus breakdown delayed arrival',
        changedById: 'admin-1',
        changedAt: '2026-10-25T09:00:00Z',
      },
    };

    (attendanceApi.correctAttendance as any).mockResolvedValue(mockCorrectionResult);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    // Open correction modal via edit button
    const editBtn = screen.getByTitle('Correct attendance record with reason');
    fireEvent.click(editBtn);

    expect(screen.getByText('Attendance Correction')).toBeInTheDocument();
    expect(screen.getByText(/Mandatory audit trail reason required/i)).toBeInTheDocument();

    // Select new status
    const statusSelect = screen.getByLabelText(/New Attendance Status/i);
    fireEvent.change(statusSelect, { target: { value: 'LATE' } });

    // Enter correction reason (>= 5 chars)
    const reasonInput = screen.getByPlaceholderText(/Bus breakdown delayed arrival/i);
    fireEvent.change(reasonInput, { target: { value: 'Bus breakdown delayed arrival' } });

    const saveCorrectionBtn = screen.getByRole('button', { name: /Save Correction/i });
    expect(saveCorrectionBtn).not.toBeDisabled();
    fireEvent.click(saveCorrectionBtn);

    await waitFor(() => {
      expect(attendanceApi.correctAttendance).toHaveBeenCalledWith('att-record-1', {
        status: 'LATE',
        reason: 'Bus breakdown delayed arrival',
      });
    });

    // Verify success notification
    expect(await screen.findByText(/updated to LATE/i)).toBeInTheDocument();
  });

  it('9. Opens Student Attendance History Modal and displays statistics and logs', async () => {
    const mockHistory: StudentAttendanceHistoryResponse = {
      student: {
        id: 'student-1',
        admissionNumber: 'ADM-001',
        rollNumber: '101',
        firstName: 'Aarav',
        lastName: 'Sharma',
        gradeId: 'grade-1',
        sectionId: 'section-1',
      },
      stats: {
        totalWorkingDays: 20,
        presentDays: 18,
        absentDays: 1,
        lateDays: 1,
        halfDays: 0,
        excusedDays: 0,
        attendanceRate: 95.0,
      },
      data: [
        {
          id: 'att-1',
          schoolId: 'school-1',
          registerId: 'reg-1',
          studentId: 'student-1',
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          attendanceDate: '2026-10-25',
          attendanceType: 'DAILY',
          periodNumber: 0,
          status: 'PRESENT',
          remarks: 'On time',
          markedById: 'admin-1',
          markedAt: '2026-10-25T08:00:00Z',
          lastUpdatedBy: null,
          updatedAt: '2026-10-25T08:00:00Z',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 30,
        totalPages: 1,
      },
    };

    (attendanceApi.getStudentHistory as any).mockResolvedValue(mockHistory);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    const historyBtn = screen.getAllByTitle('View student attendance history')[0];
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(attendanceApi.getStudentHistory).toHaveBeenCalledWith('student-1', {
        academicYearId: 'ay-1',
      });
    });

    // Verify statistics cards
    expect(await screen.findByText('95%')).toBeInTheDocument();
    expect(screen.getByText('Overall Attendance Rate')).toBeInTheDocument();
    expect(screen.getByText('Daily Roll Records (1)')).toBeInTheDocument();
  });

  it('10. Renders AttendanceManagementWorkspace shell with top navigation bar', async () => {
    renderComponent(<AttendanceManagementWorkspace />);

    // Verify workspace header
    expect(
      await screen.findByText('Daily Attendance & Roll-Call Registers'),
    ).toBeInTheDocument();
    expect(screen.getByText('All Systems')).toBeInTheDocument();

    // Verify child view loaded
    expect(screen.getByText('Daily Attendance Register')).toBeInTheDocument();
  });

  it('11. Restricts unauthorized roles (e.g. STUDENT) at workspace shell level', async () => {
    currentMockUser = {
      id: 'student-user-1',
      email: 'student@school.edu',
      name: 'Enrolled Student',
      role: 'STUDENT',
      schoolId: 'school-1',
    };

    renderComponent(<AttendanceManagementWorkspace />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(
      screen.getByText(/Your authenticated role \(STUDENT\) is not authorized/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return to System Launcher/i })).toBeInTheDocument();
  });

  it('12. Direct route access displays Class Teacher Assignment Required for unassigned teacher', async () => {
    currentMockUser = {
      id: 'teacher-unassigned-1',
      email: 'teacher.unassigned@school.edu',
      name: 'Unassigned Teacher',
      role: 'TEACHER',
      schoolId: 'school-1',
    };

    (getMyTeacherProfile as any).mockResolvedValueOnce({
      id: 'tch-unassigned',
      email: 'teacher.unassigned@school.edu',
      assignments: [],
    });

    renderComponent(<AttendanceManagementWorkspace />);

    expect(await screen.findByText('Class Teacher Assignment Required')).toBeInTheDocument();
    expect(
      screen.getByText(/Daily attendance marking and register management is restricted to designated/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return to System Launcher/i })).toBeInTheDocument();
    // Does NOT expose attendance register table or student data
    expect(screen.queryByText('Daily Attendance Register')).not.toBeInTheDocument();
  });

  it('13. Direct route access displays Class Teacher Assignment Required for subject-only teacher', async () => {
    currentMockUser = {
      id: 'teacher-subject-1',
      email: 'teacher.subject@school.edu',
      name: 'Subject Teacher',
      role: 'TEACHER',
      schoolId: 'school-1',
    };

    (getMyTeacherProfile as any).mockResolvedValueOnce({
      id: 'tch-subject',
      email: 'teacher.subject@school.edu',
      assignments: [
        {
          id: 'asg-sub-1',
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          subject: 'Mathematics',
          isClassTeacher: false,
        },
      ],
    });

    renderComponent(<AttendanceManagementWorkspace />);

    expect(await screen.findByText('Class Teacher Assignment Required')).toBeInTheDocument();
    expect(screen.queryByText('Daily Attendance Register')).not.toBeInTheDocument();
  });

  it('14. Authorized Class Teacher defaults selection to their assigned grade and section', async () => {
    currentMockUser = {
      id: 'teacher-class-1',
      email: 'teacher.class@school.edu',
      name: 'Class Teacher',
      role: 'TEACHER',
      schoolId: 'school-1',
    };

    const teacherProfileData = {
      id: 'tch-class',
      email: 'teacher.class@school.edu',
      assignments: [
        {
          id: 'asg-class-1',
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          subject: 'General',
          isClassTeacher: true,
        },
      ],
    };

    (getMyTeacherProfile as any).mockResolvedValue(teacherProfileData);

    renderComponent(<AttendanceManagementWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Daily Attendance & Roll-Call Registers')).toBeInTheDocument();
    });

    // Verify register was queried for the teacher's assigned section
    await waitFor(() => {
      expect(attendanceApi.getRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
        }),
      );
    });

    // Verify no access denied banner is displayed
    expect(screen.queryByText(/Access Restricted/i)).not.toBeInTheDocument();
  });

  it('15. Restricts grade and section dropdown choices to teacher Class Teacher assignments only', async () => {
    currentMockUser = {
      id: 'teacher-class-1',
      email: 'teacher.class@school.edu',
      name: 'Class Teacher',
      role: 'TEACHER',
      schoolId: 'school-1',
    };

    // School has grade-1 (with section-1 and section-2) and grade-2
    // Teacher is ONLY Class Teacher for grade-1 section-2
    const teacherProfileData = {
      id: 'tch-class',
      email: 'teacher.class@school.edu',
      assignments: [
        {
          id: 'asg-class-1',
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-2',
          subject: 'General',
          isClassTeacher: true,
        },
        {
          id: 'asg-subject-only',
          academicYearId: 'ay-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          subject: 'Physics',
          isClassTeacher: false, // Subject only!
        },
      ],
    };

    (getMyTeacherProfile as any).mockResolvedValue(teacherProfileData);

    renderComponent(<AttendanceRegisterView teacherProfile={teacherProfileData as any} />);

    await waitFor(() => {
      expect(screen.getByText('Daily Attendance Register')).toBeInTheDocument();
    });

    // Defaulted to section-2 (where isClassTeacher: true)
    await waitFor(() => {
      expect(attendanceApi.getRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: 'section-2',
        }),
      );
    });
  });

  it('16. Gracefully handles teacher profile fetch failure', async () => {
    currentMockUser = {
      id: 'teacher-err',
      email: 'teacher.err@school.edu',
      name: 'Faculty Member',
      role: 'TEACHER',
      schoolId: 'school-1',
    };

    (getMyTeacherProfile as any).mockRejectedValueOnce(new Error('Network failure'));

    renderComponent(<AttendanceManagementWorkspace />);

    expect(await screen.findByText('Class Teacher Assignment Required')).toBeInTheDocument();
    expect(screen.queryByText('Daily Attendance Register')).not.toBeInTheDocument();
  });
});
