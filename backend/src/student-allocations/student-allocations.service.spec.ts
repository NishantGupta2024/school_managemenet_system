import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConcessionType, FeeFrequency, Prisma } from '@prisma/client';
import { StudentAllocationsService } from './student-allocations.service';

describe('StudentAllocationsService (Individual & Bulk Allocation)', () => {
  let service: StudentAllocationsService;
  let mockPrisma: any;

  const schoolId = '00000000-0000-0000-0000-000000000001';
  const currentUserId = 'user-admin-uuid-1';
  const academicYearId = 'ay-2026-uuid-1';
  const grade10Id = 'grade-10-uuid-1';
  const grade5Id = 'grade-5-uuid-1';
  const feeStructureId = 'struct-10-uuid-1';

  const sampleStructure = {
    id: feeStructureId,
    schoolId,
    name: 'Grade 10 Annual Fee',
    academicYearId,
    gradeId: grade10Id,
    status: 'ACTIVE',
    items: [
      {
        id: 'item-1',
        feeHeadId: 'head-tution',
        amount: new Prisma.Decimal('1000.00'),
        frequency: FeeFrequency.MONTHLY,
        isOptional: false,
      },
      {
        id: 'item-2',
        feeHeadId: 'head-transport',
        amount: new Prisma.Decimal('500.00'),
        frequency: FeeFrequency.MONTHLY,
        isOptional: true,
      },
    ],
  };

  const sampleStudent1 = {
    id: 'student-1',
    schoolId,
    firstName: 'Kabir',
    lastName: 'Mehta',
    admissionNumber: 'DPS-2026-001',
    rollNumber: '101',
    gradeId: grade10Id,
    status: 'ACTIVE',
  };

  const sampleStudent2 = {
    id: 'student-2',
    schoolId,
    firstName: 'Ananya',
    lastName: 'Sen',
    admissionNumber: 'DPS-2026-002',
    rollNumber: '102',
    gradeId: grade10Id,
    status: 'ACTIVE',
  };

  const sampleStudentWrongGrade = {
    id: 'student-3',
    schoolId,
    firstName: 'Rohan',
    lastName: 'Verma',
    admissionNumber: 'DPS-2026-003',
    rollNumber: '501',
    gradeId: grade5Id, // Mismatched grade
    status: 'ACTIVE',
  };

  beforeEach(() => {
    mockPrisma = {
      student: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      feeStructure: {
        findUnique: jest.fn(),
      },
      studentFeeAllocation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      feeInvoice: {
        create: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    service = new StudentAllocationsService(mockPrisma);
  });

  describe('1. Successful Individual Allocation', () => {
    it('allocates a single student to a fee structure when valid', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(sampleStudent1);
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.studentFeeAllocation.findUnique.mockResolvedValue(null);
      mockPrisma.studentFeeAllocation.create.mockResolvedValue({
        id: 'alloc-uuid-1',
        studentId: sampleStudent1.id,
        feeStructureId,
        academicYearId,
        concessionType: ConcessionType.NONE,
      });

      const result = await service.create(schoolId, currentUserId, {
        studentId: sampleStudent1.id,
        feeStructureId,
        academicYearId,
      });

      expect(result.id).toBe('alloc-uuid-1');
      expect(mockPrisma.studentFeeAllocation.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.feeInvoice.create).not.toHaveBeenCalled();
    });
  });

  describe('2. Successful Bulk Allocation & Class-Wise Selection', () => {
    it('allocates multiple eligible students in the target class in one bounded batch', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.student.findMany.mockResolvedValue([sampleStudent1, sampleStudent2]);
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([]);
      mockPrisma.studentFeeAllocation.create
        .mockResolvedValueOnce({ id: 'alloc-1', studentId: sampleStudent1.id })
        .mockResolvedValueOnce({ id: 'alloc-2', studentId: sampleStudent2.id });

      const result = await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: [sampleStudent1.id, sampleStudent2.id],
      });

      expect(result.totalRequested).toBe(2);
      expect(result.allocatedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.results[0].status).toBe('ALLOCATED');
      expect(result.results[1].status).toBe('ALLOCATED');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Duplicate Allocation Prevention', () => {
    it('throws ConflictException on individual allocation if already allocated for the session', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(sampleStudent1);
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.studentFeeAllocation.findUnique.mockResolvedValue({ id: 'existing-alloc-1' });

      await expect(
        service.create(schoolId, currentUserId, {
          studentId: sampleStudent1.id,
          feeStructureId,
          academicYearId,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.studentFeeAllocation.create).not.toHaveBeenCalled();
    });
  });

  describe('4. Mixed Results When Some Students Are Already Allocated', () => {
    it('allocates unallocated students while skipping already allocated students safely', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.student.findMany.mockResolvedValue([sampleStudent1, sampleStudent2]);
      // Student 1 already has an active allocation
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([
        { studentId: sampleStudent1.id, id: 'existing-alloc-1' },
      ]);
      mockPrisma.studentFeeAllocation.create.mockResolvedValueOnce({
        id: 'alloc-2',
        studentId: sampleStudent2.id,
      });

      const result = await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: [sampleStudent1.id, sampleStudent2.id],
      });

      expect(result.totalRequested).toBe(2);
      expect(result.allocatedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      const skipped = result.results.find((r) => r.studentId === sampleStudent1.id);
      const allocated = result.results.find((r) => r.studentId === sampleStudent2.id);

      expect(skipped?.status).toBe('SKIPPED');
      expect(skipped?.reason).toContain('Already allocated');
      expect(allocated?.status).toBe('ALLOCATED');
    });
  });

  describe('5. Invalid Fee Structure / Academic Session Combination', () => {
    it('rejects bulk allocation if academic session does not match fee structure', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);

      await expect(
        service.bulkCreate(schoolId, currentUserId, {
          academicYearId: 'wrong-academic-year-uuid',
          feeStructureId,
          studentIds: [sampleStudent1.id],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects inactive or archived fee structure', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue({
        ...sampleStructure,
        status: 'INACTIVE',
      });

      await expect(
        service.bulkCreate(schoolId, currentUserId, {
          academicYearId,
          feeStructureId,
          studentIds: [sampleStudent1.id],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('6. Concession Preservation', () => {
    it('applies standard concession to new students without affecting existing student records', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.student.findMany.mockResolvedValue([sampleStudent1, sampleStudent2]);
      // Student 1 has existing custom 20% concession
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([
        {
          studentId: sampleStudent1.id,
          id: 'existing-alloc-with-concession',
          concessionType: ConcessionType.PERCENTAGE,
          concessionValue: new Prisma.Decimal('20.00'),
        },
      ]);
      mockPrisma.studentFeeAllocation.create.mockResolvedValueOnce({
        id: 'new-alloc-2',
        studentId: sampleStudent2.id,
      });

      const result = await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: [sampleStudent1.id, sampleStudent2.id],
        concessionType: ConcessionType.PERCENTAGE,
        concessionValue: 10,
        concessionReason: 'Bulk Sibling Policy',
      });

      expect(result.allocatedCount).toBe(1);
      expect(result.skippedCount).toBe(1);

      // Verify Student 1 was skipped to protect their existing 20% concession
      const st1 = result.results.find((r) => r.studentId === sampleStudent1.id);
      expect(st1?.status).toBe('SKIPPED');

      // Verify Student 2 receives the batch 10% concession
      expect(mockPrisma.studentFeeAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: sampleStudent2.id,
            concessionType: ConcessionType.PERCENTAGE,
            concessionValue: expect.any(Prisma.Decimal),
            concessionReason: 'Bulk Sibling Policy',
          }),
        }),
      );
    });
  });

  describe('7. Tenant Isolation & Cross-School Protection', () => {
    it('rejects foreign students belonging to another school tenant', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      // Student is from another school, findMany returns empty array for current school
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([]);

      const result = await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: ['foreign-student-from-other-school'],
      });

      expect(result.failedCount).toBe(1);
      expect(result.results[0].status).toBe('FAILED');
      expect(result.results[0].reason).toContain('not found in this school');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('8. Safe Grade Mismatch Handling', () => {
    it('reports FAILED for students whose enrolled grade does not match fee structure', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.student.findMany.mockResolvedValue([sampleStudentWrongGrade]);
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([]);

      const result = await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: [sampleStudentWrongGrade.id],
      });

      expect(result.allocatedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.results[0].status).toBe('FAILED');
      expect(result.results[0].reason).toContain('does not match fee structure grade');
    });
  });

  describe('9. Idempotency on Repeated Retries', () => {
    it('returns SKIPPED for all students if bulk allocation is run a second time', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.student.findMany.mockResolvedValue([sampleStudent1, sampleStudent2]);
      // Both are already allocated
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([
        { studentId: sampleStudent1.id, id: 'alloc-1' },
        { studentId: sampleStudent2.id, id: 'alloc-2' },
      ]);

      const result = await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: [sampleStudent1.id, sampleStudent2.id],
      });

      expect(result.allocatedCount).toBe(0);
      expect(result.skippedCount).toBe(2);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('10. Fee Generation Independence', () => {
    it('never creates invoices or triggers fee generation during allocation', async () => {
      mockPrisma.feeStructure.findUnique.mockResolvedValue(sampleStructure);
      mockPrisma.student.findMany.mockResolvedValue([sampleStudent1]);
      mockPrisma.studentFeeAllocation.findMany.mockResolvedValue([]);
      mockPrisma.studentFeeAllocation.create.mockResolvedValue({ id: 'alloc-1', studentId: sampleStudent1.id });

      await service.bulkCreate(schoolId, currentUserId, {
        academicYearId,
        feeStructureId,
        studentIds: [sampleStudent1.id],
      });

      // Crucial financial invariant: Allocation must NOT generate invoices
      expect(mockPrisma.feeInvoice.create).not.toHaveBeenCalled();
    });
  });
});
