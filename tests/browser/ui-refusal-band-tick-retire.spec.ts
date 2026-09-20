import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationRefusal,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { REFUSAL_BAND_TICK_CEILING } from '../../src/simulation/refusals/refusal-band-lifetime';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import type { HudAlertViewModel, HudRefusalNoticeViewModel, HudViewModel } from '../../src/ui/hud';
import { hudAlertsFromWorkerMessage, hudRefusalFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **The refusal band retires when nothing further happens, counted in
 * simulation ticks** -- the owner's ruling of 2026-09-20, amending ADR 0091
 * and ADR 0084's amendment section 6.
 *
 * ADR 0091 decision 2 (option F) retires the band when *something* happens: a
 * decided outcome of the same command route. `ui-refusal-band-route-retire.spec.ts`
 * is that rule on the screen. This file is the complementary half, and the
 * case option F could not reach -- a refusal that nothing ever answers.
 *
 * **The provenance is the weaker of the two kinds this repository
 * distinguishes**, exactly as option F's own is: the owner did not type a
 * sentence, they chose from four clickable options the one labelled *"Tak, ale
 * liczony w tikach"* ("Yes, but counted in ticks"). What was agreed is the
 * **unit and that there is a lifetime at all**; the number is this
 * repository's, measured in `src/simulation/refusals/refusal-band-lifetime.ts`.
 * `docs/adr/0091-what-clears-the-refusal-band.md` is the thing to read before
 * changing any of this.
 *
 * ## Why ticks are the whole of the ruling, and why a browser has to say so
 *
 * A wall-clock ceiling -- what `.hud__event` has, and what ADR 0084's section
 * 6 says in terms does **not** reach this band -- would take the sentence down
 * while the game is paused, which is the one state in which a player is most
 * likely reading it. So the load-bearing assertion in this file is not that
 * the band goes away; it is that **the band goes away as a function of the
 * kernel's tick and of nothing else**, which is why every step below moves the
 * tick explicitly and nothing waits on a timer.
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `hud.ts` is
 * unreachable headlessly. `tests/unit/worker-status-counts.test.ts` pins that
 * the publication gate opens when the ceiling is crossed and
 * `tests/unit/ui-simulation-alerts.test.ts` pins that the translator marks the
 * notice; neither can say whether the corner ever goes away.
 *
 * ## The prison is real and it is built in this process
 *
 * Nothing below is a hand-written notice. A real `SimulationRuntime` refuses a
 * real command, the standing `SimulationRefusal` is read off the session's own
 * `RefusalLog`, carried through the production wire schema, and turned into a
 * view model by the production translator. Only the finished `HudViewModel`
 * crosses into the page, which is what `src/main.ts` puts there.
 *
 * ## Both surfaces, and the row
 *
 * Every case reads the band **and** the alerts list, because the cost of this
 * change is that they disagree: the corner is what is happening now, the list
 * is the record. The first case additionally measures `.hud__rail`, because
 * the grid row the band holds is what the change is *for* and a retirement
 * that gave nothing back would pass every other assertion here.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';
const SEED = 0x92;
/** Outside the single 32x32 chunk a new session owns, which is what a refused build order needs. */
const UNOWNED_TILE = { x: 100, y: 100 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function placeWall(runtime: SimulationRuntime, id: string, tile: { readonly x: number; readonly y: number }): void {
  submit(runtime, id, packCommand({ type: 'PlaceBuildOrder', orderId: id, definitionId: 'wall-brick', ...tile }));
}

/**
 * Runs the kernel forward `ticks` ticks and nothing else.
 *
 * No command, so no route decides anything and option F cannot be what retires
 * the band -- the only thing that changes between two readings here is the
 * number this ruling is counted in.
 */
function idle(runtime: SimulationRuntime, ticks: number): void {
  for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
}

/** The `simulation/status-counts` publication the worker would send, validated by the production schema. */
function publication(runtime: SimulationRuntime, refusal: SimulationRefusal): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000092',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
      refusal,
    },
  }) as WorkerToMainMessage;
}

