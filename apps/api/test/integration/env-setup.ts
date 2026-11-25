import { applyTestEnv } from './test-env';

// Runs in every test worker before any application module is imported.
applyTestEnv();
