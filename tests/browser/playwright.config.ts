import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * `LOCKSTATE_BROWSER_TEST_PORT` exists for the case where 5183 is taken —
 * most often a second checkout of this repository running the same suite.
 * See `reuseExistingServer` below for why that case has to be a failure
 * rather than something the run quietly works around.
 */
const port = Number(process.env['LOCKSTATE_BROWSER_TEST_PORT'] ?? 5183);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Real-browser verification for `src/persistence/local/`, `src/ui/`,
 * `src/rendering/camera/` and the assembled application page.
 *
 * Every one of them is here for the same reason: a claim that only a real
 * browser can settle. For persistence that is durability across a navigation,
 * real `DOMException` names and a genuinely exhausted quota; for the UI it is
 * that a real click on a real disabled button does nothing, that no
 * `unhandledrejection` fires, and what a *computed* font stack and
 * `getBoundingClientRect` actually are; for the camera it is what a real
 * Phaser camera answers for a real mouse position, which is the only thing
 * that can catch a pure transform that has drifted from the engine drawing
 * the frame (#115); for the assembled page it is canvas sizing, hit-testing
 * the centre pixel and decoding a real PNG. Everything else stays headless.
 *
 * `docs/TESTING.md` gates browser test environments behind explicit review,
 * so this stays a narrowly-scoped, separate project: it is NOT part of
 * `pnpm test` (Vitest still runs in the `node` environment and only matches
 * `*.test.ts`, while every spec here is `*.spec.ts`), it is NOT part of
 * `pnpm build`, and `@playwright/test` is a devDependency that never reaches
 * the production bundle.
 *
 * Separate is not optional. `pnpm test:browser` is its own command *and* its
 * own required CI job (`browser` in .github/workflows/ci.yml), which
 * provisions Chromium with `scripts/provision-playwright-browsers.sh`. Before
 * that job existed this layer ran only when a human remembered to type it,
 * despite having found every defect docs/TESTING.md credits it with.
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
    /**
     * Never reuse. This used to be `process.env['CI'] === undefined`, which
     * meant a local run would happily attach to whatever was already
     * answering on this port — including a dev server started from a
     * *different checkout* of this repository. Its root is that checkout's
     * repository root, so the suite then loads that tree's `src/**` and
     * reports on code the developer is not editing.
     *
     * Observed, not theorised: a run in one worktree measured another's
     * sources and a deliberately broken token still came back green, which
     * is precisely the "green for the wrong reason" failure this whole layer
     * exists to prevent. Refusing to reuse turns that into a loud
     * "port 5183 is already used" and `LOCKSTATE_BROWSER_TEST_PORT` is the
     * way out.
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
