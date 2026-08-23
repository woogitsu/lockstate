import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const port = 5183;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Real-browser verification for `src/persistence/local/` only.
 *
 * `docs/TESTING.md` gates browser test environments behind explicit review,
 * so this stays a narrowly-scoped, opt-in project: it is NOT part of
 * `pnpm test` (Vitest still runs in the `node` environment and only matches
 * `*.test.ts`, while every spec here is `*.spec.ts`), it is NOT part of
 * `pnpm build`, and `@playwright/test` is a devDependency that never reaches
 * the production bundle.
 *
 * Run with: `pnpm test:browser`
 *
 * The pre-provisioned Chromium is used as-is; `LOCKSTATE_CHROMIUM_PATH` can
 * point at an explicit binary when the installed Playwright version does not
 * match the browsers on disk (e.g. `/opt/pw-browsers/chromium`).
 */
const explicitExecutablePath = process.env['LOCKSTATE_CHROMIUM_PATH'];

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    ...(explicitExecutablePath === undefined ? {} : { launchOptions: { executablePath: explicitExecutablePath } }),
  },
  webServer: {
    command: `pnpm exec vite --config tests/browser/vite.config.ts --port ${port} --strictPort`,
    cwd: repositoryRoot,
    url: `${baseURL}/tests/browser/harness.html`,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 120_000,
  },
});
