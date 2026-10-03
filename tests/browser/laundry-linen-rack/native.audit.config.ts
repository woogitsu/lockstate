import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from '../playwright.artifact.config';

if (process.env['LOCKSTATE_LAUNDRY_LINEN_NATIVE'] !== '1') {
  throw new Error('Laundry linen rack observer requires explicit root browser/build lease.');
}
export default defineConfig({
  ...artifact,
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /player-build\.spec\.ts$/,
  testIgnore: [],
  outputDir: fileURLToPath(new URL('../../../assets/intermediate/laundry-linen-rack-native/', import.meta.url)),
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
});
