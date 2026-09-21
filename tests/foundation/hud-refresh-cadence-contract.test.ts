import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { CLOCK_STATE_PUBLISH_INTERVAL_MS, SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { hudAlertsFromWorkerMessage, hudRefusalFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { hudClockFromWorkerMessage } from '../../src/ui/simulation-clock';
import { hudCountsFromWorkerMessage } from '../../src/ui/simulation-counts';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { hudZoningFromWorkerMessage } from '../../src/ui/simulation-zoning';
import { UNKNOWN_HUD_CLOCK } from '../../src/ui/hud/view-model';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What actually refreshes the nine pulled readouts in `src/main.ts`** — and
 * the reason it needs a gate of its own rather than a line in
 * `composition-root-contract.test.ts`.
 *
 * Issue [#718](https://github.com/matmaxalez/lockstate/issues/718) reported the
 * Regime roster frozen for a full thirty-second poll, and diagnosed it as the
 * pull layer riding `simulation/status-counts`, which is change-gated. The
 * diagnosis of that channel is exactly right and this file measures it: a
 * prison with **no occupied place** publishes `simulation/status-counts` once
 * and never again, because `stateIncomeAccruedTodayMinorUnits` is the only
 * per-tick mover among its twenty integers and it is a constant `0` while
 * nobody is housed (`src/simulation/economy/income.ts`, `stateIncomeForOccupiedPlaces`).
 *
 * **What the issue missed is that the pull layer does not ride that channel.**
 * `src/main.ts` opens *one* listener whose early return fires only when all six
 * of its translators say nothing, and `hudClockFromWorkerMessage` has no
 * "nothing changed" arm — it answers every `simulation/clock-state`, and the
 * worker posts one at most every `CLOCK_STATE_PUBLISH_INTERVAL_MS` for the life
 * of a running session. So the binding cadence is the clock heartbeat, twice
 * the rate of the counts channel and not gated on the counts at all.
 *
 * ## Why that is worth a gate
 *
 * It is load-bearing and, until this file, entirely unguarded. `src/main.ts`
 * touches `document` and `vitest.config.ts` sets `environment: 'node'` with no
 * jsdom, so the listener is unreachable from `pnpm test`
 * (`docs/AGENT_WORKFLOW.md` §2); `composition-root-contract.test.ts` pins the
 * refresh *calls* by source text but nothing pins what reaches them.
 *
 * **Measured, on this tree, over 30 simulated seconds at ×1 in a prison with
 * two furnished cells and nobody admitted: 1 counts publication, 118 clock
 * publications, 120 refresh-triggering messages, worst gap 255 ms.** Remove
 * the clock term from the predicate and nothing else — the exact mutation the
 * obvious optimisation would make, because `publishClockState` already carries
 * a tick-equality check its own docblock records as dead — and the same prison
 * refreshes **once in thirty seconds**, which is issue #718's reported symptom
 * reproduced to the second. That mutation is what this file kills.
 *
 * This gate records the cadence; it does not decide it.
 * [ADR 0086](../../docs/adr/0086-what-refreshes-a-pulled-hud-readout.md) is
 * where the decision is proposed, and if the owner picks a different heartbeat
 * this file changes with it in the same commit.
 *
 * ## What "worst gap 255 ms" above is, corrected 2026-09-02 (issue #765)
 *
 * **The sentence above is kept because it is what this file measured and what
 * it still measures. What it does not say is the two things that matter about
 * the number**, and both were established after it was written.
 *
 * **First, 255 ms is arithmetic, not an observation.** `publishClockState` can
 * only publish on a tick-loop wake, and `startTickLoop` wakes on
 * `setInterval(..., 15)`, so the first wake at which the interval has elapsed
 * is `Math.ceil(CLOCK_STATE_PUBLISH_INTERVAL_MS / 15) * 15` after the last
 * publication — `ceil(250 / 15) * 15 = 255`. It is a function of **two**
 * constants, and only one of them has a name: the wake is a bare literal in
 * `startTickLoop`, which is why `WAKE_MS` below is a hand-copied 15 rather
 * than an import. Verified by mutation rather than asserted:
 * `CLOCK_STATE_PUBLISH_INTERVAL_MS` at 200 makes `worstGapMs` report **210**,
 * which is `ceil(200 / 15) * 15`.
 *
 * **Second, in a browser it is a floor and not a bound.** PR #762
 * (`73996787d4`) ran the same scenario in a real page
 * (`tests/browser/playtest-2026-09-01-measurements-owed.playtest.ts`), four
 * runs of 30 s: **118, 118, 118, 119** requests — this file's count confirmed
 * almost exactly — but a median gap of **253–260 ms** and a tail of
 * **292.8–299.6 ms**, with 46–58 of the ~118 gaps above 260 ms. The arithmetic
 * above bounds the *worker's publication grid* under punctual timers; what a
 * player waits adds worker timer lateness, the worker's own per-wake work and
 * the main thread's delivery of the message, none of which any constant in
 * this repository bounds. So this file's 255 ms is exactly right about the
 * harness and understates a player's wait by about 18%, and the honest
 * statement of the browser figure is a sample maximum over four 30-second runs
 * on one container — not a bound. `docs/BENCHMARKING.md` is why no gate here
 * can assert the browser figure at all.
 *
 * ADR 0086 §5's *"no gap above 260 ms"* and this file's 255 ms are the **same
 * claim at two numbers** — 255 the exact arithmetic, 260 the rounded cushion
 * §5 predicted against — and the same four runs falsify both. See that ADR's
 * unsigned amendment of 2026-09-02.
 */

const MAIN_PATH = join(__dirname, '../../src/main.ts');

/** Thirty seconds of wall clock, which is the window issue #718's report names. */
const WINDOW_MS = 30_000;

/** The worker's tick loop wake, `setInterval(..., 15)` in `SimulationWorkerStateMachine`. */
const WAKE_MS = 15;

/**
 * `src/main.ts`'s listener predicate, rebuilt from the same six exported
 * translators it calls and in the same order.
 *
 * Rebuilt rather than imported, because the listener lives inside
 * `mountInterface` in a module that runs at import and reaches for `document`.
 * The textual assertions at the bottom of this file are what keep the rebuild
 * honest: they fail if `src/main.ts` stops composing these six the same way.
 */
function refreshesTheReadouts(message: WorkerToMainMessage): boolean {
  const clock = hudClockFromWorkerMessage(message, UNKNOWN_HUD_CLOCK);
  const counts = hudCountsFromWorkerMessage(message);
  const alerts = hudAlertsFromWorkerMessage(message, []);
  const zoning = hudZoningFromWorkerMessage(message);
  const refusal = hudRefusalFromWorkerMessage(message, 1);
  // `'none'` is `simulation/stopped`'s answer since #1184 -- the log comes off
  // the view model rather than being emptied -- and this translator says nothing
  // about that message, so the list it is handed is one no row is added to.
  const eventAlerts = hudEventAlertsFromWorkerMessage(message, alerts === 'none' ? [] : (alerts ?? []));
  const event = hudEventNoticeFromWorkerMessage(message);
  const nextAlerts = eventAlerts ?? alerts;
  return !(
    clock === undefined &&
    counts === undefined &&
    nextAlerts === undefined &&
    zoning === undefined &&
    refusal === undefined &&
    event === undefined
  );
}

/** The same predicate with the clock term deleted: the cadence #718 describes. */
function refreshesWithoutTheClock(message: WorkerToMainMessage): boolean {
  const counts = hudCountsFromWorkerMessage(message);
  const alerts = hudAlertsFromWorkerMessage(message, []);
  const zoning = hudZoningFromWorkerMessage(message);
  const refusal = hudRefusalFromWorkerMessage(message, 1);
  // `'none'` is `simulation/stopped`'s answer since #1184 -- the log comes off
  // the view model rather than being emptied -- and this translator says nothing
  // about that message, so the list it is handed is one no row is added to.
  const eventAlerts = hudEventAlertsFromWorkerMessage(message, alerts === 'none' ? [] : (alerts ?? []));
  const event = hudEventNoticeFromWorkerMessage(message);
  const nextAlerts = eventAlerts ?? alerts;
  return !(
    counts === undefined &&
    nextAlerts === undefined &&
    zoning === undefined &&
    refusal === undefined &&
    event === undefined
  );
}

class RecordingPort implements MessagePortLike {
  public readonly messages: WorkerToMainMessage[] = [];
  public postMessage(message: unknown): void {
    this.messages.push(message as WorkerToMainMessage);
  }
}

interface Trace {
  readonly messages: readonly WorkerToMainMessage[];
  /** Wall-clock milliseconds at which each message was posted, index-aligned. */
  readonly postedAtMs: readonly number[];
  readonly elapsedMs: number;
}

/** Longest silence between two messages the predicate accepts, and after the last one. */
function worstGapMs(trace: Trace, accepts: (message: WorkerToMainMessage) => boolean): number {
  const stamps = trace.postedAtMs.filter((_stamp, index) => accepts(trace.messages[index]!));
  let worst = stamps.length === 0 ? trace.elapsedMs : trace.elapsedMs - stamps[stamps.length - 1]!;
  for (let i = 1; i < stamps.length; i += 1) worst = Math.max(worst, stamps[i]! - stamps[i - 1]!);
  return worst;
}

function countAccepted(trace: Trace, accepts: (message: WorkerToMainMessage) => boolean): number {
  return trace.messages.filter((message) => accepts(message)).length;
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * Two walled cells with a bed each, built through the real command path, and
 * **nobody admitted**.
 *
 * The beds matter: they are what makes `accommodationCapacity` non-zero without
 * making `occupiedPlaces` non-zero, so the prison is one a player would
 * plausibly be sitting in — finished cells, waiting to receive somebody — and
 * not a degenerate empty world.
 */
function prisonWithNobodyHoused(): SessionSnapshotBundle {
  const runtime = createNewSimulationRuntime(0x718);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 120 }));
  for (let index = 0; index < 2; index += 1) {
    const rect = { x: 4 + index * 3, y: 6, width: 2, height: 3 };
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
    submit(
      runtime,
      `bed-${String(index)}`,
      packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }),
    );
  }
  // Long enough for the delivery and the two build orders to complete, so the
  // trace below is of a settled prison rather than of a building site.
  while (runtime.kernel.tick < 400) runtime.kernel.step();
  return captureSessionSnapshot(runtime);
}

