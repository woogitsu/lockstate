import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

if (process.env['LOCKSTATE_V10_MAX_NATIVE'] !== '1')
  throw Error('Explicit opt-in required: LOCKSTATE_V10_MAX_NATIVE=1');

/** Existing genuine artifact server/launch configuration; one opt-in case only. */
export default defineConfig({ ...artifact,
  testMatch: /construction-v10-max-counter\.native\.ts$/,
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
  outputDir: process.env['LOCKSTATE_V10_MAX_OUTPUT'] ?? fileURLToPath(new URL('./native-results', import.meta.url)),
  use: { ...artifact.use, viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
