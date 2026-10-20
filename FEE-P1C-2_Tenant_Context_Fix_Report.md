# FEE-P1C-2: Minimal Tenant Context Fix & Regression Verification Report

**Project:** School Fee Management SaaS  
**Repository:** `D:\fee`  
**Execution Date:** October 21, 2026  
**Target Branch:** `master`  
**Commit / HEAD:** `509edd693fde316645a9ec01c878111625e58428`  
**Report Artifact:** `D:\fee\FEE-P1C-2_Tenant_Context_Fix_Report.md`  

---

## 1. Pre-Change Branch, HEAD, and Working-Tree Status

- **Branch:** `master`
- **HEAD Commit:** `509edd693fde316645a9ec01c878111625e58428`
- **Pre-Existing Modified Files:** 25 files (including `seed.ts`, `app.module.ts`, notification providers, payment services, frontend components).
- **Pre-Existing Untracked Files:** 17 files/directories (reports, notifications, payment tests, frontend test specs).
- **Working Tree Integrity:** All pre-existing modified and untracked files were preserved completely. Zero files were stashed, reset, checked out, or committed.

---

## 2. Confirmed Call-Site and Dependency Analysis

A comprehensive pre-implementation scan verified all call sites of `TenantContextService.run()`, `getSchoolId()`, `getUserId()`, and `getStore()`:

1. **`TenantMiddleware.use` (`backend/src/common/tenant/tenant.middleware.ts#L22`):**
   - Express middleware registered globally in `AppModule` for `{ *path }`.
   - Inspects the client-supplied `x-school-id` header before authentication occurs.
   - Executes `this.tenantContextService.run({ schoolId }, () => next())`.
   - If `x-school-id` is omitted (standard for authenticated school users whose school ID is inside the JWT), it runs `this.tenantContextService.run({ schoolId: undefined }, () => next())`.
2. **`TenantGuard.canActivate` (`backend/src/common/tenant/tenant.guard.ts#L83`):**
   - Called `this.tenantContextService.run({ schoolId: targetSchoolId, userId: user.id, userRole: user.role }, () => {})` with a no-op callback.
   - The callback exited immediately on line 90, meaning the child `AsyncLocalStorage` scope was destroyed before the guard returned and before any controller handler was invoked.
3. **`HealthService.checkHealth` (`backend/src/health/health.service.ts#L33`):**
   - Reads `this.tenantContext.getSchoolId()` for diagnostic status reporting (`activeSchoolId` / `none`).
4. **`ReceiptSequenceService` & `ReversalSequenceService` (`receipt-sequence.service.ts#L55`, `reversal-sequence.service.ts#L40`):**
   - Both contain:
     ```typescript
     const contextSchoolId = this.tenantContextService.getSchoolId();
     ...
     const targetSchoolId = explicitSchoolId || contextSchoolId;
     if (!targetSchoolId) {
       throw new BadRequestException('Tenant context missing: Valid school context must be established');
     }
     ```
   - **Crucial finding:** In all production business paths (`payments.service.ts#L684` and `#L1348`), `explicitSchoolId` (`schoolId`) is passed directly into sequence allocation. Neither service depends on ambient context.
5. **Controllers and Business Logic:**
   - Every business controller (`payments`, `fee-generation`, `students`, `reports`, `excel-imports`, `fee-heads`, `fee-structures`, `fine-rules`, `student-allocations`) explicitly extracts `req.school.id` (attached by `TenantGuard`) and passes it into service methods.
   - Zero business services consume `TenantContextService`.

**Conclusion:** Removing the no-op `this.tenantContextService.run(...)` invocation from `TenantGuard` does not break any intended behavior or dependency.

---

## 3. Exact Files Modified and Why

| File Path | Action | Rationale |
| :--- | :---: | :--- |
| `backend/src/common/tenant/tenant.guard.ts` | **Modified** | Removed redundant `TenantContextService` import, constructor injection, and the empty `this.tenantContextService.run(..., () => {})` invocation. Preserved all authentication checks, super-admin rules, active status checks, and `req.school` attachment. |
| `backend/src/common/tenant/tenant.guard.spec.ts` | **Created** | Added focused, non-mutating in-memory unit tests (11 test cases) verifying `TenantGuard` authentication validation, tenant boundary enforcement, `req.school` assignment, and error handling. |

---

## 4. Summary of the Implementation

### Change A: `backend/src/common/tenant/tenant.guard.ts`
1. Removed `import { TenantContextService } from './tenant-context.service';`.
2. Cleaned constructor signature from:
   ```typescript
   constructor(
     private readonly tenantContextService: TenantContextService,
     private readonly prisma: PrismaService,
   ) {}
   ```
   to:
   ```typescript
   constructor(private readonly prisma: PrismaService) {}
   ```
3. Removed lines 79–86:
   ```typescript
   this.tenantContextService.run(
     {
       schoolId: targetSchoolId,
       userId: user.id,
       userRole: user.role,
     },
     () => {},
   );
   ```
4. Preserved `request.school = school;` directly prior to `return true;`.

---

## 5. Regression Tests Added

Created `backend/src/common/tenant/tenant.guard.spec.ts` with 11 isolated, in-memory unit test scenarios using mocked `PrismaService` (zero database connectivity required):

