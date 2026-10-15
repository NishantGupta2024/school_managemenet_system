# Phase 2C Read-Only Integrity & Security Audit Report

**Audit Target:** School Fee Management System (`d:\fee`)  
**Commit Inspected:** `dfdc8e9ee7dcf561df10d343d5081b36fe0f285c` (`dfdc8e9`)  
**Audit Mode:** Strictly Read-Only (Code & Test Inspection)  
**Date:** October 16, 2026  
**Auditor:** Antigravity AI Coding Assistant  

---

## 1. Audit Scope & Environmental State Confirmation

### Scope of Audit
This audit evaluates the Monthly Fee Generation Engine and Student Fee Statements implemented in Phase 2C (commit `dfdc8e9`) against three specific risk areas:
1. **Audit 1**: Parent and Student Fee Statement Authorization & Tenant Isolation.
2. **Audit 2**: School Timezone and Invoice Due-Date / Status Correctness.
3. **Audit 3**: One-Time and Annual Fee Duplication Across Academic Sessions.

### Environmental State Confirmation
- **Working Tree**: Preserved completely clean (`git status` reports `nothing to commit, working tree clean`).
- **Database Migrations & Schema**: No migrations were generated, modified, rolled back, or applied.
- **Database Contents**: No database reset, truncation, seeding, or table mutations were performed.
- **Application Data**: No invoices, invoice items, allocations, structures, or audit logs were created, modified, voided, or deleted during this audit.
- **Source Code**: No application source files, test suites, or configuration files were modified. This report (`docs/phase-2c-read-only-integrity-audit.md`) is the sole file written.

---

## 2. Audit 1 — Parent and Student Fee Statement Authorization

### Objective
Verify that students and parents can access only the fee statements they are explicitly authorized to view, that admission numbers are not treated as credentials, that guardian email matches are verified securely, and that tenant boundaries cannot be breached.

### Files & Code Paths Inspected
- `backend/src/students/students.controller.ts`: Handler `getFeeStatement` (lines 34–56).
- `backend/src/fee-generation/fee-generation.service.ts`: Method `getStudentFeeStatement` (lines 563–732).
- `backend/src/common/tenant/tenant.guard.ts`: Method `canActivate` (lines 20–93).
- `backend/src/common/auth/roles.guard.ts`: Method `canActivate` (lines 10–36).
- `backend/src/auth/strategies/jwt.strategy.ts`: Method `validate` (lines 26–50).
- `backend/prisma/schema.prisma`: Models `User` (lines 115–133) and `Student` (lines 210–244).
- `frontend/src/components/StudentStatementView.tsx`: Data loading and statement presentation (lines 40–80).
- `backend/test/fee-generation.e2e-spec.ts`: Tests `allows student user Aarav Sharma to view his own fee statement`, `forbids student user from accessing another student fee statement`, `prevents School B admin from viewing School A student fee statement`.

### Findings

#### A. Parent-to-Student Relationship
- **Status**: `FAIL`
- **Severity**: `HIGH`
- **Finding**:
  In `backend/prisma/schema.prisma`, there is **no relational model or foreign key linking `User` and `Student`**. The `Student` entity only maintains unstructured string fields: `guardianName String?`, `guardianPhone String?`, and `guardianEmail String?`.
  In `FeeGenerationService.getStudentFeeStatement` (lines 583–585):
  ```typescript
  const isGuardianMatch =
    student.guardianEmail &&
    student.guardianEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
  ```
  Authorization relies **solely on a raw string equality check** against `student.guardianEmail`. There is no verified invitation, verification token, guardian phone OTP, or custodial mapping record (`ParentStudent` table).
  - If school administrative staff mistypes a guardian email during student admission, an unrelated user registering that email gains instant access to that student's complete ledger and billing snapshot.
  - While changing the URL `studentId` will reject access if the target student has a different `guardianEmail` (403), relying on unverified free-text string equality violates the strict security requirement that matching email alone must not grant access without a verified association mechanism.

