import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

if (process.env['LOCKSTATE_OBJECT_ROTATION_DRAFT_NATIVE'] !== '1')
  throw new Error('Review draft only: requires the sole browser/server lease and LOCKSTATE_OBJECT_ROTATION_DRAFT_NATIVE=1.');

export default defineConfig({
  ...artifact,
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /object-rotation-review\.native\.ts$/,
  outputDir: fileURLToPath(new URL('../../../test-results/object-rotation-ui-draft', import.meta.url)),
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
});
