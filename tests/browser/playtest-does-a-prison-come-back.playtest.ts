import { expect, test, type Page } from '@playwright/test';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  buildAndPopulate,
  buy,
  currentClock,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

/**
 * **Does a prison come back, and does the game say what it kept?**
 *
 * `tests/determinism/` proves the save format round-trips below the UI, and
 * `docs/research/2026-09-02-what-does-not-survive-a-reload.md` walked the
 * schema field by field through `restoreSimulationRuntime`. Neither of them
 * ever pressed **Save now**, reloaded the page, and pressed **Load** — which
 * is the only route a player has. This instrument does exactly that and
 * writes down what the screen said at each step.
 *
 * ## The two channels, never mixed
 *
 * - **HUD** — `innerText` read out of the real DOM, or an attribute on a real
 *   control. What a player sees. Every HUD reading below is prefixed `HUD`.
 * - **STATE** — a `simulation/request-projection` round trip to the worker,
 *   using the same envelope `src/ui/simulation-projections.ts` posts, or a
 *   figure off `simulation/status-counts`. Prefixed `STATE`.
 *
 * `hud/held-guards` is the one projection here that is **both**: the Staff
 * panel on the Security tab renders it (`src/ui/hud/staff-panel.ts`'s
 * `.hud-staff__held` block), so a claim read off the projection and the row a
 * player reads are two views of one fact — and this instrument reads both,
 * separately, because the panel only pulls it while that tab shows and only on
 * a clock heartbeat.
 *
 * ## Not a gate
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`. Only
 * `tests/browser/playwright.playtest.config.ts` collects `.playtest.ts`, and
 * nothing in CI drives it. The output is the deliverable; the findings live in
 * `docs/research/2026-09-04-does-a-prison-come-back.md`.
 *
 * Run one act at a time (`-g` is a regex, so escape parentheses):
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5417 node --experimental-transform-types \
 *   --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-does-a-prison-come-back.playtest.ts -g "act 1"
 * ```
 */

/* ------------------------------------------------------------------ */
/* The projection probe, lifted from                                   */
/* playtest-2026-09-04-does-anyone-answer-an-incident.playtest.ts.     */
/* ------------------------------------------------------------------ */

/**
 * Captures the worker instance and installs an in-page projection puller.
 *
 * **Must be installed after `installTee`**, which replaces `Worker` with a tee
 * subclass; this one subclasses whatever `Worker` is by then, so the other
 * order loses the instance handle.
 *
 * `addInitScript` re-runs on every navigation, which is the property this
 * whole instrument depends on: the probe and the tee survive `page.reload()`,
 * so a reading taken before the reload and one taken after come off the same
 * two mechanisms.
 */
async function installProjectionProbe(page: Page): Promise<void> {
  await page.addInitScript((protocolVersion: number) => {
    const Base = Worker;
    class ProbeWorker extends Base {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __lsWorker?: Worker }).__lsWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;

    (window as unknown as { __lsProjection?: unknown }).__lsProjection = (
      projectionId: string,
      target?: { kind: 'id'; id: string },
    ): Promise<unknown> => {
      const worker = (window as unknown as { __lsWorker?: Worker }).__lsWorker;
      if (worker === undefined) return Promise.reject(new Error('no worker captured'));
      const messageId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          reject(new Error(`no reply for ${projectionId}`));
        }, 15_000);
        const onMessage = (event: MessageEvent): void => {
          const data = event.data as {
            replyTo?: string;
            kind?: string;
            payload?: { tick?: number; view?: { data?: unknown } };
          };
          if (data?.replyTo !== messageId) return;
          worker.removeEventListener('message', onMessage);
          clearTimeout(timer);
          if (data.kind !== 'simulation/projection') {
            reject(new Error(`${projectionId} answered ${String(data.kind)}`));
            return;
          }
          // `payload.tick` is the kernel tick the projection was read at, and
          // it is carried out of here beside the view because it is the only
          // authoritative tick a **paused** session will hand over: the worker
          // publishes `simulation/clock-state` at most every 250 ms and *only
          // when the tick has moved*, so `currentTick` from the harness is
          // stale for as long as the clock is stopped. Reading a restore's tick
          // off that channel reports the tick from before the reload.
          resolve({ tick: data.payload?.tick ?? -1, data: data.payload?.view?.data ?? null });
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({
          protocolVersion,
          messageId,
          kind: 'simulation/request-projection',
          payload: { projectionId, ...(target === undefined ? {} : { target }) },
        });
      });
    };
  }, SIMULATION_PROTOCOL_VERSION);
}

interface ProjectionReply<T> {
  readonly tick: number;
  readonly data: T | null;
}

async function projectionReply<T>(
  page: Page,
  id: string,
  target?: { kind: 'id'; id: string },
): Promise<ProjectionReply<T>> {
  return page.evaluate(
    async ([projectionId, aim]) =>
      (await (
        window as unknown as { __lsProjection: (p: string, t?: { kind: 'id'; id: string }) => Promise<unknown> }
      ).__lsProjection(projectionId as string, aim as { kind: 'id'; id: string } | undefined)) as ProjectionReply<T>,
    [id, target] as const,
  );
}

async function projection<T>(page: Page, id: string, target?: { kind: 'id'; id: string }): Promise<T | null> {
  return (await projectionReply<T>(page, id, target)).data;
}

/**
 * The kernel tick, off a projection reply rather than off `simulation/clock-state`.
 *
 * **Use this and not `currentTick` wherever the clock may be stopped.** See the
 * comment in the probe: a paused worker publishes no clock state, so the tee's
 * last `clock-state` message survives a page reload's worth of staleness and
 * reports the *pre-reload* tick as if it were the restored one. That artefact
 * produced a reading of "0 ticks discarded" across a load that discarded about
 * 2,500 of them.
 */
async function kernelTick(page: Page): Promise<number> {
  // A page with no session at all answers `protocol/error` rather than a
  // projection -- which is itself a reading (a freshly reloaded page has no
  // kernel until Load), so it is reported as `-1` instead of failing the act.
  try {
    return (await projectionReply<unknown>(page, 'hud/prisoner-population')).tick;
  } catch {
    return -1;
  }
}

