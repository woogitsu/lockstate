import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

if (process.env['LOCKSTATE_TEMPLATE_FIT_NATIVE'] !== '1') throw Error('Explicit opt-in required: LOCKSTATE_TEMPLATE_FIT_NATIVE=1');
export default defineConfig({ ...artifact, testDir: fileURLToPath(new URL('../../../tests/browser', import.meta.url)),
  testMatch: /camera-a-template-fit\.native\.ts$/, workers: 1, retries: 0, fullyParallel: false,
  timeout: 60_000, expect: { timeout: 10_000 },
  outputDir: process.env['LOCKSTATE_TEMPLATE_FIT_OUTPUT'] ?? fileURLToPath(new URL('./native-results', import.meta.url)),
  use: { ...artifact.use, viewport: { width: 1920, height: 1080 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
