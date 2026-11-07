/**
 * Hardened Preflight Database Target Guard
 * 
 * Verifies that DATABASE_URL does not target 'fee_db', 'fee_dev', production databases,
 * or unapproved remote hosts before allowing migration or seed scripts to proceed.
 * 
 * Fails closed on missing, malformed, ambiguous, or unapproved targets.
 * Never leaks passwords, tokens, or full connection strings in logs or error messages.
 */
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const SUPPORTED_PROTOCOLS = ['postgresql:', 'postgres:'];

const FORBIDDEN_DATABASES = [
  'fee_db',
  'fee_dev',
  'postgres',
  'template1',
  'template0',
];

const FORBIDDEN_DB_PATTERNS = [
  /prod/i,
  /production/i,
  /master/i,
  /live/i,
];

const DEFAULT_ALLOWED_DATABASES = [
  'fee_staging',
  'fee_uat',
  'fee_uat_sandbox',
  'fee_test',
  'fee_iso_test',
];

const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
];

const FORBIDDEN_HOST_PATTERNS = [
  /prod/i,
  /production/i,
  /live/i,
  /master/i,
];

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: 'process.env.DATABASE_URL' };
  }

  // Check backend/.env, ../../.env, and root .env if not set in environment
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
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
      } catch {
        // Continue searching other candidates
      }
    }
  }

  return { url: null, source: 'none' };
}

