import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0029](../../docs/adr/0029-concurrent-room-use-claims.md) decision 6:
 * concurrent-use claims are **derived on restore, not persisted**, and *"the
 * restore reproduces the count exactly"*.
 *
 * ## The half of that promise nothing was watching
 *
 * `ActionSystem.reinstateUseClaims` rebuilds a claim only for a prisoner whose
 * in-flight action targets a room **by catalogue id**. The other target kind,
 * `own-accommodation`, resolves by id and takes no claim in a live session at
 * all -- `claimUseIfNeeded` answers `true` for it without touching the registry,
 * deliberately, so that the first bed placed buys three needs rather than one.
 * The `action.target.kind !== 'room-catalog-id'` half of that filter is
 * therefore the entire reason the rebuilt claim set equals the live one for a
 * housed prisoner.
 *
 * Nothing exercised it. Every restore-rebuild case lives in
 * `tests/unit/prisoners-concurrent-room-use.test.ts`, and that file's fixture
 * says so in its own words -- *"no accommodation is set for anybody here, so it
 * could not resolve a target anyway"* -- which puts the `own-accommodation`
 * branch structurally out of its reach.
 * `tests/integration/session-save-round-trip.test.ts` compares `occupancyOf`
 * (residency), and `snapshot-restore-fidelity` cannot see use claims because
 * they are deliberately absent from the payload.
 *
 * ## Measured, through this file's own prison
 *
 * Weakening the filter to `if (action === undefined) continue;` leaves the whole
 * suite green -- including all five of the files named above -- while this
 * happens at tick 241, with the prisoner mid-`action.sleep` in their own cell:
 *
 * ```text
 * CLEAN     { performedActionId: "action.sleep", liveClaims: 0, restoredClaims: 0 }
 * MUTATED   { performedActionId: "action.sleep", liveClaims: 0, restoredClaims: 1 }
 * ```
 *
 * That invented claim is not cosmetic. `RoomInstanceRegistry.claimCountOf` sums
 * both kinds, so it blocks `unzone`; and a claim the owning action will never
 * release -- `releaseUseClaim` fires on the real exit, but the restored claim
 * was never matched by a live one -- costs the room a seat for the rest of the
 * session. That is precisely the failure decision 6's exact-count promise
 * exists to remove.
 *
 * ## Why `action.sleep`, and why the real command path
 *
 * `action.sleep` targets `own-accommodation` and is the most-performed action in
 * every shipped prison: 800 of the first 3,000 ticks here, against 220 of
 * `action.use-toilet` and 160 of `action.eat-in-cell`. A prisoner mid-sleep at
 * the moment the player saves is the ordinary case, not a contrived one -- which
 * is why this is driven through `ZoneRoom`/`PlaceObject`/`AdmitPrisoner` and
 * `PrisonerOperationsRuntime.loadSnapshot`, the same method
 * `src/simulation/runtime/session-systems.ts:663` calls on a real restore.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, the same rectangle the cell-loop files measure. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
const TOILET_TILE = { x: 5, y: 6 } as const;
const CELL_ID = 'room.cell:4:6';

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** What one press of the Intake panel's control asks for, copied from `ADMISSION_REQUEST` in `src/main.ts`. */
const ADMISSION = { sentenceLengthTicks: 10_000, priorIncidents: 0 } as const;

const ADMIT_AT = 200;
/** Well past the first own-accommodation performance, which lands at 241. */
const SEARCH_UNTIL = 3_000;

/** `2` is `performing` in `ACTION_PHASES`; the phase names are not exported. */
const PERFORMING_PHASE = 2;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** One zoned cell with a bed and a toilet, one prisoner housed in it, nothing else zoned. */
function housedPrisonerPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', ...TOILET_TILE }));
  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  return runtime;
}

