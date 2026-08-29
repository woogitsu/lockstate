import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The web server below used to start with `pnpm exec vite ...`. That works in
 * a normal checkout and fails in a **git worktree**, which is how parallel
 * agents work on this repository.
 *
 * The mechanism, because the symptom hides it completely: pnpm 11 runs a
 * dependency-status check before `exec`, that check decides the tree is out
 * of date and shells out to `pnpm install`, and the install refuses with
 * `ERR_PNPM_UNSAFE_MODULES_DIR` -- it will not touch a `node_modules` whose
 * resolved target is not a strict subdirectory of the project root, which is
 * exactly what a worktree's `node_modules -> <main checkout>/node_modules`
 * symlink is. None of that reaches the operator. Playwright prints one line,
 * `Process from config.webServer was not able to start. Exit code: 1`, and
 * every spec fails, which reads like a broken harness or a broken page.
 *
 * So do not go through a package manager at all. Resolve Vite's bin from its
 * own `package.json` -- `vite/bin/vite.js` is not in the package's `exports`
 * map, so `require.resolve` on the subpath throws `ERR_PACKAGE_PATH_NOT_EXPORTED`
 * and the `bin` field is the supported way in -- and run it on this process's
 * own Node. That is one process instead of three, it has no opinion about
 * whether `node_modules` is a symlink, and it behaves identically in a plain
 * checkout and in a worktree.
 */
const viteManifestPath = createRequire(import.meta.url).resolve('vite/package.json');
const viteBinField = (createRequire(import.meta.url)('vite/package.json') as { bin: { vite: string } }).bin.vite;
const viteBinPath = resolve(dirname(viteManifestPath), viteBinField);

/**
 * `LOCKSTATE_BROWSER_TEST_PORT` exists for the case where 5183 is taken —
 * most often a second checkout of this repository running the same suite.
 * See `reuseExistingServer` below for why that case has to be a failure
 * rather than something the run quietly works around.
 */
const port = Number(process.env['LOCKSTATE_BROWSER_TEST_PORT'] ?? 5183);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Real-browser verification for `src/persistence/local/`,
 * `src/persistence/session/`'s DOM event wiring, `src/ui/`,
 * `src/rendering/camera/` and the assembled application page.
 *
 * Every one of them is here for the same reason: a claim that only a real
 * browser can settle. For persistence that is durability across a navigation,
 * real `DOMException` names and a genuinely exhausted quota; for the UI it is
 * that a real click on a real disabled button does nothing, that no
 * `unhandledrejection` fires, and what a *computed* font stack and
 * `getBoundingClientRect` actually are; for the lifecycle handler it is
 * whether a real, browser-generated `pagehide` reaches it at all (#92); for
 * the camera it is what a real Phaser camera answers for a real mouse
 * position, which is the only thing that can catch a pure transform that has
 * drifted from the engine drawing the frame (#115); for the world scene it is
 * what the keyboard listeners it puts on `window` do when focus moves, and what
 * a **second finger** does -- a pinch needs a context created with `hasTouch`
 * and CDP `Input.dispatchTouchEvent`, which no layer below this one can supply
 * (#209); for the environment artwork it is decoding a Git LFS-tracked PNG,
 * cutting frames out of it with `createImageBitmap` and a 2D canvas, and
 * reading back the pixel the renderer actually put on the screen; for the
 * assembled page it is canvas sizing, hit-testing the centre
 * pixel and decoding a real PNG. Everything else stays headless.
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
    /**
     * A trace, kept only for a test that failed, and deliberately the
     * cheapest trace Playwright can record.
     *
     * ## Why this exists
     *
     * Three runs of this suite on `main` in one afternoon -- 829, 842 and 847
     * -- each failed with exactly one test of the 253 timing out at 60 s
     * while every other test passed. All three timed out waiting for the page
     * to come up: two on `page.waitForFunction(() => '<harness global>' in
     * window)`, one on `page.waitForSelector('#game-root canvas')`. The test
     * immediately before and the test immediately after each failure passed in
     * under six seconds, so nothing was degrading -- one page load, and only
     * one, never finished.
     *
     * The uploaded evidence could not settle why, and that is the point. All
     * run 847's `error-context.md` holds is the accessibility snapshot
     *
     *     - generic [active]:
     *       - main "Lockstate game application"
     *
     * which is `index.html` and nothing else: the static `<main id="app">` is
     * there and no part of `/src/main.ts` has run. That is equally consistent
     * with a module request the dev server never answered and with a throw on
     * the first line of boot, and those have opposite owners -- the first is
     * this harness, the second is the game. **Nothing in the artifact
     * distinguishes them**, and an integrator who guesses between two causes
     * with the same symptom is the failure `docs/AGENT_WORKFLOW.md` §3 is
     * about.
     *
     * A trace holds the network log and the console, so it names which one on
     * the next occurrence.
     *
     * ## Why `snapshots: true`, which is not the cheap setting
     *
     * The first version of this line read `snapshots: false`, on the reasoning
     * that DOM snapshots are the expensive part and the question here is about
     * the network. **That configuration produces a `0-trace.network` of
     * exactly zero bytes**, measured rather than assumed: a run of a
     * deliberately failing spec under `snapshots: false` emitted
     *
     *     0  0-trace.network
     *
     * and under `snapshots: true` emitted 342,951 bytes carrying the request
     * URLs. Playwright gates resource recording on the same flag as DOM
     * snapshots. So the cheap setting records a trace that cannot answer the
     * only question the trace is here for -- a gate nothing can make fail --
     * and the fact that this was caught by opening the artifact rather than by
     * reading the option's name is the reason it is written down here.
     *
     * `screenshots` and `sources` stay off: neither distinguishes a stalled
     * module request from a throw, and both cost.
     *
     * `retain-on-failure` and not `on-first-retry`, because `retries` is 0
     * above -- `on-first-retry` would record nothing, ever. It does mean the
     * trace is recorded for every test and discarded when it passes, so the
     * cost lands on the whole suite and not only on the failure.
     *
     * ## What that costs, and why no ratio is quoted here
     *
     * It was not possible to measure honestly where this change was written:
     * that container was running seven agents, and `world-scene-input.spec.ts`
     * took 2.2 min for its 24 tests with tracing on against a control that was
     * still contending for the same cores. A ratio taken there would be a
     * fiction. **The measurement that matters is free and arrives by itself**:
     * this suite's browser job has run eleven times on `main` in a single
     * afternoon in a 5.5-6.0 min band, so the first run carrying this change
     * reports its own overhead against that baseline. If it leaves the band,
     * reconsider this block rather than defending it.
     */
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: false },
    ...(explicitExecutablePath === undefined ? {} : { launchOptions: { executablePath: explicitExecutablePath } }),
  },
  webServer: {
    command: `${JSON.stringify(execPath)} ${JSON.stringify(viteBinPath)} --config tests/browser/vite.config.ts --port ${port} --strictPort`,
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
    /**
     * Playwright pipes a web server's stderr by default and **ignores its
     * stdout**, and Vite says the interesting things on stdout: a
     * re-optimization of dependencies, the full reload it forces, a
     * pre-transform error. Run 847's captured log contains zero lines from
     * this server -- checked, `grep -c WebServer` over the uploaded
     * `browser-suite.log` returns 0 -- so a page that never finished loading
     * left no record on the serving side at all.
     *
     * Piping stdout costs nothing on a passing run beyond the lines
     * themselves, and it is the half of the picture the trace above does not
     * have: the trace says what the browser asked for, this says what the
     * server thought it was doing.
     */
    stdout: 'pipe',
    timeout: 120_000,
  },
});