interface IncidentRowView {
  readonly incidentId: string;
  readonly type: string;
  readonly state: string;
  readonly severity: number;
  readonly requiredResponders?: number;
}
/**
 * The real shape of `hud/incidents`, read off a live reply rather than
 * assumed: **open incidents are `active`, an array, and closed ones are
 * `resolved.rows`.** An earlier draft of this file typed it as
 * `incidents.items` and would have silently found no incident at all.
 */
interface IncidentsView {
  readonly active: readonly IncidentRowView[];
  readonly resolved: { readonly total: number; readonly rows: readonly IncidentRowView[] };
  readonly summary?: Record<string, number>;
  readonly countsByState?: readonly { readonly state: string; readonly count: number }[];
  readonly responseMetrics?: Record<string, number>;
}
interface IncidentDetailView extends IncidentRowView {
  readonly timeline: readonly { readonly state: string; readonly atTick: number }[];
}
interface HeldGuardRow {
  readonly entityId: number;
  readonly claim: string;
  readonly deploymentPhase: string;
  readonly sectorId?: string;
}
interface HeldGuardsView {
  /** A `ViewModelPage`: `{ total, offset, limit, rows }`, not `items`. */
  readonly held: { readonly total: number; readonly rows: readonly HeldGuardRow[] };
  readonly countsByClaim: readonly { readonly claim: string; readonly count: number }[];
  readonly totals: { readonly hired: number; readonly held: number; readonly unassigned: number };
}

interface SecurityView {
  readonly sectors: readonly {
    readonly sectorId: string;
    readonly controlState: string;
    readonly openIncidentCount: number;
    readonly staffing: { readonly onPost: number; readonly travelling: number; readonly onSearch: number };
  }[];
}

const readIncidents = (page: Page) => projection<IncidentsView>(page, 'hud/incidents');
const readHeld = (page: Page) => projection<HeldGuardsView>(page, 'hud/held-guards');

/**
 * Each sector's control state and phase tally.
 *
 * **STATE only, and it cannot be anything else**: nothing under `src/ui/`
 * requests `hud/security` (the 2026-09-04 orphan census records it, 65
 * members, painted by nobody), so a lockdown a restore inherits is invisible
 * to a player by construction. It is read here because a response's *second*
 * claim is the incident sector's `'lockdown'`, and that claim's fate across a
 * restore is half of what this act is about.
 */
async function readSectors(page: Page): Promise<string> {
  const view = await projection<SecurityView>(page, 'hud/security');
  if (view === null) return 'no reply';
  return JSON.stringify(
    view.sectors.map((sector) => ({
      id: sector.sectorId,
      control: sector.controlState,
      open: sector.openIncidentCount,
      ...sector.staffing,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* HUD readings                                                        */
/* ------------------------------------------------------------------ */

/** Every transport button, by index: 0 pause, 1 play, 2 fast-forward. */
const transport = (page: Page, index: 0 | 1 | 2) => page.locator('.hud-strip__transport button').nth(index);

/**
 * A one-line reading of a panel, with newlines flattened so a whole screen
 * fits on one console line and two readings can be compared by eye.
 */
async function line(page: Page, selector: string): Promise<string> {
  return (await panelText(page, selector)).replace(/\n+/g, ' | ');
}

/**
 * The alerts column as a player reads it: one entry per row, in layout order,
 * with the row's dismiss control's presence noted.
 */
async function alertRows(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')].map((row) => {
      const laidOut = row.getClientRects().length > 0;
      const text = (row.innerText ?? '').replace(/\n+/g, ' / ').trim();
      return `${row.dataset['alert'] ?? '?'} :: ${text}${laidOut ? '' : ' [NOT LAID OUT]'}`;
    }),
  );
}

/** The held-guards block on the Security tab, exactly as it is laid out. */
async function heldRowsHud(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('.hud-staff__held');
    if (block === null) return ['.hud-staff__held: ABSENT'];
    if (block.hidden || block.getClientRects().length === 0) return ['.hud-staff__held: NO BOX'];
    // Laid-out rows only. The block is a pooled list
    // (`src/ui/hud/pooled-row-binding.ts`), so it keeps spare rows in the DOM
    // carrying whatever text they last painted -- a spare still reading
    // "Guard · Contraband Search" in a prison that has never run a search was
    // observed on the first run of this act. A row with no box is not something
    // a player can read, so it is counted rather than quoted.
    const all = [...block.querySelectorAll<HTMLElement>('.hud-staff__held-row')];
    const rows = all.filter((row) => row.getClientRects().length > 0);
    const header = (block.querySelector<HTMLElement>('.hud-staff__held-header')?.innerText ?? '').replace(/\n+/g, ' ');
    return [
      `header :: ${header.trim()} (${rows.length} laid-out row(s), ${all.length - rows.length} pooled spare(s))`,
      ...rows.map((row, index) => {
        const label = (row.querySelector<HTMLElement>('.hud-staff__held-label')?.innerText ?? '').replace(/\n+/g, ' ');
        const button = row.querySelector<HTMLButtonElement>('button');
        const box = row.getClientRects()[0];
        return (
          `row${index} :: ${label.trim()} :: button=${button === null ? 'NONE' : `"${(button.innerText ?? '').trim()}"`}` +
          ` disabled=${String(button?.disabled)} laidOut=${box === undefined ? 'no' : `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`}`
        );
      }),
    ];
  });
}

/** The save panel, split into the three things it can say. */
async function savePanel(page: Page): Promise<{ status: string; kind: string; detail: string; list: string }> {
  return page.evaluate(() => {
    const status = document.querySelector<HTMLElement>('.save-panel__status');
    const detail = document.querySelector<HTMLElement>('.save-panel__detail');
    const list = document.querySelector<HTMLElement>('.save-panel__list');
    return {
      status: (status?.innerText ?? 'ABSENT').trim(),
      kind: status?.dataset['kind'] ?? 'ABSENT',
      detail: (detail?.innerText ?? 'ABSENT').trim(),
      list: (list?.innerText ?? 'ABSENT').replace(/\n+/g, ' | ').trim(),
    };
  });
}

/**
 * Everything a player can read at once, per tab, plus the always-visible
 * furniture. This is the HUD half of the round trip: two of these, one before
 * the reload and one after the load, and the diff between them is the finding.
 */