#### B. Student Identity & Admission Number Handling
- **Status**: `FAIL`
- **Severity**: `CRITICAL`
- **Finding**:
  In `FeeGenerationService.getStudentFeeStatement` (lines 586–590), student identity is authorized using the following check:
  ```typescript
  const isStudentMatch =
    (user.email.trim().toLowerCase() === 'student@greenwood.edu' &&
      student.admissionNumber === 'ADM-2026-001') ||
    user.email.trim().toLowerCase().includes(student.admissionNumber.toLowerCase());
  ```
  1. **Hardcoded Test Credential in Core Service Code**: The production codebase contains a hardcoded bypass specifically for email `'student@greenwood.edu'` and admission number `'ADM-2026-001'`.
  2. **Admission Number Treated as an Authentication Credential via Insecure Substring**: The heuristic `user.email.includes(student.admissionNumber)` checks whether the student's admission number is a substring of the authenticated user's email.
     - Admission numbers are identifiers (printed on badges, bus passes, school rosters), NOT secrets.
     - If student Aarav Sharma has admission number `1001`, any authenticated user in the school whose email contains `1001` (e.g., `user1001@example.com`, `class1001@greenwood.edu`) is granted full access to Aarav's fee statement.
     - Any user who creates an account with an email incorporating a known student's admission number can view that student's financial records by passing their `studentId` in the URL.
  - Directly violates: *"An admission number must not be treated as an authentication credential. A student must access only their own statement through a securely established identity."*

#### C. Tenant Isolation
- **Status**: `PASS` (Test-Verified & Code-Inspected)
- **Severity**: N/A
- **Finding**:
  - `TenantGuard` enforces `targetSchoolId = user.schoolId` for all non-superadmin users (lines 48–59). If an attacker passes a forged `x-school-id` header that differs from their server-validated JWT `schoolId`, `TenantGuard` throws `403 Forbidden`.
  - In `FeeGenerationService.getStudentFeeStatement` (lines 569–574), student lookup is partitioned by the composite unique index `where: { schoolId_id: { schoolId, id: studentId } }`.
  - A user from School A attempting to access a student in School B results in `student = null`, triggering `404 Not Found` without disclosing student details, amounts, or fee data.
  - Verified by test in `backend/test/fee-generation.e2e-spec.ts` (lines 615–628).

#### D. Staff Access & Permissions
- **Status**: `PASS` (Test-Verified & Code-Inspected)
- **Severity**: N/A
- **Finding**:
  - `PLATFORM_SUPER_ADMIN`: Authorized across tenants but must supply `x-school-id` header; validated against the database.
  - `SCHOOL_ADMIN` and `FEE_STAFF`: Authorized to view any student fee statement within their active school tenant.
  - School staff cannot access statements of other schools by manipulating parameters or headers.

#### E. Frontend Student/Parent Access Discrepancy
- **Status**: `FAIL`
- **Severity**: `MEDIUM`
- **Finding**:
  `StudentStatementView.tsx` (lines 47–56) loads its student selection dropdown using `metaApi.getStudents()`, which queries `GET /api/v1/students`. In `StudentsController` (lines 14–16), `GET /api/v1/students` is restricted to `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN`, and `FEE_STAFF`. When an authenticated `STUDENT` or `PARENT` visits the screen, metadata loading fails with a 403 Forbidden error. There is no dedicated portal or self-service route (e.g. `GET /api/v1/me/fee-statement`) for student or parent self-service.

### Role-by-Role Authorization Matrix

| Role | Intended Access | Implemented Access | Enforcement Mechanism | Security Assessment |
|---|---|---|---|---|
| **`PLATFORM_SUPER_ADMIN`** | Any student across all schools with tenant selection | Can view any student in school specified by `x-school-id` | `TenantGuard` + `RolesGuard` + composite query `[schoolId, studentId]` | **PASS** — Secure tenant switching. |
| **`SCHOOL_ADMIN`** | Any student within own school | Can view any student within own school | `TenantGuard` (`user.schoolId`) + `RolesGuard` + composite query | **PASS** — Properly scoped to tenant. |
| **`FEE_STAFF`** | Any student within own school | Can view any student within own school | `TenantGuard` (`user.schoolId`) + `RolesGuard` + composite query | **PASS** — Properly scoped to tenant. |
| **`PARENT`** | Only their own children's statements | Can view any student whose `guardianEmail` matches `user.email` | Text equality check on `student.guardianEmail` | **FAIL** — No verified relationship model; vulnerable to staff entry errors or shared emails. |
| **`STUDENT`** | Only their own statement | Can view statement if email has hardcoded match or contains admission number | Hardcoded `'student@greenwood.edu'` check OR `user.email.includes(admissionNumber)` | **FAIL** — Critical vulnerability: Hardcoded credential in service code; admission number used as heuristic authorization. |

