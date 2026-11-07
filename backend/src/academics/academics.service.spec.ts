import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AcademicsService', () => {
  let service: AcademicsService;
  let prisma: any;

  const schoolA = '00000000-0000-0000-0000-000000000001';
  const schoolB = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    prisma = {
      academicYear: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      gradeClass: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      section: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      student: { count: jest.fn().mockResolvedValue(0) },
      feeStructure: { count: jest.fn().mockResolvedValue(0) },
      feeInvoice: { count: jest.fn().mockResolvedValue(0) },
      studentFeeAllocation: { count: jest.fn().mockResolvedValue(0) },
      payment: { count: jest.fn().mockResolvedValue(0) },
      assessment: { count: jest.fn().mockResolvedValue(0) },
      assessmentChapter: { count: jest.fn().mockResolvedValue(0) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'g-1' }]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AcademicsService>(AcademicsService);
  });

  describe('Academic Years', () => {
    it('creates an academic year and sets isCurrent if requested', async () => {
      prisma.academicYear.findUnique.mockResolvedValue(null);
      prisma.academicYear.create.mockResolvedValue({
        id: 'ay-1',
        schoolId: schoolA,
        name: '2026-2027',
        isCurrent: true,
      });

      const result = await service.createAcademicYear(schoolA, {
        name: '2026-2027',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        isCurrent: true,
      });

      expect(prisma.academicYear.updateMany).toHaveBeenCalledWith({
        where: { schoolId: schoolA, isCurrent: true },
        data: { isCurrent: false },
      });
      expect(result.name).toBe('2026-2027');
    });

    it('rejects academic year if startDate >= endDate', async () => {
      await expect(
        service.createAcademicYear(schoolA, {
          name: 'Invalid Dates',
          startDate: '2027-04-01',
          endDate: '2026-03-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate academic year name in same school', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-existing', name: '2026-2027' });

      await expect(
        service.createAcademicYear(schoolA, {
          name: '2026-2027',
          startDate: '2026-04-01',
          endDate: '2027-03-31',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('sets current academic year atomically', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-2', schoolId: schoolA, isCurrent: false });
      prisma.academicYear.update.mockResolvedValue({ id: 'ay-2', isCurrent: true });

      const res = await service.setCurrentAcademicYear(schoolA, 'ay-2');

      expect(prisma.academicYear.updateMany).toHaveBeenCalledWith({
        where: { schoolId: schoolA, isCurrent: true },
        data: { isCurrent: false },
      });
      expect(prisma.academicYear.update).toHaveBeenCalledWith({
        where: { schoolId_id: { schoolId: schoolA, id: 'ay-2' } },
        data: { isCurrent: true },
      });
      expect(res.isCurrent).toBe(true);
    });

    it('prevents deleting active current academic year', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-current', schoolId: schoolA, isCurrent: true });

      await expect(service.deleteAcademicYear(schoolA, 'ay-current')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('prevents deleting academic year referenced by students or invoices', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-used', schoolId: schoolA, isCurrent: false });
      prisma.student.count.mockResolvedValue(15);
      prisma.feeInvoice.count.mockResolvedValue(30);

      await expect(service.deleteAcademicYear(schoolA, 'ay-used')).rejects.toThrow(
        /referenced by 15 student\(s\), 30 invoice\(s\)/,
      );
    });

    it('prevents deleting academic year referenced by assessments or chapters', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-exam', schoolId: schoolA, isCurrent: false });
      prisma.assessment.count.mockResolvedValue(4);
      prisma.assessmentChapter.count.mockResolvedValue(12);

      await expect(service.deleteAcademicYear(schoolA, 'ay-exam')).rejects.toThrow(
        /referenced by 4 assessment\(s\), 12 assessment chapter\(s\)/,
      );
      expect(prisma.academicYear.delete).not.toHaveBeenCalled();
    });

    it('translates P2003 foreign key violation into ConflictException on academic year delete', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-empty', schoolId: schoolA, isCurrent: false });
      prisma.academicYear.delete.mockRejectedValue({ code: 'P2003' });

      await expect(service.deleteAcademicYear(schoolA, 'ay-empty')).rejects.toThrow(ConflictException);
    });

    it('deletes unreferenced non-current academic year cleanly', async () => {
      prisma.academicYear.findUnique.mockResolvedValue({ id: 'ay-empty', schoolId: schoolA, isCurrent: false });
      prisma.academicYear.delete.mockResolvedValue({ id: 'ay-empty' });

      await service.deleteAcademicYear(schoolA, 'ay-empty');
      expect(prisma.academicYear.delete).toHaveBeenCalledWith({
        where: { schoolId_id: { schoolId: schoolA, id: 'ay-empty' } },
      });
    });
  });

  describe('Grades and Sections', () => {
    it('creates grade with normalized uppercase code', async () => {
      prisma.gradeClass.findUnique.mockResolvedValue(null);
      prisma.gradeClass.create.mockResolvedValue({
        id: 'g-1',
        schoolId: schoolA,
        name: 'Grade 10',
        code: 'G10',
      });

      const res = await service.createGrade(schoolA, { name: 'Grade 10', code: 'g10' });
      expect(prisma.gradeClass.create).toHaveBeenCalledWith({
        data: { schoolId: schoolA, name: 'Grade 10', code: 'G10' },
      });
      expect(res.code).toBe('G10');
    });

    it('rejects duplicate grade code in same school', async () => {
      prisma.gradeClass.findUnique.mockResolvedValue({ id: 'g-existing', code: 'G10' });

      await expect(service.createGrade(schoolA, { name: 'Another Grade 10', code: 'G10' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('prevents deleting grade with active sections or students', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'g-used' }]);
      prisma.section.count.mockResolvedValue(2);
      prisma.student.count.mockResolvedValue(45);

      await expect(service.deleteGrade(schoolA, 'g-used')).rejects.toThrow(
        /referenced by 2 section\(s\), 45 student\(s\)/,
      );
    });

    it('prevents deleting grade when referenced by assessments or chapters to block cascade deletion', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'g-exam' }]);
      prisma.section.count.mockResolvedValue(0);
      prisma.student.count.mockResolvedValue(0);
      prisma.feeStructure.count.mockResolvedValue(0);
      prisma.assessment.count.mockResolvedValue(5);
      prisma.assessmentChapter.count.mockResolvedValue(8);

      await expect(service.deleteGrade(schoolA, 'g-exam')).rejects.toThrow(
        /referenced by 5 assessment\(s\), 8 assessment chapter\(s\)/,
      );
      expect(prisma.gradeClass.delete).not.toHaveBeenCalled();
    });

    it('translates P2003 foreign key violation into ConflictException on grade delete', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'g-empty' }]);
      prisma.gradeClass.delete.mockRejectedValue({ code: 'P2003' });

      await expect(service.deleteGrade(schoolA, 'g-empty')).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when grade to delete is not found in school', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await expect(service.deleteGrade(schoolA, 'g-missing')).rejects.toThrow(NotFoundException);
      expect(prisma.gradeClass.delete).not.toHaveBeenCalled();
    });

    it('locks target grade row before performing reference counts and deleting', async () => {
      const callOrder: string[] = [];
      prisma.$queryRawUnsafe.mockImplementation(async (query: string, ...params: any[]) => {
        callOrder.push('rawLock');
        return [{ id: 'g-1' }];
      });
      prisma.section.count.mockImplementation(async () => {
        callOrder.push('countSection');
        return 0;
      });
      prisma.gradeClass.delete.mockImplementation(async () => {
        callOrder.push('deleteGrade');
        return { id: 'g-1' };
      });

      await service.deleteGrade(schoolA, 'g-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        'SELECT "id" FROM "grade_classes" WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE',
        schoolA,
        'g-1',
      );
      expect(callOrder[0]).toBe('rawLock');
      expect(callOrder).toContain('countSection');
      expect(callOrder[callOrder.length - 1]).toBe('deleteGrade');
    });

    it('creates section under valid grade', async () => {
      prisma.gradeClass.findUnique.mockResolvedValue({ id: 'g-1', schoolId: schoolA, name: 'Grade 1' });
      prisma.section.findUnique.mockResolvedValue(null);
      prisma.section.create.mockResolvedValue({
        id: 'sec-1',
        schoolId: schoolA,
        gradeId: 'g-1',
        name: 'A',
        capacity: 40,
      });

      const res = await service.createSection(schoolA, 'g-1', { name: 'a', capacity: 40 });
      expect(prisma.section.create).toHaveBeenCalledWith({
        data: { schoolId: schoolA, gradeId: 'g-1', name: 'A', capacity: 40 },
      });
      expect(res.name).toBe('A');
    });

    it('rejects duplicate section name under same grade', async () => {
      prisma.gradeClass.findUnique.mockResolvedValue({ id: 'g-1', schoolId: schoolA, name: 'Grade 1', code: 'G1' });
      prisma.section.findUnique.mockResolvedValue({ id: 'sec-a', name: 'A' });

      await expect(service.createSection(schoolA, 'g-1', { name: 'A' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('prevents deleting section with enrolled students', async () => {
      prisma.section.findUnique.mockResolvedValue({ id: 'sec-busy', schoolId: schoolA, grade: { name: 'G1' } });
      prisma.student.count.mockResolvedValue(32);

      await expect(service.deleteSection(schoolA, 'sec-busy')).rejects.toThrow(
        /referenced by 32 enrolled student\(s\)/,
      );
    });

    it('prevents deleting section referenced by section-specific assessments', async () => {
      prisma.section.findUnique.mockResolvedValue({ id: 'sec-exam', schoolId: schoolA, grade: { name: 'G1' } });
      prisma.student.count.mockResolvedValue(0);
      prisma.assessment.count.mockResolvedValue(3);

      await expect(service.deleteSection(schoolA, 'sec-exam')).rejects.toThrow(
        /referenced by 3 assessment\(s\)/,
      );
      expect(prisma.section.delete).not.toHaveBeenCalled();
    });

    it('translates P2003 foreign key violation into ConflictException on section delete', async () => {
      prisma.section.findUnique.mockResolvedValue({ id: 'sec-empty', schoolId: schoolA, grade: { name: 'G1' } });
      prisma.section.delete.mockRejectedValue({ code: 'P2003' });

      await expect(service.deleteSection(schoolA, 'sec-empty')).rejects.toThrow(ConflictException);
    });
  });

  describe('Cross-Tenant Isolation', () => {
    it('throws NotFoundException when accessing academic year of another school', async () => {
      prisma.academicYear.findUnique.mockResolvedValue(null);

      await expect(service.findAcademicYearById(schoolA, 'ay-of-school-b')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when accessing grade of another school', async () => {
      prisma.gradeClass.findUnique.mockResolvedValue(null);

      await expect(service.findGradeById(schoolA, 'grade-of-school-b')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
