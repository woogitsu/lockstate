import { expect, test, type Page } from './network-changed-fixture';
import { SAVE_PANEL_MESSAGE_KEY } from '../../src/ui/save-panel-messages';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud';
import { defaultMessageCatalogEn } from '../../src/services/localization';

/**
 * Does the thing we actually built execute as a game?
 *
 * That is this file's entire contract, and until it existed nothing in this
 * repository asked it. Every other browser spec drives a Vite **dev server**
 * over `src/**` (`tests/browser/vite.config.ts`, which says of itself that it
 * "loads no Cloudflare plugin and never participates in `pnpm build`"), so a
 * green browser job and a green `pnpm build` were compatible with the artefact
 * a player receives never having been executed once. `pnpm build` proves the
 * bundle compiles and emits. `scripts/verify-cloudflare-build.mjs` reads the
 * emitted files and the generated Wrangler config.
 * `scripts/verify-deployment-preview.mjs` serves `dist/` through workerd and
 * asserts the response headers, and its own header names the hole:
 *
 *   "What it CANNOT check is that the policy still lets the renderer run,
 *    because it never opens a browser. ... A Phaser upgrade that started
 *    needing 'unsafe-eval', a cross-origin CDN or a `blob:` worker would pass
 *    every check in this repository and break the page."
 *
 * This spec is the browser that sentence asks for. It runs against
 * `vite preview` on `dist/` with the production `vite.config.ts`, so the page
 * under test is served by workerd with `public/_headers` applied exactly as
 * production applies them -- CSP, COOP/COEP and all. See
 * `tests/browser/playwright.artifact.config.ts`.
 *
 * WHY IT IS SHORT, AND WHY THAT IS NOT A COMPROMISE. `app-shell.spec.ts`
 * already exercises this application's behaviour exhaustively against the same
 * sources. Repeating it here would double a five-minute CI job to re-derive
 * conclusions that do not change between a dev server and a bundle. What DOES
 * change between them is the small set of things below: whether the emitted
 * worker chunk is reachable and parses, whether compile-time `define`s
 * survived, whether the shipped CSP lets the renderer and the worker run, and
 * whether tree shaking left the round trips intact. Each assertion here is one
 * a dev-server run cannot make.
 *
 * WHAT PROMPTED IT, and what that does and does not mean. An external audit
 * drove `lockstate.io` and reported a load ending in "Loading failed: The
 * simulation worker did not reply within 15000ms", with every save-panel
 * button disabled and Play not starting the clock. **That host does not serve
 * the current build** -- the owner confirmed it on 2026-08-29 and
 * `docs/DEPLOYMENT.md` records both the confirmation and the measurement -- so
 * the report is not evidence about this commit, and nothing in this file
 * treats it as such. Built and driven locally at v0.0.206 the same sequence
 * passes: both loads settle in well under a second and the clock advances.
 *
 * This file exists for the gap the audit did NOT settle, which three separate
 * reports named independently and which was true before the audit and after
 * it: nothing had ever asserted that the artefact executes. The 15-second
 * symptom is worth an assertion of its own regardless of where it was seen,
 * because the one thing measured here that reproduces it verbatim is a worker
 * chunk URL that does not resolve to the worker chunk -- invisible to every
 * other check in this repository. The `content-type` assertion in the first
 * test is aimed at exactly that.
 *
 * THIS GATE HAS BEEN MUTATED FROM THE ARTEFACT SIDE, which is the only side
 * that proves anything about it: a gate nothing can make fail is not a gate,
 * and mutating the *spec* would only prove the spec runs. Both mutations were
 * applied to the emitted `dist/assets/index-<hash>.js` by hand, run, and
 * reversed by hand back to a byte-identical file (`md5sum -c`: OK).
 *
 *   1. The worker chunk URL rewritten to a hash the build does not contain
 *      (`/assets/worker-DEADBEEF.js`). RED in 1.4 s, on the `content-type`
 *      assertion and not on a timeout:
 *
 *        Error: /assets/worker-DEADBEEF.js was served as
 *        "text/html; charset=utf-8" rather than JavaScript.
 *
 *      -- the SPA fallback answering HTTP 200 with the index body, exactly as
 *      the comment on that assertion describes. Unmutated, and with the chunk
 *      absent, the second test also fails, on "The built client created no
 *      save slot", which is why the media-type check is ordered first.
 *
 *   2. The worker chunk URL rewritten to the dev server's bare module shape
 *      (`/src/simulation/worker/worker.ts?worker_file&type=module`). RED in
 *      2.6 s on the fingerprint assertion below, with the message this file
 *      writes for it.
 *
 *   Restored: `2 passed (17.6s)`.
 *
 * Mutation 2 is worth naming precisely, because that exact string arrived as a
 * CI failure on this file (run 33271621137) without any artefact being
 * involved: `tests/browser/playwright.config.ts` was collecting this spec into
 * the **dev-server** suite. The assertion was right and the subject was wrong.
 * That config now excludes this file, and
 * `tests/foundation/browser-suite-partition-contract.test.ts` fails if either
 * config stops complementing the other.
 */

