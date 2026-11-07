/**
 * =============================================================================
 * TASK-P4-08D-20: Disposable Examination PostgreSQL Test Runner Entrypoint
 * =============================================================================
 * Dedicated entrypoint alias for the disposable examination PostgreSQL runner.
 * Directly invokes `main()` from `run-examination-iso-test.ts`.
 * =============================================================================
 */

import { main } from './run-examination-iso-test';

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[FATAL RUNNER ERROR]:', err);
    process.exit(1);
  });
}
