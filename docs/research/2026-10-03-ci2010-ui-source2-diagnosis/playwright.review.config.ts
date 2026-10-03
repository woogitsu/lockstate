import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import artifact from '../../../tests/browser/playwright.artifact.config';

const outputDir = process.env['CAMERA_REVIEW_OUTPUT'];
if (outputDir === undefined) throw new Error('Set isolated CAMERA_REVIEW_OUTPUT before a native review');

export default defineConfig({
  ...artifact,
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: 'camera-variant-review.spec.ts',
  outputDir,
  use: { ...artifact.use, trace: { mode: 'retain-on-failure', snapshots: true, screenshots: false, sources: false } },
});