interface ScreenReading {
  readonly clock: string;
  readonly strip: string;
  readonly event: string;
  readonly refusal: string;
  readonly unavailable: string;
  readonly alerts: readonly string[];
  readonly overview: string;
  readonly build: string;
  readonly rooms: string;
  readonly security: string;
  readonly regime: string;
  readonly held: readonly string[];
  readonly save: { status: string; kind: string; detail: string; list: string };
}

async function readScreen(page: Page): Promise<ScreenReading> {
  // Overview first and last is not worth the presses; the tabs are visited in
  // a fixed order so two readings are comparable line for line.
  const clock = await line(page, '.hud-strip__clock');
  const strip = await line(page, '.hud-strip');
  const event = await line(page, '.hud__event');
  const refusal = await line(page, '.hud__refusal');
  const unavailable = await line(page, '.hud__unavailable');
  const alerts = await alertRows(page);
  const save = await savePanel(page);

  await tab(page, 'overview').click();
  await page.waitForTimeout(400);
  const overview = await line(page, '.hud__side');
  await tab(page, 'build').click();
  await page.waitForTimeout(400);
  const build = await line(page, '.hud-build');
  await tab(page, 'zones').click();
  await page.waitForTimeout(400);
  const rooms = await line(page, '.hud-rooms');
  await tab(page, 'manage').click();
  await page.waitForTimeout(600);
  const security = await line(page, '.hud-staff');
  const held = await heldRowsHud(page);
  await tab(page, 'day-plan').click();
  await page.waitForTimeout(400);
  const regime = await line(page, '.hud-regime');
  await tab(page, 'overview').click();

  return { clock, strip, event, refusal, unavailable, alerts, overview, build, rooms, security, regime, held, save };
}

function report(label: string, reading: ScreenReading): void {
  const log = (l: string) => console.log(`[${label}] ${l}`);
  log(`HUD clock       :: ${reading.clock}`);
  log(`HUD strip       :: ${reading.strip}`);
  log(`HUD event band  :: ${reading.event}`);
  log(`HUD refusal     :: ${reading.refusal}`);
  log(`HUD unavailable :: ${reading.unavailable}`);
  log(`HUD alerts      :: ${reading.alerts.length} row(s)`);
  for (const row of reading.alerts) log(`HUD   alert      :: ${row}`);
  log(`HUD overview    :: ${reading.overview}`);
  log(`HUD build       :: ${reading.build}`);
  log(`HUD rooms       :: ${reading.rooms}`);
  log(`HUD security    :: ${reading.security}`);
  for (const row of reading.held) log(`HUD   held       :: ${row}`);
  log(`HUD regime      :: ${reading.regime}`);
  log(`HUD save.status :: [${reading.save.kind}] ${reading.save.status}`);
  log(`HUD save.detail :: ${reading.save.detail}`);
  log(`HUD save.list   :: ${reading.save.list}`);
}

/** Every line that differs between two screen readings, named. */
function diffScreens(label: string, before: ScreenReading, after: ScreenReading): readonly string[] {
  const differences: string[] = [];
  const compare = (field: string, a: string, b: string): void => {
    if (a !== b) differences.push(`${field}\n    before: ${a}\n    after : ${b}`);
  };
  compare('clock', before.clock, after.clock);
  compare('strip', before.strip, after.strip);
  compare('event band', before.event, after.event);
  compare('refusal band', before.refusal, after.refusal);
  compare('unavailable notice', before.unavailable, after.unavailable);
  compare('alerts', before.alerts.join(' ;; '), after.alerts.join(' ;; '));
  compare('overview', before.overview, after.overview);
  compare('build', before.build, after.build);
  compare('rooms', before.rooms, after.rooms);
  compare('security', before.security, after.security);
  compare('held guards', before.held.join(' ;; '), after.held.join(' ;; '));
  compare('regime', before.regime, after.regime);
  console.log(`[${label}] === ${differences.length} HUD line(s) differ across the round trip ===`);
  for (const difference of differences) console.log(`[${label}]   ${difference}`);
  return differences;
}

/** Presses the Load button on the one prison row, and waits for the panel to settle. */
async function pressLoad(page: Page): Promise<void> {
  const loadButton = page.locator('.save-panel__item button', { hasText: 'Load' }).first();
  await expect(loadButton).toBeVisible();
  await loadButton.click();
  // The gate disables the whole panel while the action runs; waiting on the
  // status line rather than a fixed timeout is what a player watches.
  await expect(page.locator('.save-panel__status')).not.toHaveText('Loading…', { timeout: 60_000 });
  await page.waitForTimeout(600);
}

async function pressSaveNow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).not.toHaveText('Saving…', { timeout: 60_000 });
  await page.waitForTimeout(400);
}

/**
 * Reloads the page for real and waits for the app to stand back up.
 *
 * **The page reload is the point of this instrument.** A harness round trip
 * (`saveAndLoad`) hands a decoded bundle straight back to
 * `restoreSimulationRuntime` in the same process; a player closes the tab.
 * Everything the main thread holds that is not in the save — the HUD view
 * model, the event band, the refusal band, the tab, the transport speed — is
 * destroyed here and nowhere else.
 */
async function reloadPage(page: Page): Promise<void> {
  await page.reload();
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.waitForTimeout(1500);
}

/* ================================================================== */
/* act 1 — the honest round trip                                       */
/* ================================================================== */

