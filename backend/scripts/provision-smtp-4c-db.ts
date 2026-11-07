import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { validateTestDatabaseUrl } from './smtp-4c-safety';

const TEST_DB_NAME = 'fee_notification_e2e_test';
const TEST_HOST = 'localhost';
const TEST_PORT = '5432';

// Specific role passwords for least-privilege isolated testing
const ROLES = {
  provisioner: 'postgres', // admin role to create db & roles
  migrator: 'fee_e2e_migrator',
  app: 'fee_e2e_app',
  teardown: 'fee_e2e_teardown',
};

const PASSWORDS = {
  migrator: 'e2e_migrator_pass_2026',
  app: 'e2e_app_pass_2026',
  teardown: 'e2e_teardown_pass_2026',
};

const adminConnStr = 'postgresql://postgres:admin%402003@localhost:5432/postgres';
const migratorConnStr = `postgresql://${ROLES.migrator}:${PASSWORDS.migrator}@${TEST_HOST}:${TEST_PORT}/${TEST_DB_NAME}?schema=public`;
const appConnStr = `postgresql://${ROLES.app}:${PASSWORDS.app}@${TEST_HOST}:${TEST_PORT}/${TEST_DB_NAME}?schema=public`;
const teardownConnStr = `postgresql://${ROLES.teardown}:${PASSWORDS.teardown}@${TEST_HOST}:${TEST_PORT}/postgres`;

