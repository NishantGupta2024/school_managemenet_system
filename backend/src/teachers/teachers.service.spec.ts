import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherStatus } from './types';

describe('TeachersService — Unit Tests & Multi-Tenant Business Rules', () => {
  let service: TeachersService;
  let prismaMock: any;

  const schoolA = '00000000-0000-0000-0000-000000000001';
  const schoolB = '00000000-0000-0000-0000-000000000002';

  const mockTeacherRecord = {
    id: 'tch-101',
    schoolId: schoolA,
    employeeId: 'EMP-001',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah.connor@springfield.edu',
    phone: '9876543210',
    department: 'Science',
    designation: 'Senior Faculty',
    joiningDate: new Date('2026-06-01'),
    status: TeacherStatus.ACTIVE,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    userAccount: null,
    assignments: [],
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
      teacher: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      teacherAssignment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      academicYear: {
        findFirst: jest.fn(),
      },
      gradeClass: {
        findFirst: jest.fn(),
      },
      section: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assessment: {
        count: jest.fn().mockResolvedValue(0),
      },
      assessmentChapter: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
  });

  describe('createTeacher', () => {
    it('creates a teacher profile with uppercase employeeId and trimmed lowercase email', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(null);
      prismaMock.teacher.create.mockResolvedValue({
        ...mockTeacherRecord,
        employeeId: 'EMP-001',
        email: 'sarah.connor@springfield.edu',
      });

      const result = await service.createTeacher(schoolA, {
        employeeId: ' emp-001 ',
        firstName: ' Sarah ',
        lastName: ' Connor ',
        email: ' Sarah.Connor@Springfield.edu ',
        department: 'Science',
      });

      expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith({
        where: { schoolId: schoolA, employeeId: 'EMP-001' },
      });
      expect(prismaMock.teacher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolA,
            employeeId: 'EMP-001',
            firstName: 'Sarah',
            lastName: 'Connor',
            email: 'sarah.connor@springfield.edu',
            department: 'Science',
          }),
        }),
      );
      expect(result.employeeId).toBe('EMP-001');
    });

    it('rejects duplicate employeeId within the same school with ConflictException', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);

      await expect(
        service.createTeacher(schoolA, {
          employeeId: 'EMP-001',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@springfield.edu',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns paginated teachers with metadata', async () => {
      prismaMock.teacher.count.mockResolvedValue(1);
      prismaMock.teacher.findMany.mockResolvedValue([mockTeacherRecord]);

      const result = await service.findAll(schoolA, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('applies search and department filters correctly', async () => {
      prismaMock.teacher.count.mockResolvedValue(0);
      prismaMock.teacher.findMany.mockResolvedValue([]);

      await service.findAll(schoolA, {
        search: 'Sarah',
        department: 'Science',
        status: TeacherStatus.ACTIVE,
      });

      expect(prismaMock.teacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            schoolId: schoolA,
            department: 'Science',
            status: TeacherStatus.ACTIVE,
            OR: expect.arrayContaining([
              { firstName: { contains: 'Sarah', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns teacher when found in caller school', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);

      const result = await service.findOne(schoolA, 'tch-101');
      expect(result.id).toBe('tch-101');
    });

    it('throws NotFoundException when teacher belongs to another school', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(null);

      await expect(service.findOne(schoolB, 'tch-101')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteTeacher vs deactivateTeacher', () => {
    it('blocks hard deletion if teacher has existing assignments', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.teacherAssignment.count.mockResolvedValue(2); // 2 active assignments

      await expect(service.deleteTeacher(schoolA, 'tch-101')).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.teacher.delete).not.toHaveBeenCalled();
    });

    it('blocks hard deletion if teacher has authored assessments', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.teacherAssignment.count.mockResolvedValue(0);
      prismaMock.assessment.count.mockResolvedValue(3); // 3 authored assessments
      prismaMock.assessmentChapter.count.mockResolvedValue(0);

      await expect(service.deleteTeacher(schoolA, 'tch-101')).rejects.toThrow(
        /Cannot delete teacher with existing records:.*3 authored assessment\(s\)/,
      );
      expect(prismaMock.teacher.delete).not.toHaveBeenCalled();
    });

    it('blocks hard deletion if teacher has created chapters', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.teacherAssignment.count.mockResolvedValue(0);
      prismaMock.assessment.count.mockResolvedValue(0);
      prismaMock.assessmentChapter.count.mockResolvedValue(5); // 5 created chapters

      await expect(service.deleteTeacher(schoolA, 'tch-101')).rejects.toThrow(
        /Cannot delete teacher with existing records:.*5 created chapter\(s\)/,
      );
      expect(prismaMock.teacher.delete).not.toHaveBeenCalled();
    });

    it('translates P2003 foreign key violation into ConflictException on teacher delete', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.teacherAssignment.count.mockResolvedValue(0);
      prismaMock.assessment.count.mockResolvedValue(0);
      prismaMock.assessmentChapter.count.mockResolvedValue(0);
      prismaMock.teacher.delete.mockRejectedValue({ code: 'P2003' });

      await expect(service.deleteTeacher(schoolA, 'tch-101')).rejects.toThrow(ConflictException);
    });

    it('allows hard deletion if teacher has 0 assignments', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.teacherAssignment.count.mockResolvedValue(0);
      prismaMock.teacher.delete.mockResolvedValue(mockTeacherRecord);

      const result = await service.deleteTeacher(schoolA, 'tch-101');
      expect(result.success).toBe(true);
      expect(prismaMock.teacher.delete).toHaveBeenCalledWith({
        where: { id: 'tch-101' },
      });
    });

    it('deactivates teacher and deactivates linked user account when present in same school', async () => {
      const teacherWithAccount = { ...mockTeacherRecord, userId: 'usr-999' };
      prismaMock.teacher.findFirst.mockResolvedValue(teacherWithAccount);
      prismaMock.user.findFirst.mockResolvedValue({
        id: 'usr-999',
        schoolId: schoolA,
        status: UserStatus.ACTIVE,
      });
      prismaMock.teacher.update.mockResolvedValue({
        ...teacherWithAccount,
        status: TeacherStatus.INACTIVE,
      });
      prismaMock.user.update.mockResolvedValue({ id: 'usr-999', status: UserStatus.INACTIVE });

      await service.deactivateTeacher(schoolA, 'tch-101');

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'usr-999', schoolId: schoolA },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-999' },
        data: { status: UserStatus.INACTIVE },
      });
      expect(prismaMock.teacher.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: TeacherStatus.INACTIVE },
        }),
      );
    });

    it('rejects linked user deactivation if linked user belongs to another school (SEC-002)', async () => {
      const teacherWithMismatchedAccount = { ...mockTeacherRecord, userId: 'foreign-usr-999' };
      prismaMock.teacher.findFirst.mockResolvedValue(teacherWithMismatchedAccount);
      // User lookup in schoolA returns null (user is in foreign tenant)
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivateTeacher(schoolA, 'tch-101'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('rejects deletion with linked user belonging to another school (SEC-002)', async () => {
      const teacherWithMismatchedAccount = { ...mockTeacherRecord, userId: 'foreign-usr-999' };
      prismaMock.teacher.findFirst.mockResolvedValue(teacherWithMismatchedAccount);
      prismaMock.teacherAssignment.count.mockResolvedValue(0);
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteTeacher(schoolA, 'tch-101'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe('assignTeacher', () => {
    const assignDto = {
      academicYearId: 'year-01',
      gradeId: 'grd-01',
      sectionId: 'sec-01',
      subject: 'Physics',
      isClassTeacher: true,
    };

    it('rejects assignment if teacher is INACTIVE', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        ...mockTeacherRecord,
        status: TeacherStatus.INACTIVE,
      });

      await expect(
        service.assignTeacher(schoolA, 'tch-101', assignDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects assignment if academic year belongs to another school', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.academicYear.findFirst.mockResolvedValue(null); // Foreign academic year

      await expect(
        service.assignTeacher(schoolA, 'tch-101', assignDto),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.academicYear.findFirst).toHaveBeenCalledWith({
        where: { id: assignDto.academicYearId, schoolId: schoolA },
      });
    });

    it('rejects assignment if grade belongs to another school', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year-01', schoolId: schoolA });
      prismaMock.gradeClass.findFirst.mockResolvedValue(null); // Foreign grade

      await expect(
        service.assignTeacher(schoolA, 'tch-101', assignDto),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.gradeClass.findFirst).toHaveBeenCalledWith({
        where: { id: assignDto.gradeId, schoolId: schoolA },
      });
    });

    it('rejects assignment if section does not belong to grade', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year-01', schoolId: schoolA });
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: 'grd-01', schoolId: schoolA, name: 'Grade 10' });
      prismaMock.section.findFirst.mockResolvedValue(null); // Not matching grade/school

      await expect(
        service.assignTeacher(schoolA, 'tch-101', assignDto),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.section.findFirst).toHaveBeenCalledWith({
        where: { id: assignDto.sectionId, schoolId: schoolA, gradeId: assignDto.gradeId },
      });
    });

    it('enforces at most one class teacher per section per academic year', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year-01', schoolId: schoolA, name: '2026-2027' });
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: 'grd-01', schoolId: schoolA, name: 'Grade 10' });
      prismaMock.section.findFirst.mockResolvedValue({ id: 'sec-01', schoolId: schoolA, gradeId: 'grd-01', name: 'A' });

      // Another teacher is already class teacher
      prismaMock.teacherAssignment.findFirst.mockResolvedValueOnce({
        id: 'asg-existing',
        teacherId: 'other-tch',
        teacher: { firstName: 'Robert', lastName: 'Oppenheimer', employeeId: 'EMP-002' },
      });

      await expect(
        service.assignTeacher(schoolA, 'tch-101', assignDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate assignment for the same teacher, section, and subject', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year-01', schoolId: schoolA, name: '2026-2027' });
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: 'grd-01', schoolId: schoolA, name: 'Grade 10' });
      prismaMock.section.findFirst.mockResolvedValue({ id: 'sec-01', schoolId: schoolA, gradeId: 'grd-01', name: 'A' });

      // No other class teacher
      prismaMock.teacherAssignment.findFirst
        .mockResolvedValueOnce(null)
        // Duplicate check finds existing assignment
        .mockResolvedValueOnce({ id: 'asg-dup' });

      await expect(
        service.assignTeacher(schoolA, 'tch-101', assignDto),
      ).rejects.toThrow(ConflictException);
    });

    it('creates assignment successfully when all constraints pass', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: 'year-01', schoolId: schoolA, name: '2026-2027' });
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: 'grd-01', schoolId: schoolA, name: 'Grade 10' });
      prismaMock.section.findFirst.mockResolvedValue({ id: 'sec-01', schoolId: schoolA, gradeId: 'grd-01', name: 'A' });

      prismaMock.teacherAssignment.findFirst
        .mockResolvedValueOnce(null) // no existing class teacher
        .mockResolvedValueOnce(null); // no duplicate

      prismaMock.teacherAssignment.create.mockResolvedValue({
        id: 'asg-new',
        schoolId: schoolA,
        teacherId: 'tch-101',
        subject: 'Physics',
        isClassTeacher: true,
      });

      const result = await service.assignTeacher(schoolA, 'tch-101', assignDto);
      expect(result.id).toBe('asg-new');
      expect(prismaMock.teacherAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolA,
            teacherId: 'tch-101',
            subject: 'Physics',
            isClassTeacher: true,
          }),
        }),
      );
    });
  });

  describe('provisionTeacherAccount (SEC-001 Atomic Transactions & Safe Provisioning)', () => {
    it('creates user with role TEACHER and links to teacher profile atomically', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.user.findFirst.mockResolvedValue(null); // email not taken
      prismaMock.user.create.mockResolvedValue({
        id: 'usr-new',
        email: 'sarah.connor@springfield.edu',
        name: 'Sarah Connor',
        role: 'TEACHER',
        status: UserStatus.ACTIVE,
      });
      prismaMock.teacher.update.mockResolvedValue({ ...mockTeacherRecord, userId: 'usr-new' });

      const result = await service.provisionTeacherAccount(schoolA, 'tch-101', {
        password: 'SecurePassword123!',
      });

      expect(result.success).toBe(true);
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolA,
            email: 'sarah.connor@springfield.edu',
            role: 'TEACHER',
            status: UserStatus.ACTIVE,
          }),
        }),
      );
      expect(prismaMock.teacher.update).toHaveBeenCalledWith({
        where: { id: 'tch-101' },
        data: { userId: 'usr-new' },
      });
    });

    it('rejects provisioning if teacher already has a user account', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        ...mockTeacherRecord,
        userId: 'existing-usr',
      });

      await expect(
        service.provisionTeacherAccount(schoolA, 'tch-101', {
          password: 'Password123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects provisioning if email is already used by another account in school', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.user.findFirst.mockResolvedValue({ id: 'collision-usr' });

      await expect(
        service.provisionTeacherAccount(schoolA, 'tch-101', {
          email: 'taken@springfield.edu',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rolls back atomic account provisioning if linking the user to teacher fails (SEC-001)', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(mockTeacherRecord);
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'usr-new',
        email: 'sarah.connor@springfield.edu',
        name: 'Sarah Connor',
        role: 'TEACHER',
        status: UserStatus.ACTIVE,
      });
      // Simulate fatal failure on teacher profile link
      prismaMock.teacher.update.mockRejectedValue(new Error('Fatal linkage failure'));

      await expect(
        service.provisionTeacherAccount(schoolA, 'tch-101', {
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow('Fatal linkage failure');
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('detects concurrent duplicate provisioning race inside transaction and rejects with ConflictException', async () => {
      // First call outside tx: userId is null
      prismaMock.teacher.findFirst
        .mockResolvedValueOnce(mockTeacherRecord)
        // Inside transaction: concurrent request has populated userId!
        .mockResolvedValueOnce({ ...mockTeacherRecord, userId: 'concurrent-usr-already-linked' });
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        service.provisionTeacherAccount(schoolA, 'tch-101', {
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });
});