test('act 1: save a working prison, reload the page, load it, and diff the screen', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 4, admits: 6, guards: 3, label: 'act1-build' });

  // Past a day boundary, so the clock, the treasury and the alerts column all
  // carry something a restore could lose.
  await transport(page, 2).click();
  await page.waitForTimeout(200);
  await transport(page, 2).click();
  const runStarted = Date.now();
  for (;;) {
    const tick = await kernelTick(page);
    if (tick >= 5_200) break;
    if (Date.now() - runStarted > 240_000) throw new Error(`stuck at tick ${tick}`);
    await page.waitForTimeout(1000);
  }

  // Pause, so the "before" reading and the save describe the same tick.
  await transport(page, 0).click();
  await page.waitForTimeout(1200);

  const tickBefore = await kernelTick(page);
  const clockBefore = await currentClock(page);
  const countsBefore = await latestCounts(page);
  const incidentsBefore = await readIncidents(page);
  const heldBefore = await readHeld(page);
  console.log(`[act1] STATE tick=${tickBefore} clock=${JSON.stringify(clockBefore)}`);
  console.log(`[act1] STATE counts=${JSON.stringify(countsBefore)}`);
  console.log(`[act1] STATE incidents=${JSON.stringify(incidentsBefore)}`);
  console.log(`[act1] STATE heldGuards=${JSON.stringify(heldBefore)}`);

  const before = await readScreen(page);
  report('act1 BEFORE', before);

  // --- Save now -----------------------------------------------------
  await pressSaveNow(page);
  const afterSave = await savePanel(page);
  console.log(`[act1] HUD after Save now :: [${afterSave.kind}] ${afterSave.status}`);
  console.log(`[act1] HUD after Save now, detail :: "${afterSave.detail}"`);
  console.log(`[act1] HUD after Save now, list :: ${afterSave.list}`);
  console.log(`[act1] STATE tick at save = ${await kernelTick(page)}`);

  // --- the reload ---------------------------------------------------
  await reloadPage(page);
  const fresh = await savePanel(page);
  console.log(`[act1] HUD on the fresh page :: [${fresh.kind}] ${fresh.status}`);
  console.log(`[act1] HUD on the fresh page, detail :: "${fresh.detail}"`);
  console.log(`[act1] HUD on the fresh page, list :: ${fresh.list}`);
  console.log(`[act1] HUD fresh clock :: ${await line(page, '.hud-strip__clock')}`);
  console.log(`[act1] HUD fresh strip :: ${await line(page, '.hud-strip')}`);
  console.log(`[act1] HUD fresh unavailable :: ${await line(page, '.hud__unavailable')}`);
  console.log(`[act1] HUD fresh alerts :: ${JSON.stringify(await alertRows(page))}`);
  console.log(`[act1] STATE tick on the fresh page = ${await kernelTick(page)}`);

  // --- Load ---------------------------------------------------------
  await pressLoad(page);
  const loaded = await savePanel(page);
  console.log(`[act1] HUD after Load :: [${loaded.kind}] ${loaded.status}`);
  console.log(`[act1] HUD after Load, detail :: "${loaded.detail}"`);
  console.log(`[act1] HUD after Load, list :: ${loaded.list}`);

  const tickAfter = await kernelTick(page);
  // The same tick off the clock-state channel, for the record: this is what a
  // reader that watches `simulation/clock-state` sees after a load onto a
  // stopped clock, and the gap between the two numbers is the staleness.
  console.log(`[act1] STATE tick off clock-state after Load = ${await currentTick(page)} (kernel says ${tickAfter})`);
  const clockAfter = await currentClock(page);
  const countsAfter = await latestCounts(page);
  const incidentsAfter = await readIncidents(page);
  const heldAfter = await readHeld(page);
  console.log(`[act1] STATE tick=${tickAfter} clock=${JSON.stringify(clockAfter)}`);
  console.log(`[act1] STATE counts=${JSON.stringify(countsAfter)}`);
  console.log(`[act1] STATE incidents=${JSON.stringify(incidentsAfter)}`);
  console.log(`[act1] STATE heldGuards=${JSON.stringify(heldAfter)}`);
  console.log(`[act1] STATE tick delta across the round trip = ${tickAfter - tickBefore}`);

  const after = await readScreen(page);
  report('act1 AFTER', after);
  diffScreens('act1', before, after);
});

/* ================================================================== */
/* act 2 — the mid-incident restore                                    */
/* ================================================================== */

