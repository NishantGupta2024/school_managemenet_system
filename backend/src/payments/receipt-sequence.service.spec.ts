import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { ReceiptSequenceService } from './receipt-sequence.service';

describe('ReceiptSequenceService — Atomic Receipt Sequence Engine', () => {
  let service: ReceiptSequenceService;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  let sessionAId: string;
  let sessionA2Id: string;
  let sessionBId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, TenantContextService, ReceiptSequenceService],
    }).compile();

    service = module.get<ReceiptSequenceService>(ReceiptSequenceService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantContext = module.get<TenantContextService>(TenantContextService);

    // 1. Fetch Session A
    const sessionA = await prisma.academicYear.findFirst({
      where: { schoolId: schoolAId, name: '2026-2027' },
    });
    if (!sessionA) {
      throw new Error('Precondition failed: Academic year 2026-2027 for School A must exist');
    }
    sessionAId = sessionA.id;

    // 2. Fetch Session B
    const sessionB = await prisma.academicYear.findFirst({
      where: { schoolId: schoolBId, name: '2026-2027' },
    });
    if (!sessionB) {
      throw new Error('Precondition failed: Academic year 2026-2027 for School B must exist');
    }
    sessionBId = sessionB.id;

    // 3. Create or fetch a secondary session for School A to test multi-session isolation
    const sessionA2 = await prisma.academicYear.upsert({
      where: {
        schoolId_name: {
          schoolId: schoolAId,
          name: '2027-2028',
        },
      },
      update: {},
      create: {
        schoolId: schoolAId,
        name: '2027-2028',
        startDate: new Date('2027-06-01T00:00:00.000Z'),
        endDate: new Date('2028-05-31T23:59:59.999Z'),
        isCurrent: false,
      },
    });
    sessionA2Id = sessionA2.id;
  });

  beforeEach(async () => {
    // Clean up sequence counters created during tests to ensure predictable test states
    await prisma.receiptSequenceCounter.deleteMany({
      where: {
        schoolId: { in: [schoolAId, schoolBId] },
      },
    });
  });

  afterAll(async () => {
    await prisma.receiptSequenceCounter.deleteMany({
      where: {
        schoolId: { in: [schoolAId, schoolBId] },
      },
    });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // Test 1: First sequence allocation starts at 1
  // -------------------------------------------------------------
  it('1. should allocate sequence 1 with formatted receipt number on first request', async () => {
    const result = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });

    expect(result.sequenceNumber).toBe(1);
    expect(result.receiptNumber).toBe('RCT-202627-00001');
    expect(result.prefix).toBe('RCT');
    expect(result.schoolId).toBe(schoolAId);
    expect(result.academicYearId).toBe(sessionAId);
    expect(result.academicYearName).toBe('2026-2027');

    const status = await service.getCurrentSequence({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    expect(status.currentSequence).toBe(1);
    expect(status.nextSequence).toBe(2);
  });

  // -------------------------------------------------------------
  // Test 2: Sequential allocations increment monotonically
  // -------------------------------------------------------------
  it('2. should increment sequence monotonically on consecutive calls', async () => {
    const seq1 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    const seq2 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    const seq3 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });

    expect(seq1.sequenceNumber).toBe(1);
    expect(seq1.receiptNumber).toBe('RCT-202627-00001');

    expect(seq2.sequenceNumber).toBe(2);
    expect(seq2.receiptNumber).toBe('RCT-202627-00002');

    expect(seq3.sequenceNumber).toBe(3);
    expect(seq3.receiptNumber).toBe('RCT-202627-00003');
  });

  // -------------------------------------------------------------
  // Test 3: Independent sequences for different schools
  // -------------------------------------------------------------
  it('3. should maintain completely independent sequence numbers across different schools', async () => {
    // School A allocations
    const a1 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    const a2 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });

    // School B allocations (must start at 1 regardless of School A progress)
    const b1 = await service.allocateNextReceiptNumber({
      schoolId: schoolBId,
      academicYearId: sessionBId,
    });
    const b2 = await service.allocateNextReceiptNumber({
      schoolId: schoolBId,
      academicYearId: sessionBId,
    });

    expect(a1.sequenceNumber).toBe(1);
    expect(a2.sequenceNumber).toBe(2);

    expect(b1.sequenceNumber).toBe(1);
    expect(b2.sequenceNumber).toBe(2);

    expect(a1.receiptNumber).toBe('RCT-202627-00001');
    expect(b1.receiptNumber).toBe('RCT-202627-00001');
  });

  // -------------------------------------------------------------
  // Test 4: Independent sequences for different academic sessions
  // -------------------------------------------------------------
  it('4. should maintain independent sequence numbers for different academic years in the same school', async () => {
    // Session 2026-2027
    const s1 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    const s2 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });

    // Session 2027-2028 (starts fresh at 1)
    const y1 = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionA2Id,
    });

    expect(s1.sequenceNumber).toBe(1);
    expect(s1.receiptNumber).toBe('RCT-202627-00001');

    expect(s2.sequenceNumber).toBe(2);
    expect(s2.receiptNumber).toBe('RCT-202627-00002');

    expect(y1.sequenceNumber).toBe(1);
    expect(y1.receiptNumber).toBe('RCT-202728-00001');
  });

  // -------------------------------------------------------------
  // Test 5: Cross-tenant academic year rejection
  // -------------------------------------------------------------
  it('5. should reject request when academic year belongs to a different school (404 Not Found)', async () => {
    await expect(
      service.allocateNextReceiptNumber({
        schoolId: schoolAId,
        academicYearId: sessionBId, // School B's session requested under School A context
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // -------------------------------------------------------------
  // Test 6: School-user tenant context cannot be overridden by client
  // -------------------------------------------------------------
  it('6. should reject cross-tenant override attempt by a school user (403 Forbidden)', async () => {
    const schoolAStaffUser = {
      id: 'staff-user-1',
      schoolId: schoolAId,
      role: UserRole.FEE_STAFF,
    };

    // Staff user from School A attempting to supply School B in request
    await expect(
      service.allocateNextReceiptNumber({
        user: schoolAStaffUser,
        schoolId: schoolBId, // Attempted spoof
        academicYearId: sessionAId,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Super Admin permitted with target school specified
    const superAdminUser = {
      id: 'super-admin-1',
      schoolId: null,
      role: UserRole.PLATFORM_SUPER_ADMIN,
    };

    const adminAlloc = await service.allocateNextReceiptNumber({
      user: superAdminUser,
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    expect(adminAlloc.sequenceNumber).toBe(1);
    expect(adminAlloc.schoolId).toBe(schoolAId);
  });

  // -------------------------------------------------------------
  // Test 7: Custom prefix and consistent formatting
  // -------------------------------------------------------------
  it('7. should format receipt number with custom configured prefix', async () => {
    const customResult = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
      prefix: 'FEE',
    });

    expect(customResult.sequenceNumber).toBe(1);
    expect(customResult.prefix).toBe('FEE');
    expect(customResult.receiptNumber).toBe('FEE-202627-00001');
  });

  // -------------------------------------------------------------
  // Test 8: Concurrent allocations return strictly distinct numbers
  // -------------------------------------------------------------
  it('8. should return strictly distinct sequence numbers under high concurrency (10 parallel requests)', async () => {
    const concurrencyLevel = 10;
    const promises = Array.from({ length: concurrencyLevel }, () =>
      service.allocateNextReceiptNumber({
        schoolId: schoolAId,
        academicYearId: sessionAId,
      }),
    );

    const results = await Promise.all(promises);

    const sequenceNumbers = results.map((r) => r.sequenceNumber);
    const receiptNumbers = results.map((r) => r.receiptNumber);

    // Assert that all allocated sequences are unique
    const uniqueSequences = new Set(sequenceNumbers);
    expect(uniqueSequences.size).toBe(concurrencyLevel);

    const uniqueReceiptNumbers = new Set(receiptNumbers);
    expect(uniqueReceiptNumbers.size).toBe(concurrencyLevel);

    // Assert that the allocated numbers span 1 through 10
    const sorted = [...sequenceNumbers].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  // -------------------------------------------------------------
  // Test 9: Concurrent initialization does not duplicate counters
  // -------------------------------------------------------------
  it('9. should handle concurrent first-time requests without duplicate counters or crashes', async () => {
    // Ensure counter does not exist for sessionA2
    await prisma.receiptSequenceCounter.deleteMany({
      where: { schoolId: schoolAId, academicYearId: sessionA2Id },
    });

    const concurrencyLevel = 6;
    const promises = Array.from({ length: concurrencyLevel }, () =>
      service.allocateNextReceiptNumber({
        schoolId: schoolAId,
        academicYearId: sessionA2Id,
      }),
    );

    const results = await Promise.all(promises);

    // Verify counter table has exactly 1 row for this school and session
    const counterRows = await prisma.receiptSequenceCounter.findMany({
      where: { schoolId: schoolAId, academicYearId: sessionA2Id },
    });
    expect(counterRows.length).toBe(1);
    expect(counterRows[0].nextSequence).toBe(concurrencyLevel + 1);

    const sequenceNumbers = results.map((r) => r.sequenceNumber);
    const uniqueSequences = new Set(sequenceNumbers);
    expect(uniqueSequences.size).toBe(concurrencyLevel);
  });

  // -------------------------------------------------------------
  // Test 10: Transaction rollback safety
  // -------------------------------------------------------------
  it('10. should roll back allocated sequence and counter changes when calling transaction aborts', async () => {
    // 1. Initial allocation outside transaction
    const initial = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    expect(initial.sequenceNumber).toBe(1);

    // 2. Attempt allocation inside a transaction that fails/aborts
    try {
      await prisma.$transaction(async (tx) => {
        const txAlloc = await service.allocateNextReceiptNumber({
          schoolId: schoolAId,
          academicYearId: sessionAId,
          tx,
        });
        expect(txAlloc.sequenceNumber).toBe(2);

        // Intentionally simulate downstream payment failure
        throw new Error('Payment processing simulated failure');
      });
    } catch (err: any) {
      expect(err.message).toBe('Payment processing simulated failure');
    }

    // 3. Counter in DB should have rolled back to nextSequence = 2
    const statusAfterRollback = await service.getCurrentSequence({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    expect(statusAfterRollback.nextSequence).toBe(2);

    // 4. Next allocation should cleanly re-attempt sequence 2
    const retryAlloc = await service.allocateNextReceiptNumber({
      schoolId: schoolAId,
      academicYearId: sessionAId,
    });
    expect(retryAlloc.sequenceNumber).toBe(2);
    expect(retryAlloc.receiptNumber).toBe('RCT-202627-00002');
  });
});
