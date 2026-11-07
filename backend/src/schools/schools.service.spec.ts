import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantStatus, UserRole, UserStatus } from '@prisma/client';
import { SchoolsService, SAFE_SCHOOL_SELECT } from './schools.service';

describe('SchoolsService (FEE-P2A & FEE-P2B)', () => {
  let service: SchoolsService;
  let mockPrisma: any;
  let mockEmailProvider: any;

  const sampleSchoolId = '00000000-0000-0000-0000-000000000001';
  const sampleSchool = {
    id: sampleSchoolId,
    code: 'SCH001',
    name: 'Greenwood International Academy',
    address: '100 Academic Road',
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: TenantStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    mockPrisma = {
      school: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    mockEmailProvider = {
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    service = new SchoolsService(mockPrisma, mockEmailProvider as any);
  });

  describe('create', () => {
    it('creates a new school when code is unique', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(null);
      mockPrisma.school.create.mockResolvedValue({
        ...sampleSchool,
        id: 'new-school-uuid',
        code: 'SCH099',
        name: 'New Horizon School',
      });

      const result = await service.create({
        code: 'SCH099',
        name: 'New Horizon School',
        city: 'Mumbai',
      });

      expect(result.id).toBe('new-school-uuid');
      expect(result.code).toBe('SCH099');
      expect(mockPrisma.school.findUnique).toHaveBeenCalledWith({
        where: { code: 'SCH099' },
        select: { id: true },
      });
      expect(mockPrisma.school.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          code: 'SCH099',
          name: 'New Horizon School',
          address: null,
          city: 'Mumbai',
          state: null,
          country: 'IN',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          status: TenantStatus.ACTIVE,
        },
        select: SAFE_SCHOOL_SELECT,
      });
    });

    it('throws ConflictException when school code already exists', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(sampleSchool);

      await expect(
        service.create({
          code: 'SCH001',
          name: 'Duplicate School',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.school.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated schools list with metadata', async () => {
      mockPrisma.school.count.mockResolvedValue(25);
      mockPrisma.school.findMany.mockResolvedValue([
        { ...sampleSchool, _count: { users: 5, students: 100, invoices: 200, payments: 150 } },
      ]);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
      expect(mockPrisma.school.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: expect.objectContaining({
          id: true,
          name: true,
          _count: expect.any(Object),
          users: expect.any(Object),
        }),
      });
    });

    it('filters by status and search keyword', async () => {
      mockPrisma.school.count.mockResolvedValue(1);
      mockPrisma.school.findMany.mockResolvedValue([sampleSchool]);

      await service.findAll({
        search: 'Greenwood',
        status: TenantStatus.ACTIVE,
      });

      expect(mockPrisma.school.findMany).toHaveBeenCalledWith({
        where: {
          status: TenantStatus.ACTIVE,
          OR: [
            { name: { contains: 'Greenwood', mode: 'insensitive' } },
            { code: { contains: 'Greenwood', mode: 'insensitive' } },
            { city: { contains: 'Greenwood', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('returns school details by valid UUID', async () => {
      mockPrisma.school.findUnique.mockResolvedValue({
        ...sampleSchool,
        _count: { users: 5, students: 50 },
      });

      const result = await service.findOne(sampleSchoolId);
      expect(result.id).toBe(sampleSchoolId);
      expect(result.name).toBe(sampleSchool.name);
    });

    it('throws BadRequestException on malformed UUID', async () => {
      await expect(service.findOne('invalid-uuid')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.school.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when school does not exist', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(null);
      await expect(service.findOne('99999999-9999-9999-9999-999999999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates allowlisted school profile fields', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(sampleSchool);
      mockPrisma.school.update.mockResolvedValue({
        ...sampleSchool,
        name: 'Greenwood High Academy',
        city: 'Mysore',
      });

      const result = await service.update(sampleSchoolId, {
        name: 'Greenwood High Academy',
        city: 'Mysore',
      });

      expect(result.name).toBe('Greenwood High Academy');
      expect(mockPrisma.school.update).toHaveBeenCalledWith({
        where: { id: sampleSchoolId },
        data: {
          name: 'Greenwood High Academy',
          city: 'Mysore',
        },
        select: SAFE_SCHOOL_SELECT,
      });
    });

    it('throws BadRequestException on malformed UUID', async () => {
      await expect(service.update('malformed-id', { name: 'Test' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if school not found', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(null);
      await expect(
        service.update(sampleSchoolId, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('updates school status to SUSPENDED', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(sampleSchool);
      mockPrisma.school.update.mockResolvedValue({
        ...sampleSchool,
        status: TenantStatus.SUSPENDED,
      });

      const result = await service.updateStatus(sampleSchoolId, {
        status: TenantStatus.SUSPENDED,
      });

      expect(result.status).toBe(TenantStatus.SUSPENDED);
      expect(mockPrisma.school.update).toHaveBeenCalledWith({
        where: { id: sampleSchoolId },
        data: { status: TenantStatus.SUSPENDED },
        select: SAFE_SCHOOL_SELECT,
      });
    });

    it('throws BadRequestException on malformed UUID', async () => {
      await expect(
        service.updateStatus('bad-id', { status: TenantStatus.INACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if school not found', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus(sampleSchoolId, { status: TenantStatus.INACTIVE }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('provisionInitialAdmin', () => {
    const validDto = {
      name: 'Dr. Jane Principal',
      email: 'Principal@Greenwood.edu',
      password: 'SecureAdminPassword123!',
    };

    it('successfully provisions initial school administrator', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(sampleSchool);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-admin-uuid',
        schoolId: sampleSchoolId,
        name: 'Dr. Jane Principal',
        email: 'principal@greenwood.edu',
        role: UserRole.SCHOOL_ADMIN,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.provisionInitialAdmin(sampleSchoolId, validDto);

      expect(result.message).toContain('successfully provisioned');
      expect(result.user.id).toBe('new-admin-uuid');
      expect(result.user.email).toBe('principal@greenwood.edu');
      expect(result.user.role).toBe(UserRole.SCHOOL_ADMIN);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schoolId: sampleSchoolId,
            email: 'principal@greenwood.edu',
            role: UserRole.SCHOOL_ADMIN,
            status: UserStatus.ACTIVE,
          }),
        }),
      );
    });

    it('rejects malformed school UUID', async () => {
      await expect(
        service.provisionInitialAdmin('invalid-uuid', validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if school does not exist', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(null);
      await expect(
        service.provisionInitialAdmin(sampleSchoolId, validDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects if school is suspended or inactive', async () => {
      mockPrisma.school.findUnique.mockResolvedValue({
        ...sampleSchool,
        status: TenantStatus.SUSPENDED,
      });

      await expect(
        service.provisionInitialAdmin(sampleSchoolId, validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate administrator if school already has one', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(sampleSchool);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-admin-uuid',
        email: 'admin@greenwood.edu',
        role: UserRole.SCHOOL_ADMIN,
      });

      await expect(
        service.provisionInitialAdmin(sampleSchoolId, validDto),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects if email already exists in the target school', async () => {
      mockPrisma.school.findUnique.mockResolvedValue(sampleSchool);
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null) // no existing admin
        .mockResolvedValueOnce({ id: 'staff-user', email: 'principal@greenwood.edu' }); // email conflict

      await expect(
        service.provisionInitialAdmin(sampleSchoolId, validDto),
      ).rejects.toThrow(ConflictException);
    });
  });
});