/** Runs the real worker over a snapshot for `WINDOW_MS` at ×1 and returns everything it posted. */
function traceRunningSession(snapshot: SessionSnapshotBundle): Trace {
  const port = new RecordingPort();
  let nowMs = 0;
  const machine = new SimulationWorkerStateMachine(port, 'hud-refresh-cadence', () => nowMs);
  const postedAtMs: number[] = [];
  const stamp = (): void => {
    while (postedAtMs.length < port.messages.length) postedAtMs.push(nowMs);
  };

  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'initialize',
    kind: 'simulation/initialize',
    payload: {
      sessionId: 'session-hud-refresh-cadence',
      source: {
        kind: 'snapshot',
        snapshot: {
          transport: 'structured-clone',
          schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
          schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
          data: snapshot as unknown as null,
        },
      },
    },
  } as MainToWorkerMessage);
  stamp();
  const fault = port.messages.find((message) => message.kind === 'protocol/error');
  expect(fault, 'the worker refused the scenario snapshot').toBeUndefined();

  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'run',
    kind: 'simulation/set-clock',
    payload: { mode: 'running', speed: 1 },
  } as MainToWorkerMessage);
  stamp();

  for (let elapsed = 0; elapsed < WINDOW_MS; elapsed += WAKE_MS) {
    nowMs += WAKE_MS;
    vi.advanceTimersByTime(WAKE_MS);
    stamp();
  }
  return { messages: port.messages, postedAtMs, elapsedMs: nowMs };
}