---

## 3. Audit 2 — School Timezone and Invoice Due-Date Correctness

### Objective
Verify that invoice due dates and invoice statuses strictly follow the school's configured timezone and intended business rules, analyze boundary transitions, and check frontend/backend date consistency.

### Files & Code Paths Inspected
- `backend/prisma/schema.prisma`: `School.timezone` definition (line 91).
- `backend/src/fee-generation/fee-generation.service.ts`:
  - `getDueDateForBillingMonth` (lines 59–68)
  - `deriveCurrentInvoiceStatus` (lines 70–89)
  - `execute` (lines 375–538)
  - `getStudentFeeStatement` (lines 563–732)
- `frontend/src/components/StudentStatementView.tsx`: Date display formatting (line 440).
- `backend/test/fee-generation.e2e-spec.ts`: Date generation tests.

### Findings

#### A. School Timezone Ignored Globally
- **Status**: `FAIL`
- **Severity**: `HIGH`
- **Finding**:
  `School.timezone` exists in the database schema (`timezone String @default("Asia/Kolkata")`), but `FeeGenerationService.getDueDateForBillingMonth` (lines 59–68) **does not accept or inspect `school.timezone`**:
  ```typescript
  public getDueDateForBillingMonth(academicYear: AcademicYear, billingMonth: number): Date {
    const startYear = academicYear.startDate.getUTCFullYear();
    const monthOffset = billingMonth - 1;
    const calendarMonth = (3 + monthOffset) % 12;
    const calendarYear = startYear + Math.floor((3 + monthOffset) / 12);

    // Standard school fee due date: 10th of the calendar month
    return new Date(Date.UTC(calendarYear, calendarMonth, 10, 23, 59, 59, 999));
  }
  ```
  The timestamp is hardcoded directly to `23:59:59.999 UTC`.

#### B. Due Date Off-By-One Day in Local Timezone (Frontend Display Discrepancy)
- **Status**: `FAIL`
- **Severity**: `HIGH`
- **Finding**:
  For schools in India (`Asia/Kolkata`, UTC+5:30) or any timezone east of UTC (UTC+1 to UTC+12):
  - A UTC timestamp of `2026-04-10T23:59:59.999Z` corresponds to **`2026-04-11T05:29:59.999+05:30`** (5:29:59 AM on the **11th** of April).
  - In `StudentStatementView.tsx` (line 440):
    ```tsx
    new Date(inv.dueDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    ```
  - When parsed in a browser in India, this timestamp formats as **`11 Apr 2026`**, NOT `10 Apr 2026`!
  - Parents and administrators will see due dates rendered on the 11th of every month across all 12 billing cycles.

#### C. Invoice Status Derivation & Boundary Condition Semantics
- **Status**: `FAIL`
- **Severity**: `MEDIUM`
- **Finding**:
  In `FeeGenerationService.deriveCurrentInvoiceStatus` (lines 70–89):
  ```typescript
  const dueTime = dueDate.getTime();
  const currentTime = asOfDate.getTime();
  const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;

  if (currentTime < dueTime) {
    return InvoiceStatus.UPCOMING;
  } else if (currentTime <= dueTime + gracePeriodMs) {
    return InvoiceStatus.DUE;
  } else {
    return InvoiceStatus.OVERDUE;
  }
  ```
  **Boundary Analysis**:
  1. **Before Due Date (`currentTime < dueTime`)**: Returns `UPCOMING`.
     - *Semantic Discrepancy*: On April 1st through April 10th, the current active month's obligation is labeled `UPCOMING` rather than `ISSUED` or `DUE`.
  2. **At Due Date & During Grace Period (`dueTime <= currentTime <= dueTime + 5 days`)**: Returns `DUE`.
     - In India, because `dueTime` is `23:59:59.999 UTC` (05:29:59 IST on the 11th), the transition from `UPCOMING` to `DUE` does not occur at local midnight; it occurs at 5:30 AM on the 11th.
     - The grace period expires at 5:29:59 AM on the 16th rather than midnight local time.
  3. **After Grace Period (`currentTime > dueTime + 5 days`)**: Returns `OVERDUE`.
  4. **Void Status (`status === InvoiceStatus.VOID`)**: Handled correctly; permanently overrides date calculations.

