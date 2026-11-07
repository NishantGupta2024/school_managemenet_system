import { Test, TestingModule } from '@nestjs/testing';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AcademicsController', () => {
  let controller: AcademicsController;
  let service: AcademicsService;

  const mockSchoolId = '00000000-0000-0000-0000-000000000001';
  const mockReq = {
    school: { id: mockSchoolId, name: 'Greenwood High', code: 'SCH001' },
    user: { id: 'user-admin-1', role: 'SCHOOL_ADMIN', schoolId: mockSchoolId },
  };

  const mockAcademicsService = {
    findAcademicYears: jest.fn(),
    findAcademicYearById: jest.fn(),
    createAcademicYear: jest.fn(),
    updateAcademicYear: jest.fn(),
    setCurrentAcademicYear: jest.fn(),
    deleteAcademicYear: jest.fn(),
    findGrades: jest.fn(),
    findGradeById: jest.fn(),
    createGrade: jest.fn(),
    updateGrade: jest.fn(),
    deleteGrade: jest.fn(),
    findSectionById: jest.fn(),
    createSection: jest.fn(),
    updateSection: jest.fn(),
    deleteSection: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AcademicsController],
      providers: [
        { provide: AcademicsService, useValue: mockAcademicsService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AcademicsController>(AcademicsController);
    service = module.get<AcademicsService>(AcademicsService);
    jest.clearAllMocks();
  });

  describe('Academic Years Endpoints', () => {
    it('delegates getAcademicYears with school ID from validated tenant request', async () => {
      mockAcademicsService.findAcademicYears.mockResolvedValue([{ id: 'ay-1', name: '2026-2027' }]);

      const result = await controller.getAcademicYears(mockReq);
      expect(service.findAcademicYears).toHaveBeenCalledWith(mockSchoolId);
      expect(result).toHaveLength(1);
    });

    it('delegates createAcademicYear with DTO and school ID', async () => {
      const dto = { name: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', isCurrent: false };
      mockAcademicsService.createAcademicYear.mockResolvedValue({ id: 'ay-2', ...dto });

      const result = await controller.createAcademicYear(mockReq, dto);
      expect(service.createAcademicYear).toHaveBeenCalledWith(mockSchoolId, dto);
      expect(result.id).toBe('ay-2');
    });

    it('delegates setCurrentAcademicYear', async () => {
      mockAcademicsService.setCurrentAcademicYear.mockResolvedValue({ id: 'ay-1', isCurrent: true });

      const result = await controller.setCurrentAcademicYear(mockReq, 'ay-1');
      expect(service.setCurrentAcademicYear).toHaveBeenCalledWith(mockSchoolId, 'ay-1');
      expect(result.isCurrent).toBe(true);
    });

    it('delegates deleteAcademicYear', async () => {
      mockAcademicsService.deleteAcademicYear.mockResolvedValue({ id: 'ay-1' });

      await controller.deleteAcademicYear(mockReq, 'ay-1');
      expect(service.deleteAcademicYear).toHaveBeenCalledWith(mockSchoolId, 'ay-1');
    });
  });

  describe('Grades and Sections Endpoints', () => {
    it('delegates getGrades with school ID', async () => {
      mockAcademicsService.findGrades.mockResolvedValue([{ id: 'g-1', name: 'Grade 1', code: 'G1' }]);

      const result = await controller.getGrades(mockReq);
      expect(service.findGrades).toHaveBeenCalledWith(mockSchoolId);
      expect(result).toHaveLength(1);
    });

    it('delegates createGrade with DTO', async () => {
      const dto = { name: 'Grade 11', code: 'G11' };
      mockAcademicsService.createGrade.mockResolvedValue({ id: 'g-11', ...dto });

      const result = await controller.createGrade(mockReq, dto);
      expect(service.createGrade).toHaveBeenCalledWith(mockSchoolId, dto);
      expect(result.code).toBe('G11');
    });

    it('delegates createSection with gradeId and DTO', async () => {
      const dto = { name: 'A', capacity: 35 };
      mockAcademicsService.createSection.mockResolvedValue({ id: 'sec-1', ...dto });

      const result = await controller.createSection(mockReq, 'g-1', dto);
      expect(service.createSection).toHaveBeenCalledWith(mockSchoolId, 'g-1', dto);
      expect(result.id).toBe('sec-1');
    });

    it('delegates deleteSection with section ID and school ID', async () => {
      mockAcademicsService.deleteSection.mockResolvedValue({ id: 'sec-1' });

      await controller.deleteSection(mockReq, 'sec-1');
      expect(service.deleteSection).toHaveBeenCalledWith(mockSchoolId, 'sec-1');
    });
  });
});
