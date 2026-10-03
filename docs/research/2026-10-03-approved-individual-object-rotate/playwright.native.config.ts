import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

if (process.env['LOCKSTATE_APPROVED_OBJECT_ROTATE_NATIVE'] !== '1')
  throw new Error('Requires the sole browser/build lease and LOCKSTATE_APPROVED_OBJECT_ROTATE_NATIVE=1.');

export default defineConfig({
  ...artifact,
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /object-rotate\.native\.ts$/,
  outputDir: fileURLToPath(new URL('../../../test-results/approved-object-rotate', import.meta.url)),
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
  use: { ...artifact.use, viewport: { width: 1920, height: 1080 } },
});
