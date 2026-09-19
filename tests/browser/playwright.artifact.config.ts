import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The browser gate for the artefact a player actually downloads.
 *
 * WHY THIS IS A SECOND CONFIG AND NOT A PROJECT IN THE FIRST ONE.
 * `tests/browser/playwright.config.ts` starts a **Vite dev server** over
 * `src/**` using `tests/browser/vite.config.ts` -- a config that, in its own
 * words, "loads no Cloudflare plugin and never participates in `pnpm build`".
 * Everything it proves is a statement about the sources. This config serves
 * `dist/` through `vite preview` with the real `vite.config.ts` and
 * `CLOUDFLARE_ENV=production`, which is workerd serving the built client with
 * `public/_headers` applied exactly as production applies them. The two cannot
 * be one Playwright project because they need different web servers, and they
 * are answering different questions:
 *
 *   playwright.config.ts        does the code we wrote behave?
 *   playwright.artifact.config.ts  does the thing we built execute as a game?
 *
 * WHAT MADE THIS WORTH ITS MINUTES. Nothing in this repository had ever run
 * the production bundle in a browser. `pnpm build` proves it compiles and
 * emits; `scripts/verify-cloudflare-build.mjs` reads the generated Wrangler
 * config and the emitted files; `scripts/verify-deployment-preview.mjs` runs
 * `vite preview` and asserts response headers, and its own header says what it
 * cannot do -- *"What it CANNOT check is that the policy still lets the
 * renderer run, because it never opens a browser."* That sentence is the hole
 * this config fills. A CSP directive, a COEP escalation, a worker chunk that
 * is emitted but not reachable, or a `define` that only resolves under the dev
 * server would pass every gate above and reach a player as a dead page.
 *
 * IT IS DELIBERATELY SMALL. `app-shell.spec.ts` is thousands of lines of
 * behaviour and duplicating it here would double a five-minute job for no new
 * information -- the sources are the same sources. This config runs one spec
 * whose whole contract is that the *built* client boots, builds its worker
 * from its own emitted chunk, and completes one command and one persistence
 * round trip. Everything else stays where it is.
 *
 * Run with: `pnpm test:artifact` (after `pnpm build`), which since #652 is
 * `tests/browser/run-suite.ts --suite artifact` rather than `playwright test`
 * -- the same wrapper the dev-server gate goes through, so a run aborted by
 * `net::ERR_NETWORK_CHANGED` is retried here on exactly the terms it is there
 * and on no others. See `retries` below.
 */

/**
 * `dist/` is an input to this suite, not something it produces.
 *
 * Checked here rather than left to `vite preview` because the failure
 * otherwise arrives as a webServer that exits and Playwright's single
 * "Process from config.webServer was not able to start. Exit code: 1", which
 * is the same line a worktree's pnpm abort used to produce and reads like a
 * broken harness. This says which command was not run.
 */
/*
 * **Two layouts, because a server entry point moved the client.** Until
 * `wrangler.jsonc` gained a `main`, the production build put the client at
 * `dist/index.html`. With a Worker entry present, Cloudflare's Vite plugin
 * splits the output per environment -- the client to `dist/client/` and the
 * Worker to `dist/<worker name>/` -- and this check went red naming a path the
 * build had stopped writing, with the whole suite failing before its one spec
 * ran. `scripts/verify-cloudflare-build.mjs` already knew (it prints
 * "Verified Cloudflare production output: dist/<name>/wrangler.json ->
 * dist/client"); this file did not, which is the gap.
 *
 * Both are accepted rather than the new one substituted, so this suite runs on
 * a tree with a Worker and on one without. The error below names every path it
 * tried, because "No production build at <one path>" was true and unhelpful:
 * there *was* a production build, three directories over.
 */
const distCandidates = [
  resolve(repositoryRoot, 'dist', 'client', 'index.html'),
  resolve(repositoryRoot, 'dist', 'index.html'),
];
const distIndex = distCandidates.find((candidate) => existsSync(candidate));
if (distIndex === undefined) {
  throw new Error(
    `No production build at any of ${distCandidates.join(' or ')}. This suite runs the built client, so it has to be built first: \`pnpm build\` (or \`node scripts/cloudflare-task.mjs build production\`). It deliberately does not build one itself -- a suite that builds its own subject can pass on a tree nobody deployed.`,
  );
}

/**
 * Vite's bin resolved from its own `package.json` and run on this process's
 * Node, for exactly the reason `tests/browser/playwright.config.ts` records at
 * length: `pnpm exec` runs a dependency-status check that shells out to
 * `pnpm install`, and the install refuses with `ERR_PNPM_UNSAFE_MODULES_DIR`
 * in a git worktree whose `node_modules` is a symlink. That failure surfaces
 * as a webServer that would not start, with every spec red under it.
 */
const viteManifestPath = createRequire(import.meta.url).resolve('vite/package.json');
const viteBinField = (createRequire(import.meta.url)('vite/package.json') as { bin: { vite: string } })
  .bin.vite;
const viteBinPath = resolve(dirname(viteManifestPath), viteBinField);

/**
 * A port of its own, not `LOCKSTATE_BROWSER_TEST_PORT`.
 *
 * The two suites can run back to back in one CI job, and a preview server left
 * holding the dev suite's port would make the next run attach to the wrong
 * thing -- which is the failure `playwright.config.ts` set `reuseExistingServer:
 * false` to make loud. Separate variables mean the two can never collide by
 * default, and each can still be moved.
 */
const port = Number(process.env['LOCKSTATE_ARTIFACT_TEST_PORT'] ?? 5184);
const baseURL = `http://127.0.0.1:${port}`;

const explicitExecutablePath = process.env['LOCKSTATE_CHROMIUM_PATH'];

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  // One spec, named exactly. The dev-server config matches `*.spec.ts`
  // repository-wide, so without this the artefact suite would try to run every
  // harness spec against a server that serves no harness pages.
  testMatch: /production-artifact\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  /**
   * ZERO, AND THE WRAPPER ABOVE THIS CONFIG DOES NOT RELAX IT.
   *
   * Same rule as `tests/browser/playwright.config.ts`, for the same reason,
   * and pinned by the same contract since #652: the only retry either browser
   * gate may have is the one `tests/browser/run-suite.ts` decides after the
   * run, when every failing test observed `net::ERR_NETWORK_CHANGED`. A
   * blanket retry here would be worse than there, not better -- this suite is
   * two tests over the artefact a player downloads, so one flaky pass is a
   * much larger share of what the gate says.
   */
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    ...(explicitExecutablePath === undefined
      ? {}
      : { launchOptions: { executablePath: explicitExecutablePath } }),
  },
  webServer: {
    /*
     * `vite preview` with the production `vite.config.ts`, which loads the
     * Cloudflare plugin -- so `dist/` is served by workerd through the
     * generated `dist/wrangler.json`, `public/_headers` is applied, and
     * `assets.not_found_handling` behaves as it does in production. Serving
     * `dist/` with any static file server would test a different thing.
     *
     * `CLOUDFLARE_ENV=production` matches what `scripts/cloudflare-task.mjs`
     * passes, so the environment the plugin reads is the one the artefact was
     * built for.
     */
    command: `${JSON.stringify(execPath)} ${JSON.stringify(viteBinPath)} preview --port ${port} --strictPort --host 127.0.0.1`,
    cwd: repositoryRoot,
    env: { CLOUDFLARE_ENV: 'production' },
    url: baseURL + '/',
    // Never reuse, for the reason `playwright.config.ts` gives: attaching to a
    // server this suite did not start means reporting on a `dist/` it did not
    // build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