#### D. Database Stagnation (Absence of Scheduled Status Updates)
- **Status**: `FAIL`
- **Severity**: `MEDIUM`
- **Finding**:
  - Code inspection confirmed there are **no scheduled cron jobs, background workers, or event listeners** in the backend.
  - When invoices are generated, the database column `fee_invoices.status` is written as `'UPCOMING'` (line 474).
  - The database row is **never updated** when the due date or grace period passes.
  - Any direct SQL query or third-party reporting tool querying `WHERE status = 'DUE'` or `WHERE status = 'OVERDUE'` returns **0 rows**.
  - Status transitions exist entirely in memory, calculated dynamically on-the-fly only when calling `getStudentFeeStatement`.

---

## 4. Audit 3 — One-Time and Annual Fee Duplication Across Academic Sessions

### Objective
Verify that admission fees and other one-time charges cannot be accidentally billed again when a new academic session or fee structure is created, and evaluate snapshot immutability and uniqueness enforcement.

### Files & Code Paths Inspected
- `backend/prisma/schema.prisma`:
  - `FeeFrequency` enum (lines 49–53)
  - `FeeStructureItem` model (lines 306–329)
  - `StudentFeeAllocation` model (lines 334–366)
  - `FeeInvoice` model (lines 375–407)
  - `InvoiceItem` model (lines 412–433)
- `backend/src/fee-generation/fee-generation.service.ts`:
  - `generateStudentSchedule` (lines 91–262)
  - `preview` (lines 264–373)
  - `execute` (lines 375–538)
- `backend/test/fee-generation.e2e-spec.ts`: Existing test suites.

### Findings

#### A. Code Inspection of Frequency Handling
In `FeeGenerationService.generateStudentSchedule` (lines 131–139):
```typescript
if (item.frequency === FeeFrequency.MONTHLY) {
  isApplicableThisMonth = true;
} else if (
  item.frequency === FeeFrequency.ANNUAL ||
  item.frequency === FeeFrequency.ONE_TIME
) {
  // Annual and One-Time charges are billed in the student's first active month
  isApplicableThisMonth = m === startMonth;
}
```

#### B. Duplication Risk Assessment by Fee Frequency

| Fee Frequency | Intended Billing Frequency | Implemented Enforcement Mechanism | Duplicate-Billing Risk |
|---|---|---|---|
| **`MONTHLY`** | Every active billing cycle in session ($startBillingMonth \dots 12$) | Iterates active months. Idempotency enforced via `existingKeySet` in `execute` and `@@unique([schoolId, studentId, academicYearId, billingMonth])` on `FeeInvoice`. | **SAFE / LOW RISK** — Re-runs within the same session idempotently skip existing invoices. |
| **`ANNUAL`** | Exactly once per academic session | Placed only in `m === startMonth`. Idempotency enforced via `existingKeySet` and composite unique key. Subsequent re-runs within session do not duplicate. | **SAFE / LOW RISK** — Re-runs within the same session idempotently skip. Billed once each session as expected for annual charges. |
| **`ONE_TIME`** | Exactly once in student's entire enrollment tenure (e.g. Admission Fee, Security Deposit) | **Identical to `ANNUAL`**. Placed in `startBillingMonth` of the academic year being generated. **No historical check across prior sessions exists.** | **CRITICAL RISK OF DUPLICATE BILLING ACROSS SESSIONS** — When a new academic session is created, any structure containing a `ONE_TIME` fee head will bill the student again. |