function parseConnectionDetails(connectionUrl) {
  if (!connectionUrl || typeof connectionUrl !== 'string') {
    return {
      ok: false,
      reason: 'DATABASE_URL is not set or empty in environment or configuration files.',
    };
  }

  const cleanUrl = connectionUrl.trim().replace(/^["']|["']$/g, '');
  if (!cleanUrl) {
    return {
      ok: false,
      reason: 'DATABASE_URL is empty.',
    };
  }

  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return {
      ok: false,
      reason: 'DATABASE_URL is malformed and could not be parsed as a valid URL.',
    };
  }

  // 1. Validate protocol
  if (!SUPPORTED_PROTOCOLS.includes(parsed.protocol.toLowerCase())) {
    return {
      ok: false,
      reason: `Unsupported database protocol '${parsed.protocol}'. Only ${SUPPORTED_PROTOCOLS.join(', ')} are supported.`,
    };
  }

  // 2. Validate hostname presence
  const host = parsed.hostname ? parsed.hostname.trim() : '';
  if (!host) {
    return {
      ok: false,
      reason: 'Missing hostname in DATABASE_URL.',
    };
  }

  // 3. Validate database name presence and structure
  const rawPath = parsed.pathname ? parsed.pathname.trim() : '';
  if (!rawPath || rawPath === '/') {
    return {
      ok: false,
      reason: 'Missing database name in DATABASE_URL.',
    };
  }

  const dbPath = rawPath.replace(/^\//, '').trim();
  if (!dbPath) {
    return {
      ok: false,
      reason: 'Missing database name in DATABASE_URL.',
    };
  }

  // Reject multiple path segments (e.g. /fee_staging/extra)
  if (dbPath.includes('/')) {
    return {
      ok: false,
      reason: 'Ambiguous database path: multiple path segments are not permitted.',
    };
  }

  // Reject URL-encoded / percent-encoded characters (e.g. fee%20staging)
  if (dbPath.includes('%')) {
    return {
      ok: false,
      reason: 'Ambiguous or URL-encoded database path rejected.',
    };
  }

  // Reject characters outside standard SQL identifier charset (alphanumeric and underscores)
  if (!/^[a-zA-Z0-9_]+$/.test(dbPath)) {
    return {
      ok: false,
      reason: `Invalid database name '${dbPath}': must contain only alphanumeric characters and underscores.`,
    };
  }

  return {
    ok: true,
    protocol: parsed.protocol,
    host: host.toLowerCase(),
    rawHost: host,
    dbName: dbPath.toLowerCase(),
    rawDbName: dbPath,
  };
}

function parseDatabaseName(connectionUrl) {
  const details = parseConnectionDetails(connectionUrl);
  return details.ok ? details.rawDbName : null;
}

function parseHostname(connectionUrl) {
  const details = parseConnectionDetails(connectionUrl);
  return details.ok ? details.rawHost : null;
}

function checkDatabaseTarget(connectionUrl, options = {}) {
  const details = parseConnectionDetails(connectionUrl);
  if (!details.ok) {
    return {
      ok: false,
      reason: details.reason,
    };
  }

  const { host, rawHost, dbName, rawDbName } = details;

  // -------------------------------------------------------------
  // Hostname Validation
  // -------------------------------------------------------------

  // Reject forbidden host patterns (e.g. prod, production, live, master)
  const isForbiddenHost = FORBIDDEN_HOST_PATTERNS.some((pattern) => pattern.test(host));
  if (isForbiddenHost) {
    return {
      ok: false,
      host: rawHost,
      dbName: rawDbName,
      reason: `Refusing execution: Hostname '${rawHost}' is recognized as a production or forbidden endpoint.`,
    };
  }

  // Build approved host allowlist
  const extraAllowedHosts = [
    ...(process.env.ALLOWED_STAGING_HOSTS
      ? process.env.ALLOWED_STAGING_HOSTS.split(',').map((h) => h.trim().toLowerCase())
      : []),
    ...(process.env.AUTHORIZED_HOST ? [process.env.AUTHORIZED_HOST.trim().toLowerCase()] : []),
    ...(options.allowedHosts ? options.allowedHosts.map((h) => h.trim().toLowerCase()) : []),
  ].filter(Boolean);

  // Filter out any user-injected hosts matching forbidden patterns
  const safeExtraAllowedHosts = extraAllowedHosts.filter(
    (h) => !FORBIDDEN_HOST_PATTERNS.some((p) => p.test(h)),
  );

  const allowedHosts = Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...safeExtraAllowedHosts]));
  const isHostApproved = allowedHosts.includes(host);

  if (!isHostApproved) {
    return {
      ok: false,
      host: rawHost,
      dbName: rawDbName,
      reason: `Hostname '${rawHost}' is not in the approved staging host allowlist (${DEFAULT_ALLOWED_HOSTS.join(', ')}). Set ALLOWED_STAGING_HOSTS or AUTHORIZED_HOST if this is an approved isolated host.`,
    };
  }

  // -------------------------------------------------------------
  // Database Name Validation
  // -------------------------------------------------------------

  // Narrowly scoped, operation-specific authorization for local development migration
  const isMigrateOperation =
    options.operation === 'migrate' ||
    process.env.PREFLIGHT_OPERATION === 'migrate' ||
    process.argv.includes('--operation=migrate');

  const isLocalDevMigrationAuthorized =
    process.env.ALLOW_DEV_LOCAL_MIGRATION === 'true' &&
    isMigrateOperation &&
    dbName === 'fee_dev' &&
    DEFAULT_ALLOWED_HOSTS.includes(host);

  // Reject explicitly forbidden database names regardless of any flags or options,
  // unless strictly authorized under the narrow local development migration exception
  if (FORBIDDEN_DATABASES.includes(dbName) && !isLocalDevMigrationAuthorized) {
    return {
      ok: false,
      host: rawHost,
      dbName: rawDbName,
      reason: `Refusing execution on prohibited database '${rawDbName}'. Target must be an isolated staging or test database.`,
    };
  }

  // Reject production-like database names (containing prod, production, master, live)
  const isForbiddenDbPattern = FORBIDDEN_DB_PATTERNS.some((pattern) => pattern.test(dbName));
  if (isForbiddenDbPattern) {
    return {
      ok: false,
      host: rawHost,
      dbName: rawDbName,
      reason: `Refusing execution on production-like database '${rawDbName}'. Target must be an isolated staging or test database.`,
    };
  }

  // Exact matching against allowed database allowlist
  const configuredAllowed = options.allowedDatabases || DEFAULT_ALLOWED_DATABASES;
  // Never allow forbidden names to enter the effective allowlist
  const effectiveAllowed = configuredAllowed
    .map((d) => d.trim().toLowerCase())
    .filter(
      (d) =>
        !FORBIDDEN_DATABASES.includes(d) &&
        !FORBIDDEN_DB_PATTERNS.some((pattern) => pattern.test(d)),
    );

  const isExactAllowed = effectiveAllowed.includes(dbName);

  // Explicit target authorization via environment variable (must also pass forbidden checks)
  const explicitEnvDb = process.env.AUTHORIZED_DATABASE
    ? process.env.AUTHORIZED_DATABASE.trim().toLowerCase()
    : null;
  const isExplicitEnvAllowed =
    explicitEnvDb &&
    !FORBIDDEN_DATABASES.includes(explicitEnvDb) &&
    !FORBIDDEN_DB_PATTERNS.some((pattern) => pattern.test(explicitEnvDb)) &&
    dbName === explicitEnvDb;

  if (!isExactAllowed && !isExplicitEnvAllowed && !isLocalDevMigrationAuthorized) {
    return {
      ok: false,
      host: rawHost,
      dbName: rawDbName,
      reason: `Database '${rawDbName}' is not in the approved staging/test allowlist (${DEFAULT_ALLOWED_DATABASES.join(', ')}). Set AUTHORIZED_DATABASE=${rawDbName} if this is an intentional isolated target.`,
    };
  }

  return {
    ok: true,
    host: rawHost,
    dbName: rawDbName,
    isLocalDevMigration: isLocalDevMigrationAuthorized,
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

  const opInfo = result.isLocalDevMigration ? ' [OPERATION: LOCAL DEV MIGRATION]' : '';
  console.log(
    `[PREFLIGHT PASS] Verified authorized database target: '${result.dbName}' on host '${result.host}' (from ${source})${opInfo}`,
  );
  process.exit(0);
}

module.exports = {
  checkDatabaseTarget,
  parseDatabaseName,
  parseHostname,
  parseConnectionDetails,
  resolveDatabaseUrl,
  DEFAULT_ALLOWED_DATABASES,
  DEFAULT_ALLOWED_HOSTS,
  FORBIDDEN_DATABASES,
  FORBIDDEN_DB_PATTERNS,
  FORBIDDEN_HOST_PATTERNS,
  SUPPORTED_PROTOCOLS,
};

if (require.main === module) {
  main();
}