interface MainThreadReading {
  readonly notice: HudRefusalNoticeViewModel;
  readonly alerts: readonly HudAlertViewModel[];
}

/** What `src/main.ts` would hold for the refusal standing in `runtime` right now. */
function readMainThread(runtime: SimulationRuntime): MainThreadReading {
  const refusal = runtime.refusals.last;
  if (refusal === undefined) throw new Error('nothing is standing, so there is no band state to read');
  const message = publication(runtime, refusal);
  const notice = hudRefusalFromWorkerMessage(message);
  if (notice === undefined || notice === 'none') throw new Error('the translator gave the band nothing to say');
  const alerts = hudAlertsFromWorkerMessage(message, []);
  if (alerts === undefined || alerts === 'none') throw new Error('the translator gave the list nothing to show');
  return { notice, alerts };
}

function viewModelWith(reading: MainThreadReading): HudViewModel {
  return {
    counts: {
      prisoners: 0,
      prisonerCapacity: 0,
      occupiedPlaces: 0,
      staff: 0,
      staffUnassigned: 0,
      rooms: 0,
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      prisonersHighRisk: 0,
      activeIncidents: 0,
      contrabandFound: 0,
      treasuryMinorUnits: 25_000,
      stateIncomeAccruedTodayMinorUnits: 0,
    },
    clock: { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [...reading.alerts],
    refusal: reading.notice,
  };
}

interface BothSurfaces {
  readonly bandVisible: boolean;
  readonly bandSource: string | null;
  readonly bandText: string;
  readonly bandWidth: number;
  readonly rowPresent: boolean;
  readonly rowText: string;
  /** `.hud__rail`'s laid-out height: the thing the grid row is taken from. */
  readonly railHeight: number;
}

async function show(page: Page, reading: MainThreadReading): Promise<BothSurfaces> {
  await page.evaluate((model) => {
    window.lockstateUiHarness.setHudViewModel(model);
  }, viewModelWith(reading));
  return page.evaluate(() => {
    const band = window.lockstateUiHarness.refusalProbe();
    const row = window.lockstateUiHarness.alertRowProbe();
    const rail = document.querySelector('.hud__rail');
    return {
      bandVisible: band.visible,
      bandSource: band.source,
      bandText: band.text,
      bandWidth: band.width,
      rowPresent: row.present,
      rowText: row.text,
      railHeight: rail === null ? 0 : rail.getBoundingClientRect().height,
    };
  });
}

test.describe('the refusal band retires after a tick ceiling with nothing further happening', () => {
  // 1280x800: the one viewport where both surfaces exist at once, which is
  // what makes "the band emptied and the list did not" a single reading rather
  // than two runs compared. `hud.css` drops `.hud__corner` at 720px and below.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('holds the sentence up to the ceiling and lets the row go one tick past it', async ({ page }) => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWall(runtime, 'refused', UNOWNED_TILE);
    expect(runtime.refusals.last?.reason, 'the scenario has to start from a real refusal').toBe('build.out-of-bounds');
    const refusedAt = runtime.refusals.last?.tick ?? -1;

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const standing = await show(page, readMainThread(runtime));
    expect(standing.bandVisible, 'the refusal never reached the band, so nothing below measures the rule').toBe(true);
    expect(standing.bandSource).toBe('simulation');
    expect(standing.bandWidth, "a band with no box is on nobody's screen (#220)").toBeGreaterThan(0);
    expect(standing.rowPresent).toBe(true);
    const sentence = standing.bandText;
    expect(sentence.length, 'the band is showing an empty string').toBeGreaterThan(0);

    // **One tick short of the ceiling.** The boundary is asserted from the
    // inside as well as the outside, because a rule that fired early would
    // still empty the band eventually and every "it went away" assertion in
    // this file would stay green.
    idle(runtime, REFUSAL_BAND_TICK_CEILING - 1 - (runtime.kernel.tick - refusedAt));
    expect(runtime.kernel.tick - refusedAt).toBe(REFUSAL_BAND_TICK_CEILING - 1);
    const almost = await show(page, readMainThread(runtime));
    expect(almost.bandVisible, 'the sentence is still owed its last tick').toBe(true);
    expect(almost.bandText).toBe(sentence);
    expect(almost.railHeight, 'the row is still being held, so the rail is still short').toBe(standing.railHeight);

    // **The tick that completes the count.**
    idle(runtime, 1);
    expect(runtime.kernel.tick - refusedAt).toBe(REFUSAL_BAND_TICK_CEILING);
    const retired = await show(page, readMainThread(runtime));
    expect(retired.bandVisible, 'nothing answered the refusal and the ceiling has been reached').toBe(false);
    expect(retired.bandSource, 'a retired band belongs to no producer').toBeNull();

    // **The row the change is for.** A retirement that let go of the sentence
    // without giving the grid row back would pass everything above.
    expect(
      retired.railHeight,
      'the band was lowered and `.hud__rail` got nothing back, which is the whole point of lowering it',
    ).toBeGreaterThan(standing.railHeight);

    // And the half that is the cost rather than the fix: the list keeps it.
    expect(
      retired.rowPresent,
      'the alerts list is the record and this ruling does not touch it -- an empty list here would be a different change',
    ).toBe(true);
    expect(retired.rowText).toContain(sentence);
  });

  test('a prison whose clock does not move never ages the sentence, however often it is republished', async ({
    page,
  }) => {
    // **This is the ruling, stated as the thing a wall-clock ceiling would
    // have got wrong.** A paused prison republishes the same refusal beside
    // whatever else the counts channel carries, and every one of those
    // publications is a chance for a lifetime measured in milliseconds to
    // expire under a player who is reading. The tick does not move here, so
    // nothing ages: the band is repainted, not retired.
    const runtime = createNewSimulationRuntime(SEED);
    placeWall(runtime, 'refused', UNOWNED_TILE);

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const first = await show(page, readMainThread(runtime));
    expect(first.bandVisible).toBe(true);
    const tickWhilePaused = runtime.kernel.tick;

    for (let republication = 0; republication < 20; republication += 1) {
      const again = await show(page, readMainThread(runtime));
      expect(again.bandVisible, 'a paused prison must not lose the sentence to a republication').toBe(true);
      expect(again.bandText).toBe(first.bandText);
    }
    expect(runtime.kernel.tick, 'the clock has to have stayed still for the loop above to mean anything').toBe(
      tickWhilePaused,
    );
  });

  test('a refusal whose ceiling has already passed never takes the band at all', async ({ page }) => {
    // The coalescing case, which the publication cadence makes real: the
    // counts channel is rate-limited and suppresses a publication that moves
    // no count, so the main thread's *first* sight of a refusal can already be
    // past its ceiling. A rule that only cleared a band it had previously
    // painted would show the sentence here and never take it back.
    const runtime = createNewSimulationRuntime(SEED);
    placeWall(runtime, 'refused', UNOWNED_TILE);
    idle(runtime, REFUSAL_BAND_TICK_CEILING);

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const reading = await show(page, readMainThread(runtime));
    expect(reading.bandVisible).toBe(false);
    expect(reading.bandSource).toBeNull();
    expect(reading.rowPresent, 'the list still receives it on its first sight of it too').toBe(true);
  });

  test('a later refusal takes the band back, so a retirement is a lifetime and not a mute', async ({ page }) => {
    const runtime = createNewSimulationRuntime(SEED);
    placeWall(runtime, 'refused', UNOWNED_TILE);
    idle(runtime, REFUSAL_BAND_TICK_CEILING);

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect((await show(page, readMainThread(runtime))).bandVisible).toBe(false);

    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', x: 20, y: 20, width: 8, height: 8 }));
    expect(runtime.refusals.last?.reason).toBe('unzone.nothing-to-remove');
    expect(runtime.refusals.count, 'a second refusal, so a second ordinal').toBe(2);

    const next = await show(page, readMainThread(runtime));
    expect(next.bandVisible, 'a new refusal has to reach the band the retirement emptied').toBe(true);
    expect(next.bandSource).toBe('simulation');
    expect(next.bandWidth).toBeGreaterThan(0);
  });
});
