import { defineConfig } from '@playwright/test';
import base from './playwright.artifact.config';

/** Built-client acceptance for the approved object-facing renderer consumer. */
export default defineConfig({
  ...base,
  testMatch: /rotated-security-console-player-build\.spec\.ts$/,
});
