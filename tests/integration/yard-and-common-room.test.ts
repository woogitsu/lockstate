import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_IDS, NEED_MAX, NeedsComponent } from '../../src/simulation/prisoners/needs';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { TILES_PER_OPEN_GROUND_PLACE } from '../../src/simulation/prisoners/room-instance-registry';
import { rankActions, scoreAction } from '../../src/simulation/prisoners/utility-ai';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #532's second half, on the real command path: **the common room gets a
 * state in which it wins.**
 *
 * ## What was measured before the change, through this file's own prison
 *
 * Six prisoners, six furnished cells, an 8x8 yard and a 5x5 common room with
 * its two authored benches, five in-game days:
 *
 * ```
 * action.yard-recreation        6,952 performing ticks
 * action.common-room-recreation    96 performing ticks
 * most prisoners in the yard at once: 6 of 6
 * ```
 *
 * ## Why the lever is capacity and not a score
 *
 * `scoreAction` is deficit x effect summed
 * (`src/simulation/prisoners/utility-ai.ts:16-24`) and `rankActions` sorts
 * descending. `action.yard-recreation` gives `recreation: 3`;
 * `action.common-room-recreation` gives `recreation: 2`. So
 *
 *     score(yard) - score(common) = d_recreation * 1
 *
 * and a deficit is `NEED_MAX - level`, which is never negative. **The yard
 * therefore scores at least as high as the common room in every state a
 * prisoner can be in**, with equality only when the `recreation` deficit is
 * exactly zero -- and at that tie `rankActions` breaks by ascending action id,
 * which puts `action.common-room-recreation` first. The common room was
 * reachable on merit only where it is worth nothing. The 96 ticks above are
 * that state, not a near miss.
 *
 * **The yard also gave `safety: 0.1` until issue #588**, so the difference
 * above carried a `+ d_safety * 0.1` term and the tie needed *both* deficits
 * at zero. That term was removed when the owner's ruling on issue #599 made
 * guard coverage the provisioner of `safety`: with an unguarded prison now
 * driving `d_safety` to the top of its range, a term scaled by it lifted the
 * yard over meals, showers and sleep in the ranking -- measured on this
 * fixture, 5,872 performing ticks became 8,588 -- for a need standing in the
 * yard barely moved. `src/simulation/prisoners/actions.ts` carries the
 * argument beside the entry. Nothing about *this* file's claim changes except
 * the width of the tie.
 *
 * That is why no edit to the numbers fixes this. Keeping the yard ahead
 * changes nothing; putting the common room ahead makes the *yard* the room
 * with no state, which an audit named specifically. A ceiling changes which
 * room a prisoner can *have* without touching what they *want*, and the state
 * the common room then wins in is one a player can see and cause: the yard is
 * full.
 *
 * The first test below is the proof of that algebra; the rest are the prison.
 */

const SEED = 0x0b1ec7;

const CELLS = [
  { x: 4, y: 6, width: 2, height: 3 },
  { x: 4, y: 10, width: 2, height: 3 },
  { x: 4, y: 14, width: 2, height: 3 },
  { x: 8, y: 6, width: 2, height: 3 },
  { x: 8, y: 10, width: 2, height: 3 },
  { x: 8, y: 14, width: 2, height: 3 },
] as const;
const PRISONERS = CELLS.length;

/** `room.yard`'s authored 8x8 minimum: 64 tiles, and 4 places at 16 tiles each. */
const MINIMUM_YARD = { x: 20, y: 6, width: 8, height: 8 } as const;
/** The player's answer to a full yard: twice the ground, no walls, no objects, no materials. */
const ENLARGED_YARD = { x: 12, y: 6, width: 16, height: 8 } as const;
/** `room.common-room`'s authored 5x5 minimum, and its two authored benches: 4 places. */
const COMMON_RECT = { x: 20, y: 16, width: 5, height: 5 } as const;
const COMMON_ID = 'room.common-room:20:16';

