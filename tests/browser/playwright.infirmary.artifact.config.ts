import { defineConfig } from '@playwright/test';
import base from './playwright.artifact.config';

/** Built-client worker and artwork acceptance for the two Infirmary fixtures. */
export default defineConfig({
  ...base,
  testMatch: /infirmary-player-build\.spec\.ts$/,
});