function localeText(key: string): string {
  const entry = defaultMessageCatalogEn.messages[key];
  if (typeof entry !== 'string') {
    throw new Error(
      `"${key}" is not a plain string in the bundled default locale, so it cannot be matched as one.`,
    );
  }
  return entry;
}

const NEW_PRISON = localeText(SAVE_PANEL_MESSAGE_KEY.actionCreate);
const LOAD = localeText(SAVE_PANEL_MESSAGE_KEY.actionLoad);
const PLAY = localeText(HUD_MESSAGE_KEY.transportPlay);

/**
 * Every message the page sent to or received from a `Worker`, by protocol
 * `kind`, plus the URL each worker was constructed from.
 *
 * A tee over the real `Worker` rather than an inspection of the page's own
 * state, for the reason `app-shell.spec.ts` gives about `postMessage`: the
 * protocol crossing the thread boundary is not otherwise observable, and
 * "the worker replied" is the claim this file exists to make.
 */
interface WorkerTrace {
  readonly constructedFrom: readonly string[];
  readonly sent: readonly string[];
  readonly received: readonly string[];
}

declare global {
  interface Window {
    __artifactWorkerTrace?: {
      constructedFrom: string[];
      sent: string[];
      received: string[];
    };
  }
}

async function installWorkerTrace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace = { constructedFrom: [] as string[], sent: [] as string[], received: [] as string[] };
    window.__artifactWorkerTrace = trace;
    const Native = window.Worker;
    class TracingWorker extends Native {
      public constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        trace.constructedFrom.push(String(scriptURL));
        this.addEventListener('message', (event: MessageEvent) => {
          const kind: unknown = (event.data as { kind?: unknown } | null)?.kind;
          trace.received.push(typeof kind === 'string' ? kind : '(no kind)');
        });
      }
      public override postMessage(message: unknown, transfer?: unknown): void {
        const kind: unknown = (message as { kind?: unknown } | null)?.kind;
        trace.sent.push(typeof kind === 'string' ? kind : '(no kind)');
        // `postMessage` is overloaded; the transfer list is optional and the
        // structured-clone overload takes an array.
        (super.postMessage as (m: unknown, t?: unknown) => void)(message, transfer);
      }
    }
    window.Worker = TracingWorker as unknown as typeof Worker;
  });
}

async function readWorkerTrace(page: Page): Promise<WorkerTrace> {
  return await page.evaluate(
    () =>
      window.__artifactWorkerTrace ?? { constructedFrom: [], sent: [], received: [] },
  );
}

/** The save panel's one-line status, which every persistence outcome lands in. */
function saveStatus(page: Page) {
  return page.locator('.save-panel__status').first();
}

