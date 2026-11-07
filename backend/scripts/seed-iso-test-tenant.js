/**
 * Isolated Staging Tenant Seeder
 * 
 * Target: strictly 'fee_iso_test' on localhost/127.0.0.1/::1
 * Purpose: Pre-populates a dedicated test tenant (school, academic year, student, invoice)
 *          to enable end-to-end receipt numbering validation without touching fee_dev or fee_db.
 * 
 * Fails closed if DATABASE_URL points anywhere other than 'fee_iso_test'.
 * Never prints connection strings or credentials.
 */

const {
  PrismaClient,
  TenantStatus,
  UserRole,
  UserStatus,
  StudentStatus,
  FeeHeadCategory,
  FeeHeadStatus,
  FeeFrequency,
  InvoiceStatus,
} = require('@prisma/client');
const bcrypt = require('bcrypt');
const { checkDatabaseTarget, resolveDatabaseUrl } = require('./preflight-db-check');

// Deterministic Tenant-Scoped Identifiers for Staging Isolation
const ISO_SCHOOL_ID = '00000000-0000-0000-0000-000000000099';
const ISO_SCHOOL_CODE = 'ISO99';
const ISO_AY_ID = '00000000-0000-0000-0000-000000000199';
const ISO_AY_NAME = '2026-2027';
const ISO_GRADE_ID = '00000000-0000-0000-0000-000000000299';
const ISO_SECTION_ID = '00000000-0000-0000-0000-000000000399';
const ISO_STUDENT_ID = '00000000-0000-0000-0000-000000000499';
const ISO_STUDENT_ADM = 'ADM-ISO-001';
const ISO_FEE_HEAD_ID = '00000000-0000-0000-0000-000000000599';
const ISO_INVOICE_ID = '00000000-0000-0000-0000-000000000699';
const ISO_INVOICE_ITEM_ID = '00000000-0000-0000-0000-000000000799';
const ISO_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000999';
const ISO_ADMIN_EMAIL = 'admin@iso-school.edu';

