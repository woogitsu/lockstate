import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  buildAndPopulate,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **Contraband, played.** It has an ADR (0073), a document
 * (`docs/CONTRABAND.md`), a five-entry catalogue, an intelligence ledger, a
 * confiscation ledger, four search policies, a search system with real
 * navigation, and a whole projection route -- and nobody in this repository
 * has ever sat in front of the game and asked what a *player* gets out of it.
 *
 * The three questions, in a player's words:
 *
 * 1. Does contraband happen on its own, and do I notice?
 * 2. Can I do anything about it -- order a search, spend a guard, choose?
 * 3. Does any of it reach the screen, and does it change anything?
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file. Run one
 * act at a time, on your own port:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5329 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-05-contraband.playtest.ts -g "act 1"
 * ```
 *
 * ## The natural experiment act 1 runs, and why it is one prison rather than two
 *
 * `SectorSearchDutySystem` (`src/simulation/contraband/sector-search-duty.ts`)
 * orders a sweep only when **both** (1) a guard is assigned to the sector and
 * (2) `claimableGuardIds(...).length >= policy.requiredGuardCount`. The default
 * sector requires exactly one guard
 * (`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1`,
 * `src/simulation/security/default-sector.ts:113`) and the sector search policy
 * requires one claimable guard (`default-search-policies.ts`, `sector`). So:
 *
 * - **one** guard -> it posts, the claimable pool is empty, nothing is ever
 *   searched;
 * - **two** guards -> one posts, one is spare, sweeps run every 600 ticks.
 *
 * That is the whole comparison ADR 0073 predicts ("a prison that hires exactly
 * its posted requirement finds nothing, and the first hire past it is what
 * makes contraband findable"), and it can be run *inside one prison* by hiring
 * the second guard partway. Same seed, same prisoners, same items -- which two
 * separate prisons could not give, because nothing in the UI seeds a session.
 *
 * ## Two channels, kept apart
 *
 * Sentences come from `.hud` `innerText`. Numbers come from the worker tee.
 * The third channel this file adds is the **projection probe**: an init script
 * that keeps the `Worker` instance and records `simulation/projection` replies,
 * so act 2 can ask the running worker for `hud/contraband` -- the route
 * `src/simulation/worker/projection-catalog.ts:406` publishes and no file under
 * `src/ui/` ever requests -- and print what a panel would have had to draw.
 */

const CONTRABAND_METRIC = '.hud-strip [data-metric="contraband"]';

interface ProbeWindow {
  __lsWorker?: Worker;
  __lsProjections?: unknown[];
}

/**
 * A second `Worker` wrapper, registered *after* `installTee`.
 *
 * The tee deliberately drops `simulation/projection` from its received array
 * ("only the small messages, so the array cannot grow without bound"), which is
 * exactly the message this file needs. Registering after it means `window.Worker`
 * is already `TeeWorker` when this runs, so the tee keeps working and this
 * subclass sits on top of it.
 */
async function installProjectionProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Base = window.Worker;
    const captured: unknown[] = [];
    class ProbeWorker extends Base {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as ProbeWindow).__lsWorker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const kind = (event.data as { kind?: string })?.kind ?? '';
          if (kind !== 'simulation/projection' && kind !== 'protocol/error') return;
          captured.push(event.data);
          while (captured.length > 80) captured.shift();
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as unknown as ProbeWindow).__lsProjections = captured;
  });
}

/** Asks the live worker for a projection the HUD never asks for, and answers the reply. */
async function pullProjection(page: Page, projectionId: string, messageId: string): Promise<unknown> {
  const posted = await page.evaluate(
    ([id, mid]) => {
      const probe = window as unknown as ProbeWindow;
      /*
       * `length = 0`, NOT `= []`. The capture array is a closure variable
       * inside the init script and `window.__lsProjections` is the *same*
       * array; assigning a fresh one here orphans the listener's target and
       * every pull answers `[]` for ever. Measured, on the first run of act 1.
       */
      const captured = probe.__lsProjections;
      if (captured !== undefined) captured.length = 0;
      if (probe.__lsWorker === undefined) return 'no worker captured';
      probe.__lsWorker.postMessage({
        protocolVersion: 1,
        messageId: mid,
        kind: 'simulation/request-projection',
        payload: { projectionId: id },
      });
      return 'posted';
    },
    [projectionId, messageId],
  );
  await page.waitForTimeout(2500);
  /*
   * Filtered by `replyTo`, because the HUD is pulling its own routes at the
   * same time: with the Security tab open the app requests `hud/staff` and
   * `hud/held-guards` about once a second, and the first run of this file lost
   * every contraband reply to those inside a six-deep buffer.
   */
  const replies = await page.evaluate(
    (mid) => ((window as unknown as ProbeWindow).__lsProjections ?? []).filter((message) => (message as { replyTo?: string }).replyTo === mid),
    messageId,
  );
  return { posted, replies };
}

interface ContrabandEventRow {
  readonly tick: number;
  readonly type: string;
  readonly categoryNameKey: string | undefined;
  readonly restored: boolean | undefined;
}

/** Every `simulation/event` the worker has published, flattened. */
async function events(page: Page): Promise<readonly ContrabandEventRow[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const payload = (message as { payload: { tick: number; event: Record<string, unknown>; restored?: boolean } }).payload;
        return {
          tick: payload.tick,
          type: String(payload.event['type']),
          categoryNameKey: payload.event['categoryNameKey'] as string | undefined,
          restored: payload.restored,
        };
      }),
  );
}

/** The contraband chip, exactly as it is painted: label, number and any badge. */
async function contrabandChip(page: Page): Promise<string> {
  return page.evaluate((selector) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (node === null) return 'ABSENT';
    if (node.getClientRects().length === 0) return 'not laid out';
    return `${(node.innerText ?? '').replace(/\n/g, ' / ')} [tone=${node.dataset['tone'] ?? 'none'}]`;
  }, CONTRABAND_METRIC);
}

/** A cheap, stable digest of the world canvas, so "did anything get drawn" is a number. */
async function canvasDigest(page: Page): Promise<string> {
  const shot = await page.locator('#game-root canvas').screenshot();
  let hash = 0;
  for (const byte of shot) hash = (hash * 31 + byte) >>> 0;
  return `${shot.byteLength}b/${hash.toString(16)}`;
}

async function sample(page: Page, label: string): Promise<void> {
  const tick = await currentTick(page);
  const counts = await latestCounts(page);
  console.log(
    `[contraband] ${label} tick=${tick} chip=${JSON.stringify(await contrabandChip(page))}` +
      ` staff=${counts?.staff} prisoners=${counts?.prisoners} highRisk=${counts?.prisonersHighRisk}`,
  );
}

/** Runs the clock forward to `target`, sampling the strip and the alerts on the way. */
async function runSampling(page: Page, target: number, label: string, everyMs = 20_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) {
      await sample(page, `${label} reached`);
      return;
    }
    if (Date.now() - started > 480_000) throw new Error(`stuck at tick ${tick}, wanted ${target}`);
    await sample(page, label);
    await page.waitForTimeout(everyMs);
  }
}

test.describe('contraband, played', () => {
  test('act 1 — one guard, then two, then three', async ({ page }) => {
    test.setTimeout(1_800_000);
    await installTee(page);
    await installProjectionProbe(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 1, label: 'contraband' });

    const phase = async (label: string, target: number, probeId: string): Promise<void> => {
      console.log(`[contraband] === PHASE ${label} ===`);
      await runSampling(page, target, label);
      const rows = await events(page);
      console.log(`[contraband] phase ${label} events: ${JSON.stringify(rows)}`);
      console.log(`[contraband] phase ${label} discoveries: ${JSON.stringify(rows.filter((r) => r.type === 'contraband.discovered'))}`);
      console.log(`[contraband] phase ${label} strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
      console.log(`[contraband] phase ${label} staff panel: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
      console.log(`[contraband] phase ${label} hud/contraband: ${JSON.stringify(await pullProjection(page, 'hud/contraband', probeId))}`);
      console.log(`[contraband] phase ${label} canvas: ${await canvasDigest(page)}`);
    };

    const hireGuard = async (): Promise<number> => {
      await tab(page, 'security').click();
      const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
      if ((await guardRow.count()) > 0) await guardRow.first().click();
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(2500);
      const tick = await currentTick(page);
      console.log(`[contraband] hired a guard at tick ${tick}: staff=${(await latestCounts(page))?.staff}`);
      return tick;
    };

    // A: one guard. Required is `ceil(population / 8)` = 2 at twelve prisoners
    // (`DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8`,
    // `src/simulation/security/sector-staffing.ts:147`), so the sector is
    // understaffed and nothing is claimable.
    await phase('A-one-guard', 11_000, 'probe.contraband.a');

    // B: two guards -- the requirement exactly met, which is what the Staff
    // panel asks the player for and calls "Covered". Both post; the claimable
    // pool is still empty.
    const hiredSecond = await hireGuard();
    await phase('B-two-guards', 19_000, 'probe.contraband.b');

    // C: three guards -- one past the requirement, so one is spare and
    // `SectorSearchDutySystem` can finally staff a sweep.
    const hiredThird = await hireGuard();
    await phase('C-three-guards', 34_000, 'probe.contraband.c');

    const all = await events(page);
    const found = all.filter((row) => row.type === 'contraband.discovered');
    console.log(`[contraband] hires at ticks: second=${hiredSecond} third=${hiredThird}`);
    console.log(`[contraband] every contraband.discovered: ${JSON.stringify(found)}`);
    console.log(`[contraband] final chip: ${JSON.stringify(await contrabandChip(page))}`);
    console.log(`[contraband] final alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    console.log(`[contraband] final band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);

    const commandTypes = (await sentCommands(page)).map((command) => String(command['type']));
    const histogram: Record<string, number> = {};
    for (const type of commandTypes) histogram[type] = (histogram[type] ?? 0) + 1;
    console.log(`[contraband] every command this session sent: ${JSON.stringify(histogram)}`);

    expect(await currentTick(page)).toBeGreaterThan(33_000);
  });

  test('act 2 — the whole surface a player can see, swept', async ({ page }) => {
    test.setTimeout(1_800_000);
    await installTee(page);
    await installProjectionProbe(page);
    await openApp(page);

    // Three guards at twelve prisoners: two post, one is spare, so sweeps run
    // and the sweep is what puts anything on the screen to sweep for.
    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 3, label: 'contraband-surface' });
    await runSampling(page, 30_000, 'S');

    const found = (await events(page)).filter((row) => row.type === 'contraband.discovered');
    console.log(`[contraband] discoveries before the sweep: ${JSON.stringify(found)}`);

    // Every tab, in full -- looking for anything contraband-shaped.
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(800);
      const text = await panelText(page, '.hud');
      const hits = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /contraband|search|seiz|confisc|smuggl|intelligen|informant|weapon|drug|phone|currency|tool/i.test(line));
      console.log(`[contraband] tab ${id}: ${text.split('\n').length} lines; contraband-shaped lines = ${JSON.stringify(hits)}`);
    }

    // Every control the HUD offers, so "there is no Search button" is an
    // enumeration rather than an assertion.
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(600);
      const controls = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud button, .hud input, .hud select, .hud [role="button"]')]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => `${node.tagName.toLowerCase()}:${(node.innerText || node.getAttribute('aria-label') || node.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 44)}`),
      );
      console.log(`[contraband] tab ${id} controls (${controls.length}): ${JSON.stringify(controls)}`);
    }

    await tab(page, 'security').click();
    await page.waitForTimeout(600);
    console.log(`[contraband] security tab, whole HUD text:\n${await panelText(page, '.hud')}`);

    // The alert rows themselves: what a contraband find leaves behind, and
    // whether a player can retire it (ADR 0084 decision 3).
    const alertRows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')].map((row) => ({
        id: row.dataset['alert'] ?? '',
        dismissible: row.dataset['alertDismissible'] ?? 'absent',
        text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
      })),
    );
    console.log(`[contraband] alert rows: ${JSON.stringify(alertRows)}`);
    console.log(`[contraband] chip: ${JSON.stringify(await contrabandChip(page))}`);
    console.log(`[contraband] band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);

    // The orphaned route, from a prison that has found something -- everything
    // a contraband panel would have had to draw, published and drawn by nothing.
    console.log(`[contraband] hud/contraband: ${JSON.stringify(await pullProjection(page, 'hud/contraband', 'probe.surface.contraband'))}`);
    console.log(`[contraband] hud/held-guards: ${JSON.stringify(await pullProjection(page, 'hud/held-guards', 'probe.surface.held'))}`);

    expect(await currentTick(page)).toBeGreaterThan(29_000);
  });
});
