/**
 * Preflight Database Target Guard
 * 
 * Verifies that DATABASE_URL does not target 'fee_db' or an unapproved database
 * before allowing migration or seed scripts to proceed.
 */
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const DEFAULT_ALLOWED_DATABASES = [
  'fee_dev',
  'fee_staging',
  'fee_uat',
  'fee_uat_sandbox',
  'fee_test',
  'fee_iso_test',
];

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: 'process.env.DATABASE_URL' };
  }

  // Check backend/.env and .env if not set in environment
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
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

function parseDatabaseName(connectionUrl) {
  if (!connectionUrl) return null;
  try {
    const parsed = new URL(connectionUrl);
    return parsed.pathname.replace(/^\//, '').trim();
  } catch {
    return null;
  }
}

function checkDatabaseTarget(connectionUrl, options = {}) {
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

function main() {
  const { url, source } = resolveDatabaseUrl();
  const result = checkDatabaseTarget(url);

  if (!result.ok) {
    console.error(`\n======================================================`);
    console.error(`[PREFLIGHT ERROR] Database target validation FAILED`);
    console.error(`Source: ${source}`);
    console.error(`Reason: ${result.reason}`);
    console.error(`======================================================\n`);
    process.exit(1);
  }

  console.log(`[PREFLIGHT PASS] Verified authorized database target: '${result.dbName}' (from ${source})`);
  process.exit(0);
}

module.exports = {
  checkDatabaseTarget,
  parseDatabaseName,
  resolveDatabaseUrl,
  DEFAULT_ALLOWED_DATABASES,
};

if (require.main === module) {
  main();
}