async function seedIsolatedTenant() {
  // 1. Preflight database target check
  const { url, source } = resolveDatabaseUrl();
  const targetCheck = checkDatabaseTarget(url);

  if (!targetCheck.ok) {
    console.error(`\n[ISO SEED ERROR] Target preflight rejected: ${targetCheck.reason}`);
    process.exit(1);
  }

  if (targetCheck.dbName !== 'fee_iso_test') {
    console.error(
      `\n[ISO SEED ERROR] Refusing to seed non-isolated database '${targetCheck.dbName}'. This script may only target 'fee_iso_test'.`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // 2. Double-check connected database identity via SQL query
    const dbIdentity = await prisma.$queryRaw`SELECT current_database() as db`;
    const connectedDb = dbIdentity[0]?.db;

    if (connectedDb !== 'fee_iso_test') {
      throw new Error(
        `Connected database is '${connectedDb}', but 'fee_iso_test' is strictly required. Execution halted.`,
      );
    }

    console.log(`[ISO SEED] Preflight verified: Connected to isolated test database '${connectedDb}'`);

    // 3. Upsert School
    const school = await prisma.school.upsert({
      where: { code: ISO_SCHOOL_CODE },
      update: {},
      create: {
        id: ISO_SCHOOL_ID,
        code: ISO_SCHOOL_CODE,
        name: 'Isolated Staging Test Academy',
        address: '100 Isolation Way',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        status: TenantStatus.ACTIVE,
      },
    });
    console.log(`[ISO SEED] School verified: ${school.name} (${school.code})`);

    // 4. Upsert Academic Year
    const academicYear = await prisma.academicYear.upsert({
      where: {
        schoolId_name: {
          schoolId: ISO_SCHOOL_ID,
          name: ISO_AY_NAME,
        },
      },
      update: {},
      create: {
        id: ISO_AY_ID,
        schoolId: ISO_SCHOOL_ID,
        name: ISO_AY_NAME,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T23:59:59.999Z'),
        isCurrent: true,
      },
    });
    console.log(`[ISO SEED] Academic Year verified: ${academicYear.name}`);

    // 5. Upsert School Admin User
    const passwordHash = await bcrypt.hash('IsoTestAdmin123!', 10);
    const adminUser = await prisma.user.upsert({
      where: {
        schoolId_email: {
          schoolId: ISO_SCHOOL_ID,
          email: ISO_ADMIN_EMAIL,
        },
      },
      update: {},
      create: {
        id: ISO_ADMIN_USER_ID,
        schoolId: ISO_SCHOOL_ID,
        email: ISO_ADMIN_EMAIL,
        name: 'ISO Test School Admin',
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    console.log(`[ISO SEED] School Admin verified: ${adminUser.email}`);

    // 6. Upsert Grade and Section
    const grade = await prisma.gradeClass.upsert({
      where: {
        schoolId_code: {
          schoolId: ISO_SCHOOL_ID,
          code: 'G10-ISO',
        },
      },
      update: {},
      create: {
        id: ISO_GRADE_ID,
        schoolId: ISO_SCHOOL_ID,
        name: 'Grade 10 ISO',
        code: 'G10-ISO',
      },
    });

    const section = await prisma.section.upsert({
      where: {
        schoolId_gradeId_name: {
          schoolId: ISO_SCHOOL_ID,
          gradeId: ISO_GRADE_ID,
          name: 'Section A',
        },
      },
      update: {},
      create: {
        id: ISO_SECTION_ID,
        schoolId: ISO_SCHOOL_ID,
        gradeId: ISO_GRADE_ID,
        name: 'Section A',
        capacity: 30,
      },
    });
    console.log(`[ISO SEED] Grade and Section verified: ${grade.name} - ${section.name}`);

    // 7. Upsert Student
    const student = await prisma.student.upsert({
      where: {
        schoolId_admissionNumber: {
          schoolId: ISO_SCHOOL_ID,
          admissionNumber: ISO_STUDENT_ADM,
        },
      },
      update: {},
      create: {
        id: ISO_STUDENT_ID,
        schoolId: ISO_SCHOOL_ID,
        admissionNumber: ISO_STUDENT_ADM,
        rollNumber: '101',
        firstName: 'Iso',
        lastName: 'Tester',
        gradeId: ISO_GRADE_ID,
        sectionId: ISO_SECTION_ID,
        academicYearId: ISO_AY_ID,
        status: StudentStatus.ACTIVE,
      },
    });
    console.log(`[ISO SEED] Student verified: ${student.firstName} ${student.lastName} (${student.admissionNumber})`);

    // 8. Upsert Fee Head
    const feeHead = await prisma.feeHead.upsert({
      where: {
        schoolId_code: {
          schoolId: ISO_SCHOOL_ID,
          code: 'TUIT-ISO',
        },
      },
      update: {},
      create: {
        id: ISO_FEE_HEAD_ID,
        schoolId: ISO_SCHOOL_ID,
        name: 'Tuition Fee ISO',
        code: 'TUIT-ISO',
        category: FeeHeadCategory.ACADEMIC,
        isOptional: false,
        status: FeeHeadStatus.ACTIVE,
      },
    });
    console.log(`[ISO SEED] Fee Head verified: ${feeHead.name} (${feeHead.code})`);

    // 9. Upsert Fee Invoice with Outstanding Item
    const invoice = await prisma.feeInvoice.upsert({
      where: {
        schoolId_studentId_academicYearId_billingMonth: {
          schoolId: ISO_SCHOOL_ID,
          studentId: ISO_STUDENT_ID,
          academicYearId: ISO_AY_ID,
          billingMonth: 1,
        },
      },
      update: {},
      create: {
        id: ISO_INVOICE_ID,
        schoolId: ISO_SCHOOL_ID,
        studentId: ISO_STUDENT_ID,
        academicYearId: ISO_AY_ID,
        billingMonth: 1,
        dueDate: new Date('2026-06-15T00:00:00.000Z'),
        grossAmount: 10000.0,
        discountAmount: 0.0,
        netAmount: 10000.0,
        status: InvoiceStatus.ISSUED,
      },
    });

    await prisma.invoiceItem.upsert({
      where: {
        schoolId_id: {
          schoolId: ISO_SCHOOL_ID,
          id: ISO_INVOICE_ITEM_ID,
        },
      },
      update: {},
      create: {
        id: ISO_INVOICE_ITEM_ID,
        schoolId: ISO_SCHOOL_ID,
        invoiceId: ISO_INVOICE_ID,
        feeHeadId: ISO_FEE_HEAD_ID,
        feeHeadNameSnapshot: 'Tuition Fee ISO',
        grossAmount: 10000.0,
        discountAmount: 0.0,
        netAmount: 10000.0,
        billingFrequencySnapshot: FeeFrequency.MONTHLY,
      },
    });
    console.log(`[ISO SEED] Invoice and Invoice Item verified: Invoice ${invoice.id} with net amount 10000.00`);

    console.log('\n[ISO SEED COMPLETE] Dedicated staging test tenant seeded successfully.\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedIsolatedTenant().catch((err) => {
    console.error(`[ISO SEED FATAL ERROR]: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  seedIsolatedTenant,
  ISO_SCHOOL_ID,
  ISO_SCHOOL_CODE,
  ISO_AY_ID,
  ISO_AY_NAME,
  ISO_STUDENT_ID,
  ISO_STUDENT_ADM,
  ISO_ADMIN_USER_ID,
  ISO_ADMIN_EMAIL,
  ISO_INVOICE_ID,
};