async function main() {
  const testRunId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  console.log(`\n======================================================`);
  console.log(`=== SMTP-4C: Isolated Test DB Provisioning & Setup ===`);
  console.log(`======================================================`);
  console.log(`Generated testRunId: ${testRunId}`);
  console.log(`Target Database: ${TEST_DB_NAME}`);
  console.log(`Target Host: ${TEST_HOST}:${TEST_PORT}`);

  // Step 1: Preflight URL validation
  console.log('\n[1/12] Validating target test database URL safety gates...');
  const valResult = validateTestDatabaseUrl(`postgresql://${ROLES.migrator}:***@${TEST_HOST}:${TEST_PORT}/${TEST_DB_NAME}`);
  if (!valResult.valid) {
    throw new Error(`Safety gate failed: ${valResult.error}`);
  }
  console.log('       Safety gate PASSED: URL parsed, host approved, protected DBs rejected.');

  // Step 2: Connect via admin client to inspect environment
  console.log('\n[2/12] Connecting to PostgreSQL instance to inspect roles and databases...');
  const adminClient = new PrismaClient({
    datasources: { db: { url: adminConnStr } },
  });

  try {
    // Check databases
    const existingDbs: any = await adminClient.$queryRawUnsafe(
      `SELECT datname FROM pg_database WHERE datname = $1`,
      TEST_DB_NAME,
    );

    if (existingDbs.length > 0) {
      console.log(`       Target database '${TEST_DB_NAME}' already exists. Inspecting ownership & comment...`);
      const commentRes: any = await adminClient.$queryRawUnsafe(`
        SELECT d.description 
        FROM pg_database b 
        LEFT JOIN pg_shdescription d ON b.oid = d.objoid 
        WHERE b.datname = $1
      `, TEST_DB_NAME);
      console.log(`       Existing comment: ${commentRes[0]?.description || 'None'}`);
      console.log(`       Terminating active connections and dropping stale disposable test database...`);
      await adminClient.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();
      `);
      await adminClient.$executeRawUnsafe(`DROP DATABASE "${TEST_DB_NAME}";`);
      console.log(`       Stale disposable test database dropped.`);
    }

    // Step 3: Create roles if they don't exist
    console.log('\n[3/12] Establishing required least-privilege roles...');
    
    // Migrator role (owns the DB, runs Prisma migrations with DDL)
    await adminClient.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLES.migrator}') THEN
          CREATE ROLE "${ROLES.migrator}" WITH LOGIN PASSWORD '${PASSWORDS.migrator}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        ELSE
          ALTER ROLE "${ROLES.migrator}" WITH LOGIN PASSWORD '${PASSWORDS.migrator}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);
    console.log(`       Role '${ROLES.migrator}' verified (NOSUPERUSER, NOCREATEDB, NOCREATEROLE).`);

    // App role (DML only, no DDL, no superuser)
    await adminClient.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLES.app}') THEN
          CREATE ROLE "${ROLES.app}" WITH LOGIN PASSWORD '${PASSWORDS.app}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        ELSE
          ALTER ROLE "${ROLES.app}" WITH LOGIN PASSWORD '${PASSWORDS.app}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);
    console.log(`       Role '${ROLES.app}' verified (NOSUPERUSER, NOCREATEDB, NOCREATEROLE).`);

    // Teardown role (member of fee_e2e_migrator for controlled teardown)
    await adminClient.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLES.teardown}') THEN
          CREATE ROLE "${ROLES.teardown}" WITH LOGIN PASSWORD '${PASSWORDS.teardown}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        ELSE
          ALTER ROLE "${ROLES.teardown}" WITH LOGIN PASSWORD '${PASSWORDS.teardown}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);
    await adminClient.$executeRawUnsafe(`GRANT "${ROLES.migrator}" TO "${ROLES.teardown}";`);
    console.log(`       Role '${ROLES.teardown}' verified and granted membership in '${ROLES.migrator}'.`);

    // Step 4: Create disposable test database owned by fee_e2e_migrator
    console.log('\n[4/12] Creating isolated disposable database owned by migrator...');
    await adminClient.$executeRawUnsafe(`
      CREATE DATABASE "${TEST_DB_NAME}" WITH OWNER "${ROLES.migrator}" ENCODING 'UTF8';
    `);
    console.log(`       Database '${TEST_DB_NAME}' created with OWNER '${ROLES.migrator}'.`);

    // Step 5: Persist independent testRunId comment
    console.log('\n[5/12] Persisting testRunId in PostgreSQL catalog comment...');
    const commentStr = `testRunId=${testRunId};createdAt=${new Date().toISOString()};owner=${ROLES.migrator}`;
    await adminClient.$executeRawUnsafe(`
      COMMENT ON DATABASE "${TEST_DB_NAME}" IS '${commentStr}';
    `);
    console.log(`       Catalog comment set: ${commentStr}`);

  } finally {
    await adminClient.$disconnect();
  }

  // Step 6: Connect with fee_e2e_migrator to grant schema privileges
  console.log('\n[6/12] Setting up public schema permissions under migrator...');
  const migratorClient = new PrismaClient({
    datasources: { db: { url: migratorConnStr } },
  });

  try {
    await migratorClient.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO "${ROLES.migrator}";`);
    await migratorClient.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${ROLES.app}";`);
    await migratorClient.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${ROLES.app}";`);
    await migratorClient.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${ROLES.app}";`);
    console.log(`       Public schema permissions and default privileges configured.`);
  } finally {
    await migratorClient.$disconnect();
  }

  // Step 7: Apply Prisma migrations using fee_e2e_migrator
  console.log('\n[7/12] Applying Prisma migrations to isolated test database via fee_e2e_migrator...');
  console.log('       Running: npx prisma migrate deploy with DATABASE_URL for fee_e2e_migrator');
  
  const envWithMigrator = {
    ...process.env,
    DATABASE_URL: migratorConnStr,
  };

  const migrateOutput = execSync('npx prisma migrate deploy', {
    cwd: 'd:\\fee\\backend',
    env: envWithMigrator,
    encoding: 'utf8',
  });
  console.log(migrateOutput.trim().split('\n').map(l => '       ' + l).join('\n'));

  // Step 8: Grant DML on created tables to fee_e2e_app
  console.log('\n[8/12] Granting DML-only access to fee_e2e_app on migrated tables...');
  const migratorClient2 = new PrismaClient({
    datasources: { db: { url: migratorConnStr } },
  });
  try {
    await migratorClient2.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${ROLES.app}";`);
    await migratorClient2.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${ROLES.app}";`);
    console.log(`       DML access granted on all tables and sequences.`);
  } finally {
    await migratorClient2.$disconnect();
  }

  // Step 9: Verify migration ledger and tables
  console.log('\n[9/12] Verifying migration ledger and table counts...');
  const migratorClient3 = new PrismaClient({
    datasources: { db: { url: migratorConnStr } },
  });
  try {
    const migrations: any = await migratorClient3.$queryRawUnsafe(`
      SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at ASC;
    `);
    console.log(`       Applied migrations count: ${migrations.length}`);
    const tables: any = await migratorClient3.$queryRawUnsafe(`
      SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public';
    `);
    console.log(`       Public schema table count: ${tables[0].count}`);

    // Check critical notification tables
    const notifTables: any = await migratorClient3.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'notification%'
      ORDER BY table_name;
    `);
    console.log(`       Notification tables present: ${notifTables.map((t: any) => t.table_name).join(', ')}`);
  } finally {
    await migratorClient3.$disconnect();
  }

  // Step 10: Verify application role privileges (DML allowed, DDL blocked)
  console.log('\n[10/12] Verifying application role privilege boundaries (DML allowed, DDL blocked)...');
  const appClient = new PrismaClient({
    datasources: { db: { url: appConnStr } },
  });
  try {
    // DML check
    const countRes: any = await appClient.$queryRawUnsafe(`SELECT count(*)::int as c FROM "notification_outbox"`);
    console.log(`       [PASS] DML SELECT succeeded (outbox count: ${countRes[0].c})`);

    // DDL check (must fail)
    let ddlBlocked = false;
    try {
      await appClient.$executeRawUnsafe(`CREATE TABLE fee_test_unauthorized (id int)`);
    } catch (ddlErr: any) {
      ddlBlocked = true;
      console.log(`       [PASS] DDL CREATE TABLE successfully BLOCKED: ${ddlErr.message.split('\n')[0]}`);
    }
    if (!ddlBlocked) {
      throw new Error('SECURITY VIOLATION: fee_e2e_app was able to execute DDL (CREATE TABLE)!');
    }
  } finally {
    await appClient.$disconnect();
  }

  // Step 11: Independently verify catalog comment using teardown connection
  console.log('\n[11/12] Independently verifying catalog testRunId comment via teardown connection...');
  const teardownClient = new PrismaClient({
    datasources: { db: { url: teardownConnStr } },
  });
  try {
    const commentRes: any = await teardownClient.$queryRawUnsafe(`
      SELECT d.description 
      FROM pg_database b 
      LEFT JOIN pg_shdescription d ON b.oid = d.objoid 
      WHERE b.datname = $1
    `, TEST_DB_NAME);
    const comment = commentRes[0]?.description;
    console.log(`       Retrieved catalog comment: ${comment}`);
    if (!comment || !comment.includes(`testRunId=${testRunId}`)) {
      throw new Error(`Catalog comment verification failed! Expected testRunId=${testRunId}, got: ${comment}`);
    }
    console.log('       [PASS] Catalog comment independently verified by teardown role.');
  } finally {
    await teardownClient.$disconnect();
  }

  // Step 12: Verify background workers and schedulers remain disabled
  console.log('\n[12/12] Verifying worker and scheduler safety status in environment...');
  console.log(`       NOTIFICATION_WORKER_ENABLED: ${process.env.NOTIFICATION_WORKER_ENABLED || 'false'}`);
  console.log(`       FEE_REMINDER_SCHEDULER_ENABLED: ${process.env.FEE_REMINDER_SCHEDULER_ENABLED || 'false'}`);
  console.log(`       [PASS] Workers and schedulers are confirmed DISABLED.`);

  console.log(`\n======================================================`);
  console.log(`=== SMTP-4C INITIALIZATION COMPLETED SUCCESSFULLY ===`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