1. **Unauthenticated rejection:** Throws `UnauthorizedException` when `req.user` is missing.
2. **Super Admin header requirement:** Throws `BadRequestException` when `PLATFORM_SUPER_ADMIN` omits `x-school-id`.
3. **Super Admin valid header:** Attaches verified `school` to `req.school` and queries database with target ID.
4. **Missing user school ID:** Throws `ForbiddenException` when standard user has no `schoolId`.
5. **Cross-tenant spoof rejection:** Throws `ForbiddenException` when standard user provides an `x-school-id` header that differs from `user.schoolId`.
6. **Matching header acceptance:** Successfully validates when `x-school-id` matches `user.schoolId`.
7. **Omitted header derivation:** Derives tenant from `user.schoolId` when `x-school-id` is omitted.
8. **UUID format validation:** Rejects malformed non-UUID tenant identifiers with `BadRequestException`.
9. **Non-existent tenant rejection:** Throws `ForbiddenException` when school is not found in database.
10. **Inactive/Suspended tenant rejection:** Throws `ForbiddenException` when school status is not `ACTIVE`.
11. **`req.school` preservation:** Confirms `req.school` is assigned properly without requiring ambient context.

---

## 6. Test Commands, Results, and Exit Codes

All executed tests were strictly non-mutating unit tests. No database connections were opened, and no records were written.

| Test Command | Scope | Actual Execution | Exit Code | Result |
| :--- | :--- | :---: | :---: | :--- |
| `npm --prefix backend run build` | TypeScript build (`nest build`) | Executed | `0` | **Compiled with 0 errors** |
| `npm --prefix backend test -- src/common/tenant/` | Tenant unit test suite (`tenant.guard.spec.ts`, `tenant-context.service.spec.ts`) | Executed | `0` | **PASS** (2 suites, 14 passed) |
| `npm --prefix backend test -- src/health/health.service.spec.ts src/prisma/prisma-safety.spec.ts src/reports/reports-export.service.spec.ts` | Health, Prisma safety guard, and Reports Export suites | Executed | `0` | **PASS** (3 suites, 39 passed) |
| `npm --prefix backend test -- src/notifications/templates/email-template.spec.ts src/notifications/notifications.module.spec.ts` | Notification template rendering & module DI | Executed | `0` | **PASS** (2 suites, 29 passed) |

**Total Unit Tests Executed Post-Fix:** **82 tests passed, 0 failed.**

*Verification Skipped by Design:* Full database integration suites (`payments.service.spec.ts`, `reports.e2e-spec.ts`) were intentionally not executed to comply with Mandatory Safety Rule 6 ("Do not run migrations, seeds, or database-mutating tests").

---

## 7. Before / After Diff Summary

```diff
diff --git a/backend/src/common/tenant/tenant.guard.ts b/backend/src/common/tenant/tenant.guard.ts
index f22a8fc..80b0465 100644
--- a/backend/src/common/tenant/tenant.guard.ts
+++ b/backend/src/common/tenant/tenant.guard.ts
@@ -6,16 +6,12 @@ import {
   ForbiddenException,
   BadRequestException,
 } from '@nestjs/common';
-import { TenantContextService } from './tenant-context.service';
 import { PrismaService } from '../../prisma/prisma.service';
 import { UserRole } from '@prisma/client';
 
 @Injectable()
 export class TenantGuard implements CanActivate {
-  constructor(
-    private readonly tenantContextService: TenantContextService,
-    private readonly prisma: PrismaService,
-  ) {}
+  constructor(private readonly prisma: PrismaService) {}
 
   async canActivate(context: ExecutionContext): Promise<boolean> {
     const request = context.switchToHttp().getRequest();
@@ -78,16 +74,8 @@ export class TenantGuard implements CanActivate {
       throw new ForbiddenException(`School tenant is currently ${school.status}`);
     }
 
-    // Attach validated school entity to request object and update tenant context
+    // Attach validated school entity to request object
     request.school = school;
-    this.tenantContextService.run(
-      {
-        schoolId: targetSchoolId,
-        userId: user.id,
-        userRole: user.role,
-      },
-      () => {},
-    );
 
     return true;
   }
```

---

## 8. Database and External-Service Safety Confirmation

1. **Shared Database Isolation:** `fee_db` had **0 active connections** throughout the entire task execution.
2. **Development Database:** `fee_dev` was only queried for non-mutating active connection checks (`count = 2`). Zero financial mutations, table truncations, or migrations occurred.
3. **Prisma Safety Guard:** Intact and verified passing via `prisma-safety.spec.ts`.
4. **External Services:** Zero HTTP calls to email, WhatsApp, payment gateways, or third-party providers. `NOTIFICATION_WORKER_ENABLED=false` remained enforced.

---

## 9. Remaining Architectural Limitations

- **`TenantMiddleware` Pre-Authentication Context:**
  `TenantMiddleware` continues to execute before NestJS authentication guards. As a result:
  - If a client supplies an `x-school-id` header, `TenantContextService` ambient context holds that unvalidated header value until `TenantGuard` verifies it.
  - If a normal user relies on their JWT without sending `x-school-id`, ambient context remains `undefined`.
- **Recommendation for Future Phases:**
  Because the entire application uses explicit parameter passing (`req.school.id` &rarr; `service.method(schoolId, ...)`), this limitation does not affect current accounting or data isolation. If a future feature requires ambient `AsyncLocalStorage` context (e.g. Prisma client extensions or distributed tracing), a `TenantContextInterceptor` should be introduced to bind context after `TenantGuard` completes.

---

## 10. Explicit Safety Confirmation

- **Migrations:** Zero migrations run.
- **Seeds:** Zero seeds run.
- **Financial Mutations:** Zero payments, receipts, reversals, or refunds created or altered.
- **Commits:** Zero Git commits made.
- **Working Tree:** All pre-existing modified and untracked files preserved.

*FEE-P1C-2 is complete. Report saved to `D:\fee\FEE-P1C-2_Tenant_Context_Fix_Report.md`.*
