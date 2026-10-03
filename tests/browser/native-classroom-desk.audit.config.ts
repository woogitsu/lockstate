import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from './playwright.artifact.config';

if (process.env['LOCKSTATE_CLASSROOM_COMBINED_NATIVE'] !== '1') {
  throw new Error('The combined Classroom route needs an explicit root browser lease.');
}
export default defineConfig({
  ...artifact,
  testMatch: /native-classroom-desk\.recipe\.ts$/,
  testIgnore: [],
  outputDir: fileURLToPath(new URL('../../assets/intermediate/classroom-combined-native/', import.meta.url)),
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
});
