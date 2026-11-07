import * as fs from 'fs';
import * as path from 'path';

// Import the hardened preflight validator module directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  checkDatabaseTarget,
  parseDatabaseName,
  parseHostname,
  parseConnectionDetails,
  DEFAULT_ALLOWED_DATABASES,
  DEFAULT_ALLOWED_HOSTS,
  FORBIDDEN_DATABASES,
} = require('../../scripts/preflight-db-check');

describe('Hardened Preflight Database Target Guard (Phase R1.18)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.ALLOW_UNSAFE_FEE_DB;
    delete process.env.AUTHORIZED_DATABASE;
    delete process.env.AUTHORIZED_HOST;
    delete process.env.ALLOWED_STAGING_HOSTS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // --------------------------------------------------------------------------
  // Core Requirement Test Cases (1 through 20)
  // --------------------------------------------------------------------------

  // Case 1: Missing database URL
  it('1. should reject when database URL is missing (null/undefined)', () => {
    const resNull = checkDatabaseTarget(null);
    expect(resNull.ok).toBe(false);
    expect(resNull.reason).toMatch(/DATABASE_URL is not set or empty/i);

    const resUndefined = checkDatabaseTarget(undefined);
    expect(resUndefined.ok).toBe(false);
    expect(resUndefined.reason).toMatch(/DATABASE_URL is not set or empty/i);
  });

  // Case 2: Empty database URL
  it('2. should reject when database URL is an empty or whitespace string', () => {
    const resEmpty = checkDatabaseTarget('');
    expect(resEmpty.ok).toBe(false);
    expect(resEmpty.reason).toMatch(/DATABASE_URL is not set or empty/i);

    const resWhitespace = checkDatabaseTarget('   ');
    expect(resWhitespace.ok).toBe(false);
    expect(resWhitespace.reason).toMatch(/DATABASE_URL is empty/i);
  });

  // Case 3: Malformed URL
  it('3. should reject malformed or unparseable database URLs', () => {
    const res = checkDatabaseTarget('not-a-valid-database-url');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/malformed and could not be parsed/i);
  });

  // Case 4: Unsupported URL protocol
  it('4. should reject unsupported URL protocols (mysql, http, sqlite, etc.)', () => {
    const resMysql = checkDatabaseTarget('mysql://localhost:3306/fee_staging');
    expect(resMysql.ok).toBe(false);
    expect(resMysql.reason).toMatch(/unsupported database protocol 'mysql:'/i);

    const resHttp = checkDatabaseTarget('http://localhost:5432/fee_staging');
    expect(resHttp.ok).toBe(false);
    expect(resHttp.reason).toMatch(/unsupported database protocol 'http:'/i);
  });

  // Case 5: Missing hostname
  it('5. should reject database URLs missing a hostname', () => {
    const res = checkDatabaseTarget('postgresql:///fee_staging');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/missing hostname/i);
  });

  // Case 6: Missing database name
  it('6. should reject database URLs missing a database name', () => {
    const resNoPath = checkDatabaseTarget('postgresql://localhost:5432');
    expect(resNoPath.ok).toBe(false);
    expect(resNoPath.reason).toMatch(/missing database name/i);

    const resSlashOnly = checkDatabaseTarget('postgresql://localhost:5432/');
    expect(resSlashOnly.ok).toBe(false);
    expect(resSlashOnly.reason).toMatch(/missing database name/i);
  });

  // Case 7: Exact approved staging database on an approved staging hostname
  it('7. should approve exact authorized staging database on approved staging hostname', () => {
    const res = checkDatabaseTarget('postgresql://app_user:mock_secret@localhost:5432/fee_staging');
    expect(res.ok).toBe(true);
    expect(res.dbName).toBe('fee_staging');
    expect(res.host).toBe('localhost');

    // Also verify 127.0.0.1 and IPv6 loopback
    const resIp = checkDatabaseTarget('postgresql://app_user:mock_secret@127.0.0.1:5432/fee_staging');
    expect(resIp.ok).toBe(true);
    expect(resIp.dbName).toBe('fee_staging');
  });

  // Case 8: fee_dev rejected
  it('8. should strictly reject fee_dev regardless of environment', () => {
    const res = checkDatabaseTarget('postgresql://localhost:5432/fee_dev');
    expect(res.ok).toBe(false);
    expect(res.dbName).toBe('fee_dev');
    expect(res.reason).toMatch(/prohibited database 'fee_dev'/i);
  });

  // Case 9: fee_db rejected
  it('9. should strictly reject fee_db regardless of environment', () => {
    const res = checkDatabaseTarget('postgresql://localhost:5432/fee_db');
    expect(res.ok).toBe(false);
    expect(res.dbName).toBe('fee_db');
    expect(res.reason).toMatch(/prohibited database 'fee_db'/i);
  });

  // Case 10: postgres rejected
  it('10. should strictly reject system database postgres', () => {
    const res = checkDatabaseTarget('postgresql://localhost:5432/postgres');
    expect(res.ok).toBe(false);
    expect(res.dbName).toBe('postgres');
    expect(res.reason).toMatch(/prohibited database 'postgres'/i);
  });

  // Case 11: fee_staging_production rejected (demonstrating exact match)
  it('11. should reject fee_staging_production (unsafe prefix match prevented)', () => {
    const res = checkDatabaseTarget('postgresql://localhost:5432/fee_staging_production');
    expect(res.ok).toBe(false);
    expect(res.dbName).toBe('fee_staging_production');
    // Must be rejected either by production pattern or by exact allowlist check
    expect(res.ok).toBe(false);
  });

  // Case 12: An unknown database name rejected
  it('12. should reject unknown/unapproved database name on an approved host', () => {
    const res = checkDatabaseTarget('postgresql://localhost:5432/some_unauthorized_db');
    expect(res.ok).toBe(false);
    expect(res.dbName).toBe('some_unauthorized_db');
    expect(res.reason).toMatch(/not in the approved staging\/test allowlist/i);
  });

  // Case 13: A production hostname rejected even when database name is fee_staging
  it('13. should reject a production hostname even when database name is fee_staging', () => {
    const resProd1 = checkDatabaseTarget('postgresql://app_user:mock_secret@prod-db.fee.com:5432/fee_staging');
    expect(resProd1.ok).toBe(false);
    expect(resProd1.reason).toMatch(/production or forbidden endpoint/i);

    const resProd2 = checkDatabaseTarget('postgresql://app_user:mock_secret@school-production.internal:5432/fee_staging');
    expect(resProd2.ok).toBe(false);
    expect(resProd2.reason).toMatch(/production or forbidden endpoint/i);
  });

  // Case 14: An unknown hostname rejected
  it('14. should reject unknown remote hostname even when database name is fee_staging', () => {
    const res = checkDatabaseTarget('postgresql://app_user:mock_secret@db.external-untrusted.com:5432/fee_staging');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not in the approved staging host allowlist/i);
  });

  // Case 15: A forbidden database name rejected on an otherwise approved host
  it('15. should reject a forbidden database name on an approved staging host', () => {
    process.env.ALLOWED_STAGING_HOSTS = 'staging-db.school.internal';
    const res = checkDatabaseTarget('postgresql://app_user:mock_secret@staging-db.school.internal:5432/fee_dev');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/prohibited database 'fee_dev'/i);
  });

  // Case 16: A staging hostname with an unapproved database name rejected
  it('16. should reject an unapproved database name on an approved staging host', () => {
    process.env.ALLOWED_STAGING_HOSTS = 'staging-db.school.internal';
    const res = checkDatabaseTarget('postgresql://app_user:mock_secret@staging-db.school.internal:5432/custom_random_db');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not in the approved staging\/test allowlist/i);
  });

  // Case 17: URL-encoded or ambiguous path input rejected
  it('17. should reject URL-encoded or ambiguous multi-segment database paths', () => {
    // URL-encoded space
    const resEncoded = checkDatabaseTarget('postgresql://localhost:5432/fee%20staging');
    expect(resEncoded.ok).toBe(false);
    expect(resEncoded.reason).toMatch(/Ambiguous or URL-encoded database path rejected/i);

    // Multi-segment path
    const resMultiSegment = checkDatabaseTarget('postgresql://localhost:5432/fee_staging/extra_path');
    expect(resMultiSegment.ok).toBe(false);
    expect(resMultiSegment.reason).toMatch(/multiple path segments/i);

    // Special characters outside [a-zA-Z0-9_]
    const resSpecialChars = checkDatabaseTarget('postgresql://localhost:5432/fee$staging');
    expect(resSpecialChars.ok).toBe(false);
    expect(resSpecialChars.reason).toMatch(/Invalid database name/i);
  });

  // Case 18: Error output never includes a supplied password or complete connection string
  it('18. should ensure error messages never leak passwords or full connection URLs', () => {
    const sensitivePassword = 'SuperSecretUnleakablePassword999!';
    const sensitiveUrl = `postgresql://finance_admin:${sensitivePassword}@forbidden-prod.internal:5432/fee_db?sslmode=require`;

    const res = checkDatabaseTarget(sensitiveUrl);
    expect(res.ok).toBe(false);

    // Assert that the reason string does not contain password or userinfo
    expect(res.reason).not.toContain(sensitivePassword);
    expect(res.reason).not.toContain('finance_admin');
    expect(res.reason).not.toContain('sslmode=require');
    expect(res.reason).not.toContain('@forbidden-prod.internal');
  });

  // Case 19: Legacy ALLOW_UNSAFE_FEE_DB=true cannot permit a forbidden target
  it('19. should ensure legacy ALLOW_UNSAFE_FEE_DB=true CANNOT bypass safety checks for fee_db or fee_dev', () => {
    process.env.ALLOW_UNSAFE_FEE_DB = 'true';

    // fee_db must be rejected
    const resDb = checkDatabaseTarget('postgresql://localhost:5432/fee_db');
    expect(resDb.ok).toBe(false);
    expect(resDb.reason).toMatch(/prohibited database 'fee_db'/i);

    // fee_dev must be rejected
    const resDev = checkDatabaseTarget('postgresql://localhost:5432/fee_dev');
    expect(resDev.ok).toBe(false);
    expect(resDev.reason).toMatch(/prohibited database 'fee_dev'/i);

    // Options bypass attempt must also fail
    const resOptions = checkDatabaseTarget('postgresql://localhost:5432/fee_db', {
      allowUnsafeFeeDb: true,
      allowedDatabases: ['fee_db'],
    });
    expect(resOptions.ok).toBe(false);
    expect(resOptions.reason).toMatch(/prohibited database 'fee_db'/i);
  });

  // Case 20: Both migration and seed entry points invoke the hardened preflight guard
  it('20. should verify that backend/package.json migration and seed entry points call preflight-db-check.js', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.scripts).toBeDefined();

    // Verify prisma:migrate invokes preflight check before prisma migrate deploy
    expect(pkg.scripts['prisma:migrate']).toBeDefined();
    expect(pkg.scripts['prisma:migrate']).toMatch(/^node scripts\/preflight-db-check\.js\s*&&\s*prisma migrate deploy/);

    // Verify prisma:seed invokes preflight check before prisma seed execution
    expect(pkg.scripts['prisma:seed']).toBeDefined();
    expect(pkg.scripts['prisma:seed']).toMatch(/^node scripts\/preflight-db-check\.js\s*&&\s*ts-node prisma\/seed\.ts/);
  });

  // --------------------------------------------------------------------------
  // Additional Edge-Case & Helper Tests
  // --------------------------------------------------------------------------

  describe('Additional Edge Cases & Isolated Target Customization', () => {
    it('approves custom isolated target when AUTHORIZED_DATABASE is set (and not forbidden)', () => {
      process.env.AUTHORIZED_DATABASE = 'fee_custom_isolated_test';
      const res = checkDatabaseTarget('postgresql://localhost:5432/fee_custom_isolated_test');
      expect(res.ok).toBe(true);
      expect(res.dbName).toBe('fee_custom_isolated_test');
    });

    it('rejects AUTHORIZED_DATABASE if it attempts to authorize a forbidden target', () => {
      process.env.AUTHORIZED_DATABASE = 'fee_dev';
      const res = checkDatabaseTarget('postgresql://localhost:5432/fee_dev');
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/prohibited database 'fee_dev'/i);
    });

    it('approves custom staging host via AUTHORIZED_HOST', () => {
      process.env.AUTHORIZED_HOST = 'staging-node-1.internal';
      const res = checkDatabaseTarget('postgresql://staging-node-1.internal:5432/fee_staging');
      expect(res.ok).toBe(true);
      expect(res.host).toBe('staging-node-1.internal');
    });

    it('rejects AUTHORIZED_HOST if it attempts to authorize a production-like host pattern', () => {
      process.env.AUTHORIZED_HOST = 'prod-db.internal';
      const res = checkDatabaseTarget('postgresql://prod-db.internal:5432/fee_staging');
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/production or forbidden endpoint/i);
    });

    it('safely parses query parameters without corrupting database name', () => {
      const res = checkDatabaseTarget('postgresql://localhost:5432/fee_staging?schema=public&sslmode=prefer');
      expect(res.ok).toBe(true);
      expect(res.dbName).toBe('fee_staging');
    });

    it('parses database name and hostname safely through utility functions', () => {
      expect(parseDatabaseName('postgresql://localhost:5432/fee_staging')).toBe('fee_staging');
      expect(parseHostname('postgresql://localhost:5432/fee_staging')).toBe('localhost');

      expect(parseDatabaseName('invalid-url')).toBeNull();
      expect(parseHostname('invalid-url')).toBeNull();
    });

    // --------------------------------------------------------------------------
    // Focused Tests: Narrow Local Development Migration Authorization
    // --------------------------------------------------------------------------
    describe('Narrowly Scoped Local Development Migration Gate', () => {
      beforeEach(() => {
        delete process.env.ALLOW_DEV_LOCAL_MIGRATION;
        delete process.env.PREFLIGHT_OPERATION;
      });

      it('1. rejects fee_dev when authorization is missing or operation is unspecified', () => {
        // Missing both
        const res1 = checkDatabaseTarget('postgresql://localhost:5432/fee_dev');
        expect(res1.ok).toBe(false);
        expect(res1.reason).toMatch(/prohibited database 'fee_dev'/i);

        // Flag set but operation not 'migrate'
        process.env.ALLOW_DEV_LOCAL_MIGRATION = 'true';
        process.env.PREFLIGHT_OPERATION = 'seed';
        const res2 = checkDatabaseTarget('postgresql://localhost:5432/fee_dev');
        expect(res2.ok).toBe(false);
        expect(res2.reason).toMatch(/prohibited database 'fee_dev'/i);
      });

      it('2. accepts fee_dev when explicitly authorized for migration on an approved local host', () => {
        process.env.ALLOW_DEV_LOCAL_MIGRATION = 'true';
        process.env.PREFLIGHT_OPERATION = 'migrate';

        const resLocalhost = checkDatabaseTarget('postgresql://localhost:5432/fee_dev');
        expect(resLocalhost.ok).toBe(true);
        expect(resLocalhost.dbName).toBe('fee_dev');
        expect(resLocalhost.host).toBe('localhost');

        const resIp = checkDatabaseTarget('postgresql://127.0.0.1:5432/fee_dev');
        expect(resIp.ok).toBe(true);
        expect(resIp.dbName).toBe('fee_dev');
      });

      it('3. rejects fee_db even when dev migration authorization is enabled', () => {
        process.env.ALLOW_DEV_LOCAL_MIGRATION = 'true';
        process.env.PREFLIGHT_OPERATION = 'migrate';

        const res = checkDatabaseTarget('postgresql://localhost:5432/fee_db');
        expect(res.ok).toBe(false);
        expect(res.dbName).toBe('fee_db');
        expect(res.reason).toMatch(/prohibited database 'fee_db'/i);
      });

      it('4. rejects fee_dev on any remote host even when authorized', () => {
        process.env.ALLOW_DEV_LOCAL_MIGRATION = 'true';
        process.env.PREFLIGHT_OPERATION = 'migrate';

        const res = checkDatabaseTarget('postgresql://remote-server.school.internal:5432/fee_dev');
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/not in the approved staging host allowlist/i);
      });

      it('5. rejects missing, malformed, or ambiguous targets regardless of flags', () => {
        process.env.ALLOW_DEV_LOCAL_MIGRATION = 'true';
        process.env.PREFLIGHT_OPERATION = 'migrate';

        expect(checkDatabaseTarget(null).ok).toBe(false);
        expect(checkDatabaseTarget('').ok).toBe(false);
        expect(checkDatabaseTarget('not-a-url').ok).toBe(false);
        expect(checkDatabaseTarget('postgresql://localhost:5432/').ok).toBe(false);
      });

      it('6. preserves all existing protections for staging and test targets', () => {
        const resStaging = checkDatabaseTarget('postgresql://localhost:5432/fee_staging');
        expect(resStaging.ok).toBe(true);
        expect(resStaging.dbName).toBe('fee_staging');

        const resIsoTest = checkDatabaseTarget('postgresql://localhost:5432/fee_iso_test');
        expect(resIsoTest.ok).toBe(true);
        expect(resIsoTest.dbName).toBe('fee_iso_test');

        const resProd = checkDatabaseTarget('postgresql://localhost:5432/fee_production');
        expect(resProd.ok).toBe(false);
      });
    });
  });
});
