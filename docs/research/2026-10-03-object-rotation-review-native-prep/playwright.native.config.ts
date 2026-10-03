import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';
if (process.env['LOCKSTATE_OBJECT_ROTATION_DRAFT_NATIVE'] !== '1') throw new Error('Unapproved review draft requires explicit opt-in and sole browser lease');
export default defineConfig({ ...artifact, testDir: fileURLToPath(new URL('.', import.meta.url)), testMatch: /object-rotation-fullhd\.native\.ts$/,
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
  outputDir: fileURLToPath(new URL('./native-results', import.meta.url)),
  use: { ...artifact.use, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, screenshot: 'only-on-failure', trace: 'retain-on-failure' } });
