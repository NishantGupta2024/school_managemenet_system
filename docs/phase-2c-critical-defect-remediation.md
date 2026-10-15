# Phase 2C Critical Defect Remediation and Verification Report

**Repository:** School Fee Management System (`d:\fee`)  
**Scope:** Remediation of Phase 2C Findings (`SEC-01`, `SEC-02`, `SEC-03`, `TIME-01`, `TIME-02`, `FIN-01`, `UI-01`)  
**Date:** October 16, 2026  
**Auditor & Implementer:** Antigravity AI Coding Assistant  

---

## 1. Executive Summary

During the Phase 2C read-only audit ([`docs/phase-2c-read-only-integrity-audit.md`](file:///d:/fee/docs/phase-2c-read-only-integrity-audit.md)), 7 defects were identified across authorization, timezone computation, status transition semantics, and cross-session fee duplication. 

All identified issues have been remediated cleanly and safely using:
1. **Forward-Only Database Migration**: Created migration [`20261016020000_remediate_phase2c_defects`](file:///d:/fee/backend/prisma/migrations/20261016020000_remediate_phase2c_defects/migration.sql) without altering existing migration history or resetting databases.
2. **Relational Identity & Verified Relationship Architecture**: Replaced string heuristics with direct `User-Student` linkage (`student.userId`) and explicit `ParentStudentRelation` entity mapping.
3. **Timezone-Pegged Due Dates**: Corrected wall-clock pegging to 23:59:59.999 local school time (`Asia/Kolkata` $\to$ `18:29:59.999Z`), ensuring dates render on the 10th instead of the 11th.
4. **Active Cycle Status Semantics**: Established clear state machine: `UPCOMING` before cycle start, `DUE` during cycle and grace period, `OVERDUE` after grace expiry, and `VOID` immutable.
5. **Cross-Session `ONE_TIME` Deduplication**: Created `StudentOneTimeFeeBilling` table with composite unique constraint `@@unique([schoolId, studentId, feeHeadId])`, permanently preventing duplicate billing of one-time charges across academic years.
6. **Scoped Access Endpoint & UI Fix**: Added `GET /api/v1/students/accessible` and `GET /api/v1/students/me/fee-statement`, removing the 403 Forbidden failure on `StudentStatementView.tsx`.
7. **Automated Regression Test Suite**: 75 backend e2e tests, 6 backend unit tests, and 8 frontend unit tests all pass cleanly (100% pass rate).

---

## 2. Detailed Defect Remediation

### Defect 1: Hardcoded Test Identities & Admission Number Heuristic (`SEC-01` & `SEC-02`)
- **Root Cause**: `FeeGenerationService.getStudentFeeStatement` checked hardcoded `'student@greenwood.edu'` and checked if `user.email.includes(student.admissionNumber)`.
- **Remediation**:
  - Added nullable unique `userId` field on `Student` model referencing `User.id` (`onDelete: SetNull`).
  - Removed all hardcoded email addresses and substring matching logic from `FeeGenerationService`.
  - Student authorization strictly requires `student.userId === user.id`. Non-matching access attempts throw `ForbiddenException(403)`.
  - Added self-service endpoint `GET /api/v1/students/me/fee-statement` allowing students to view their statements directly.

### Defect 2: Unverified Parent Email Matching (`SEC-03`)
- **Root Cause**: Parent access relied on loose text equality against `Student.guardianEmail`.
- **Remediation**:
  - Implemented `ParentStudentRelation` model with composite unique constraint `@@unique([schoolId, parentId, studentId])`, `relationshipType`, and `isVerified Boolean @default(true)`.
  - In `FeeGenerationService.getStudentFeeStatement`, parents must possess a verified relation record (`parentId === user.id && studentId === student.id && isVerified === true`).
  - Unlinked parents or unverified relations receive `403 Forbidden`.

### Defect 3: Cross-Session `ONE_TIME` Fee Duplication (`FIN-01`)
- **Root Cause**: `generateStudentSchedule` treated `ONE_TIME` identical to `ANNUAL`, billing in `startBillingMonth` of every academic session. No cross-session historical check or constraint existed.
- **Remediation**:
  - Created `StudentOneTimeFeeBilling` model with durable composite unique constraint `@@unique([schoolId, studentId, feeHeadId])`.
  - Updated `FeeGenerationService.generateStudentSchedule` to accept `alreadyBilledOneTimeFeeHeadIds: Set<string>` and omit any `ONE_TIME` fee heads already charged to that student.
  - In `preview` and `execute`, queries both `StudentOneTimeFeeBilling` and historical `InvoiceItem` records with `ONE_TIME` frequency across all sessions.
  - In `execute`, transactionally persists newly billed `ONE_TIME` items into `StudentOneTimeFeeBilling` via `upsert`.
  - Tested across consecutive sessions: `ONE_TIME` fees billed in Year 1 are strictly excluded in Year 2, even if the fee structure in Year 2 includes the fee head.

### Defect 4: Due Date Off-By-One Day in Local Timezone (`TIME-01`)
- **Root Cause**: `getDueDateForBillingMonth` hardcoded due dates directly to `23:59:59.999 UTC`. In `Asia/Kolkata` (UTC+5:30), this rolled over to `05:29:59.999 AM` on the 11th.
- **Remediation**:
  - Implemented `convertLocalToUtc` utility using `Intl.DateTimeFormat` with the school's configured timezone (`School.timezone`).
  - Due dates are pegged to `23:59:59.999` local school time. For `Asia/Kolkata`, this generates `18:29:59.999Z` on the 10th.
  - Confirmed that `toLocaleDateString('en-IN')` in India renders `10 Apr 2026`, strictly on the 10th.

### Defect 5: Invoice Status Derivation & Boundary Semantics (`TIME-02`)
- **Root Cause**: `deriveCurrentInvoiceStatus` labeled invoices before due date as `UPCOMING`, meaning current active month obligations during days 1–10 were marked `UPCOMING` rather than `DUE`.
- **Remediation**:
  - Updated `deriveCurrentInvoiceStatus`:
    - Before billing month start (1st of month 00:00:00 local time): returns `UPCOMING`.
    - From 1st of month 00:00:00 through due date and 5-day grace period: returns `DUE`.
    - After grace period expiry (day 15 23:59:59.999 local time): returns `OVERDUE`.
    - `VOID` status is permanently immutable.
  - On invoice creation in `execute`, stores dynamically derived initial status instead of hardcoding `UPCOMING`.

### Defect 6: Frontend Student Directory 403 Forbidden (`UI-01`)
- **Root Cause**: `StudentStatementView.tsx` called `metaApi.getStudents()` (`GET /api/v1/students`), which is restricted to staff/admin roles.
- **Remediation**:
  - Implemented `GET /api/v1/students/accessible` in `StudentsController` and `StudentsService`:
    - Staff / Admin: returns all students within the tenant.
    - Student: returns only their linked profile (`userId === user.id`).
    - Parent: returns only verified children via `ParentStudentRelation`.
  - Updated `StudentStatementView.tsx` and `metaApi.getAccessibleStudents()`.
  - Added auto-selection when only 1 student is accessible and disabled state with informative messaging when no profiles are linked.

---

## 3. Database Migration Summary

Migration directory: [`backend/prisma/migrations/20261016020000_remediate_phase2c_defects/migration.sql`](file:///d:/fee/backend/prisma/migrations/20261016020000_remediate_phase2c_defects/migration.sql)

```sql
-- AlterTable: Add userId to students table
ALTER TABLE "students" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: parent_student_relations
CREATE TABLE "parent_student_relations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'GUARDIAN',
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "parent_student_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: student_one_time_fee_billings
CREATE TABLE "student_one_time_fee_billings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "billedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_one_time_fee_billings_pkey" PRIMARY KEY ("id")
);

-- Constraints and Indexes
CREATE UNIQUE INDEX "parent_student_relations_schoolId_parentId_studentId_key" ON "parent_student_relations"("schoolId", "parentId", "studentId");
CREATE UNIQUE INDEX "parent_student_relations_schoolId_id_key" ON "parent_student_relations"("schoolId", "id");
CREATE INDEX "parent_student_relations_schoolId_idx" ON "parent_student_relations"("schoolId");
CREATE INDEX "parent_student_relations_parentId_idx" ON "parent_student_relations"("parentId");
CREATE INDEX "parent_student_relations_studentId_idx" ON "parent_student_relations"("studentId");

CREATE UNIQUE INDEX "student_one_time_fee_billings_schoolId_studentId_feeHeadId_key" ON "student_one_time_fee_billings"("schoolId", "studentId", "feeHeadId");
CREATE UNIQUE INDEX "student_one_time_fee_billings_schoolId_id_key" ON "student_one_time_fee_billings"("schoolId", "id");
CREATE INDEX "student_one_time_fee_billings_schoolId_idx" ON "student_one_time_fee_billings"("schoolId");
CREATE INDEX "student_one_time_fee_billings_studentId_idx" ON "student_one_time_fee_billings"("studentId");
CREATE INDEX "student_one_time_fee_billings_feeHeadId_idx" ON "student_one_time_fee_billings"("feeHeadId");
```

---

## 4. Test Verification Evidence

### A. Backend E2E Test Suite (`npm run test:e2e --workspace=backend`)
```
PASS test/fee-generation.e2e-spec.ts (6.474 s)
PASS test/fee-configuration.e2e-spec.ts
PASS test/multi-tenant.e2e-spec.ts
PASS test/health.e2e-spec.ts

Test Suites: 4 passed, 4 total
Tests:       75 passed, 75 total
Snapshots:   0 total
Time:        9.429 s
```

### B. Backend Unit Test Suite (`npm run test --workspace=backend`)
```
PASS src/common/tenant/tenant-context.service.spec.ts
PASS src/health/health.service.spec.ts

Test Suites: 2 passed, 2 total
Tests:       6 passed, 6 total
Snapshots:   0 total
```

### C. Frontend Unit Test Suite (`npm run test --workspace=frontend`)
```
 ✓ src/App.test.tsx (8 tests) 464ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

### D. Monorepo Production Build (`npm run build`)
```
> backend@0.1.0 build
> nest build

> frontend@0.1.0 build
> tsc -b && vite build
✓ built in 2.91s
```

---

## 5. Security & Integrity Sign-Off

| Item | Requirement | Remediation Status |
|---|---|---|
| `SEC-01` | No hardcoded test credentials or emails in service code | **RESOLVED & VERIFIED** |
| `SEC-02` | Admission number substring heuristic removed | **RESOLVED & VERIFIED** |
| `SEC-03` | Verified parent-child relational model with composite keys | **RESOLVED & VERIFIED** |
| `TIME-01`| Due dates pegged to 23:59:59.999 in school timezone (10th of month) | **RESOLVED & VERIFIED** |
| `TIME-02`| Consistent status state machine (UPCOMING $\to$ DUE $\to$ OVERDUE, VOID) | **RESOLVED & VERIFIED** |
| `FIN-01` | Cross-session `ONE_TIME` charges non-duplicable with durable constraints | **RESOLVED & VERIFIED** |
| `UI-01`  | Accessible students scoped endpoint and frontend self-service | **RESOLVED & VERIFIED** |
