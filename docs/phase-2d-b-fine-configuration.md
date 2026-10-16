# Phase 2D-B — Fine Configuration & Late Fine Rules Engine

## 1. Overview

Phase 2D-B implements a multi-tenant, academic-session-scoped **Fine Configuration & Late Fine Rules Engine** for the School Fee Management System (`D:\fee`).

Key capabilities:
- **Fine Configuration CRUD**: Create, list, inspect, update, activate/deactivate, and delete fine rules scoped to `(schoolId, academicYearId)`.
- **Three Fine Calculation Types**:
  - `FIXED`: Flat monetary late fee (`DECIMAL(12,2)`) applied once the invoice is overdue past the grace period.
  - `PER_DAY`: Monetary charge per overdue day (`fineValue × overdueDays`) past the grace period.
  - `PERCENTAGE`: Percentage (`0 < fineValue <= 100`) of the eligible unpaid base fee principal.
- **Day-Count Policies**:
  - `CALENDAR_DAYS`: Counts all 7 days of the week after the grace period end date.
  - `WORKING_DAYS`: Counts Monday through Friday (`ISO weekday 1..5`, excluding Saturday and Sunday) in the school's configured timezone (`School.timezone`, default `Asia/Kolkata`).
- **Non-Mutating Preview & Statement Integration**:
  - Fine calculations are evaluated dynamically using `Prisma.Decimal` with `ROUND_HALF_UP` to 2 decimal places.
  - Historical `FeeInvoice` and `InvoiceItem` snapshots are never mutated by fine rules or previews.
  - Calculated fines are explicitly marked with `isPaymentOrCollected: false` and never represent collected payments.

---

## 2. Database Schema & Forward Migration

Migration: `backend/prisma/migrations/20261016163000_add_fine_configuration_tier/migration.sql`

### Enums
- `FineType`: `FIXED`, `PER_DAY`, `PERCENTAGE`
- `FineDayCountPolicy`: `CALENDAR_DAYS`, `WORKING_DAYS`
- `FineRuleStatus`: `ACTIVE`, `INACTIVE`

### Model: `FineRule` (`fine_rules`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary key |
| `schoolId` | `UUID` | Tenant discriminator |
| `academicYearId` | `UUID` | Session scope (composite FK `(schoolId, academicYearId)` -> `academic_years`) |
| `name` | `String` | Unique rule name within `(schoolId, academicYearId)` |
| `description` | `String?` | Optional human-readable description |
| `fineType` | `FineType` | `FIXED`, `PER_DAY`, or `PERCENTAGE` |
| `fineValue` | `Decimal(12,2)` | Monetary amount (`> 0`) or percentage (`0 < x <= 100`) |
| `gracePeriodDays` | `Int` | Grace period in days (`0..365`, default `5`) |
| `maxFineCap` | `Decimal(12,2)?` | Optional maximum fine ceiling (`> 0`) |
| `dayCountPolicy` | `FineDayCountPolicy` | `CALENDAR_DAYS` or `WORKING_DAYS` |
| `applicableFeeHeadId` | `UUID?` | Optional fee-head scope (composite FK `(schoolId, applicableFeeHeadId)` -> `fee_heads`) |
| `applicableCategory` | `FeeHeadCategory?` | Optional fee-head category scope (`ACADEMIC`, `TRANSPORT`, etc.) |
| `effectiveStartDate` | `DateTime?` | Optional date from which the rule is active |
| `effectiveEndDate` | `DateTime?` | Optional date until which the rule is active |
| `status` | `FineRuleStatus` | `ACTIVE` or `INACTIVE` |
| `createdByUserId` | `UUID?` | Audit reference to creating user |
| `updatedByUserId` | `UUID?` | Audit reference to last updating user |
| `createdAt` / `updatedAt` | `DateTime` | Timestamps |

---

## 3. Business Rules & Documented Assumptions

1. **Timezone-Safe Local Calendar Arithmetic**:
   - All due-date, grace-period, and evaluation-date comparisons are performed at local midnight in `School.timezone` (default `Asia/Kolkata`), avoiding UTC offset drift.
   - `graceEndDate = dueLocalDate + gracePeriodDays`.
   - If `evaluationDate <= graceEndDate`, the invoice is within the due/grace window and `calculatedFine = 0.00`.
2. **Rule Matching Precedence**:
   - When multiple `ACTIVE` date-effective rules exist in the same academic session, `selectBestMatchingRuleForInvoice` deterministically selects the most specific rule:
     1. Rule matching a specific `applicableFeeHeadId` present on the invoice.
     2. Rule matching a specific `applicableCategory` present on the invoice.
     3. General session-wide rule (`applicableFeeHeadId = null` and `applicableCategory = null`).
3. **Eligible Principal Basis & No Fine-on-Fine Compounding**:
   - `unpaidInvoicePrincipal = max(0, invoice.netAmount - paidAmount)`.
   - `eligibleOutstandingBasis = min(scopedBaseAmount, unpaidInvoicePrincipal)`.
   - Existing fine amounts are never included in `scopedBaseAmount`, preventing percentage fines from compounding on top of fines.
   - Any `alreadyRecordedFineAmount` is subtracted after cap application (`max(0, cappedFine - alreadyRecordedFineAmount)`), preventing duplicate fine charges.
4. **Partial & Full Payment Handling**:
   - Since Phase 2E (Payment Collection & Allocation) is not yet implemented, `authoritativePaidAmount` from the database is `0.00`.
   - The preview endpoint (`POST /api/v1/fine-rules/preview`) accepts an optional `paidAmount` simulation parameter so staff can preview partial-payment and fully-paid scenarios deterministically.

---

## 4. API Endpoints & RBAC Matrix

All endpoints are protected by `JwtAuthGuard`, `TenantGuard`, and `RolesGuard`.

| Method & Path | Description | Allowed Roles |
| :--- | :--- | :--- |
| `POST /api/v1/fine-rules` | Create a fine rule | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN` |
| `GET /api/v1/fine-rules` | List fine rules for tenant/session | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN`, `FEE_STAFF` |
| `GET /api/v1/fine-rules/invoices` | List tenant invoices for fine preview | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN`, `FEE_STAFF` |
| `GET /api/v1/fine-rules/:id` | Get single fine rule by ID | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN`, `FEE_STAFF` |
| `PATCH /api/v1/fine-rules/:id` | Update a fine rule | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN` |
| `PATCH /api/v1/fine-rules/:id/status` | Activate / deactivate a fine rule | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN` |
| `DELETE /api/v1/fine-rules/:id` | Delete a fine rule | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN` |
| `POST /api/v1/fine-rules/preview` | Non-mutating fine calculation preview | `PLATFORM_SUPER_ADMIN`, `SCHOOL_ADMIN`, `FEE_STAFF` |

- `STUDENT` and `PARENT` roles are strictly forbidden (`403 Forbidden`) from all `/api/v1/fine-rules` endpoints.
- `STUDENT` and `PARENT` users view read-only `finePreview` breakdowns only on their own authorized fee statements (`GET /api/v1/students/me/fee-statement` and `GET /api/v1/students/:studentId/fee-statement`).
