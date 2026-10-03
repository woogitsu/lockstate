import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from '../playwright.artifact.config';

if (process.env['LOCKSTATE_STAFF_CHAIR_NATIVE'] !== '1') {
  throw new Error('Staff chair observer requires explicit root browser/build lease.');
}
export default defineConfig({
  ...artifact,
  testMatch: /wooden-chair-player-build\.spec\.ts$/,
  testIgnore: [],
  outputDir: fileURLToPath(new URL('../../../assets/intermediate/staff-room-padded-chair-native/', import.meta.url)),
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
});
