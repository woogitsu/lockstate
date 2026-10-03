import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from './playwright.artifact.config';

if (process.env['LOCKSTATE_NORTH_DOOR_BACKSIDE_NATIVE'] !== '1') {
  throw new Error('This public BasicCell backside observation needs the sole root browser/server lease.');
}
export default defineConfig({
  ...artifact,
  testMatch: /cell-cot-player-build\.spec\.ts$/,
  testIgnore: [],
  outputDir: fileURLToPath(new URL('../../assets/intermediate/interior-north-door-native/', import.meta.url)),
  workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
});