/** Steps until the one prisoner is `performing` an action whose target is their own cell. */
function stepToOwnAccommodationPerformance(runtime: SimulationRuntime): { readonly tick: number; readonly actionId: string } {
  const store = runtime.prisoners.entityStore;
  for (let tick = runtime.kernel.tick + 1; tick <= SEARCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    const index = store.getIndex(store.getIdByIndex(0));
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    if (runtime.prisoners.currentAction.phase[index] !== PERFORMING_PHASE || actionIndex < 0) continue;
    const action = DEFAULT_ACTIONS[actionIndex]!;
    if (action.target.kind !== 'own-accommodation') continue;
    return { tick, actionId: action.id };
  }
  throw new Error(`No own-accommodation action was performed before tick ${SEARCH_UNTIL}.`);
}

describe('restoring a save taken while a housed prisoner is performing in their own cell', () => {
  it('reproduces the live claim count exactly, which for an own-accommodation action is none', () => {
    const runtime = housedPrisonerPrison();
    const { tick, actionId } = stepToOwnAccommodationPerformance(runtime);
    const prisoners = runtime.prisoners;
    const prisoner = prisoners.entityStore.getIdByIndex(0);
    const index = prisoners.entityStore.getIndex(prisoner);

    /*
     * The paired assertion that stops this case going vacuous. If a future
     * change ever leaves the prisoner idle, travelling, or performing a
     * `room-catalog-id` action here, the equality below would hold for a reason
     * that has nothing to do with the branch under test -- so the state is
     * pinned first, and the target kind is read off the catalogue rather than
     * restated.
     */
    expect(actionId, 'the most-performed action in every shipped prison').toBe('action.sleep');
    expect(DEFAULT_ACTIONS.find((action) => action.id === actionId)!.target.kind).toBe('own-accommodation');
    /*
     * **241 until ADR 0059, 285 since**, and the 44 ticks are the walk from
     * the delivery tile to the cell's anchor. `continueTravelling` used to
     * write the destination in the statement that resolved the route; a
     * prisoner now covers the tiles between at
     * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`, so "the first tick they are
     * performing in their own cell" moved by the length of the journey. What
     * this line pins is unchanged: a found tick rather than a hard-coded one,
     * asserted so a shifted schedule fails loudly instead of silently testing
     * a prisoner who never got there.
     */
    expect(tick).toBe(285);
    expect(prisoners.currentAction.phase[index]).toBe(PERFORMING_PHASE);
    expect(prisoners.coldState.getAccommodation(prisoner)).toBe(CELL_ID);
    expect(prisoners.coldState.getActionTarget(prisoner)).toBe(CELL_ID);

    /*
     * A live `own-accommodation` performance takes no concurrent-use claim:
     * `ActionSystem.claimUseIfNeeded` answers `true` for that target kind
     * without touching the registry. So the number the restore has to reproduce
     * is zero -- and it is asserted as a literal as well as an equality,
     * because `restored === live` alone would be satisfied by a rebuild that
     * invented a claim on both sides.
     */
    const liveClaims = prisoners.roomInstances.totalUseClaims;
    expect(liveClaims).toBe(0);
    expect(prisoners.roomInstances.useOccupancyOf(CELL_ID)).toBe(0);

    prisoners.loadSnapshot(prisoners.getSnapshot());

    expect(prisoners.roomInstances.totalUseClaims, 'ADR 0029 decision 6: the restore reproduces the count exactly').toBe(liveClaims);
    expect(prisoners.roomInstances.totalUseClaims).toBe(0);
    expect(prisoners.roomInstances.useOccupancyOf(CELL_ID)).toBe(0);

    /*
     * And the rebuild scan really did visit this prisoner rather than skipping
     * the whole population: they are still `performing` the same action against
     * the same instance after the restore, which is the state
     * `reinstateUseClaims` filters on. Residency is untouched, which separates
     * "no claim was invented" from "the restore lost the prisoner".
     */
    expect(prisoners.currentAction.phase[index]).toBe(PERFORMING_PHASE);
    expect(DEFAULT_ACTIONS[prisoners.currentAction.actionIndex[index]!]!.id).toBe(actionId);
    expect(prisoners.coldState.getActionTarget(prisoner)).toBe(CELL_ID);
    expect(prisoners.roomInstances.occupancyOf(CELL_ID)).toBe(1);
    expect(prisoners.roomInstances.claimCountOf(CELL_ID), 'a residency claim and no use claim').toBe(1);
  });
});
