const { spawnSync } = require('child_process');

process.env.DATABASE_URL = 'postgresql://postgres:admin%402003@localhost:5432/fee_iso_test?schema=public';

const result = spawnSync('npx', ['jest', 'src/payments/phase3a-integration-execution.spec.ts', '--runInBand', '--detectOpenHandles', '--forceExit'], {
  cwd: 'D:/fee/backend',
  env: process.env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status);
