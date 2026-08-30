import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The config that collects `*.playtest.ts`, and **nothing in CI runs it.**
 *
 * WHY IT EXISTS AT ALL. `playtest-economy.playtest.ts` closes with *"To run
 * it, point a config's `testMatch` at `.playtest.ts`; none does today."* That
 * sentence has been true since the file landed, which makes the reproduction
 * it carries a thing nobody can execute without first writing a config -- and
 * a reproduction that costs a config to run is one that gets re-derived
 * instead. This is that config, written once.
 *
 * WHY IT IS A THIRD CONFIG RATHER THAN A `testMatch` WIDENING OF THE FIRST.
 * `tests/browser/playwright.config.ts` is the CI gate. Widening its
 * `testMatch` to `(spec|playtest)` would put hundreds of lines of
 * mouse-driven play, several minutes of it, into a job that already takes six
 * -- and #578 landed
 * `tests/foundation/browser-suite-partition-contract.test.ts` precisely to
 * keep one spec from being claimed by two configs. A separate config with a
 * disjoint `testMatch` is the shape that contract asks for.
 *
 * DIFFERENCES FROM THE GATE CONFIG, EACH FOR A REASON.
 * - `timeout: 600_000`. A playtest builds a prison with the mouse and runs it
 *   past in-game day boundaries; the gate's 60 s is a per-test budget for
 *   assertions, not for play. This is not a licence for a slow gate, because
 *   this config is not a gate.
 * - `port` defaults to **5184**, not 5183, so a playtest and the gate suite
 *   can run at once without the gate's `reuseExistingServer: false` turning
 *   into a spurious "port already used". `LOCKSTATE_BROWSER_TEST_PORT` still
 *   overrides, for the same reason it does there.
 * - `reuseExistingServer: false` is kept, verbatim in intent: a run that
 *   attaches to another checkout's dev server measures that checkout's
 *   `src/**`, which is the "green for the wrong reason" failure the gate
 *   config documents at length. A playtest reports findings rather than
 *   passing, so it would report findings about the wrong tree.
 */
const viteManifestPath = createRequire(import.meta.url).resolve('vite/package.json');
const viteBinField = (createRequire(import.meta.url)('vite/package.json') as { bin: { vite: string } }).bin.vite;
const viteBinPath = resolve(dirname(viteManifestPath), viteBinField);

const port = Number(process.env['LOCKSTATE_BROWSER_TEST_PORT'] ?? 5184);
const baseURL = `http://127.0.0.1:${port}`;

const explicitExecutablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /.*\.playtest\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 600_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: false },
    ...(explicitExecutablePath === undefined ? {} : { launchOptions: { executablePath: explicitExecutablePath } }),
  },
  webServer: {
    command: `${JSON.stringify(execPath)} ${JSON.stringify(viteBinPath)} --config tests/browser/vite.config.ts --port ${port} --strictPort`,
    cwd: repositoryRoot,
    url: `${baseURL}/tests/browser/harness.html`,
    reuseExistingServer: false,
    stdout: 'pipe',
    timeout: 120_000,
  },
});
