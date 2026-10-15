import { PrismaClient, TenantStatus, UserRole, UserStatus, StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
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
  const existingPlatformAdmin = await prisma.user.findFirst({
    where: { email: 'superadmin@fee-platform.com' },
  });

  let platformAdmin;
  if (existingPlatformAdmin) {
    platformAdmin = await prisma.user.update({
      where: { id: existingPlatformAdmin.id },
      data: { passwordHash, role: UserRole.PLATFORM_SUPER_ADMIN },
    });
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
  }
  console.log(`Seeded Platform Admin: ${platformAdmin.name}`);

  // 4. School A Admin
  const adminA = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolA.id,
        email: 'admin@greenwood.edu',
      },
    },
    update: { passwordHash, role: UserRole.SCHOOL_ADMIN },
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

  // 5. School A Fee Staff
  const staffA = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolA.id,
        email: 'staff@greenwood.edu',
      },
    },
    update: { passwordHash, role: UserRole.FEE_STAFF },
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
    update: { passwordHash, role: UserRole.STUDENT },
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

  // 7. School B Admin
  const adminB = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: schoolB.id,
        email: 'admin@starlight.edu',
      },
    },
    update: { passwordHash, role: UserRole.SCHOOL_ADMIN },
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

  // 11. Student for School A
  const studentA = await prisma.student.upsert({
    where: {
      schoolId_admissionNumber: {
        schoolId: schoolA.id,
        admissionNumber: 'ADM-2026-001',
      },
    },
    update: {},
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
      status: StudentStatus.ACTIVE,
    },
  });
  console.log(`Seeded Student A: ${studentA.firstName} ${studentA.lastName} (${studentA.admissionNumber})`);

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

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
