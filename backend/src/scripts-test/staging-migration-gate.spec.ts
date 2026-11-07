import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyStagingIdentity } = require('../../scripts/verify-staging-identity');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkDatabaseTarget } = require('../../scripts/preflight-db-check');

describe('Staging Migration Gate Integration (Phase R1.25)', () => {
  const backendPkgPath = path.resolve(__dirname, '../../package.json');
  const rootPkgPath = path.resolve(__dirname, '../../../package.json');

  let backendPkg: any;
  let rootPkg: any;

  beforeAll(() => {
    expect(fs.existsSync(backendPkgPath)).toBe(true);
    expect(fs.existsSync(rootPkgPath)).toBe(true);
    backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
    rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  });

  // --------------------------------------------------------------------------
  // Step 1: Script Configuration and Execution Order Verification
  // --------------------------------------------------------------------------

  it('1. backend/package.json must define a dedicated staging:migrate script', () => {
    expect(backendPkg.scripts['staging:migrate']).toBeDefined();
    expect(typeof backendPkg.scripts['staging:migrate']).toBe('string');
  });

  it('2. staging:migrate must strictly chain verify-staging-identity, preflight-db-check, and prisma migrate deploy in order', () => {
    const cmd = backendPkg.scripts['staging:migrate'].trim();

    // Verify exact sequence: Step 1 (Identity) -> Step 2 (Preflight) -> Step 3 (Deploy)
    const steps = cmd.split('&&').map((s: string) => s.trim());
    expect(steps.length).toBe(3);

    expect(steps[0]).toMatch(/^node scripts\/verify-staging-identity\.js$/);
    expect(steps[1]).toMatch(/^node scripts\/preflight-db-check\.js$/);
    expect(steps[2]).toMatch(/^prisma migrate deploy$/);
  });

  it('3. root package.json must expose staging:migrate delegating to backend workspace', () => {
    expect(rootPkg.scripts['staging:migrate']).toBeDefined();
    expect(rootPkg.scripts['staging:migrate']).toMatch(/^npm run staging:migrate --workspace=backend$/);
  });

  it('4. general-purpose development prisma:migrate script must remain preserved and unchanged', () => {
    expect(backendPkg.scripts['prisma:migrate']).toBeDefined();
    expect(backendPkg.scripts['prisma:migrate']).toMatch(/^node scripts\/preflight-db-check\.js && prisma migrate deploy$/);

    expect(rootPkg.scripts['db:migrate']).toBeDefined();
    expect(rootPkg.scripts['db:migrate']).toMatch(/^npm run prisma:migrate --workspace=backend$/);
  });

  // --------------------------------------------------------------------------
  // Step 2: Gate Short-Circuit Simulation (Mocked Execution Flow)
  // --------------------------------------------------------------------------

  describe('Gate Short-Circuiting Mechanics', () => {
    it('5. failed identity check aborts the chain before preflight or Prisma can run', () => {
      // Mock step tracker
      const executedSteps: string[] = [];

      // Step 1: Identity check fails closed
      const identityResult = verifyStagingIdentity({
        env: { DEPLOYMENT_ENVIRONMENT: 'development' }, // non-staging!
        platform: 'linux',
      });
      executedSteps.push('verify-staging-identity');

      expect(identityResult.ok).toBe(false);

      // Simulating shell '&&' behavior: non-zero exit halts execution immediately
      if (identityResult.ok) {
        executedSteps.push('preflight-db-check');
        executedSteps.push('prisma migrate deploy');
      }

      expect(executedSteps).toEqual(['verify-staging-identity']);
      expect(executedSteps).not.toContain('preflight-db-check');
      expect(executedSteps).not.toContain('prisma migrate deploy');
    });

    it('6. failed database preflight aborts the chain before Prisma can run', () => {
      const executedSteps: string[] = [];

      // Step 1: Mocked identity check passes
      const mockIdentityPass = { ok: true };
      executedSteps.push('verify-staging-identity');

      if (mockIdentityPass.ok) {
        // Step 2: Preflight check evaluates target database
        const preflightResult = checkDatabaseTarget('postgresql://localhost:5432/fee_dev'); // forbidden fee_dev!
        executedSteps.push('preflight-db-check');

        expect(preflightResult.ok).toBe(false);
        expect(preflightResult.reason).toMatch(/prohibited database 'fee_dev'/i);

        // Simulating shell '&&' behavior
        if (preflightResult.ok) {
          executedSteps.push('prisma migrate deploy');
        }
      }

      expect(executedSteps).toEqual(['verify-staging-identity', 'preflight-db-check']);
      expect(executedSteps).not.toContain('prisma migrate deploy');
    });

    it('7. both identity and preflight checks passing permits progression to deployment step', () => {
      const executedSteps: string[] = [];

      // Step 1: Mocked identity check passes
      const mockIdentityPass = { ok: true };
      executedSteps.push('verify-staging-identity');

      if (mockIdentityPass.ok) {
        // Step 2: Preflight check against approved staging database on localhost
        const preflightResult = checkDatabaseTarget('postgresql://user:pass@localhost:5432/fee_staging');
        executedSteps.push('preflight-db-check');

        expect(preflightResult.ok).toBe(true);

        // Step 3: Permitted to proceed
        if (preflightResult.ok) {
          executedSteps.push('prisma migrate deploy (authorized)');
        }
      }

      expect(executedSteps).toEqual([
        'verify-staging-identity',
        'preflight-db-check',
        'prisma migrate deploy (authorized)',
      ]);
    });
  });

  // --------------------------------------------------------------------------
  // Step 3: FQDN and Missing Evidence Fail-Closed Invariants
  // --------------------------------------------------------------------------

  describe('Fail-Closed Identity Invariants in the Staging Gate', () => {
    it('8. missing identity parameters strictly fail closed', () => {
      const res = verifyStagingIdentity({ env: {} });
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/Missing DEPLOYMENT_ENVIRONMENT/i);
    });

    it('9. uncorroborated FQDN strictly fails closed', () => {
      const res = verifyStagingIdentity({
        env: {
          DEPLOYMENT_ENVIRONMENT: 'staging',
          EXPECTED_STAGING_HOSTNAME: 'staging-fee-vm01.internal',
          EXPECTED_STAGING_IP: '10.100.1.50',
          STAGING_MARKER_PATH: '/mock/path',
        },
        platform: 'linux',
        getHostname: () => 'staging-fee-vm01', // short nodename
        fs: {
          existsSync: () => false, // no marker corroboration!
        },
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/Hostname\/FQDN mismatch/i);
    });
  });
});