test.describe('the production artefact runs the game', () => {
  test('boots from dist with no page error, and the built client builds its worker from its own emitted chunk', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    /** `content-type` of every response for a chunk under `/assets/`. */
    const scriptContentTypes = new Map<string, string>();

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (/^\/assets\/[^/]+\.js$/u.test(url.pathname)) {
        scriptContentTypes.set(url.pathname, response.headers()['content-type'] ?? '');
      }
    });

    await installWorkerTrace(page);
    await page.goto('/');

    // A session, because the worker is constructed per session
    // (`WorkerPerSessionHost`, issue #149) rather than at boot -- so pressing
    // this is what makes the emitted worker chunk get fetched at all.
    await page.getByRole('button', { name: NEW_PRISON }).click();

    /*
     * The chunk assertions below run BEFORE the session is waited out, and
     * that ordering is deliberate.
     *
     * A worker chunk that does not load fails this spec either way -- the
     * session never settles -- but it fails it 15 seconds later, on a
     * `Creating prison...` that never changed, which says nothing about why.
     * Measured: with the emitted chunk removed from `dist/` so the SPA
     * fallback answers for it, the ordering that waited first reported only
     * `unexpected value "Creating prison..."`. Construction and media type are
     * observable within a few hundred milliseconds of the click, so they are
     * checked there, where their own messages can name the cause.
     */
    await expect(async () => {
      expect(
        (await readWorkerTrace(page)).constructedFrom,
        'The built client constructed no Worker at all after a prison was created. The simulation kernel runs in a dedicated worker (AGENTS.md, "Architectural boundaries"), so a page with no worker is a page with no game.',
      ).not.toHaveLength(0);
    }).toPass({ timeout: 15_000 });

    const trace = await readWorkerTrace(page);

    /*
     * The worker came from a real, fingerprinted chunk this build emitted.
     *
     * `SimulationClient`'s own comment records why this cannot be assumed:
     * "The URL form cannot survive a production build ... the module is never
     * emitted as a worker chunk and the URL resolves to a file that does not
     * exist in `dist`." A dev-server run resolves that URL against `src/**`
     * and works either way, so this is the only layer where the distinction
     * exists.
     */
    for (const url of trace.constructedFrom) {
      expect(
        url,
        `A Worker was constructed from ${JSON.stringify(url)}, which is not a fingerprinted chunk under /assets/. In a production build the worker must come from the bundler's own emitted worker chunk; a bare module URL is the shape SimulationClient warns "cannot survive a production build".`,
      ).toMatch(/^\/assets\/worker-[A-Za-z0-9_-]+\.js$/u);
    }

    /*
     * AND IT WAS SERVED AS JAVASCRIPT.
     *
     * This is the assertion with a measured failure behind it.
     * `wrangler.jsonc` sets `assets.not_found_handling:
     * "single-page-application"` for every environment, and that fallback
     * applies to `/assets/*` too. Measured against this artefact served
     * through workerd:
     *
     *   $ curl -sSI .../assets/worker-DEADBEEF.js
     *   HTTP/1.1 200 OK
     *   content-type: text/html; charset=utf-8
     *   cache-control: public, max-age=31536000, immutable
     *
     * So a worker chunk hash the deployment does not have is not a 404 and not
     * a failed request -- it is HTTP 200 with the index.html body, cached for a
     * year. `new Worker()` on that constructs, fails to parse, never posts
     * `simulation/ready`, and `WorkerSessionHost` times out after 15 s.
     * Driving this same artefact with only the worker chunk URL rewritten to a
     * hash the build does not contain reproduces exactly that:
     *
     *   +15ms      Loading...
     *   +15180ms   Loading failed: The simulation worker did not reply
     *              within 15000ms.
     *
     * with every save-panel button disabled and Play not moving the clock.
     * Nothing else in this repository looks at the media type of a chunk the
     * page actually loaded, and a `requestfailed` listener would not see it
     * either, because the request succeeds.
     */
    for (const url of new Set(trace.constructedFrom)) {
      const contentType = scriptContentTypes.get(url);
      expect(
        contentType,
        `The page constructed a Worker from ${url} and no response for that path was observed, so this build's worker chunk was answered from cache or not at all and its media type could not be checked.`,
      ).toBeDefined();
      expect(
        contentType,
        `${url} was served as ${JSON.stringify(contentType)} rather than JavaScript. An HTML media type here means the SPA fallback answered for a chunk that is not in this build: wrangler.jsonc sets assets.not_found_handling "single-page-application", which applies to /assets/* as well, so a missing chunk is HTTP 200 with the index.html body rather than a 404 -- the request succeeds and no requestfailed listener sees it. new Worker() on that body constructs, fails to parse, never posts simulation/ready, and WorkerSessionHost times out after 15s with "The simulation worker did not reply within 15000ms".`,
      ).toMatch(/javascript|ecmascript/iu);
    }

    // Only now the slow part: the session the click started has to settle.
    await expect(saveStatus(page)).not.toHaveText(localeText(SAVE_PANEL_MESSAGE_KEY.statusCreating));

    /*
     * The compile-time `define` survived the production build. The badge is
     * how a bug report says which build it is about, and
     * `src/shared/build-identity.ts` falls back to a visible `unknown` when
     * the replacement is absent -- so the fallback reaching every player is
     * exactly the failure that leaves every headless test green.
     * `app-shell.spec.ts` asserts this against `tests/browser/vite.config.ts`'s
     * copy of the same resolver; this asserts it against the artefact.
     */
    const buildId = await page.locator('[data-build-id]').first().getAttribute('data-build-id');
    expect(
      buildId,
      'The built page carries no build identity, so `buildIdentityDefines()` did not reach the production bundle.',
    ).toBeTruthy();
    expect(
      buildId,
      `The build badge reads ${JSON.stringify(buildId)}. That is src/shared/build-identity.ts's "unknown" fallback, which means the compile-time define was not replaced in the artefact even though it is replaced under the dev server.`,
    ).not.toContain('unknown');

    // The shipped CSP and COOP/COEP let the page run rather than merely being
    // present. `verify-deployment-preview.mjs` asserts the headers; only a
    // browser can say the renderer and the worker survived them.
    expect(
      pageErrors,
      'The built client raised an uncaught error while booting. A CSP directive, a COEP escalation or a chunking change can produce this in the artefact while the dev server stays clean.',
    ).toEqual([]);
    expect(
      await page.evaluate(() => window.crossOriginIsolated),
      'The artefact is not cross-origin isolated, so COOP/COEP did not reach the served page. ADR-0021 makes that isolation the prerequisite for ever sharing simulation state with the worker without copying.',
    ).toBe(true);
    expect(
      consoleErrors.filter((text) => /Refused to|Content Security Policy|blocked/iu.test(text)),
      'The shipped Content-Security-Policy blocked something the page tried to load. public/_headers records that img-src blob: and data: are load-bearing for Phaser; this catches the next directive that is.',
    ).toEqual([]);
  });

  test('completes one command round trip and one persistence round trip in the built client', async ({
    page,
  }) => {
    await installWorkerTrace(page);
    await page.goto('/');

    // --- persistence round trip -------------------------------------------
    // Create, then load back, through the path a player takes: save panel ->
    // session controller -> worker snapshot -> IndexedDB -> and back.
    await page.getByRole('button', { name: NEW_PRISON }).click();
    await expect(
      page.locator('.save-panel__item'),
      'The built client created no save slot. A slot is written only after the worker returns a snapshot to write, so the first test in this file -- which checks how the worker chunk was served -- is where the cause will be named.',
    ).toHaveCount(1);

    await page
      .locator('.save-panel__item')
      .first()
      .getByRole('button', { name: LOAD })
      .click();
    await expect(
      saveStatus(page),
      'Loading a save the built client had just written did not reach "Loaded." This is the sequence an external audit reported failing on the deployed site with "The simulation worker did not reply within 15000ms"; against a locally built artefact it settles in well under a second.',
    ).toHaveText(localeText(SAVE_PANEL_MESSAGE_KEY.statusLoaded));

    // --- the worker really answered ---------------------------------------
    const trace = await readWorkerTrace(page);
    expect(
      trace.sent,
      'The built client never sent `simulation/initialize`, so no session was ever started in the worker.',
    ).toContain('simulation/initialize');
    expect(
      trace.received,
      'The worker chunk this build emitted never answered `simulation/ready`. That is the precise condition behind "The simulation worker did not reply within 15000ms": the chunk was requested and the reply never came.',
    ).toContain('simulation/ready');
    expect(
      trace.received,
      'The built client asked the worker for a snapshot and got none back, so persistence has nothing authoritative to write (ADR 0003).',
    ).toContain('simulation/snapshot');

    // --- command round trip -----------------------------------------------
    // Play, and the clock the worker owns has to move. Not a UI state check:
    // the clock text is rendered from `simulation/clock-state` messages, so a
    // changed readout is a full main -> worker -> main crossing in the built
    // artefact.
    const clock = page.locator('.hud-strip__clock').first();
    const before = (await clock.innerText()).replace(/\s+/gu, ' ').trim();
    await page.getByRole('button', { name: PLAY }).click();
    await expect(
      async () => {
        expect((await clock.innerText()).replace(/\s+/gu, ' ').trim()).not.toBe(before);
      },
      `Play did not advance the clock in the built client; it stayed at ${JSON.stringify(before)}. The audit report that prompted this file describes exactly that -- "the clock stayed at 00:00, Day 1 ... Play did not start time" -- so this is the assertion that would have settled it.`,
    ).toPass({ timeout: 20_000 });

    expect(
      (await readWorkerTrace(page)).received,
      'The clock readout changed without a `simulation/clock-state` message, which would mean the HUD is inventing time rather than rendering the worker\'s.',
    ).toContain('simulation/clock-state');
  });
});
