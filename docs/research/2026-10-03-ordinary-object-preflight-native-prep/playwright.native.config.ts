import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

if (process.env['LOCKSTATE_ORDINARY_OBJECT_PREFLIGHT_NATIVE'] !== '1')
  throw new Error('Explicit opt-in required: LOCKSTATE_ORDINARY_OBJECT_PREFLIGHT_NATIVE=1');

export default defineConfig({ ...artifact, testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /ordinary-object-preflight\.native\.ts$/, fullyParallel: false, workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 10_000 },
  outputDir: fileURLToPath(new URL('./native-results', import.meta.url)),
  use: { ...artifact.use, viewport: { width: 1920, height: 1080 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
