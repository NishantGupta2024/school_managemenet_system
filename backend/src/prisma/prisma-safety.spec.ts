import { PrismaService } from './prisma.service';
import { validateSeedTarget, DEFAULT_ALLOWED_SEED_DATABASES } from '../../prisma/seed';
import { checkDatabaseTarget } from '../common/guards/database-target.guard';

describe('Database Target Safety & Guardrails (FEE-P0-003-SAFETY-FIX)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.ALLOW_UNSAFE_FEE_DB;
    delete process.env.AUTHORIZED_DATABASE;
    delete process.env.AUTHORIZED_SEED_DATABASE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Preflight Script Guard (preflight-db-check.js)', () => {
    it('fails closed when DATABASE_URL is missing or empty', () => {
      const res = checkDatabaseTarget('');
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/DATABASE_URL is not set/i);
    });

    it('fails closed when DATABASE_URL is invalid/unparseable', () => {
      const res = checkDatabaseTarget('not-a-valid-url');
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/Could not extract valid database name/i);
    });

    it('strictly rejects fee_db without explicit override', () => {
      const res = checkDatabaseTarget('postgresql://user:pass@localhost:5432/fee_db');
      expect(res.ok).toBe(false);
      expect(res.dbName).toBe('fee_db');
      expect(res.reason).toMatch(/Refusing execution on prohibited database 'fee_db'/i);
    });

    it('strictly rejects unapproved non-staging databases', () => {
      const res = checkDatabaseTarget('postgresql://user:pass@localhost:5432/production_school_db');
      expect(res.ok).toBe(false);
      expect(res.dbName).toBe('production_school_db');
      expect(res.reason).toMatch(/not in the approved staging\/test allowlist/i);
    });

    it('approves authorized staging targets from default allowlist', () => {
      for (const target of DEFAULT_ALLOWED_SEED_DATABASES) {
        const res = checkDatabaseTarget(`postgresql://user:pass@localhost:5432/${target}`);
        expect(res.ok).toBe(true);
        expect(res.dbName).toBe(target);
      }
    });

    it('approves custom database when AUTHORIZED_DATABASE matches', () => {
      process.env.AUTHORIZED_DATABASE = 'custom_sandbox_db';
      const res = checkDatabaseTarget('postgresql://user:pass@localhost:5432/custom_sandbox_db');
      expect(res.ok).toBe(true);
      expect(res.dbName).toBe('custom_sandbox_db');
    });
  });

  describe('Seed Target Validator (backend/prisma/seed.ts)', () => {
    it('fails closed when DATABASE_URL is missing', async () => {
      const mockPrisma = { $queryRaw: jest.fn() };
      await expect(validateSeedTarget(mockPrisma as any, '')).rejects.toThrow(
        /DATABASE_URL environment variable is missing/i,
      );
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('strictly rejects fee_db in the connection URL before querying database', async () => {
      const mockPrisma = { $queryRaw: jest.fn() };
      await expect(
        validateSeedTarget(mockPrisma as any, 'postgresql://user:pass@localhost:5432/fee_db'),
      ).rejects.toThrow(/Refusing to seed prohibited database 'fee_db'/i);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('strictly rejects when actual connected database returned by SELECT current_database() is fee_db', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'fee_db' }]),
      };
      await expect(
        validateSeedTarget(mockPrisma as any, 'postgresql://user:pass@localhost:5432/fee_staging'),
      ).rejects.toThrow(/Connected database is prohibited database 'fee_db'/i);
    });

    it('strictly rejects when URL database name does not match actual connected database name (target spoofing)', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'another_db' }]),
      };
      await expect(
        validateSeedTarget(mockPrisma as any, 'postgresql://user:pass@localhost:5432/fee_staging'),
      ).rejects.toThrow(/Mismatch rejected/i);
    });

    it('strictly rejects unapproved databases even if URL and connection match', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'unapproved_db' }]),
      };
      await expect(
        validateSeedTarget(mockPrisma as any, 'postgresql://user:pass@localhost:5432/unapproved_db'),
      ).rejects.toThrow(/not in the approved staging\/test allowlist/i);
    });

    it('successfully approves verified staging database', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'fee_staging' }]),
      };
      const verified = await validateSeedTarget(
        mockPrisma as any,
        'postgresql://user:pass@localhost:5432/fee_staging',
      );
      expect(verified).toBe('fee_staging');
    });

    it('approves custom staging target with AUTHORIZED_SEED_DATABASE', async () => {
      process.env.AUTHORIZED_SEED_DATABASE = 'custom_qa_sandbox';
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'custom_qa_sandbox' }]),
      };
      const verified = await validateSeedTarget(
        mockPrisma as any,
        'postgresql://user:pass@localhost:5432/custom_qa_sandbox',
      );
      expect(verified).toBe('custom_qa_sandbox');
    });
  });

  describe('PrismaService Startup Guard (prisma.service.ts)', () => {
    it('refuses startup in non-production when connected to fee_db', async () => {
      process.env.NODE_ENV = 'development';
      const service = new PrismaService();

      jest.spyOn(service, '$connect').mockResolvedValue(undefined as any);
      jest.spyOn(service, '$queryRaw').mockResolvedValue([{ db: 'fee_db' }] as any);

      await expect(service.onModuleInit()).rejects.toThrow(
        /PrismaService startup blocked: Connected to prohibited database 'fee_db'/i,
      );
    });

    it('allows startup when connected to an authorized staging database', async () => {
      process.env.NODE_ENV = 'development';
      const service = new PrismaService();

      jest.spyOn(service, '$connect').mockResolvedValue(undefined as any);
      jest.spyOn(service, '$queryRaw').mockResolvedValue([{ db: 'fee_staging' }] as any);
      const loggerSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("database: fee_staging"),
      );
      loggerSpy.mockRestore();
    });

    it('does not block fee_db in production environment (allowing legitimate prod deployment)', async () => {
      process.env.NODE_ENV = 'production';
      const service = new PrismaService();

      jest.spyOn(service, '$connect').mockResolvedValue(undefined as any);
      jest.spyOn(service, '$queryRaw').mockResolvedValue([{ db: 'fee_db' }] as any);
      const loggerSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("database: fee_db"),
      );
      loggerSpy.mockRestore();
    });
  });
});
