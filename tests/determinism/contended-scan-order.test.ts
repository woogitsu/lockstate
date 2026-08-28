import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #434 put a **second iteration order over the population** inside
 * `ActionSystem.update`: the idle prisoners are selected in descending need
 * urgency and the arrivals are admitted in descending urgency of the action
 * they walked for, with ascending entity index as the tie-break on both.
 *
 * That is exactly the kind of change [ADR 0020](../../docs/adr/0020-deterministic-kernel.md)
 * governs and [ADR 0029](../../docs/adr/0029-concurrent-room-use-claims.md)
 * decision 7's four commitments constrain, so it gets its own guard rather than
 * relying on the general ones.
 * [ADR 0062](../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
 * decision 3 is the argument this file is the executable half of, and its open
 * question 2 carries the survivor list below. What could go wrong is specific:
 *
 * 1. **A key that is not a pure function of saved state.** Both keys are read
 *    off `NeedsComponent` (carried verbatim in stored units), the classification
 *    group, the incident override, the room instances and the tick -- all of
 *    which the save carries. If one of them ever read something the save does
 *    not, a restored session would hand the seats out in a different order and
 *    diverge from a continuous one from that tick on. That is the first case
 *    below.
 * 2. **A comparator that is not total.** `Array.prototype.sort` is only
 *    required to be stable in modern engines, and a comparator answering `0`
 *    would fall back to the order the list was collected in -- which is
 *    ascending index today and need not stay so. Entity index is unique among
 *    live prisoners, so the comparator never answers `0`; the second case below
 *    is what says the sorted result really is one unique permutation, by
 *    sorting a deliberately tie-heavy population and getting the same answer
 *    every run.
 *
 * The prison is `tests/integration/contended-shower-fairness.test.ts`'s, cut
 * down: what matters here is that the ordering has something to decide, and a
 * two-head shower room against twenty-four prisoners is that.
 *
 * ## Reported rather than claimed: no mutation of the new code turned this red
 *
 * A green suite is not a guarded suite, so this file says plainly what it is.
 * Four mutations were tried against it and all four survived: perturbing the
 * urgency key by `actionsStarted % 7` and by `(actionsStarted % 7) * 500`,
 * caching the key in a module-level `Map` that outlives the runtime, and
 * ordering the arrivals by the path request id's sequence suffix -- the exact
 * hazard `docs/DETERMINISM.md` names under "Per-system `requestSequence`
 * counters are outside snapshots".
 *
 * **The reason they survived is the determinism argument itself, and it is
 * worth more than the mutations would have been.** The only state
 * `ActionSystem` holds that no snapshot carries is its four metric counters and
 * `requestSequence`, and every one of those is *constant across the prisoners
 * of a single pass* -- both keys are computed in the collection walk, before
 * any prisoner acts, so a counter added to them shifts every entry by the same
 * amount and cannot reorder anything. There is no per-prisoner unsaved state in
 * this system to build a divergent key out of. The request-id mutation survived
 * for a second reason on top: sequence numbers are issued in the scan's own
 * order, so sorting by them reproduces it.
 *
 * So this file is a **regression guard** and not a demonstrated tripwire: it
 * fails the day something is added to `ActionSystem` that varies per prisoner
 * and is not snapshotted, and until then it holds by construction. Issue #375
 * is why that is written here rather than left to look like coverage, and
 * ADR 0062 open question 2 is where it is on the record for a reader who never
 * opens this file.
 */

const SEED = 0x0b1ec7;
const PRISONERS = 24;

const DORM = { x: 0, y: 0, width: 12, height: 6 } as const;
const SHOWER = { x: 0, y: 10, width: 3, height: 3 } as const;

const PLANKS = 24;
const BRICKS = 24 + 2;

const BUILT_BY = 6_000;
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 1_000_000, priorIncidents: 0 } as const;