describe('what refreshes a pulled HUD readout (#718)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves the counts channel silent in a prison with nobody housed, which is the premise #718 got right', () => {
    const trace = traceRunningSession(prisonWithNobodyHoused());

    // Non-vacuity first: the session really ran. Without this the assertion
    // below would be satisfied just as well by a worker that never started.
    const clockStates = trace.messages.filter((message) => message.kind === 'simulation/clock-state');
    expect(clockStates.length, 'the clock never published, so nothing here is a statement about a running session').toBeGreaterThan(100);

    const counts = trace.messages.filter((message) => message.kind === 'simulation/status-counts');
    expect(
      counts,
      'simulation/status-counts published more than the one readout at simulation/initialize in a prison with no occupied place. If a per-tick mover has joined the payload, the change gate has stopped bounding this channel and STATUS_COUNTS_PUBLISH_INTERVAL_MS is now a rate rather than a ceiling -- say which field, in state-machine.ts and in docs/HUD_PROJECTIONS.md, in the same change.',
    ).toHaveLength(1);
  });

  it('refreshes the pulled readouts on the clock heartbeat regardless, at better than a quarter-second', () => {
    const trace = traceRunningSession(prisonWithNobodyHoused());

    // One per `CLOCK_STATE_PUBLISH_INTERVAL_MS`, plus `simulation/ready` and
    // the single counts publication. Asserted as a floor rather than as the
    // exact 120 measured, so a change to the wake granularity is not a
    // failure; the gap below is the tight half.
    const floor = Math.floor(WINDOW_MS / (CLOCK_STATE_PUBLISH_INTERVAL_MS + WAKE_MS));
    expect(
      countAccepted(trace, refreshesTheReadouts),
      "src/main.ts's nine pulled readouts are refreshed by every message its listener does not early-return on, and in a prison with nobody housed that is the clock heartbeat and almost nothing else.",
    ).toBeGreaterThanOrEqual(floor);

    /*
     * **The ceiling below is derived from the constant it bounds, so on its own
     * it cannot fail when that constant is retuned** -- which is #375's defect
     * in the file ADR 0086 consequence 3 says owns this sentence, and #444
     * item 3's *"and the fourth was missed"* in a fifth place.
     *
     * Measured 2026-09-02 (issue #765): `CLOCK_STATE_PUBLISH_INTERVAL_MS` at
     * **200** leaves this file **5/5 green** -- the worst gap becomes 210, the
     * derived ceiling falls to 215 with it, and this file's own docblock figure
     * of 255 ms becomes false with nothing red. Ten times the heartbeat's rate
     * on the boundary would pass the same way.
     *
     * So the interval is written out first, exactly as
     * `tests/unit/worker-state-machine.test.ts` writes it out for the same
     * reason and on the same constant, and the derived form is kept beside it
     * because it is the half that reads as the contract. The observed value is
     * 255 and the ceiling is 265, so there is 10 ms of slack: this pair
     * bounds a *wake* change, and the literal bounds an *interval* change.
     */
    expect(
      CLOCK_STATE_PUBLISH_INTERVAL_MS,
      "this file's docblock states a worst gap of 255 ms, which is ceil(250 / 15) * 15 -- retuning the heartbeat changes that figure, so change this number deliberately rather than letting the ceiling below follow it",
    ).toBe(250);
    expect(
      worstGapMs(trace, refreshesTheReadouts),
      'a pulled readout went longer than a quarter-second plus one tick-loop wake without being refreshed, in a running prison. See ADR 0086: the cadence is the clock heartbeat, and something has stopped it reaching the listener.',
    ).toBeLessThanOrEqual(CLOCK_STATE_PUBLISH_INTERVAL_MS + WAKE_MS);
  });

  it('would freeze for the whole window if the clock left that predicate, which is the mutation this file kills', () => {
    const trace = traceRunningSession(prisonWithNobodyHoused());

    // This is not an aspiration: it is issue #718's reported symptom, computed
    // from the same trace as the assertions above with one term removed. It is
    // asserted so that the two numbers stay a *contrast* -- if this ever
    // stopped being a freeze, the assertions above would be pinning a cadence
    // that no longer needs pinning, and this file should be deleted rather
    // than left green.
    //
    // **This read `toBe(1)` when the file landed and was measured at 2 the same
    // afternoon**, by a merge rather than a regression: ADR 0084 (#754) made
    // the alerts channel republish a restored record, so one more message in
    // this window now carries something the counts-only predicate accepts. The
    // old number is kept here because the freeze is the point and its size is
    // not -- what matters is that 2 stands against the 120 the assertions above
    // measure, and that the gap below is still the whole window.
    //
    // Left as an exact figure rather than loosened to a bound, deliberately: a
    // bound would absorb the next such change in silence, and this number
    // moving is exactly the news a reader of this file wants.
    //
    // **And it moved again, 2 -> 4, on 2026-09-04 (#966 site 2), by the same
    // mechanism the paragraph above records.** An accepted `ZoneRoom` now
    // records an event, `prisonWithNobodyHoused` presses two of them to build
    // its cells, and ADR 0084's restore republishes both records -- so the
    // counts-only predicate accepts two more messages in this window. Both
    // figures are kept, because the news is that this number tracks *what the
    // prison has said*, and neither 2 nor 4 is a cadence: the contrast with the
    // 120 the assertions above measure is what the case is for, and the gap
    // below is still the whole window.
    //
    // **And again, 4 -> 6, on 2026-09-17 (ADR 0116, the owner's ruling of
    // 2026-09-16), by the same mechanism a third time.** A build order that
    // finishes now records an event, and `prisonWithNobodyHoused` places two
    // of them -- the two beds its own comment already calls out as *"the two
    // build orders"*, run to completion before the snapshot is captured -- so
    // ADR 0084's restore republishes two more records the counts-only
    // predicate accepts. Every figure this number has worn is kept for the
    // reason the paragraphs above keep theirs: 1, 2, 4 and 6 are all the same
    // news, which is that this tracks what the prison has said and none of
    // them is a cadence.
    expect(countAccepted(trace, refreshesWithoutTheClock)).toBe(6);
    expect(worstGapMs(trace, refreshesWithoutTheClock)).toBeGreaterThanOrEqual(WINDOW_MS - WAKE_MS);
  });

  it('answers every clock-state, because that is the property the cadence rests on', () => {
    // The single-function form of the mutation above. `hudClockFromWorkerMessage`
    // returning `undefined` for a clock that says nothing new is a natural
    // optimisation -- `publishClockState` already carries a tick-equality check
    // its own docblock calls dead -- and it would silently drop nine readouts
    // onto the change-gated counts channel.
    const message = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'clock',
      kind: 'simulation/clock-state',
      payload: { tick: 7, clock: { mode: 'running', speed: 1 } },
    } as unknown as WorkerToMainMessage;

    const first = hudClockFromWorkerMessage(message, UNKNOWN_HUD_CLOCK);
    expect(first).toBeDefined();
    expect(
      hudClockFromWorkerMessage(message, first!),
      'hudClockFromWorkerMessage has gained a "nothing changed" arm. That is the whole heartbeat of the pull layer (ADR 0086); whatever replaces it must reach the listener in src/main.ts at no worse than the clock publication interval.',
    ).toBeDefined();
  });

  it('still composes the clock into the listener that reaches the refresh block', () => {
    // Textual, and the bound is real: it proves the wiring is written, not that
    // it works. What it buys is that the executable half above cannot drift
    // away from the file it is a statement about, since that file is
    // unreachable from `pnpm test`.
    const main = readFileSync(MAIN_PATH, 'utf8');
    expect(main.length, 'src/main.ts moved or shrank; every assertion here would pass vacuously').toBeGreaterThan(2_000);
    expect(
      main,
      "src/main.ts's listener no longer tests the clock translation in the same early return as the counts. If the clock has been split into its own listener, the nine refresh calls must move with it or they drop onto the change-gated counts channel -- see ADR 0086 and the freeze this file measures.",
    ).toContain('clock === undefined &&\n      counts === undefined &&');
    expect(
      main,
      'the two Regime-tab readouts are no longer refreshed from the block every non-early-returning message reaches.',
    ).toContain('      refreshRegime();\n      refreshPrisonerRoster();');
  });
});
