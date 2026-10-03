import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

if (process.env['LOCKSTATE_WORLD_ROVING_NATIVE'] !== '1') {
  throw new Error('This focused built-client acceptance requires LOCKSTATE_WORLD_ROVING_NATIVE=1 and the sole browser/server lease.');
}

export default defineConfig({
  ...artifact,
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /world-roving-held-arrow\.native\.ts$/,
  outputDir: fileURLToPath(new URL('../../../test-results/world-roving-native', import.meta.url)),
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
