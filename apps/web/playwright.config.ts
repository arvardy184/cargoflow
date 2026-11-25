import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke test against the real stack: Next.js (production build) → NestJS API → MySQL.
 * Locally it reuses servers that are already running; in CI it starts both (after `pnpm build`
 * and a migrated + seeded database). The test creates a shipment, so it consumes one available
 * container per run — re-run `pnpm db:seed` to reset the development data.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @cargoflow/api start',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      cwd: '../..',
    },
    {
      command: 'pnpm start',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
