import { PrismaClient } from '@prisma/client';
import { URL } from 'url';

interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    protocol: string;
    hostname: string;
    port: string;
    database: string;
    username: string;
  };
}

export function validateTestDatabaseUrl(urlStr: string): ValidationResult {
  try {
    const parsed = new URL(urlStr);
    const protocol = parsed.protocol.replace(':', '');
    if (protocol !== 'postgresql' && protocol !== 'postgres') {
      return { valid: false, error: `Invalid protocol: ${protocol}. Expected postgresql or postgres.` };
    }

    const approvedHosts = ['localhost', '127.0.0.1', '::1', 'postgres-test-container'];
    if (!approvedHosts.includes(parsed.hostname)) {
      return { valid: false, error: `Host '${parsed.hostname}' is not on the approved test-host allowlist: ${approvedHosts.join(', ')}` };
    }

    const dbName = parsed.pathname.slice(1);
    if (!dbName) {
      return { valid: false, error: 'Database name is missing in connection string.' };
    }

    const protectedDatabases = ['fee_dev', 'fee_db', 'fee_iso_test', 'fee_backup_verify', 'postgres'];
    if (protectedDatabases.includes(dbName.toLowerCase())) {
      return { valid: false, error: `Access denied: '${dbName}' is a protected database.` };
    }

    if (dbName !== 'fee_notification_e2e_test') {
      return { valid: false, error: `Database name must strictly equal 'fee_notification_e2e_test', got '${dbName}'.` };
    }

    return {
      valid: true,
      details: {
        protocol,
        hostname: parsed.hostname,
        port: parsed.port || '5432',
        database: dbName,
        username: parsed.username || 'unknown',
      },
    };
  } catch (err: any) {
    return { valid: false, error: `Malformed connection URL: ${err.message}` };
  }
}