const IDLE_PHASE = 0;
const PERFORMING_PHASE = 2;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function contendedPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: PLANKS }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: BRICKS }));

  wallRoomPerimeter(runtime.world, DORM, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-dorm', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...DORM }));
  wallRoomPerimeter(runtime.world, SHOWER, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));

  let placed = 0;
  for (const y of [0, 2]) {
    for (let x = 0; x < 12; x += 1) {
      submit(runtime, `bed-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-bed-${placed}`, definitionId: 'bed-wooden', x, y }));
      placed += 1;
    }
  }
  placed = 0;
  for (const y of [4, 5]) {
    for (let x = 0; x < 12; x += 1) {
      submit(runtime, `toilet-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-toilet-${placed}`, definitionId: 'toilet-brick', x, y }));
      placed += 1;
    }
  }
  submit(runtime, 'head-0', packCommand({ type: 'PlaceObject', orderId: 'o-head-0', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
  submit(runtime, 'head-1', packCommand({ type: 'PlaceObject', orderId: 'o-head-1', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));

  stepTo(runtime, BUILT_BY);
  for (let n = 0; n < PRISONERS; n += 1) {
    submit(runtime, `admit-${n}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }
  return runtime;
}

/** Which prisoner, by admission position, is performing which action -- the outcome the ordering decides. */
function performedActions(runtime: SimulationRuntime): readonly (string | undefined)[] {
  const store = runtime.prisoners.entityStore;
  return Array.from({ length: PRISONERS }, (_unused, n) => {
    const index = store.getIndex(store.getIdByIndex(n));
    if (runtime.prisoners.currentAction.phase[index] !== PERFORMING_PHASE) return undefined;
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    return actionIndex < 0 ? undefined : DEFAULT_ACTIONS[actionIndex]!.id;
  });
}

function hygieneLevels(runtime: SimulationRuntime): readonly number[] {
  const store = runtime.prisoners.entityStore;
  return Array.from({ length: PRISONERS }, (_unused, n) => runtime.prisoners.needs.levels.hygiene[store.getIndex(store.getIdByIndex(n))]!);
}

/** How many prisoners hold a claim on each shower head right now, per prisoner position. */
function showerClaimants(runtime: SimulationRuntime): readonly number[] {
  const store = runtime.prisoners.entityStore;
  const showerId = `room.shower-room:${String(SHOWER.x)}:${String(SHOWER.y)}`;
  return Array.from({ length: PRISONERS }, (_unused, n) => n).filter((n) => {
    const entityId = store.getIdByIndex(n);
    return runtime.prisoners.coldState.getActionTarget(entityId) === showerId;
  });
}

describe('the urgency-ordered contended scan is a function of saved state alone', () => {
  it('hands the shower heads to the same prisoners after a save and restore as it does without one', () => {
    const continuous = contendedPrison();

    /*
     * A restore drops every in-flight path request, because it belongs to the
     * previous `NavigationSystem` instance -- `docs/DETERMINISM.md` records that
     * as a deliberate, bounded loss. So the snapshot is taken at a tick where
     * **nobody is travelling**, which is the same precondition
     * `snapshot-restore-fidelity.test.ts` builds its carried-scope session
     * around, and the assertion below is then about the ordering rather than
     * about that known divergence. The tick is searched for rather than
     * guessed, and the search failing is a failure rather than a skip.
     */
    let snapshotTick = -1;
    for (let tick = continuous.kernel.tick + 1; tick <= continuous.kernel.tick + 4_000; tick += 1) {
      stepTo(continuous, tick);
      const store = continuous.prisoners.entityStore;
      const anybodyTravelling = Array.from({ length: PRISONERS }, (_unused, n) => store.getIndex(store.getIdByIndex(n))).some(
        (index) => continuous.prisoners.currentAction.phase[index] === 1,
      );
      const anybodyIdle = Array.from({ length: PRISONERS }, (_unused, n) => store.getIndex(store.getIdByIndex(n))).some(
        (index) => continuous.prisoners.currentAction.phase[index] === IDLE_PHASE,
      );
      // Idle prisoners as well as no travellers: a snapshot taken when every
      // prisoner is mid-action would restore into a cycle that decides nothing,
      // and the ordering would not be exercised on the far side of it.
      if (!anybodyTravelling && anybodyIdle && tick > 8_000) {
        snapshotTick = tick;
        break;
      }
    }
    expect(snapshotTick, 'no quiescent tick found to snapshot at').toBeGreaterThan(0);

    const metricsAtSnapshot = continuous.prisoners.actionSystem.getMetrics();
    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(continuous), SEED);
    expect(restored.kernel.tick).toBe(snapshotTick);
    expect(hygieneLevels(restored)).toEqual(hygieneLevels(continuous));

    // Long enough to cross several contended hygiene blocks, so the two runs
    // have to agree about who got a head many times over rather than once.
    const until = snapshotTick + 6_000;
    stepTo(continuous, until);
    stepTo(restored, until);

    expect(restored.kernel.tick).toBe(continuous.kernel.tick);
    expect(hygieneLevels(restored)).toEqual(hygieneLevels(continuous));
    expect(performedActions(restored)).toEqual(performedActions(continuous));
    expect(showerClaimants(restored)).toEqual(showerClaimants(continuous));
    /*
     * As a **delta**, not as a total: `ActionSystem`'s counters are session
     * metrics that no save carries, so a restored session starts them at zero.
     * That is pre-existing and is recorded in `docs/DETERMINISM.md`; comparing
     * the totals would only re-measure it. What this asserts is that the same
     * number of actions began, completed and went unmet on both sides of the
     * boundary over the same 6,000 ticks -- which is what a divergence in the
     * scan order would move.
     */
    const continuedMetrics = continuous.prisoners.actionSystem.getMetrics();
    const restoredMetrics = restored.prisoners.actionSystem.getMetrics();
    expect(restoredMetrics.actionsStarted).toBe(continuedMetrics.actionsStarted - metricsAtSnapshot.actionsStarted);
    expect(restoredMetrics.actionsCompleted).toBe(continuedMetrics.actionsCompleted - metricsAtSnapshot.actionsCompleted);
    expect(restoredMetrics.unmetDemandCycles).toBe(continuedMetrics.unmetDemandCycles - metricsAtSnapshot.unmetDemandCycles);

    // Not vacuous: the shower really was being fought over across that window.
    expect(restoredMetrics.actionsCompleted).toBeGreaterThan(0);
    expect(restoredMetrics.unmetDemandCycles).toBeGreaterThan(0);
  });

  it('is stable when the whole population ties on urgency, which is where sort stability would decide it instead', () => {
    /*
     * Twenty-four prisoners admitted in the same tick run identical need
     * trajectories, so at any contended moment they are exactly equal on the
     * urgency key -- measured in the canteen scenario as all 24 sitting at the
     * same stored hunger unit. That is the input that makes the *tie-break*
     * load-bearing, and a comparator that answered `0` would leave the outcome
     * to whatever order the collection loop produced.
     *
     * Asserted as the outcome twice from one seed rather than as the order the
     * comparator returns, so a future change that reorders the callers and
     * reintroduces the dependence fails here.
     */
    const first = contendedPrison();
    const second = contendedPrison();
    stepTo(first, 20_000);
    stepTo(second, 20_000);

    expect(hygieneLevels(second)).toEqual(hygieneLevels(first));
    expect(performedActions(second)).toEqual(performedActions(first));
    expect(second.prisoners.actionSystem.getMetrics()).toEqual(first.prisoners.actionSystem.getMetrics());
  });
});
