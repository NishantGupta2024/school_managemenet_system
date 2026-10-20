import { PrismaClient, TenantStatus, UserRole, UserStatus, StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { URL } from 'url';

export const DEFAULT_ALLOWED_SEED_DATABASES = [
  'fee_dev',
  'fee_staging',
  'fee_uat',
  'fee_uat_sandbox',
  'fee_test',
  'fee_iso_test',
];

export interface SeedTargetValidationOptions {
  allowedDatabases?: string[];
  allowUnsafeFeeDb?: boolean;
}

/**
 * Fail-closed database target validation for seed operations.
 * Validates actual connected database identity against safety rules before executing any write.
 */
export async function validateSeedTarget(
  prismaClient: { $queryRaw: <T = any>(query: any, ...values: any[]) => Promise<T> },
  envDatabaseUrl?: string,
  options: SeedTargetValidationOptions = {},
): Promise<string> {
  const url = envDatabaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Seed target validation failed: DATABASE_URL environment variable is missing.');
  }

  let parsedDbName: string | null = null;
  try {
    const parsed = new URL(url.replace(/^["']|["']$/g, ''));
    parsedDbName = parsed.pathname.replace(/^\//, '').trim();
  } catch {
    throw new Error('Seed target validation failed: DATABASE_URL is not a valid database connection URL.');
  }

  if (!parsedDbName) {
    throw new Error('Seed target validation failed: Could not determine database name from DATABASE_URL.');
  }

  const allowUnsafeFeeDb = options.allowUnsafeFeeDb || process.env.ALLOW_UNSAFE_FEE_DB === 'true';

  if (parsedDbName.toLowerCase() === 'fee_db' && !allowUnsafeFeeDb) {
    throw new Error("Seed target validation failed: Refusing to seed prohibited database 'fee_db'.");
  }

  // Query actual connected database identity via SQL
  let activeDb: string;
  try {
    const result = await prismaClient.$queryRaw<Array<{ db: string }>>`SELECT current_database() as db`;
    activeDb = result[0]?.db;
  } catch (err: any) {
    throw new Error(`Seed target validation failed: Unable to verify connected database identity: ${err.message || err}`);
  }

  if (!activeDb) {
    throw new Error('Seed target validation failed: Database returned empty database identity.');
  }

  if (activeDb.toLowerCase() === 'fee_db' && !allowUnsafeFeeDb) {
    throw new Error("Seed target validation failed: Connected database is prohibited database 'fee_db'. Execution halted.");
  }

  if (activeDb.toLowerCase() !== parsedDbName.toLowerCase()) {
    throw new Error(
      `Seed target validation failed: DATABASE_URL points to '${parsedDbName}', but connected database is '${activeDb}'. Mismatch rejected.`,
    );
  }

  const allowed = options.allowedDatabases || DEFAULT_ALLOWED_SEED_DATABASES;
  const isPatternAllowed = allowed.some((allowedTarget) => {
    return activeDb.toLowerCase() === allowedTarget.toLowerCase() || activeDb.toLowerCase().startsWith(allowedTarget.toLowerCase());
  });

  const explicitEnvAllowed =
    process.env.AUTHORIZED_SEED_DATABASE &&
    process.env.AUTHORIZED_SEED_DATABASE.toLowerCase() === activeDb.toLowerCase();

  if (!isPatternAllowed && !explicitEnvAllowed) {
    throw new Error(
      `Seed target validation failed: Database '${activeDb}' is not in the approved staging/test allowlist (${allowed.join(', ')}).`,
    );
  }

  return activeDb;
}

const prisma = new PrismaClient();

async function main() {
  const verifiedDb = await validateSeedTarget(prisma);
  console.log(`[SEED PREFLIGHT PASS] Verified authorized seed database: '${verifiedDb}'`);

  console.log('Seeding Phase 1 baseline multi-tenant foundation with real bcrypt credentials...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const schoolAId = '00000000-0000-0000-0000-000000000001';
  const schoolBId = '00000000-0000-0000-0000-000000000002';

  // 1. Create Baseline School Alpha (Greenwood International Academy)
  const schoolA = await prisma.school.upsert({
    where: { code: 'SCH001' },
    update: {},
    create: {
      id: schoolAId,
      code: 'SCH001',
      name: 'Greenwood International Academy',
      address: '100 Knowledge Boulevard',
      city: 'Bangalore',
      state: 'Karnataka',
      country: 'IN',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      status: TenantStatus.ACTIVE,
    },
  });
  console.log(`Seeded School A: ${schoolA.name} (${schoolA.code})`);

  // 2. Create Baseline School Beta (Starlight Valley School)
  const schoolB = await prisma.school.upsert({
    where: { code: 'SCH002' },
    update: {},
    create: {
      id: schoolBId,
      code: 'SCH002',
      name: 'Starlight Valley School',
      address: '45 Lakeview Hill',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'IN',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      status: TenantStatus.ACTIVE,
    },
  });
  console.log(`Seeded School B: ${schoolB.name} (${schoolB.code})`);

  // 3. Platform Super Admin (Cross-School / Global)
  // Preserves existing privileged user credentials and roles if already present
  const existingPlatformAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@fee-platform.com' },
  });

  let platformAdmin;
  if (existingPlatformAdmin) {
    platformAdmin = existingPlatformAdmin;
    console.log(`Preserved existing Platform Admin: ${platformAdmin.name}`);
  } else {
    platformAdmin = await prisma.user.create({
      data: {
        schoolId: null,
        email: 'superadmin@fee-platform.com',
        name: 'System Super Admin',
        passwordHash,
        role: UserRole.PLATFORM_SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    console.log(`Seeded Platform Admin: ${platformAdmin.name}`);
  }

  // 4. School A Admin (Preserve credentials on re-seed)
  const adminA = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolA.id,
        email: 'admin@greenwood.edu',
      },
    },
    update: {},
    create: {
      schoolId: schoolA.id,
      email: 'admin@greenwood.edu',
      name: 'Dr. Jane Sterling',
      passwordHash,
      role: UserRole.SCHOOL_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Seeded School A Admin: ${adminA.name} [${adminA.role}]`);

  // 5. School A Fee Staff (Preserve credentials on re-seed)
  const staffA = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolA.id,
        email: 'staff@greenwood.edu',
      },
    },
    update: {},
    create: {
      schoolId: schoolA.id,
      email: 'staff@greenwood.edu',
      name: 'Marcus Vance',
      passwordHash,
      role: UserRole.FEE_STAFF,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Seeded School A Staff: ${staffA.name} [${staffA.role}]`);

  // 6. School A Student User
  const studentUserA = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolA.id,
        email: 'student@greenwood.edu',
      },
    },
    update: {},
    create: {
      schoolId: schoolA.id,
      email: 'student@greenwood.edu',
      name: 'Aarav Sharma (Student)',
      passwordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Seeded School A Student User: ${studentUserA.name} [${studentUserA.role}]`);

  // 6b. School A Parent User
  const parentUserA = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolA.id,
        email: 'parent@greenwood.edu',
      },
    },
    update: {
      passwordHash,
      role: UserRole.PARENT,
      status: UserStatus.ACTIVE,
    },
    create: {
      schoolId: schoolA.id,
      email: 'parent@greenwood.edu',
      name: 'Vikram Sharma (Parent)',
      passwordHash,
      role: UserRole.PARENT,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Seeded School A Parent User: ${parentUserA.name} [${parentUserA.role}]`);

  // 7. School B Admin (Preserve credentials on re-seed)
  const adminB = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolB.id,
        email: 'admin@starlight.edu',
      },
    },
    update: {},
    create: {
      schoolId: schoolB.id,
      email: 'admin@starlight.edu',
      name: 'Principal Robert Fox',
      passwordHash,
      role: UserRole.SCHOOL_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Seeded School B Admin: ${adminB.name} [${adminB.role}]`);

  // 8. Academic Sessions
  const sessionA = await prisma.academicYear.upsert({
    where: {
      schoolId_name: {
        schoolId: schoolA.id,
        name: '2026-2027',
      },
    },
    update: {},
    create: {
      schoolId: schoolA.id,
      name: '2026-2027',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T23:59:59.999Z'),
      isCurrent: true,
    },
  });

  const sessionB = await prisma.academicYear.upsert({
    where: {
      schoolId_name: {
        schoolId: schoolB.id,
        name: '2026-2027',
      },
    },
    update: {},
    create: {
      schoolId: schoolB.id,
      name: '2026-2027',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T23:59:59.999Z'),
      isCurrent: true,
    },
  });

  // 9. Grades & Sections for School A
  const grade10A = await prisma.gradeClass.upsert({
    where: {
      schoolId_code: {
        schoolId: schoolA.id,
        code: 'G10',
      },
    },
    update: {},
    create: {
      schoolId: schoolA.id,
      name: 'Grade 10',
      code: 'G10',
    },
  });

  const section10A = await prisma.section.upsert({
    where: {
      schoolId_gradeId_name: {
        schoolId: schoolA.id,
        gradeId: grade10A.id,
        name: 'Section A',
      },
    },
    update: {},
    create: {
      schoolId: schoolA.id,
      gradeId: grade10A.id,
      name: 'Section A',
      capacity: 35,
    },
  });

  // 10. Grades & Sections for School B
  const grade10B = await prisma.gradeClass.upsert({
    where: {
      schoolId_code: {
        schoolId: schoolB.id,
        code: 'G10',
      },
    },
    update: {},
    create: {
      schoolId: schoolB.id,
      name: 'Grade 10',
      code: 'G10',
    },
  });

  const section10B = await prisma.section.upsert({
    where: {
      schoolId_gradeId_name: {
        schoolId: schoolB.id,
        gradeId: grade10B.id,
        name: 'Section B',
      },
    },
    update: {},
    create: {
      schoolId: schoolB.id,
      gradeId: grade10B.id,
      name: 'Section B',
      capacity: 30,
    },
  });

  // 11. Student for School A (Linked to Student User A)
  const studentA = await prisma.student.upsert({
    where: {
      schoolId_admissionNumber: {
        schoolId: schoolA.id,
        admissionNumber: 'ADM-2026-001',
      },
    },
    update: {
      userId: studentUserA.id,
    },
    create: {
      schoolId: schoolA.id,
      admissionNumber: 'ADM-2026-001',
      rollNumber: '1001',
      firstName: 'Aarav',
      lastName: 'Sharma',
      guardianName: 'Vikram Sharma',
      guardianEmail: 'vikram.sharma@example.com',
      guardianPhone: '+91 98765 43210',
      gradeId: grade10A.id,
      sectionId: section10A.id,
      academicYearId: sessionA.id,
      userId: studentUserA.id,
      status: StudentStatus.ACTIVE,
    },
  });
  console.log(`Seeded Student A: ${studentA.firstName} ${studentA.lastName} (${studentA.admissionNumber}) -> Linked to userId: ${studentUserA.id}`);

  // 11b. Parent-Student Relationship for School A
  const parentRelA = await prisma.parentStudentRelation.upsert({
    where: {
      schoolId_parentId_studentId: {
        schoolId: schoolA.id,
        parentId: parentUserA.id,
        studentId: studentA.id,
      },
    },
    update: {
      relationshipType: 'FATHER',
      isVerified: true,
    },
    create: {
      schoolId: schoolA.id,
      parentId: parentUserA.id,
      studentId: studentA.id,
      relationshipType: 'FATHER',
      isVerified: true,
    },
  });
  console.log(`Seeded Parent-Student Relation: ${parentUserA.name} -> ${studentA.firstName} [Verified: ${parentRelA.isVerified}]`);

  // 12. Student for School B
  const studentB = await prisma.student.upsert({
    where: {
      schoolId_admissionNumber: {
        schoolId: schoolB.id,
        admissionNumber: 'ADM-2026-002',
      },
    },
    update: {},
    create: {
      schoolId: schoolB.id,
      admissionNumber: 'ADM-2026-002',
      rollNumber: '2001',
      firstName: 'Rohan',
      lastName: 'Deshmukh',
      guardianName: 'Anil Deshmukh',
      guardianEmail: 'anil.deshmukh@example.com',
      guardianPhone: '+91 98111 22334',
      gradeId: grade10B.id,
      sectionId: section10B.id,
      academicYearId: sessionB.id,
      status: StudentStatus.ACTIVE,
    },
  });
  console.log(`Seeded Student B: ${studentB.firstName} ${studentB.lastName} (${studentB.admissionNumber})`);

  console.log('Seed completed with real bcrypt credentials.');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('Seed error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
