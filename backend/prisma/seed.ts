import { PrismaClient, TenantStatus, UserRole, UserStatus, StudentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Phase 1 baseline multi-tenant foundation...');

  const schoolId = '00000000-0000-0000-0000-000000000001';

  // 1. Create Baseline School / Tenant
  const school = await prisma.school.upsert({
    where: { code: 'SCH001' },
    update: {},
    create: {
      id: schoolId,
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
  console.log(`Seeded School: ${school.name} (${school.code})`);

  // 2. Create Super Admin / School Admin User
  const admin = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: school.id,
        email: 'admin@greenwood.edu',
      },
    },
    update: {},
    create: {
      schoolId: school.id,
      email: 'admin@greenwood.edu',
      name: 'Dr. Jane Sterling',
      passwordHash: '$2b$10$EpRnTzVlqHNP0.fUbXUwSO9wB51J4GzT/qC27.h19O5vY3Keq8Zg.', // Phase 1 placeholder hash
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`Seeded User: ${admin.name} [${admin.role}]`);

  // 3. Create Current Academic Year (2026-2027)
  const academicYear = await prisma.academicYear.upsert({
    where: {
      schoolId_name: {
        schoolId: school.id,
        name: '2026-2027',
      },
    },
    update: {},
    create: {
      schoolId: school.id,
      name: '2026-2027',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T23:59:59.999Z'),
      isCurrent: true,
    },
  });
  console.log(`Seeded Academic Year: ${academicYear.name}`);

  // 4. Create Grade & Section
  const grade10 = await prisma.gradeClass.upsert({
    where: {
      schoolId_code: {
        schoolId: school.id,
        code: 'G10',
      },
    },
    update: {},
    create: {
      schoolId: school.id,
      name: 'Grade 10',
      code: 'G10',
    },
  });

  const sectionA = await prisma.section.upsert({
    where: {
      schoolId_gradeId_name: {
        schoolId: school.id,
        gradeId: grade10.id,
        name: 'Section A',
      },
    },
    update: {},
    create: {
      schoolId: school.id,
      gradeId: grade10.id,
      name: 'Section A',
      capacity: 35,
    },
  });
  console.log(`Seeded Grade: ${grade10.name}, Section: ${sectionA.name}`);

  // 5. Create Sample Foundation Student
  const student = await prisma.student.upsert({
    where: {
      schoolId_admissionNumber: {
        schoolId: school.id,
        admissionNumber: 'ADM-2026-001',
      },
    },
    update: {},
    create: {
      schoolId: school.id,
      admissionNumber: 'ADM-2026-001',
      rollNumber: '1001',
      firstName: 'Aarav',
      lastName: 'Sharma',
      guardianName: 'Vikram Sharma',
      guardianEmail: 'vikram.sharma@example.com',
      guardianPhone: '+91 98765 43210',
      gradeId: grade10.id,
      sectionId: sectionA.id,
      academicYearId: academicYear.id,
      status: StudentStatus.ACTIVE,
    },
  });
  console.log(`Seeded Student: ${student.firstName} ${student.lastName} (${student.admissionNumber})`);

  console.log('Phase 1 seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