#### C. Analysis of ONE_TIME Cross-Session Vulnerability
- **Status**: `FAIL`
- **Severity**: `CRITICAL`
- **Detailed Mechanism**:
  1. Neither `FeeInvoice` nor `InvoiceItem` maintains a lifetime uniqueness constraint on `[schoolId, studentId, feeHeadId]`.
  2. The unique constraint `@@unique([schoolId, studentId, academicYearId, billingMonth])` is scoped strictly to `academicYearId`.
  3. When an academic session rolls over (e.g., from `2026-2027` to `2027-2028`), a new student allocation is created for `2027-2028`.
  4. If the fee structure for the new grade contains a `ONE_TIME` head (such as Admission Fee, Registration Fee, or Caution Money), or if the previous structure is cloned/re-linked, `generateStudentSchedule` evaluates `m === startMonth` and **unconditionally bills the student again**.
  5. `FeeGenerationService` queries existing invoices ONLY for `academicYearId: dto.academicYearId` (lines 307–314, lines 422–429). It **never inspects prior academic sessions** to check if a `ONE_TIME` fee has already been charged to that student.

#### D. Test Coverage of `ONE_TIME` Frequencies
- **Status**: `NOT VERIFIED in automated tests`
- **Finding**:
  - A repository-wide search (`git grep "ONE_TIME" backend/test`) confirmed there are **zero automated tests for `FeeFrequency.ONE_TIME`**.
  - `backend/test/fee-generation.e2e-spec.ts` only tests `MONTHLY` (Tuition, Transport) and `ANNUAL` (Laboratory fee).
  - The behavior of `ONE_TIME` charges across multi-year sessions has never been validated in testing.

#### E. Snapshot Immutability
- **Status**: `PASS` (Test-Verified & Code-Inspected)
- **Severity**: N/A
- **Finding**:
  - `InvoiceItem` captures immutable scalar columns: `feeHeadNameSnapshot`, `billingFrequencySnapshot`, `grossAmount`, `discountAmount`, `netAmount`.
  - In `test/fee-generation.e2e-spec.ts` (lines 547–575), updating the underlying `FeeStructureItem.amount` from `5000` to `9999` confirmed that previously generated `FeeInvoice` and `InvoiceItem` records remain unchanged at `5000`.

---

## 5. Comprehensive Findings & Issue Severity Matrix

| Issue ID | Area | Finding / Vulnerability | Status | Severity |
|---|---|---|---|---|
| **SEC-01** | Authorization | Hardcoded test bypass (`student@greenwood.edu` / `ADM-2026-001`) in `FeeGenerationService.getStudentFeeStatement` | **FAIL** | `CRITICAL` |
| **SEC-02** | Authorization | Admission number treated as credential via email substring match (`user.email.includes(admissionNumber)`) | **FAIL** | `CRITICAL` |
| **SEC-03** | Authorization | Parent access relies solely on unverified loose text comparison with `Student.guardianEmail` without a relational model | **FAIL** | `HIGH` |
| **FIN-01** | Fee Engine | `ONE_TIME` charges are treated identically to `ANNUAL` and will re-bill across new academic sessions | **FAIL** | `CRITICAL` |
| **FIN-02** | Test Coverage | Zero test coverage for `FeeFrequency.ONE_TIME` across the entire backend test suite | **NOT VERIFIED** | `HIGH` |
| **TIME-01** | Timezone | School timezone is ignored; UTC due date timestamp (`23:59:59.999Z`) rolls over to the 11th in Indian Standard Time (off-by-one day) | **FAIL** | `HIGH` |
| **TIME-02** | Status Logic | Database `fee_invoices.status` is never updated via cron/scheduler; statuses are derived in-memory only | **FAIL** | `MEDIUM` |
| **UI-01** | Frontend | `StudentStatementView` queries admin-only `GET /api/v1/students`, blocking student/parent logins with 403 Forbidden | **FAIL** | `MEDIUM` |
| **ISO-01** | Multi-Tenancy | Tenant boundary enforcement and composite foreign key queries prevent cross-tenant data leakage | **PASS** | N/A |
| **SNAP-01** | Immutability | Fee invoice item snapshots remain immutable when master fee structures are modified | **PASS** | N/A |
| **IDEM-01** | Idempotency | Batch fee generation re-runs within the same session safely skip existing invoices with 0 duplicates | **PASS** | N/A |

