import type { Config } from 'jest';

/**
 * Integration tests: the full Nest application over HTTP against a real MySQL database
 * (TEST_DATABASE_URL, whose name must end in `_test`). Run serially — suites share the database.
 */
const config: Config = {
  displayName: 'integration',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  setupFiles: ['<rootDir>/test/integration/env-setup.ts'],
  testTimeout: 30_000,
  coverageDirectory: 'coverage/integration',
  clearMocks: true,
};

export default config;
