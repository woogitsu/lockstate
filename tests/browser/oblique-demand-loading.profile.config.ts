import { defineConfig } from '@playwright/test';
import artifact from './playwright.artifact.config';

// Manual #2018 route only; inherit the real server, 60s/10s, one worker and
// zero retries. Normal source/artifact *.spec.ts inventories do not match it.
export default defineConfig({ ...artifact, testMatch: /oblique-demand-loading\.profile\.ts$/, testIgnore: [] });
