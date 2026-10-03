/** Root opt-in genuine built-client route: exactly the three existing Bench cases. */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from '../playwright.artifact.config';

if (process.env['LOCKSTATE_BENCH_GROUND_NATIVE'] !== '1') {
  throw new Error('Set LOCKSTATE_BENCH_GROUND_NATIVE=1 under the root browser/build lease.');
}

export default defineConfig({
  ...artifact,
  testMatch: /wooden-bench-player-build\.spec\.ts$/,
  testIgnore: [],
  outputDir: fileURLToPath(new URL('../../../assets/intermediate/bench-ground-mounts-native/', import.meta.url)),
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