test('act 2: save during a live response, reload, load, and watch the guards', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);

  // One bed and eight admissions is the shape
  // `2026-09-04-does-anyone-answer-an-incident.md` measured incidents out of:
  // seven prisoners with nowhere to live is what pushes `needsPressure` over
  // the line. Four guards, so a response can actually be staffed.
  await buildAndPopulate(page, { beds: 1, admits: 8, guards: 4, label: 'act2-build' });

  /*
   * **The prison may have no prisoners at this point, and the reason is worth
   * writing down because it is the save panel's business.**
   *
   * On the first run of this act every one of `buildAndPopulate`'s eight
   * `Admit` presses failed, 38 seconds apart or less, with *"The simulation
   * has not reported its command sequence yet; try again in a moment"* --
   * thrown by `SimulationCommandSender.submit` because `sequenceSynced` is
   * `false`. It goes `false` when a command is **rejected**
   * (`src/ui/simulation-commands.ts:328`), and the only thing that sets it back
   * is a `simulation/snapshot` (`:321`, `baseline`). One refused bed placement
   * during construction therefore stopped every later command, and the prison
   * sat there admitting nobody.
   *
   * A snapshot is exactly what a **save** produces. So the recovery step below
   * is a real player gesture -- press *Save now* -- and whether it heals the
   * channel is measured rather than assumed.
   */
  const populated = await latestCounts(page);
  if ((populated?.prisoners ?? 0) === 0) {
    console.log(`[act2] STATE no prisoners after buildAndPopulate: ${JSON.stringify(populated)}`);
    console.log(`[act2] HUD refusal band at that point :: ${await line(page, '.hud__refusal')}`);
    console.log(`[act2] HUD intake panel at that point :: ${await line(page, '.hud-intake')}`);
    console.log(`[act2] HUD save panel before any heal :: ${JSON.stringify(await savePanel(page))}`);

    // Retry with nothing pressed in between first, so the two candidate
    // healers stay separable: by the time `buildAndPopulate` has finished
    // hiring, a dirty-driven autosave has had 30 s to fire and produce a
    // snapshot of its own. If the admissions land now, the channel healed
    // without a pressed save and no claim is made about which snapshot did it.
    await tab(page, 'overview').click();
    await page.waitForTimeout(600);
    for (let index = 0; index < 8; index += 1) {
      await page.locator('.hud-intake__admit').click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(2500);
    let healed = await latestCounts(page);
    console.log(`[act2] STATE prisoners after eight retry presses with no save pressed = ${healed?.prisoners ?? 'unknown'}`);

    if ((healed?.prisoners ?? 0) === 0) {
      await pressSaveNow(page);
      console.log(`[act2] HUD save panel after pressing Save now :: ${JSON.stringify(await savePanel(page))}`);
      await tab(page, 'overview').click();
      await page.waitForTimeout(600);
      for (let index = 0; index < 8; index += 1) {
        await page.locator('.hud-intake__admit').click();
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(2500);
      healed = await latestCounts(page);
      console.log(`[act2] STATE prisoners after Save now + eight more Admit presses = ${healed?.prisoners ?? 'unknown'}`);
    }
    console.log(`[act2] HUD strip after the heal :: ${await line(page, '.hud-strip')}`);
    if ((healed?.prisoners ?? 0) === 0) {
      console.log('[act2] the command channel did not recover; this act cannot reach an incident.');
      return;
    }
  }

  // 1x, not 4x. A response's whole life is 70 ticks — 3.5 s at 1x and 0.875 s
  // at 4x — and the poll below has to land inside the 60-tick `responding`
  // stretch. The earlier note measured a 300-400 ms poll at 4x missing entire
  // incidents.
  await transport(page, 1).click();
  await page.waitForTimeout(300);
  console.log(`[act2] clock before the watch: ${JSON.stringify(await currentClock(page))}`);

  await tab(page, 'manage').click();
  await page.waitForTimeout(500);

  // Catch a response in flight, pause on the spot, and only then save.
  let caught: { incidentId: string; state: string; tick: number } | undefined;
  const watchStarted = Date.now();
  while (caught === undefined) {
    if (Date.now() - watchStarted > 300_000) break;
    const view = await readIncidents(page);
    const live = view?.active.find((row) => row.state === 'responding' || row.state === 'notified');
    if (live !== undefined) {
      await transport(page, 0).click();
      const tick = await kernelTick(page);
      const confirm = await readIncidents(page);
      const still = confirm?.active.find((row) => row.incidentId === live.incidentId);
      console.log(
        `[act2] STATE caught ${live.incidentId} as '${live.state}' at tick ~${tick};` +
          ` after the pause press it reads '${still?.state ?? 'GONE'}'`,
      );
      if (still?.state === 'responding' || still?.state === 'notified') {
        caught = { incidentId: live.incidentId, state: still.state, tick };
        break;
      }
      // The pause landed after the containment finished. Resume and keep watching.
      await transport(page, 1).click();
      await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(120);
  }

  if (caught === undefined) {
    console.log('[act2] NO live response was ever caught mid-flight; the rest of this act cannot run.');
    console.log(`[act2] STATE incidents at give-up: ${JSON.stringify(await readIncidents(page))}`);
    return;
  }

  const pausedTick = await kernelTick(page);
  const heldAtSave = await readHeld(page);
  const detailAtSave = await projection<IncidentDetailView>(page, 'hud/incident-detail', {
    kind: 'id',
    id: caught.incidentId,
  });
  console.log(`[act2] STATE paused at tick ${pausedTick}, incident '${caught.state}'`);
  console.log(`[act2] STATE incident timeline at save: ${JSON.stringify(detailAtSave?.timeline)}`);
  console.log(`[act2] STATE heldGuards at save: ${JSON.stringify(heldAtSave)}`);
  console.log(`[act2] STATE sectors at save: ${await readSectors(page)}`);
  console.log(`[act2] HUD held block at save:`);
  for (const row of await heldRowsHud(page)) console.log(`[act2]   ${row}`);
  console.log(`[act2] HUD security at save :: ${await line(page, '.hud-staff')}`);
  console.log(`[act2] HUD alerts at save :: ${JSON.stringify(await alertRows(page))}`);
  console.log(`[act2] HUD event band at save :: ${await line(page, '.hud__event')}`);

  await pressSaveNow(page);
  console.log(`[act2] HUD after Save now :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act2] STATE tick at save = ${await kernelTick(page)}`);
  console.log(`[act2] STATE incidents at save = ${JSON.stringify(await readIncidents(page))}`);

  await reloadPage(page);
  await pressLoad(page);
  console.log(`[act2] HUD after Load :: ${JSON.stringify(await savePanel(page))}`);

  // --- the window ---------------------------------------------------
  // Everything below is inside the stretch ADR 0033's residue lives in: the
  // response records are gone (`getSnapshot` carries metrics only) and the
  // guards are still on `'on-search'` until this system's first scheduled
  // update. The clock is whatever the load left it as — measured, not assumed.
  const tickAtLoad = await kernelTick(page);
  const clockAtLoad = await currentClock(page);
  console.log(`[act2] STATE tick right after Load = ${tickAtLoad}`);
  console.log(`[act2] STATE clock right after Load = ${JSON.stringify(clockAtLoad)}`);
  console.log(`[act2] STATE incidents right after Load = ${JSON.stringify(await readIncidents(page))}`);
  console.log(`[act2] STATE sectors right after Load = ${await readSectors(page)}`);
  const detailAfterLoad = await projection<IncidentDetailView>(page, 'hud/incident-detail', {
    kind: 'id',
    id: caught.incidentId,
  });
  console.log(`[act2] STATE the same incident's timeline after Load = ${JSON.stringify(detailAfterLoad?.timeline)}`);

  const samples: string[] = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const tick = await kernelTick(page);
    const held = await readHeld(page);
    samples.push(
      `t=${tick} totals=${JSON.stringify(held?.totals)} claims=${JSON.stringify(held?.countsByClaim)}` +
        ` rows=${JSON.stringify(held?.held.rows)}`,
    );
    await page.waitForTimeout(250);
  }
  console.log('[act2] STATE held-guards while the clock is where Load left it:');
  for (const sample of samples) console.log(`[act2]   ${sample}`);

  // What the player actually sees, on the tab that renders this projection.
  await tab(page, 'manage').click();
  await page.waitForTimeout(1200);
  console.log(`[act2] HUD security in the window :: ${await line(page, '.hud-staff')}`);
  console.log('[act2] HUD held block in the window:');
  for (const row of await heldRowsHud(page)) console.log(`[act2]   ${row}`);
  console.log(`[act2] HUD alerts in the window :: ${JSON.stringify(await alertRows(page))}`);
  console.log(`[act2] HUD event band in the window :: ${await line(page, '.hud__event')}`);
  console.log(`[act2] HUD clock in the window :: ${await line(page, '.hud-strip__clock')}`);

  // Can a player press something? The Release control on a held row is the one
  // gesture aimed at exactly this state (ADR 0034).
  const releaseProbe = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.hud-staff__held-row');
    if (row === null) return { present: false } as const;
    const button = row.querySelector<HTMLButtonElement>('button');
    if (button === null) return { present: true, button: false } as const;
    const box = button.getBoundingClientRect();
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;
    const topmost = document.elementFromPoint(centreX, centreY);
    return {
      present: true,
      button: true,
      text: (button.innerText ?? '').trim(),
      disabled: button.disabled,
      box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      // The one check that has cost three withdrawn findings: is the point a
      // press would land on actually this control, or is something over it?
      topmostIsTheButton: topmost === button || button.contains(topmost),
      topmost: topmost === null ? 'null' : `${topmost.tagName}.${topmost.className}`,
    } as const;
  });
  console.log(`[act2] HUD release control probe :: ${JSON.stringify(releaseProbe)}`);

  if (releaseProbe.present && releaseProbe.button === true && releaseProbe.disabled === false) {
    const heldBeforePress = await readHeld(page);
    await page.locator('.hud-staff__held-row button').first().click();
    await page.waitForTimeout(800);
    const heldAfterPress = await readHeld(page);
    console.log(`[act2] STATE held before the Release press :: ${JSON.stringify(heldBeforePress?.totals)}`);
    console.log(`[act2] STATE held after the Release press  :: ${JSON.stringify(heldAfterPress?.totals)}`);
    console.log(`[act2] HUD refusal band after the press :: ${await line(page, '.hud__refusal')}`);
    console.log(`[act2] HUD event band after the press :: ${await line(page, '.hud__event')}`);
    console.log('[act2] HUD held block after the press:');
    for (const row of await heldRowsHud(page)) console.log(`[act2]   ${row}`);
  }

  // --- how wide is the window, in ticks? ----------------------------
  // Start the clock and sample until the claim stops being `'unattributed'`.
  const beforeStart = await kernelTick(page);
  await transport(page, 1).click();
  const closeStarted = Date.now();
  let closedAt: number | undefined;
  const closing: string[] = [];
  while (Date.now() - closeStarted < 30_000) {
    const tick = await kernelTick(page);
    const held = await readHeld(page);
    const unattributed = held?.countsByClaim.find((entry) => entry.claim === 'unattributed')?.count ?? 0;
    closing.push(`t=${tick} unattributed=${unattributed} claims=${JSON.stringify(held?.countsByClaim)}`);
    if (unattributed === 0) {
      closedAt = tick;
      break;
    }
    await page.waitForTimeout(60);
  }
  console.log(`[act2] STATE clock restarted from tick ${beforeStart}`);
  for (const sample of closing) console.log(`[act2]   closing :: ${sample}`);
  console.log(
    `[act2] STATE window closed at tick ${closedAt ?? -1}; width from the load tick ${tickAtLoad} is` +
      ` ${closedAt === undefined ? 'NOT OBSERVED' : String(closedAt - tickAtLoad)} tick(s)`,
  );
  console.log(`[act2] STATE incidents after the window closed = ${JSON.stringify(await readIncidents(page))}`);
  console.log(`[act2] STATE sectors after the window closed = ${await readSectors(page)}`);
  console.log(
    `[act2] STATE the same incident's timeline after the window closed = ` +
      JSON.stringify(
        (await projection<IncidentDetailView>(page, 'hud/incident-detail', { kind: 'id', id: caught.incidentId }))
          ?.timeline,
      ),
  );
  console.log(`[act2] HUD alerts after the window closed :: ${JSON.stringify(await alertRows(page))}`);
  console.log('[act2] HUD held block after the window closed:');
  for (const row of await heldRowsHud(page)) console.log(`[act2]   ${row}`);
});

