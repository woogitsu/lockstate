import { DEFAULT_LOCALE } from '../../src/content/localization';
import { SimulationEventLog } from '../../src/simulation/events';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import {
  DEFAULT_INCIDENT_RESPONSE_POLICY,
  IncidentResponseSystem,
} from '../../src/simulation/incidents/response-system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { resolveHudLabelParameters } from '../../src/ui/hud/label-parameters';
import type { HudAlertViewModel, HudViewModel } from '../../src/ui/hud';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { EVENT_BAND_DWELL_FLOOR_MS } from '../../src/ui/hud/event-band-dwell';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import {
  deliverAsTheWorkerWould,
  expectNeverPainted,
  expectPaintedFor,
  installBandRecorder,
  letFramesRun,
  readBandRecording,
  writesOf,
} from './alert-dwell';
import { expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **Does the escape sentence survive a frame?**
 * ([#700](https://github.com/matmaxalez/lockstate/issues/700).)
 *
 * `tests/integration/escape-outcome-visibility.test.ts` proves the sentence is
 * *produced*, and it was already proving that on the day #700 was filed. What
 * no test could express is the property that actually failed: **the sentence
 * was written correctly three times and reached zero animation frames**,
 * because an all-clear recorded on the same tick replaced it 1 ms later. A
 * test that reads the DOM after the event reads the replacement and passes.
 *
 * This file measures survival instead, with `tests/browser/alert-dwell.ts`.
 * Its header carries the mechanism; the three arms here are what make the
 * instrument trustworthy:
 *
 * - **The escape, as `main` produces it today.** A real
 *   `IncidentResponseSystem` lapses a real escape attempt with no guards, the
 *   production translators turn its events into view models, and they are
 *   delivered into the page the way the worker delivers them. The sentence has
 *   to be on screen at the end.
 * - **The same run with the tick's all-clear put back, and what the band does
 *   with it now.** That is the v0.0.273 stream. Until ADR 0084 decision 4's
 *   dwell floor (`src/ui/hud/event-band-dwell.ts`), the instrument caught it
 *   as a defect -- written, never painted -- and this arm asserted exactly
 *   that, as a permanent proof that `expectNeverPainted` could see a real
 *   displacement rather than passing on an empty recording. **The floor
 *   changes what a correct band does with this stream, so this arm now
 *   asserts the corrected shape instead: both sentences painted, in order,
 *   the escape first.** `expectNeverPainted`'s own credibility does not rest
 *   on this arm alone -- the guard test below still proves it refuses a
 *   sentence that was never written -- so repointing this arm at the fix
 *   loses no coverage of the instrument itself.
 * - **The instrument's own vacuity guards**, each exercised: a selector that
 *   matches nothing, a read with no recorder, and a recording of a band nobody
 *   wrote to.
 *
 * ## What this covers that `pnpm test` cannot
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `hud.ts`'s
 * `applyEventNotice` -- the function that writes the band -- is unreachable
 * there, and an animation frame does not exist at all. Every claim below is
 * about frames.
 *
 * ## What it does not cover
 *
 * The worker `postMessage` itself. The events are carried into the page by
 * Playwright rather than by a `Worker`, exactly as
 * `ui-relocation-notice.spec.ts` does it and for the same reason;
 * `workerToMainMessageSchema.parse` is what stands in for the boundary. What
 * *is* reproduced faithfully is the **delivery shape** -- one view model per
 * task -- because that is the half the defect turns on.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** The band `hud.ts` builds for `HudEventNoticeViewModel`. Laid out at every viewport, which is why it is the surface this measures. */
const BAND = '.hud__event';

/** Distinct from the ids the incident suites use, so no shared fixture can make a result here true by accident. */
const INCIDENT_ID = 'incident-escape-700';

/** `IncidentTriggerSystem` never gives an escape attempt more than one participant. */
const ESCAPER: EntityId = 3 as EntityId;

/** The lowest severity `tryOpenEscapeAttempt` can produce; `requiredResponderCount(6)` is 3, and this run hires none. */
const SEVERITY = 6;

/** Cell index avoiding `buildCellBlockFixture`'s `i % 5 === 0` medical gating and `i % 7 === 0` closed doors. */
const OPEN_CELL_INDEX = 1;

/** Past `responseDeadlineTicks` (600) with room to spare, so the attempt has lapsed or the fixture fails loudly. */
const RUN_TICKS = 2_000;

/** The name the departure port answers with, so the sentence has two halves to assemble through `hud.regime.roster-name`. */
const ESCAPER_NAME = { givenName: 'Ada', familyName: 'Bell' } as const;

/**
 * How long the recorder is left running after the last write.
 *
 * Generous on purpose. The floor asserted below is well under it, so a slow or
 * contended machine costs frames without costing the assertion -- what the
 * assertion is for is a sentence *displaced*, which loses every frame however
 * fast the machine is.
 */
const FRAME_WINDOW_MS = 600;

/** What this file is willing to call "a player could have read it". Roughly fifteen frames at 60 Hz. */
const SEEN_MS = 250;

/**
 * How long to let the recorder run when the assertion needs the dwell floor to
 * have actually lapsed -- as opposed to `FRAME_WINDOW_MS`, which only needs
 * enough frames to measure a span that is not going anywhere.
 *
 * `EVENT_BAND_DWELL_FLOOR_MS` plus half again, read from
 * `src/ui/hud/event-band-dwell.ts` rather than restated, so a change to the
 * floor's duration cannot silently make this window too short and turn a
 * flaky test into a false pass. The margin is for `setTimeout` jitter on a
 * shared, loaded machine, which only ever fires *late*, never early -- so a
 * generous window costs wall-clock time and nothing else.
 */
const FLOOR_LAPSE_WINDOW_MS = Math.round(EVENT_BAND_DWELL_FLOOR_MS * 1.5);

/**
 * A real prison losing a real prisoner, and the events it recorded.
 *
 * The wiring is `tests/integration/escape-outcome-visibility.test.ts`'s, kept
 * deliberately identical: a real `NavigationSystem`, a real `GuardRoster` with
 * nobody in it, a real `SecuritySectorRegistry` and the real
 * `SimulationEventLog`. Nothing about the sentence is written down here -- it
 * comes off the production catalogue at the end.
 *
 * `alsoRecordTheAllClear` reconstructs the **pre-ruling-6** stream, through the
 * same production recorder rather than a hand-shaped event: before #703 ruling
 * 6, `reportAllClearIfCalm` called `recordIncidentsAllClear` on this very tick,
 * because the escape's own lapse is what left `openIncidentCount` at zero.
 */
function escapeEvents(alsoRecordTheAllClear: boolean): readonly SimulationEvent[] {
  const cellBlock = buildCellBlockFixture(8);
  const navigation = new NavigationSystem(
    cellBlock.world,
    { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 },
    cellBlock.doors,
  );
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const sectors = new SecuritySectorRegistry(cellBlock.doors);
  sectors.register({
    id: 'block-a',
    gradeId: 'grade.general',
    doorIds: [`cell-door-${String(OPEN_CELL_INDEX)}`],
    postTile: cellBlock.cellTiles[OPEN_CELL_INDEX]!,
  });

  const incidents = new IncidentLog();
  const events = new SimulationEventLog();
  const response = new IncidentResponseSystem(
    incidents,
    sectors,
    // Nobody to dispatch, which is the whole input: the attempt lapses at the
    // response deadline and ADR 0061 decision 5 takes the prisoner away.
    new GuardRoster(64),
    navigation,
    events,
    DEFAULT_INCIDENT_RESPONSE_POLICY,
    undefined,
    () => [],
    () => ({ name: ESCAPER_NAME }),
  );

  const kernel = new Kernel();
  kernel.registerSystem(navigation);
  kernel.registerSystem(response);

  // The order `IncidentTriggerSystem.openIncident` does it in: the record
  // first, then the event, at the same tick.
  incidents.open(
    { id: INCIDENT_ID, type: 'escape-attempt', sectorId: 'block-a', participantIds: [ESCAPER], severity: SEVERITY, causeFactors: [] },
    0,
  );
  events.recordIncidentOpened('escape-attempt', 1, 0);

  for (let tick = 0; tick < RUN_TICKS && incidents.openIncidentCount > 0; tick += 1) kernel.step();

  const incident = incidents.get(INCIDENT_ID);
  if (incident?.outcome?.escaped !== true) {
    throw new Error('the fixture did not lose a prisoner, so there is no escape sentence to measure');
  }

  if (alsoRecordTheAllClear) {
    // The same tick the escape was recorded on. That is not a choice this
    // fixture makes -- it is what `reportAllClearIfCalm` did, and the tick is
    // read off the escape event rather than assumed.
    const escape = events.since(0).find((event) => event.type === 'incidents.escape-succeeded');
    if (escape === undefined) throw new Error('a prisoner left and no sentence was recorded');
    events.recordIncidentsAllClear(escape.tick);
  }

  return events.since(0);
}

/** The event as it reaches the main thread: through the protocol schema, so a payload the boundary would reject cannot reach an assertion. */
function publication(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000700',
    kind: 'simulation/event',
    payload: { tick: event.tick + 1, event },
  }) as WorkerToMainMessage;
}

/** A prison's worth of view model around the two fields this file is about. */
function viewModelWith(event: HudViewModel['event'], alerts: readonly HudAlertViewModel[]): HudViewModel {
  return {
    counts: {
      prisoners: 13,
      prisonerCapacity: 2,
      occupiedPlaces: 2,
      staff: 0,
      rooms: 1,
      prisonersCovered: 0,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 13,
      prisonersHighRisk: 13,
      activeIncidents: 0,
      contrabandFound: 0,
      treasuryMinorUnits: 29_620,
      stateIncomeAccruedTodayMinorUnits: 0,
    },
    clock: { day: 21, tickOfDay: 611, dayLengthTicks: 2_400, mode: 'running', speed: 4 },
    alerts,
    ...(event === undefined ? {} : { event }),
  };
}

/**
 * The whole main-thread chain, run in this process: every event through the
 * protocol schema, both translators, and one view model per event.
 *
 * One per event and not one at the end, because that is what `src/main.ts`
 * does -- `client.addListener` rebuilds `viewModel` and calls `hud.update` on
 * every message. Collapsing them would delete the race this file measures.
 */
function viewModelsFor(events: readonly SimulationEvent[]): readonly HudViewModel[] {
  let alerts: readonly HudAlertViewModel[] = [];
  let event: HudViewModel['event'];
  const models: HudViewModel[] = [];
  for (const recorded of events) {
    const message = publication(recorded);
    alerts = hudEventAlertsFromWorkerMessage(message, alerts) ?? alerts;
    const notice = hudEventNoticeFromWorkerMessage(message);
    if (notice === undefined || notice === 'none') throw new Error(`${recorded.type} produced no notice to paint`);
    event = notice;
    models.push(viewModelWith(event, alerts));
  }
  return models;
}

/** What a player reads, resolved through the shipped catalogue rather than restated here. */
function sentenceFor(events: readonly SimulationEvent[], type: SimulationEvent['type']): string {
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
  const recorded = events.find((event) => event.type === type);
  if (recorded === undefined) throw new Error(`the run recorded no ${type}`);
  const notice = hudEventNoticeFromWorkerMessage(publication(recorded));
  if (notice === undefined || notice === 'none') throw new Error(`${type} produced no notice`);
  return localizer.format(notice.labelKey, resolveHudLabelParameters((key, values) => localizer.format(key, values), notice));
}

test.describe('the escape sentence has to survive a frame (#700)', () => {
  // 1280x800: the wide viewport, where the alerts list exists as well, so a
  // failure here cannot be blamed on the fold. The band is laid out at every
  // viewport by design and `ui-relocation-notice.spec.ts` already measures it
  // at 375x812.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('is still on the screen after the tick that produced it, on `main`', async ({ page }) => {
    const events = escapeEvents(false);
    const escape = sentenceFor(events, 'incidents.escape-succeeded');

    await page.goto(HARNESS_URL);
    await page.evaluate(() => {
      window.lockstateUiHarness.mountHudShell();
    });

    // Before the first write. There is no recovering a frame that has gone by,
    // which is exactly why this defect was invisible to the suite.
    await installBandRecorder(page, BAND);
    await deliverAsTheWorkerWould(page, viewModelsFor(events));
    await letFramesRun(page, FRAME_WINDOW_MS);
    const recording = await readBandRecording(page);

    // The premise, in the prison's own terms: without it this would pass for a
    // run that never lost anybody and therefore never had a sentence to lose.
    expect(escape, 'the owner`s sentence, off the shipped catalogue').toBe(
      'Ada Bell broke out — no guard reached them in time.',
    );
    expect(escape, 'an unfilled placeholder is what a nested parameter fails as').not.toContain('{');

    // The assertion #700 was filed for the absence of.
    expectPaintedFor(recording, escape, SEEN_MS, 'the escape sentence');

    // And it is the *last* thing the band said, not merely something it said
    // on the way past -- the property that makes the sentence readable at all.
    expect(recording.spans.at(-1)?.text, 'the band ended the run saying something else').toBe(escape);
    expect(recording.spans.at(-1)?.severity, 'and in the band the owner graded it').toBe('danger');
  });

  test('the dwell floor keeps the escape sentence on screen through the same-tick all-clear (ADR 0084 decision 4)', async ({
    page,
  }) => {
    /*
     * **The same reconstructed stream this test used as a control before the
     * floor existed, now exercising the floor instead.** `#703` ruling 6
     * (`src/simulation/incidents/response-system.ts`) already stops *this
     * exact* incident from producing the collision on `main` -- that is arm 1
     * above -- but Finding 4 of ADR 0084 also found the collision reachable
     * through two *different* incidents closing on one tick
     * (`simulation-events.ts:297-304`'s own count of same-tick pairs), which
     * ruling 6's single-incident guard cannot see. `alsoRecordTheAllClear`
     * reconstructs that shape directly, deliberately bypassing ruling 6, so
     * this arm is a test of the band's own defence -- the dwell floor -- and
     * not of the one kernel path ruling 6 happens to guard.
     */
    const events = escapeEvents(true);
    const escape = sentenceFor(events, 'incidents.escape-succeeded');
    const allClear = sentenceFor(events, 'incidents.all-clear');

    // The premise: the two really are on one tick, so the only thing standing
    // between the escape sentence and instant displacement is the floor this
    // test exists to prove -- not a gap in the stream that would let it
    // survive on timing alone.
    const escapeTick = events.find((event) => event.type === 'incidents.escape-succeeded')?.tick;
    const allClearTick = events.find((event) => event.type === 'incidents.all-clear')?.tick;
    expect(allClearTick, 'the reconstructed all-clear shares the escape`s tick, which is the whole mechanism').toBe(
      escapeTick,
    );

    await page.goto(HARNESS_URL);
    await page.evaluate(() => {
      window.lockstateUiHarness.mountHudShell();
    });

    await installBandRecorder(page, BAND);
    await deliverAsTheWorkerWould(page, viewModelsFor(events));
    // Long enough for the floor to actually lapse and release the held
    // all-clear, not merely long enough to sample a few frames -- the claim
    // below is about what happens *after* the floor, not only during it.
    await letFramesRun(page, FLOOR_LAPSE_WINDOW_MS);
    const recording = await readBandRecording(page);

    // The finding this amendment closes: the escape sentence is on screen,
    // for a real stretch a player could read, rather than reaching zero
    // frames the way it did before the floor existed.
    expectPaintedFor(recording, escape, SEEN_MS, 'the escape sentence, held by the floor');

    // The all-clear was not dropped either -- it waited, and the floor
    // released it once it lapsed, exactly as `event-band-dwell.ts` documents.
    expectPaintedFor(recording, allClear, SEEN_MS, 'the all-clear, released once the floor lapsed');

    // And the order is the one a player actually lived through: the escape
    // first, the all-clear after -- never the reverse, which is what "the
    // older sentence is never shown after the newer one" means in practice.
    const escapeSpan = recording.spans.find((span) => span.text === escape);
    const allClearSpan = recording.spans.find((span) => span.text === allClear);
    expect(escapeSpan, 'the escape sentence never reached a span at all').toBeDefined();
    expect(allClearSpan, 'the all-clear sentence never reached a span at all').toBeDefined();
    expect(
      escapeSpan!.firstFrameAt,
      'the all-clear was painted before the escape it was supposed to wait behind',
    ).toBeLessThan(allClearSpan!.firstFrameAt);

    // And the all-clear is the last thing the band says once the floor has
    // lapsed -- nothing is left waiting forever.
    expect(recording.spans.at(-1)?.text, 'the band did not end the run on the released all-clear').toBe(allClear);
  });

  test('a more severe event still takes the band immediately, with no floor-imposed delay (ADR 0084 decision 4)', async ({
    page,
  }) => {
    /*
     * The other half of the owner's ruling: the floor protects a sentence
     * from an *equal or less severe* one, never from a more severe one. Two
     * synthetic events stand in for the real kernel here -- unlike the arms
     * above, what matters is the severity gap between them
     * (`EVENT_PRESENTATION` in `src/ui/simulation-events.ts`), not any
     * particular incident -- an `info` discharge, then a `danger` riot,
     * delivered back to back the way `deliverAsTheWorkerWould` always
     * delivers, which is well inside any floor a discharge could have armed.
     */
    const discharged: SimulationEvent = { sequence: 1, tick: 100, type: 'prisoners.discharged', count: 2 };
    const riot: SimulationEvent = { sequence: 2, tick: 100, type: 'incidents.riot-opened', participantCount: 12 };
    const events = [discharged, riot];
    const discharge = sentenceFor(events, 'prisoners.discharged');
    const riotSentence = sentenceFor(events, 'incidents.riot-opened');

    await page.goto(HARNESS_URL);
    await page.evaluate(() => {
      window.lockstateUiHarness.mountHudShell();
    });

    await installBandRecorder(page, BAND);
    await deliverAsTheWorkerWould(page, viewModelsFor(events));
    // Deliberately short, and well under the floor: if the riot had to wait
    // for the discharge's floor to lapse, it could not yet have reached
    // `SEEN_MS` of dwell inside this window, and the assertion below would
    // fail rather than merely running long enough to hide a delay.
    await letFramesRun(page, SEEN_MS + 100);
    const recording = await readBandRecording(page);

    expect(EVENT_BAND_DWELL_FLOOR_MS, 'the window below has to be comfortably under the floor to prove immediacy').toBeGreaterThan(
      SEEN_MS + 100,
    );

    // The riot reached the band and stood long enough to count as seen,
    // inside a window too short to have waited out the discharge's floor --
    // the only way that is possible is that severity promoted it at once.
    expectPaintedFor(recording, riotSentence, SEEN_MS, 'the riot, which must outrank the discharge already on the line');

    // And it is the last thing the band says, not a flash that the discharge
    // then reclaimed -- a `danger` sentence does not lose the line back to an
    // `info` one still within its own floor.
    expect(recording.spans.at(-1)?.text, 'the discharge displaced the riot that is supposed to outrank it').toBe(
      riotSentence,
    );

    // The discharge was real and was written -- this is a promotion, not a
    // suppression of the first event, which is a different feature.
    expect(writesOf(recording, discharge), 'the discharge was never written, so nothing was actually promoted past').toBeGreaterThan(0);
  });

  test('an instrument that observed nothing fails instead of passing', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => {
      window.lockstateUiHarness.mountHudShell();
    });

    // Guard 1: a selector that matches nothing. A recording of it would be
    // empty, and an empty recording satisfies a careless assertion.
    await expect(installBandRecorder(page, '.hud__event-that-does-not-exist')).rejects.toThrow(/nothing matches/);

    // Guard 2: reading before installing. Answering an empty recording here
    // would turn a harness mistake into a finding about the product.
    await expect(readBandRecording(page)).rejects.toThrow(/no recorder installed/);

    // Guard 3: a real recorder over a band nobody wrote to. Frames accumulate,
    // writes do not, and every assertion built on it has to refuse.
    await installBandRecorder(page, BAND);
    await letFramesRun(page, FRAME_WINDOW_MS);
    const idle = await readBandRecording(page);

    expect(idle.frameCount, 'the page produced no animation frames, so this control cannot make its point').toBeGreaterThanOrEqual(2);
    expect(idle.writes, 'nothing was delivered, so nothing should have been written').toEqual([]);
    expect(
      () => {
        expectPaintedFor(idle, 'Ada Bell broke out — no guard reached them in time.', SEEN_MS, 'a band nobody wrote to');
      },
      'expectPaintedFor passed against a recording with no writes in it',
    ).toThrow(/nothing wrote to/);

    /*
     * Guard 4, and it needs a recording with real writes in it: on the idle
     * recording above every assertion refuses at guard 3, which proves guard 3
     * and nothing else. So this one delivers a real escape, and then asks both
     * assertions about a sentence the prison never said.
     *
     * That is the shape a regression test for #700 rots into if nothing stops
     * it -- rename the escape's message key, and a control asserting "the
     * escape sentence never reached a frame" starts passing for the best
     * possible reason and the worst possible one at once.
     */
    await installBandRecorder(page, BAND);
    await deliverAsTheWorkerWould(page, viewModelsFor(escapeEvents(false)));
    await letFramesRun(page, FRAME_WINDOW_MS);
    const busy = await readBandRecording(page);

    expect(busy.writes.length, 'the band was written to, so guard 3 is satisfied and guard 4 is what answers next').toBeGreaterThan(0);
    const neverSaid = 'a sentence this prison never said';
    expect(
      () => {
        expectPaintedFor(busy, neverSaid, SEEN_MS, 'a sentence nobody produced');
      },
      'expectPaintedFor passed for a sentence that was never written',
    ).toThrow(/reached 0 animation frames/);
    expect(
      () => {
        expectNeverPainted(busy, neverSaid, 'a sentence nobody produced');
      },
      'expectNeverPainted passed for a sentence that was never written, which is true of every string',
    ).toThrow(/was never written to the band/);
  });
});
