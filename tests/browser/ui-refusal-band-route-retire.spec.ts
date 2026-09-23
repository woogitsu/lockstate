import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationRefusal,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { editHistoryAvailability } from '../../src/simulation/construction/handler';
import type { HudAlertViewModel, HudRefusalNoticeViewModel, HudViewModel } from '../../src/ui/hud';
import { hudAlertsFromWorkerMessage, hudRefusalFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **ADR 0091 decision 2, option F, on the screen**: the refusal band retires
 * its sentence when a **decided outcome of the same command route** arrives,
 * and leaves it alone for every other route.
 *
 * The owner ruled this on 2026-09-16. The provenance is the weaker of the two
 * kinds this repository distinguishes -- the label of a clickable option a
 * session wrote, *"F -- ta sama trasa (zalecane)"*, not a sentence they typed
 * -- and what was agreed is the **rule**, not any of the implementation under
 * it. `docs/adr/0091-what-clears-the-refusal-band.md`'s Status block says both
 * in those terms and is the thing to read before changing any of this.
 *
 * ## Why a browser, and why `pnpm test` cannot cover it
 *
 * The rule is one condition in `applySimulationRefusal`
 * (`src/ui/hud/hud.ts`), and `vitest.config.ts` is `environment: 'node'` with
 * no jsdom, so `hud.ts` is not merely untested headlessly -- it is
 * **unreachable**. `tests/unit/simulation-refusals.test.ts` pins where the
 * comparison is made, `tests/unit/worker-status-counts.test.ts` pins that the
 * publication gate opens for it, and `tests/unit/ui-simulation-alerts.test.ts`
 * pins that the translator forwards it. None of those can say whether the
 * corner ever goes away, which is the whole of what the owner ruled.
 *
 * ## The prison is real and it is built in this process
 *
 * A Playwright spec runs in Node and may import `src/**`. So nothing below is
 * a hand-written notice: a real `SimulationRuntime` refuses a real command,
 * the standing `SimulationRefusal` is read off the session's own `RefusalLog`,
 * carried through the production wire schema, and turned into a view model by
 * the production translator. Only the finished `HudViewModel` crosses into the
 * page, which is exactly what `src/main.ts` puts there.
 *
 * **What is therefore not covered here** is the `Worker` `postMessage` itself;
 * `workerToMainMessageSchema.parse` stands in for it, the same guard
 * `ui-relocation-notice.spec.ts` uses for the same reason.
 *
 * ## Both surfaces, every time
 *
 * Option F's cost is that the band and the alerts list **deliberately**
 * disagree: the corner is what is happening now, the list is the record. So
 * every case below reads both. A band that emptied because the list emptied
 * too would be a different change with the same green test.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';
const SEED = 0x91;
/** Outside the single 32x32 chunk a new session owns, which is what a refused build order needs. */
const UNOWNED_TILE = { x: 100, y: 100 } as const;
const OWNED_TILE = { x: 4, y: 4 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function placeWall(runtime: SimulationRuntime, id: string, tile: { readonly x: number; readonly y: number }): void {
  submit(runtime, id, packCommand({ type: 'PlaceBuildOrder', orderId: id, definitionId: 'wall-brick', ...tile }));
}

/**
 * The `simulation/status-counts` publication the worker would send, validated
 * by the production schema.
 *
 * `counts` comes from `projectStatusCounts` against the same runtime rather
 * than being written out here: a hand-built block is a fixture that would go
 * stale the next time a count is added, and this file is not about the counts.
 */
function publication(runtime: SimulationRuntime, refusal: SimulationRefusal): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000091',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
      refusal,
      // The worker's own pair off the same runtime -- required since #1370.
      editHistory: editHistoryAvailability(runtime.construction),
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
  const notice = hudRefusalFromWorkerMessage(message, 1);
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
}

async function show(page: Page, reading: MainThreadReading): Promise<BothSurfaces> {
  await page.evaluate((model) => {
    window.lockstateUiHarness.setHudViewModel(model);
  }, viewModelWith(reading));
  return page.evaluate(() => {
    const band = window.lockstateUiHarness.refusalProbe();
    const row = window.lockstateUiHarness.alertRowProbe();
    return {
      bandVisible: band.visible,
      bandSource: band.source,
      bandText: band.text,
      bandWidth: band.width,
      rowPresent: row.present,
      rowText: row.text,
    };
  });
}

test.describe('the refusal band retires on a decided outcome of the same route (ADR 0091 decision 2, option F)', () => {
  // 1280x800: the one viewport where both surfaces exist at once, which is
  // what makes "the band emptied and the list did not" a single reading rather
  // than two runs compared. `hud.css` drops `.hud__corner` at 720px and below.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('leaves the sentence up while the player does something else, and takes it down when they repeat the route', async ({ page }) => {
    const runtime = createNewSimulationRuntime(SEED);

    // A refused build order: a wall outside every materialised chunk
    // (`build.out-of-bounds`), which is a coordinate the Build panel's
    // unbounded number fields let a player type.
    placeWall(runtime, 'refused', UNOWNED_TILE);
    expect(runtime.refusals.last?.reason, 'the scenario has to start from a real refusal').toBe('build.out-of-bounds');

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const standing = await show(page, readMainThread(runtime));
    expect(standing.bandVisible, 'the refusal never reached the band, so nothing below measures the rule').toBe(true);
    expect(standing.bandSource).toBe('simulation');
    expect(standing.bandWidth, 'a band with no box is on nobody\'s screen (#220)').toBeGreaterThan(0);
    expect(standing.rowPresent).toBe(true);
    const sentence = standing.bandText;
    expect(sentence.length, 'the band is showing an empty string').toBeGreaterThan(0);

    // **A different route, decided.** A room zoned somewhere else says
    // nothing about a wall ordered off the map, and under option D -- rejected
    // on a measured 2 ms band lifetime inside one drag -- this would already
    // have emptied the corner.
    submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 2, y: 2, width: 8, height: 8 }));
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard'), 'the zoning had to succeed to be a decided outcome').toHaveLength(1);

    const afterOtherRoute = await show(page, readMainThread(runtime));
    expect(afterOtherRoute.bandVisible, 'an unrelated gesture must not take the sentence away mid-read').toBe(true);
    expect(afterOtherRoute.bandText).toBe(sentence);

    // **The same route, decided.** A build order that is accepted, at a
    // different tile -- so #492's key misses and the log keeps the record.
    placeWall(runtime, 'accepted', OWNED_TILE);
    expect(runtime.refusals.last?.reason, 'the log must still hold the refusal: F is a band rule, not a log rule').toBe(
      'build.out-of-bounds',
    );
    expect(runtime.refusals.count, 'nothing new was refused').toBe(1);

    const afterSameRoute = await show(page, readMainThread(runtime));
    expect(
      afterSameRoute.bandVisible,
      'the player has built since; the corner names no tile, so it must stop standing beside what they just did',
    ).toBe(false);
    expect(afterSameRoute.bandSource, 'a retired band belongs to no producer').toBeNull();

    // And the half that is the cost rather than the fix: the list keeps it.
    expect(
      afterSameRoute.rowPresent,
      'the alerts list is the record and option F does not touch it -- an empty list here would be a different change',
    ).toBe(true);
    expect(afterSameRoute.rowText).toContain(sentence);
  });

  test('a refusal that arrives already marked never takes the band at all', async ({ page }) => {
    // The coalescing case, which the publication cadence makes real: the
    // counts channel is rate-limited, so a refusal and a later same-route
    // success can both land between two publications and the main thread sees
    // the marked record on its *first* sight of it. A rule that only cleared a
    // band it had previously painted would show the sentence here and never
    // take it back, because nothing republishes a new ordinal for a fact that
    // has not changed -- which is issue #777's own failure mode, one door over.
    const runtime = createNewSimulationRuntime(SEED);
    placeWall(runtime, 'refused', UNOWNED_TILE);
    placeWall(runtime, 'accepted', OWNED_TILE);
    expect(runtime.refusals.last?.routeDecidedSince, 'the scenario has to produce a marked record').toBe(true);

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const reading = await show(page, readMainThread(runtime));
    expect(reading.bandVisible).toBe(false);
    expect(reading.bandSource).toBeNull();
    expect(reading.rowPresent, 'the list still receives it on its first sight of it too').toBe(true);
  });

  test('a later refusal of any route takes the band back, so nothing is permanently muted', async ({ page }) => {
    // The mark is per record, not per session. Without that this change would
    // be a mute button: the first retirement would be the last thing the band
    // ever did.
    const runtime = createNewSimulationRuntime(SEED);
    placeWall(runtime, 'refused', UNOWNED_TILE);
    placeWall(runtime, 'accepted', OWNED_TILE);

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
