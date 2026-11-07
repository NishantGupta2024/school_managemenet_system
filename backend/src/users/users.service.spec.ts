import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService (FEE-P2B)', () => {
  let service: UsersService;
  let mockPrisma: any;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';
  const sampleUserId = 'user-uuid-1111';

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      student: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      parentStudentRelation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };
    service = new UsersService(mockPrisma);
  });

  describe('findAll', () => {
    it('returns users scoped to schoolId without password hashes', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: sampleUserId,
          schoolId: schoolAId,
          email: 'staff@school.edu',
          name: 'Staff One',
          role: UserRole.FEE_STAFF,
          status: UserStatus.ACTIVE,
        },
      ]);

      const result = await service.findAll(schoolAId, {});
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('staff@school.edu');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId: schoolAId },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns single user in school', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: sampleUserId,
        schoolId: schoolAId,
        email: 'staff@school.edu',
      });

      const result = await service.findOne(schoolAId, sampleUserId);
      expect(result.id).toBe(sampleUserId);
    });

    it('throws NotFoundException if user not found in school', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findOne(schoolAId, 'other-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createStaff', () => {
    const staffDto = {
      name: 'Accountant Jane',
      email: 'Jane.Accountant@School.edu',
      password: 'SecurePassword123!',
    };

    it('creates FEE_STAFF user in school with normalized email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-staff-id',
        schoolId: schoolAId,
        name: 'Accountant Jane',
        email: 'jane.accountant@school.edu',
        role: UserRole.FEE_STAFF,
        status: UserStatus.ACTIVE,
      });

      const result = await service.createStaff(schoolAId, staffDto);

      expect(result.id).toBe('new-staff-id');
      expect(result.role).toBe(UserRole.FEE_STAFF);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolAId,
            email: 'jane.accountant@school.edu',
            role: UserRole.FEE_STAFF,
            status: UserStatus.ACTIVE,
          }),
        }),
      );
    });

    it('rejects if email already registered in school', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.createStaff(schoolAId, staffDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateUser', () => {
    it('updates allowlisted name field', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: sampleUserId,
        schoolId: schoolAId,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: sampleUserId,
        name: 'Jane Doe Updated',
      });

      const result = await service.updateUser(schoolAId, sampleUserId, {
        name: 'Jane Doe Updated',
      });

      expect(result.name).toBe('Jane Doe Updated');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sampleUserId },
          data: { name: 'Jane Doe Updated' },
        }),
      );
    });

    it('throws NotFoundException if user not found in school', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.updateUser(schoolAId, 'missing-id', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('updates user status to INACTIVE', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: sampleUserId,
        schoolId: schoolAId,
        role: UserRole.FEE_STAFF,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: sampleUserId,
        status: UserStatus.INACTIVE,
      });

      const result = await service.updateStatus(
        schoolAId,
        sampleUserId,
        'current-admin-id',
        { status: UserStatus.INACTIVE },
      );

      expect(result.status).toBe(UserStatus.INACTIVE);
    });

    it('rejects self-deactivation', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: sampleUserId,
        schoolId: schoolAId,
      });

      await expect(
        service.updateStatus(schoolAId, sampleUserId, sampleUserId, {
          status: UserStatus.INACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects deactivating last active school admin', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        schoolId: schoolAId,
        role: UserRole.SCHOOL_ADMIN,
      });
      mockPrisma.user.count.mockResolvedValue(1); // only 1 active admin

      await expect(
        service.updateStatus(schoolAId, 'admin-1', 'other-caller', {
          status: UserStatus.INACTIVE,
        }),
      ).rejects.toThrow(/Cannot deactivate the last active School Administrator/);
    });
  });

  describe('getUnlinkedStudents', () => {
    it('returns students in school where userId is null', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: 'stud-1', schoolId: schoolAId, userId: null },
      ]);

      const result = await service.getUnlinkedStudents(schoolAId);
      expect(result).toHaveLength(1);
      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId: schoolAId, userId: null },
        }),
      );
    });
  });

  describe('provisionStudentAccount', () => {
    const studentDto = {
      email: 'student@school.edu',
      password: 'StudentPassword123!',
    };

    it('provisions student account and links to existing student record', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-uuid',
        schoolId: schoolAId,
        firstName: 'Alice',
        lastName: 'Wonder',
        userId: null,
      });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        schoolId: schoolAId,
        email: 'student@school.edu',
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      });
      mockPrisma.student.update.mockResolvedValue({
        id: 'student-uuid',
        userId: 'new-user-id',
      });

      const result = await service.provisionStudentAccount(
        schoolAId,
        'student-uuid',
        studentDto,
      );

      expect(result.message).toContain('successfully provisioned');
      expect(result.user.id).toBe('new-user-id');
      expect(result.studentId).toBe('student-uuid');
    });

    it('rejects if student already has account linked', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-uuid',
        schoolId: schoolAId,
        userId: 'existing-user-id',
      });

      await expect(
        service.provisionStudentAccount(schoolAId, 'student-uuid', studentDto),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects if student not found in current school', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);

      await expect(
        service.provisionStudentAccount(schoolAId, 'student-uuid', studentDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createParent & linkParentStudent', () => {
    const parentDto = {
      name: 'Parent Bob',
      email: 'bob.parent@school.edu',
      password: 'ParentPassword123!',
      studentIds: ['student-1'],
    };

    it('creates parent and associates student', async () => {
      mockPrisma.student.findMany.mockResolvedValue([{ id: 'student-1', schoolId: schoolAId }]);
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null) // parent does not exist
        .mockResolvedValueOnce({
          id: 'new-parent-id',
          schoolId: schoolAId,
          role: UserRole.PARENT,
          email: 'bob.parent@school.edu',
          parentRelations: [],
        }); // findOne call
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-parent-id',
        schoolId: schoolAId,
        role: UserRole.PARENT,
        email: 'bob.parent@school.edu',
      });
      mockPrisma.parentStudentRelation.findUnique.mockResolvedValue(null);
      mockPrisma.parentStudentRelation.create.mockResolvedValue({});

      const result = await service.createParent(schoolAId, parentDto);

      expect(result.id).toBe('new-parent-id');
      expect(mockPrisma.parentStudentRelation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: schoolAId,
            parentId: 'new-parent-id',
            studentId: 'student-1',
          }),
        }),
      );
    });

    it('rejects if student does not belong to caller school', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]); // not found in school

      await expect(service.createParent(schoolAId, parentDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('links student to parent safely', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'parent-1',
        schoolId: schoolAId,
        role: UserRole.PARENT,
      });
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        schoolId: schoolAId,
      });
      mockPrisma.parentStudentRelation.findUnique.mockResolvedValue(null);
      mockPrisma.parentStudentRelation.create.mockResolvedValue({
        id: 'rel-1',
        schoolId: schoolAId,
        parentId: 'parent-1',
        studentId: 'student-1',
      });

      const result = await service.linkParentStudent(
        schoolAId,
        'parent-1',
        'student-1',
        { relationshipType: 'FATHER' },
      );

      expect(result.parentId).toBe('parent-1');
      expect(result.studentId).toBe('student-1');
    });

    it('rejects linking if link already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'parent-1',
        schoolId: schoolAId,
        role: UserRole.PARENT,
      });
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        schoolId: schoolAId,
      });
      mockPrisma.parentStudentRelation.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.linkParentStudent(schoolAId, 'parent-1', 'student-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('unlinks student from parent', async () => {
      mockPrisma.parentStudentRelation.findUnique.mockResolvedValue({ id: 'rel-1' });
      mockPrisma.parentStudentRelation.delete.mockResolvedValue({});

      const result = await service.unlinkParentStudent(
        schoolAId,
        'parent-1',
        'student-1',
      );

      expect(result.message).toContain('successfully removed');
    });
  });
});
