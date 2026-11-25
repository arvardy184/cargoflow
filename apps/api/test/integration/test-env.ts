import { loadDotEnvFile } from '../../src/config/env';

/**
 * Resolves the integration-test database and refuses anything that does not look like a
 * disposable test database — the suites delete every row between tests.
 */
export function resolveTestDatabaseUrl(): string {
  loadDotEnvFile();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example).');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against '${dbName}': name must end in _test.`,
    );
  }
  return url;
}

export function applyTestEnv(): void {
  const url = resolveTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ??= 'integration-test-secret-that-is-at-least-32-characters';
  // Throttling has its own dedicated test; keep it out of the way elsewhere.
  process.env.LOGIN_RATE_LIMIT_PER_MINUTE = '1000';
}
