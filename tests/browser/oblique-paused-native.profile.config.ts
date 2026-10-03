import { defineConfig } from '@playwright/test';
import artifact from './playwright.artifact.config';

// Explicit manual recipe only. The normal *.spec.ts inventory does not include
// this fixture. Inherit the real artifact server and all existing budgets.
export default defineConfig({
  ...artifact,
  testMatch: /oblique-paused-native\.profile\.ts$/,
  testIgnore: [],
});