/* ================================================================== */
/* act 3 — the autosave                                                */
/* ================================================================== */

test('act 3: what the autosave notice says, and what it corresponds to', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await expect(page.locator('.save-panel__status')).not.toHaveText('Creating prison…', { timeout: 60_000 });
  await page.waitForTimeout(600);
  console.log(`[act3] HUD right after New prison :: ${JSON.stringify(await savePanel(page))}`);

  // The brief says there is an autosave notice on the Overview tab. Look for
  // one rather than assuming it: every text node on the page that mentions
  // saving, with whether it has a box and whether it is inside the save panel.
  await tab(page, 'overview').click();
  await page.waitForTimeout(600);
  const saveMentions = await page.evaluate(() => {
    const found: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (text.length === 0) continue;
      if (!/sav|autosav|automatic/i.test(text)) continue;
      const parent = node.parentElement;
      const laidOut = parent !== null && !parent.hidden && parent.getClientRects().length > 0;
      const inSavePanel = parent?.closest('.save-panel') != null;
      found.push(`${laidOut ? 'LAID OUT' : 'no box '} ${inSavePanel ? '[save-panel]' : '[elsewhere]'} :: ${text}`);
    }
    return found;
  });
  console.log(`[act3] HUD every mention of saving with the Overview tab showing (${saveMentions.length}):`);
  for (const mention of saveMentions) console.log(`[act3]   ${mention}`);

  /**
   * Watches the panel for `windowMs`, pressing nothing, and answers every
   * distinct thing the status line said.
   *
   * `DEFAULT_AUTOSAVE_INTERVAL_MS` is 30_000, so a window of 80 s covers two
   * intervals and a margin. The tick is sampled with each reading so a change
   * in the status line can be placed against the simulation's own progress.
   */
  const watchPanel = async (label: string, windowMs: number): Promise<readonly string[]> => {
    const seen: string[] = [];
    let previous = '';
    const started = Date.now();
    while (Date.now() - started < windowMs) {
      const panel = await savePanel(page);
      const signature = `[${panel.kind}] ${panel.status} | list ${panel.list}`;
      if (signature !== previous) {
        seen.push(`+${Math.round((Date.now() - started) / 1000)}s t=${await kernelTick(page)} ${signature}`);
        previous = signature;
      }
      await page.waitForTimeout(1000);
    }
    console.log(`[act3] HUD ${label} — every distinct save-panel state:`);
    for (const state of seen) console.log(`[act3]   ${state}`);
    return seen;
  };

  /* --- 3a. The clock runs and nothing is pressed -------------------- */
  // `SessionController.markDirty` is driven by **accepted commands** only
  // (`src/main.ts:3226`, `commandSender.onCommandAccepted`), and the transport
  // is not a command: `SimulationCommandSender.setClock` posts
  // `simulation/set-clock`, not `simulation/submit-command`. So a prison that
  // is merely *running* may never be marked dirty at all. That is what this
  // window measures, and pressing Play is the only thing done in it.
  await transport(page, 1).click();
  await page.waitForTimeout(500);
  console.log(`[act3a] STATE clock = ${JSON.stringify(await currentClock(page))}, tick = ${await kernelTick(page)}`);
  const watchedA = await watchPanel('3a, clock running, nothing pressed for 80 s', 80_000);
  console.log(`[act3a] STATE tick after the 80 s window = ${await kernelTick(page)}`);
  console.log(`[act3a] distinct panel states in the window = ${watchedA.length}`);

  /* --- 3b. One accepted command, then wait ------------------------- */
  // A purchase is the cheapest gesture that produces a real command
  // (`PurchaseMaterials`) on a prison with no rooms.
  await tab(page, 'build').click();
  await page.waitForTimeout(400);
  const tickAtCommand = await kernelTick(page);
  await buy(page, 'wall-brick', 2);
  console.log(`[act3b] STATE one PurchaseMaterials submitted at about tick ${tickAtCommand}`);
  console.log(`[act3b] HUD panel immediately after the command :: ${JSON.stringify(await savePanel(page))}`);
  const watchedB = await watchPanel('3b, 80 s after one accepted command', 80_000);
  console.log(`[act3b] distinct panel states in the window = ${watchedB.length}`);

  /* --- 3c. Does the notice correspond to a save that loads? --------- */
  // Keep playing, pressing nothing, so the simulation runs on past whatever
  // the last autosave captured — then reload and load, and compare the tick
  // that comes back against the tick the panel was last standing at.
  await page.waitForTimeout(45_000);
  const panelBeforeReload = await savePanel(page);
  const tickBeforeReload = await kernelTick(page);
  const countsBeforeReload = await latestCounts(page);
  console.log(`[act3c] HUD what the panel says at the moment of the reload :: [${panelBeforeReload.kind}] ${panelBeforeReload.status} | list ${panelBeforeReload.list}`);
  console.log(`[act3c] STATE kernel tick at the moment of the reload = ${tickBeforeReload}`);
  console.log(`[act3c] STATE counts at the moment of the reload = ${JSON.stringify(countsBeforeReload)}`);
  console.log(`[act3c] HUD clock at the moment of the reload :: ${await line(page, '.hud-strip__clock')}`);

  await reloadPage(page);
  console.log(`[act3c] HUD fresh page :: ${JSON.stringify(await savePanel(page))}`);
  await pressLoad(page);
  const loadedPanel = await savePanel(page);
  const tickAfterLoad = await kernelTick(page);
  console.log(`[act3c] HUD after Load :: [${loadedPanel.kind}] ${loadedPanel.status}`);
  console.log(`[act3c] HUD after Load, detail :: "${loadedPanel.detail}"`);
  console.log(`[act3c] HUD after Load, list :: ${loadedPanel.list}`);
  console.log(`[act3c] STATE kernel tick after Load = ${tickAfterLoad}`);
  console.log(`[act3c] STATE ticks between the last pre-reload reading and what came back = ${tickBeforeReload - tickAfterLoad}`);
  console.log(`[act3c] STATE counts after Load = ${JSON.stringify(await latestCounts(page))}`);
  console.log(`[act3c] HUD clock after Load :: ${await line(page, '.hud-strip__clock')}`);
  console.log(`[act3c] HUD strip after Load :: ${await line(page, '.hud-strip')}`);
});

