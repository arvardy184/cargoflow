import { execSync } from 'node:child_process';
import { resolveTestDatabaseUrl } from './test-env';

/** Brings the test database schema up to date once before all suites. */
export default function globalSetup(): void {
  const url = resolveTestDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    cwd: `${__dirname}/../..`,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