const ARRIVAL = { x: 16, y: 16 } as const;
const ADMIT_AT = 600;
const WATCH_FROM = 1_000;
const WATCH_UNTIL = WATCH_FROM + DAY_LENGTH_TICKS * 5;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Six finished cells, one yard of the given rectangle, and one furnished common room. */
function prison(yardRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'b1', itemId: 'item.wood-plank', quantity: 20 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'b2', itemId: 'item.brick', quantity: 20 }));

  CELLS.forEach((rect, n) => {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zc${String(n)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
    submit(runtime, `bed${String(n)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(n)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc${String(n)}`, packCommand({ type: 'PlaceObject', orderId: `wc-${String(n)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });

  // No walls: `room.yard` authors `outdoors`, which is the whole of what makes
  // it free -- 64 tiles of open ground, no materials and no money.
  submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...yardRect }));

  wallRoomPerimeter(runtime.world, COMMON_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-common', packCommand({ type: 'ZoneRoom', roomId: 'room.common-room', ...COMMON_RECT }));
  submit(runtime, 'bench-1', packCommand({ type: 'PlaceObject', orderId: 'bn-1', definitionId: 'bench-wooden', x: COMMON_RECT.x, y: COMMON_RECT.y }));
  submit(runtime, 'bench-2', packCommand({ type: 'PlaceObject', orderId: 'bn-2', definitionId: 'bench-wooden', x: COMMON_RECT.x, y: COMMON_RECT.y + 2 }));

  stepTo(runtime, ADMIT_AT);
  for (let n = 0; n < PRISONERS; n += 1) {
    submit(runtime, `admit-${String(n)}`, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 400_000, priorIncidents: 0, ...ARRIVAL }));
  }
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  readonly performingTicks: Record<string, number>;
  /** The most prisoners holding a use claim on the yard in any one tick of the run. */
  readonly peakYardOccupancy: number;
  readonly yardCapacity: number;
}

/** All six prisoners watched **every tick**, because a performed action is short and a coarse sample can miss one whole. */
function watch(runtime: SimulationRuntime): WatchedRun {
  stepTo(runtime, WATCH_FROM);
  const yardId = runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')[0]!.instanceId;
  const yardCapacity = runtime.prisoners.roomInstances.concurrentUseCapacityFor(runtime.prisoners.roomInstances.getById(yardId)!, undefined);

  const store = runtime.prisoners.entityStore;
  const performingTicks: Record<string, number> = {};
  let peakYardOccupancy = 0;

  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    for (let slot = 0; slot < PRISONERS; slot += 1) {
      const id = store.getIdByIndex(slot);
      if (id === undefined) continue;
      const index = store.getIndex(id);
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      // `2` is `performing` in `ACTION_PHASES`; the phase names are not
      // exported, and what matters here is only that the action is being done
      // rather than travelled to.
      if (runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
        const id_ = DEFAULT_ACTIONS[actionIndex]!.id;
        performingTicks[id_] = (performingTicks[id_] ?? 0) + 1;
      }
    }
    const occupancy = runtime.prisoners.roomInstances.useOccupancyOf(yardId);
    if (occupancy > peakYardOccupancy) peakYardOccupancy = occupancy;
  }

  return { runtime, performingTicks, peakYardOccupancy, yardCapacity };
}

describe('what a prisoner wants, which no ceiling changes', () => {
  it('ranks the yard at or above the common room in every state, and equal only where both are worth nothing', () => {
    /*
     * **The reason the lever is capacity**, asserted over states rather than
     * argued in a comment -- and over a grid that includes the deficits that
     * actually occur, not one hand-picked state.
     *
     * A fixture that started every need at `NEED_MAX` would compare a score of
     * zero with a score of zero and hold for any catalogue at all. This sweeps
     * `recreation` and `safety` across the whole range each can take, and
     * asserts separately that the sweep contains states with a real deficit --
     * without which the "equal only at zero" clause below would be vacuous.
     *
     * **`safety` is still swept even though neither action scores it any
     * more** (issue #588), and the sweep is what turns that from a claim into
     * a measurement: every assertion below has to hold at `safety` 0 exactly
     * as it does at `safety` 255, which is only true while no term in either
     * action reads the need. Dropping the axis would make the file agree with
     * a catalogue that quietly put the term back.
     */
    const needs = new NeedsComponent(1);
    const yard = DEFAULT_ACTIONS.find((action) => action.id === 'action.yard-recreation')!;
    const common = DEFAULT_ACTIONS.find((action) => action.id === 'action.common-room-recreation')!;

    const levels = [0, 1, 32, 64, 128, 192, 254, NEED_MAX];
    let statesWithADeficit = 0;
    let statesWhereTheCommonRoomRanksFirst = 0;

    for (const recreation of levels) {
      for (const safety of levels) {
        for (const needId of NEED_IDS) needs.set(0, needId, NEED_MAX);
        needs.set(0, 'recreation', recreation);
        needs.set(0, 'safety', safety);

        const yardScore = scoreAction(needs, 0, yard);
        const commonScore = scoreAction(needs, 0, common);
        // `recreation` alone since issue #588 -- see the header. Named for
        // what it now is: the state where the *scored* deficit is zero.
        const bothSatisfied = recreation === NEED_MAX;
        if (!bothSatisfied) statesWithADeficit += 1;

        expect(yardScore, `recreation ${recreation}, safety ${safety}`).toBeGreaterThanOrEqual(commonScore);
        expect(yardScore === commonScore, `recreation ${recreation}, safety ${safety}: equal scores mean both deficits are zero`).toBe(bothSatisfied);

        // And the ranking, which is what `beginNextAction` actually walks.
        const ranked = rankActions(needs, 0, [yard, common]);
        if (ranked[0] === common) statesWhereTheCommonRoomRanksFirst += 1;
        expect(ranked[0], `recreation ${recreation}, safety ${safety}`).toBe(bothSatisfied ? common : yard);
      }
    }

    // The two vacuity guards. Without the first, every assertion above could
    // have been made about a prisoner with nothing to want.
    // Seven of the eight `recreation` levels carry a deficit, at each of the
    // eight `safety` levels: 56 of the 64 sampled states. It was 63 while the
    // yard scored `safety` as well.
    expect(statesWithADeficit, 'the sweep must contain states with a real deficit').toBe((levels.length - 1) * levels.length);
    /*
     * And the states the common room does win on merit are the ones where
     * winning is worth nothing: both scores are 0, and `rankActions` breaks the
     * tie by ascending action id, which `action.common-room-recreation` takes
     * from `action.yard-recreation` alphabetically. That is the whole of the
     * common room's pre-#532 reachability, and it is why the fix is not a
     * number.
     *
     * **Eight rather than one since issue #588**, and the eight are one state
     * counted eight times: full `recreation` at each of the eight `safety`
     * levels the sweep visits. The yard stopped scoring `safety`, so the tie
     * no longer needs that need to be full as well -- which is the same
     * "a prisoner who wants nothing" state, widened, and not the common room
     * winning anything new.
     */
    expect(statesWhereTheCommonRoomRanksFirst).toBe(levels.length);
    for (const needId of NEED_IDS) needs.set(0, needId, NEED_MAX);
    expect(scoreAction(needs, 0, yard)).toBe(0);
    expect(scoreAction(needs, 0, common)).toBe(0);

    // And neither action reads `safety` at all any more, stated directly
    // rather than only as a property of the sweep: a prisoner at zero
    // `safety` and full `recreation` scores both at zero, where the yard used
    // to score 25.5.
    needs.set(0, 'safety', 0);
    expect(scoreAction(needs, 0, yard)).toBe(0);
    expect(scoreAction(needs, 0, common)).toBe(0);
  });
});

describe('a prison with a minimum yard and a common room', () => {
  it('bounds the yard by its ground, so the common room takes the overflow', () => {
    const run = watch(prison(MINIMUM_YARD));
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: PRISONERS, failedCount: 0 });

    /*
     * The ceiling, read off the constant and the rectangle rather than typed
     * in -- a test that hard-codes the product of a balance figure it is also
     * asserting would agree with any value of that figure.
     */
    expect(run.yardCapacity).toBe(Math.floor((MINIMUM_YARD.width * MINIMUM_YARD.height) / TILES_PER_OPEN_GROUND_PLACE));
    expect(run.yardCapacity).toBeLessThan(PRISONERS);
    // The common room's own ceiling is object-derived and untouched by any of
    // this: two authored benches, each 2 tiles wide, carrying `'recreation'`.
    expect(run.runtime.prisoners.roomInstances.getById(COMMON_ID)).toMatchObject({
      concurrentUseCapacityByCapability: [['recreation', 4], ['seating', 4]],
    });

    /*
     * **The measurement, and the number this change exists to move.** Exact
     * because the loop is deterministic -- one seed, one command order, no RNG
     * on this path.
     *
     * Before: yard 6,952, common room 96, six of six prisoners in the yard at
     * once. After: the yard holds its four and the other two go indoors.
     */
    // 5,872 / 1,248 until issue #588. Two separate movements, and the second
    // is the larger:
    //
    // - The yard's 4% is the rest of the day reshuffling around a `safety`
    //   need that now falls five times faster.
    // - The common room's 1,248 -> 4,208 is the tie widening. The yard stopped
    //   scoring `safety`, so the two actions now tie wherever `recreation`
    //   alone is full instead of only where `recreation` *and* `safety` are,
    //   and the ascending-id tie-break sends a prisoner who wants no
    //   recreation indoors instead of outdoors. Both are the "worth nothing"
    //   state the first test in this file isolates; what changed is how often
    //   a prison is in it, not what the common room is worth.
    //
    // The split this case is about -- yard bounded by its ground, common room
    // taking the overflow -- is unchanged, and the two assertions after these
    // are what say so.
    expect(run.performingTicks['action.yard-recreation']).toBe(6_020);
    expect(run.performingTicks['action.common-room-recreation']).toBe(4_208);
    expect(run.peakYardOccupancy).toBe(run.yardCapacity);

    /*
     * The yard is *weakened*, not replaced: it still scores higher, so it
     * still takes the larger share, and a prisoner goes indoors because the
     * yard is full rather than because the common room became better. Both
     * halves are asserted, because a change that made the common room dominant
     * would be the same defect pointing the other way.
     */
    expect(run.performingTicks['action.yard-recreation']!).toBeGreaterThan(run.performingTicks['action.common-room-recreation']!);
  });

  it('is answered by zoning more ground, which is what makes the ceiling a build decision', () => {
    /*
     * The player's remedy, measured rather than asserted to exist. `room.yard`
     * authors `outdoors` and no `object` requirement, so twice the yard costs
     * no walls, no materials and no money -- only ground the prison already
     * owns. A ceiling that could not be answered would be a nerf; this one is
     * a reason to build.
     */
    const enlarged = watch(prison(ENLARGED_YARD));
    const minimum = watch(prison(MINIMUM_YARD));

    expect(enlarged.yardCapacity).toBe(Math.floor((ENLARGED_YARD.width * ENLARGED_YARD.height) / TILES_PER_OPEN_GROUND_PLACE));
    expect(enlarged.yardCapacity).toBeGreaterThanOrEqual(PRISONERS);

    /*
     * 8 places for six prisoners, and all six are in the yard at once at the
     * peak -- the ceiling stops binding, which is the point.
     *
     *     minimum 8x8   yard 5,872   common room 1,248   peak 4 of 6
     *     enlarged 16x8 yard 7,208   common room   336   peak 6 of 6
     *
     * **The enlarged row is the unmodified tree's row, to the tick.** Measured
     * on a second worktree checked out at `feefbc4` (v0.0.189), before this
     * change: an 8x8 yard gave 6,952 / 96 and a 16x8 yard gave 7,208 / 336,
     * both with a ceiling of `Infinity`. So a yard with room for its
     * population behaves exactly as it did -- the ceiling binds nothing and
     * costs nothing -- and the whole of this change is what happens to a yard
     * that is too small for the prison around it. That is the strongest
     * statement available about its blast radius, and it is why the number to
     * watch is the 96 -> 1,248 on the row above rather than anything here.
     *
     * The common room does not fall to nothing, and that is the tie the first
     * test in this file isolates: at exactly zero recreation and safety
     * deficit both actions score 0 and the ascending-id tie-break takes
     * `action.common-room-recreation`. It was worth 96 ticks before this
     * change and it is worth a few hundred here for the same reason -- a
     * prisoner who wants nothing, choosing between two things worth nothing.
     */
    expect(enlarged.peakYardOccupancy).toBe(PRISONERS);
    // 7,208 / 336 until issue #588, for the two reasons the row above gives.
    // The enlarged yard still cuts the common room's share by more than half
    // against the minimum one, which is the comparison this case makes.
    expect(enlarged.performingTicks['action.yard-recreation']).toBe(7_424);
    expect(enlarged.performingTicks['action.common-room-recreation']).toBe(2_364);
    expect(enlarged.performingTicks['action.yard-recreation']!).toBeGreaterThan(minimum.performingTicks['action.yard-recreation']!);
    expect(enlarged.performingTicks['action.common-room-recreation'] ?? 0).toBeLessThan(minimum.performingTicks['action.common-room-recreation']!);
  });
});
