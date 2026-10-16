import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { ReversalSequenceService } from './reversal-sequence.service';

describe('ReversalSequenceService — Atomic Reversal Sequence Engine', () => {
  let service: ReversalSequenceService;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let sessionAId: string;
  let sessionBId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, TenantContextService, ReversalSequenceService],
    }).compile();

    service = module.get<ReversalSequenceService>(ReversalSequenceService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantContext = module.get<TenantContextService>(TenantContextService);

    const sessionA = await prisma.academicYear.findFirst({
      where: { schoolId: schoolAId, name: '2026-2027' },
    });
    if (!sessionA) {
      throw new Error('Precondition failed: Academic year 2026-2027 for School A must exist');
    }
    sessionAId = sessionA.id;

    const sessionB = await prisma.academicYear.findFirst({
      where: { schoolId: schoolBId, name: '2026-2027' },
    });
    if (!sessionB) {
      throw new Error('Precondition failed: Academic year 2026-2027 for School B must exist');
    }
    sessionBId = sessionB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. should allocate strictly sequential reversal numbers', async () => {
    const adminUser = {
      id: '00000000-0000-0000-0000-000000000011',
      schoolId: schoolAId,
      role: UserRole.SCHOOL_ADMIN,
    };

    const res1 = await service.allocateNextReversalNumber({
      academicYearId: sessionAId,
      user: adminUser,
    });
    const res2 = await service.allocateNextReversalNumber({
      academicYearId: sessionAId,
      user: adminUser,
    });

    expect(res1.reversalNumber).toMatch(/^REV-202627-\d{5}$/);
    expect(res2.reversalNumber).toMatch(/^REV-202627-\d{5}$/);
    expect(res2.sequenceNumber).toBe(res1.sequenceNumber + 1);
  });

  it('2. should isolate reversal sequence counters between School A and School B', async () => {
    const adminA = {
      id: '00000000-0000-0000-0000-000000000011',
      schoolId: schoolAId,
      role: UserRole.SCHOOL_ADMIN,
    };
    const adminB = {
      id: '00000000-0000-0000-0000-000000000021',
      schoolId: schoolBId,
      role: UserRole.SCHOOL_ADMIN,
    };

    const resA = await service.allocateNextReversalNumber({
      academicYearId: sessionAId,
      user: adminA,
    });
    const resB = await service.allocateNextReversalNumber({
      academicYearId: sessionBId,
      user: adminB,
    });

    expect(resA.schoolId).toBe(schoolAId);
    expect(resB.schoolId).toBe(schoolBId);
  });

  it('3. should safely handle concurrent sequence allocations without duplicates', async () => {
    const adminUser = {
      id: '00000000-0000-0000-0000-000000000011',
      schoolId: schoolAId,
      role: UserRole.SCHOOL_ADMIN,
    };

    const count = 10;
    const promises = Array.from({ length: count }, () =>
      service.allocateNextReversalNumber({
        academicYearId: sessionAId,
        user: adminUser,
      }),
    );

    const results = await Promise.all(promises);
    const seqNumbers = results.map((r) => r.sequenceNumber);
    const uniqueSeqs = new Set(seqNumbers);

    expect(uniqueSeqs.size).toBe(count);
  });

  it('4. should reject cross-tenant access when user attempts to access another school', async () => {
    const adminA = {
      id: '00000000-0000-0000-0000-000000000011',
      schoolId: schoolAId,
      role: UserRole.SCHOOL_ADMIN,
    };

    await expect(
      service.allocateNextReversalNumber({
        academicYearId: sessionAId,
        user: adminA,
        schoolId: schoolBId,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
