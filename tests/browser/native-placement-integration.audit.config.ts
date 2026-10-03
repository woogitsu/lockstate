import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from './playwright.artifact.config';

if (process.env['LOCKSTATE_PLACEMENT_INTEGRATION_NATIVE'] !== '1') {
  throw new Error('This bounded integration needs the sole root browser/server lease.');
}

export default defineConfig({
  ...artifact,
  testMatch: /(?:yard-bench-player-build|ui-build-where-readout|oblique-room-object-load-gesture)\.spec\.ts$/,
  testIgnore: [],
  outputDir: fileURLToPath(new URL('../../assets/intermediate/placement-integration-native/', import.meta.url)),
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