/* ================================================================== */
/* act 4 — the unhappy paths                                           */
/* ================================================================== */

test('act 4: no save, two saves, and an older save over a newer prison', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);

  /* --- 4a. Nothing saved at all ------------------------------------- */
  console.log(`[act4a] HUD on a page that has never had a prison :: ${JSON.stringify(await savePanel(page))}`);
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.save-panel button')].map((button) => {
      const box = button.getBoundingClientRect();
      return `"${(button.innerText ?? '').trim()}" disabled=${String((button as HTMLButtonElement).disabled)} box=${Math.round(box.width)}x${Math.round(box.height)}`;
    }),
  );
  console.log(`[act4a] HUD save-panel controls :: ${JSON.stringify(controls)}`);
  console.log(`[act4a] HUD unavailable notice :: ${await line(page, '.hud__unavailable')}`);
  console.log(`[act4a] HUD strip :: ${await line(page, '.hud-strip')}`);

  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(1200);
  console.log(`[act4a] HUD after pressing Save now with no prison :: ${JSON.stringify(await savePanel(page))}`);
  await page.getByRole('button', { name: 'Export' }).click();
  await page.waitForTimeout(1200);
  console.log(`[act4a] HUD after pressing Export with no prison :: ${JSON.stringify(await savePanel(page))}`);

  /* --- 4b. Two saves in a row --------------------------------------- */
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(600);
  console.log(`[act4b] HUD after New prison :: ${JSON.stringify(await savePanel(page))}`);

  await transport(page, 2).click();
  await page.waitForTimeout(200);
  await transport(page, 2).click();
  await page.waitForTimeout(6000);
  await transport(page, 0).click();
  await page.waitForTimeout(800);

  const tickAtFirstSave = await kernelTick(page);
  await pressSaveNow(page);
  const firstSave = await savePanel(page);
  console.log(`[act4b] STATE tick at the first Save now = ${tickAtFirstSave}`);
  console.log(`[act4b] HUD after the first Save now :: [${firstSave.kind}] ${firstSave.status} | list ${firstSave.list}`);

  // Immediately again, with nothing changed.
  await pressSaveNow(page);
  const secondSave = await savePanel(page);
  console.log(`[act4b] HUD after the second Save now :: [${secondSave.kind}] ${secondSave.status} | list ${secondSave.list}`);

  // And two presses inside one gate window, which is what a double click is.
  const doublePress = await page.evaluate(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('.save-panel__actions button')].find(
      (candidate) => (candidate.innerText ?? '').trim() === 'Save now',
    );
    if (button === undefined) return 'no Save now button';
    button.click();
    const disabledAfterFirst = button.disabled;
    button.click();
    return `disabledAfterFirstClick=${String(disabledAfterFirst)}`;
  });
  await page.waitForTimeout(2500);
  const doubled = await savePanel(page);
  console.log(`[act4b] HUD two clicks inside one gate window :: ${doublePress}`);
  console.log(`[act4b] HUD after the double press :: [${doubled.kind}] ${doubled.status} | list ${doubled.list}`);

  /* --- 4c. An older save over a newer prison ------------------------ */
  // Run on well past the save, press Load, and see which tick comes back and
  // whether anything warned that the play since the save was about to go.
  await transport(page, 2).click();
  await page.waitForTimeout(200);
  await transport(page, 2).click();
  const onStarted = Date.now();
  const savedTick = await kernelTick(page);
  for (;;) {
    const tick = await kernelTick(page);
    if (tick >= savedTick + 2_000) break;
    if (Date.now() - onStarted > 180_000) throw new Error(`stuck at tick ${tick}`);
    await page.waitForTimeout(500);
  }
  await transport(page, 0).click();
  await page.waitForTimeout(800);

  const tickBeforeLoad = await kernelTick(page);
  const stripBeforeLoad = await line(page, '.hud-strip');
  const panelBeforeLoad = await savePanel(page);
  console.log(`[act4c] STATE tick before pressing Load = ${tickBeforeLoad} (last save was at ${savedTick})`);
  console.log(`[act4c] HUD strip before pressing Load :: ${stripBeforeLoad}`);
  console.log(`[act4c] HUD panel before pressing Load :: [${panelBeforeLoad.kind}] ${panelBeforeLoad.status} | list ${panelBeforeLoad.list}`);

  // Everything the page says between the press and the outcome. A warning, if
  // there is one, is here.
  await page.locator('.save-panel__item button', { hasText: 'Load' }).first().click();
  await page.waitForTimeout(250);
  console.log(`[act4c] HUD mid-load status :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act4c] HUD mid-load dialogs :: ${await page.evaluate(() => [...document.querySelectorAll('dialog,[role=dialog],[role=alertdialog]')].length)}`);
  await expect(page.locator('.save-panel__status')).not.toHaveText('Loading…', { timeout: 60_000 });
  await page.waitForTimeout(800);

  const tickAfterLoad = await kernelTick(page);
  const panelAfterLoad = await savePanel(page);
  console.log(`[act4c] STATE tick after Load = ${tickAfterLoad}`);
  console.log(`[act4c] STATE ticks discarded without a warning = ${tickBeforeLoad - tickAfterLoad}`);
  console.log(`[act4c] HUD after Load :: [${panelAfterLoad.kind}] ${panelAfterLoad.status}`);
  console.log(`[act4c] HUD after Load, detail :: "${panelAfterLoad.detail}"`);
  console.log(`[act4c] HUD after Load, list :: ${panelAfterLoad.list}`);
  console.log(`[act4c] HUD strip after Load :: ${await line(page, '.hud-strip')}`);
  console.log(`[act4c] HUD clock after Load :: ${await line(page, '.hud-strip__clock')}`);
  console.log(`[act4c] HUD event band after Load :: ${await line(page, '.hud__event')}`);

  /* --- 4d. Delete, then Load ---------------------------------------- */
  // The one route to "load with no save present" that a player can reach with
  // a session already running.
  await page.locator('.save-panel__item button', { hasText: 'Delete' }).first().click();
  await page.waitForTimeout(250);
  console.log(
    `[act4d] HUD dialogs while Delete runs = ${await page.evaluate(() => [...document.querySelectorAll('dialog,[role=dialog],[role=alertdialog]')].length)}`,
  );
  await page.waitForTimeout(1500);
  const afterDelete = await savePanel(page);
  console.log(`[act4d] HUD after Delete :: [${afterDelete.kind}] ${afterDelete.status} | list ${afterDelete.list}`);
  console.log(`[act4d] HUD strip after Delete :: ${await line(page, '.hud-strip')}`);
  console.log(`[act4d] HUD clock after Delete :: ${await line(page, '.hud-strip__clock')}`);
  console.log(`[act4d] STATE tick after Delete = ${await kernelTick(page)}`);
  console.log(`[act4d] STATE counts after Delete = ${JSON.stringify(await latestCounts(page))}`);
  console.log(`[act4d] HUD load buttons remaining = ${await page.locator('.save-panel__item button', { hasText: 'Load' }).count()}`);
  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(2000);
  console.log(`[act4d] HUD after Save now on a deleted prison :: ${JSON.stringify(await savePanel(page))}`);

  // Does the prison the panel says is gone keep running? A session that still
  // simulates and can no longer be written anywhere is a different thing from
  // a session that stopped.
  await transport(page, 1).click();
  await page.waitForTimeout(4000);
  const tickWhilePlaying = await kernelTick(page);
  await page.waitForTimeout(3000);
  const tickLater = await kernelTick(page);
  console.log(`[act4d] STATE kernel tick after pressing Play on the deleted prison: ${tickWhilePlaying} then ${tickLater}`);
  console.log(`[act4d] HUD strip while the deleted prison plays :: ${await line(page, '.hud-strip')}`);
  console.log(`[act4d] HUD clock while the deleted prison plays :: ${await line(page, '.hud-strip__clock')}`);
  console.log(`[act4d] HUD panel while the deleted prison plays :: ${JSON.stringify(await savePanel(page))}`);

  // And can a player still act on it? One admission is the cheapest gesture
  // that changes simulation state.
  await tab(page, 'overview').click();
  await page.waitForTimeout(600);
  const admit = page.locator('.hud-intake__admit');
  console.log(`[act4d] HUD admit control disabled=${await admit.getAttribute('disabled')}`);
  if ((await admit.count()) > 0 && (await admit.isEnabled())) {
    await admit.click();
    await page.waitForTimeout(2500);
    console.log(`[act4d] STATE counts after admitting into the deleted prison = ${JSON.stringify(await latestCounts(page))}`);
    console.log(`[act4d] HUD strip after admitting into the deleted prison :: ${await line(page, '.hud-strip')}`);
    console.log(`[act4d] HUD refusal band :: ${await line(page, '.hud__refusal')}`);
  }
});