---

## 6. Recommended Corrective Actions (For Future Implementation)

*Note: In accordance with the critical restrictions, none of these recommendations have been implemented during this audit.*

### Recommended Fix 1: Establish Formal User-to-Student and Parent-to-Student Mapping
1. Introduce an explicit `StudentUserMapping` and/or `ParentStudentRelation` entity in Prisma:
   ```prisma
   model ParentStudentRelation {
     id         String   @id @default(uuid())
     schoolId   String
     parentId   String
     studentId  String
     isVerified Boolean  @default(false)
     createdAt  DateTime @default(now())

     school   School  @relation(fields: [schoolId], references: [id], onDelete: Cascade)
     parent   User    @relation(fields: [parentId], references: [id], onDelete: Cascade)
     student  Student @relation(fields: [schoolId, studentId], references: [schoolId, id], onDelete: Cascade)

     @@unique([schoolId, parentId, studentId])
   }
   ```
2. For students, link `User.studentId` directly to `Student.id` via composite foreign key `[schoolId, studentId]`.
3. Remove the hardcoded `'student@greenwood.edu'` check and the substring `user.email.includes(admissionNumber)` heuristic completely.
4. Add a self-service endpoint `GET /api/v1/me/fee-statement` that derives student identity directly from the authenticated JWT session without requiring a `studentId` URL parameter.

### Recommended Fix 2: Local Timezone-Aware Due Date Calculation
1. Update `getDueDateForBillingMonth` to accept `school: School` (or `school.timezone`).
2. Construct the due date targeting `23:59:59.999` in the school's local timezone (e.g. using `date-fns-tz` or standard offset arithmetic) before converting to UTC for database storage:
   - For `Asia/Kolkata` (UTC+5:30), the end of the 10th of April is `2026-04-10T18:29:59.999Z`.
   - This ensures `new Date(dueDate).toLocaleDateString('en-IN')` in the frontend accurately renders as `10 Apr 2026`.
3. Add a scheduled background cron task (e.g. `@nestjs/schedule`) or database trigger to sync `FeeInvoice.status` periodically so reporting queries match derived statuses.

### Recommended Fix 3: Lifetime Enforcement for ONE_TIME Fees
1. In `FeeGenerationService.generateStudentSchedule`, distinguish between `ANNUAL` and `ONE_TIME`:
   - For `FeeFrequency.ONE_TIME`, query whether an invoice item with `feeHeadId` already exists for this `studentId` across **all** academic years in this school:
     ```typescript
     const alreadyBilled = await this.prisma.invoiceItem.findFirst({
       where: {
         schoolId,
         feeHeadId: item.feeHeadId,
         invoice: { studentId: allocation.studentId },
       },
     });
     if (alreadyBilled) {
       // Exclude from generation schedule
       continue;
     }
     ```
2. Add end-to-end multi-year tests in `backend/test/fee-generation.e2e-spec.ts` validating that rolling over to a new session does not re-bill one-time admission charges.

---

## 7. Final Recommendation & Gate Determination

### Decision: **BLOCK PHASE 2D UNTIL ISSUES ARE RESOLVED**

### Rationale:
1. **Critical Security Vulnerability (SEC-01 & SEC-02)**: The authorization logic for `GET /api/v1/students/:studentId/fee-statement` contains hardcoded email strings and treats admission numbers in email substrings as authorization proof. Proceeding with external integrations or imports on top of this compromised gate presents substantial security liability.
2. **Financial Integrity Risk (FIN-01)**: `ONE_TIME` charges are currently duplicate-billed whenever a student is enrolled in a new session or fee structure.
3. **Timezone Discrepancy (TIME-01)**: Due dates render off-by-one day in Indian Standard Time, which will cause misaligned late fees and incorrect payment due windows in Phase 2D (Fine Configuration & Late Fee Calculation).

Resolving these three defects before beginning Phase 2D will ensure financial accuracy, timezone fidelity, and enterprise-grade tenant authorization.
