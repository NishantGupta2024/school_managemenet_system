import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_ALLOWED_DATABASES = [
  'fee_dev',
  'fee_staging',
  'fee_uat',
  'fee_uat_sandbox',
  'fee_test',
  'fee_iso_test',
];

export interface DatabaseTargetCheckResult {
  ok: boolean;
  dbName?: string;
  reason?: string;
}

export function parseDatabaseName(connectionUrl: string | undefined | null): string | null {
  if (!connectionUrl) return null;
  try {
    const parsed = new URL(connectionUrl.replace(/^["']|["']$/g, ''));
    return parsed.pathname.replace(/^\//, '').trim();
  } catch {
    return null;
  }
}

export function resolveDatabaseUrl(): { url: string | null; source: string } {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: 'process.env.DATABASE_URL' };
  }

  const candidates = [
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          if (key === 'DATABASE_URL') {
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            return { url: val, source: envPath };
          }
        }
      }
    }
  }

  return { url: null, source: 'none' };
}

export function checkDatabaseTarget(
  connectionUrl: string | undefined | null,
  options: { allowedDatabases?: string[]; allowUnsafeFeeDb?: boolean } = {},
): DatabaseTargetCheckResult {
  const allowedDatabases = options.allowedDatabases || DEFAULT_ALLOWED_DATABASES;
  const allowUnsafeFeeDb = options.allowUnsafeFeeDb || process.env.ALLOW_UNSAFE_FEE_DB === 'true';

  if (!connectionUrl) {
    return {
      ok: false,
      reason: 'DATABASE_URL is not set in environment or configuration files.',
    };
  }

  const dbName = parseDatabaseName(connectionUrl);
  if (!dbName) {
    return {
      ok: false,
      reason: 'Could not extract valid database name from DATABASE_URL.',
    };
  }

  if (dbName.toLowerCase() === 'fee_db' && !allowUnsafeFeeDb) {
    return {
      ok: false,
      dbName,
      reason: "Refusing execution on prohibited database 'fee_db'. Target must be an isolated staging or test database.",
    };
  }

  const isPatternAllowed = allowedDatabases.some(
    (allowed) =>
      dbName.toLowerCase() === allowed.toLowerCase() ||
      dbName.toLowerCase().startsWith(allowed.toLowerCase()),
  );

  const isExplicitEnvAllowed =
    process.env.AUTHORIZED_DATABASE &&
    process.env.AUTHORIZED_DATABASE.toLowerCase() === dbName.toLowerCase();

  if (!isPatternAllowed && !isExplicitEnvAllowed) {
    return {
      ok: false,
      dbName,
      reason: `Database '${dbName}' is not in the approved staging/test allowlist (${allowedDatabases.join(', ')}). Set AUTHORIZED_DATABASE=${dbName} if this is an intentional isolated target.`,
    };
  }

  return {
    ok: true,
    dbName,
  };
}
