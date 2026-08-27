import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { projectPrisonerDetail } from '../../src/simulation/presentation/prisoner-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **A player may un-zone a room a prisoner is walking to, and until now the
 * prisoner went on naming it.**
 *
 * ## Why the removal is allowed at all
 *
 * `RoomZoningService.unzone` refuses with `unzone.room-occupied` when
 * `claimCountOf(instanceId) > 0`, and by
 * [ADR 0029](../../docs/adr/0029-concurrent-room-use-claims.md) decision 2 a
 * **traveller holds no claim** -- the claim is taken at the transition into
 * `performing`, deliberately, because "is inside this room right now" is what a
 * use claim means and a traveller is not. So a canteen with somebody eating in
 * it cannot be removed, and the same canteen with somebody halfway across the
 * prison towards it can. That is the decided behaviour on both sides; what
 * follows is what the prisoner does about it.
 *
 * ## The defect, measured on this prison before the fix
 *
 * `ActionSystem.continueTravelling`'s vanished-instance exit set the phase back
 * to `idle` and returned, leaving `currentActionTargetInstanceId` naming the
 * removed room and counting no unmet cycle -- unlike the route-failure exit two
 * statements above it, which does both. Driven through the real commands:
 *
 * ```text
 * tick 2021  travelling -> room.canteen:8:8, claimCountOf 0
 * tick 2021  UnzoneRoom accepted, refusals 0, the instance is unregistered
 * tick 2041  phase idle, staleTarget "room.canteen:8:8", canteenExists false,
 *            unmetDemandCycles 14 -> 14, routeFailures 0 -> 0,
 *            projectPrisonerDetail -> targetRoomInstanceId "room.canteen:8:8"
 * ```
 *
 * The stale target is not a one-cycle blip. `beginNextAction` writes a target
 * only when some candidate resolves, so an idle prisoner who then finds nothing
 * to do keeps it -- and `projectPrisonerDetail` publishes it regardless of
 * phase, so the HUD names a room the player has already demolished.
 * `unmetDemandCycles` is the repository's one observable measure of unserved
 * demand, and a room being taken out from under a walk is as unserved as a
 * route that failed.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored 2x3 minimum. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** `room.canteen`'s authored 6x6 minimum, clear of the cell. */
const CANTEEN_RECT = { x: 8, y: 8, width: 6, height: 6 } as const;
const CANTEEN_ID = 'room.canteen:8:8';

const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 } as const;

/** Every order is complete well before this. */
const BUILT_BY = 1_500;

/** Indices into `ACTION_PHASES`, which does not export its names. */
const IDLE_PHASE = 0;
const TRAVELLING_PHASE = 1;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** A furnished cell and a canteen with one dining table: enough that `action.eat-meal` resolves and is walked to. */
function prisonWithACanteen(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN_RECT }));
  submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'o-bed', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'toilet', packCommand({ type: 'PlaceObject', orderId: 'o-toilet', definitionId: 'toilet-brick', x: 5, y: 6 }));
  submit(runtime, 'dining-table', packCommand({ type: 'PlaceObject', orderId: 'o-dt', definitionId: 'dining-table-wooden', x: 8, y: 8 }));
  stepTo(runtime, BUILT_BY);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  return runtime;
}

describe('un-zoning a canteen a prisoner is halfway to', () => {
  it('drops the journey, forgets the room and counts the unmet cycle, rather than going on naming a room that is gone', () => {
    const runtime = prisonWithACanteen();
    const prisoners = runtime.prisoners;
    const prisoner = prisoners.entityStore.getIdByIndex(0);
    const index = prisoners.entityStore.getIndex(prisoner);

    // Walk the session forward to a tick where the prisoner is genuinely
    // mid-journey to the canteen. Found rather than hard-coded, then asserted,
    // so a shifted schedule fails loudly instead of silently testing an idle
    // prisoner.
    let travellingAt = -1;
    for (let tick = runtime.kernel.tick + 1; tick <= 6_000; tick += 1) {
      stepTo(runtime, tick);
      if (prisoners.currentAction.phase[index] !== TRAVELLING_PHASE) continue;
      if (prisoners.coldState.getActionTarget(prisoner) !== CANTEEN_ID) continue;
      travellingAt = tick;
      break;
    }
    expect(travellingAt, 'the prisoner never set out for the canteen').toBe(2_021);
    expect(DEFAULT_ACTIONS[prisoners.currentAction.actionIndex[index]!]!.id).toBe('action.eat-meal');

    /*
     * The precondition that makes the removal legal, asserted rather than
     * assumed: a traveller holds no claim, so `unzone`'s `claimCountOf > 0`
     * guard does not fire and the player's drag is accepted. If this ever
     * became a refusal the case below would be testing nothing.
     */
    expect(prisoners.roomInstances.claimCountOf(CANTEEN_ID), 'ADR 0029 decision 2: a traveller holds no claim').toBe(0);

    const before = prisoners.actionSystem.getMetrics();
    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CANTEEN_RECT }));

    expect(runtime.refusals.count, 'the removal must be accepted for this case to exist').toBe(0);
    expect(prisoners.roomInstances.getById(CANTEEN_ID), 'the canteen is gone from under the walk').toBeUndefined();
    // Still travelling: the removal is a command, and the prisoner does not
    // learn about it until `ActionSystem` next runs on them.
    expect(prisoners.currentAction.phase[index]).toBe(TRAVELLING_PHASE);

    // `ActionSystem.schedule` is `{ intervalTicks: 20 }`, so one more
    // reconsideration is at most twenty ticks away.
    for (let n = 0; n < 40 && prisoners.currentAction.phase[index] === TRAVELLING_PHASE; n += 1) runtime.kernel.step();

    expect(prisoners.currentAction.phase[index], 'the journey is abandoned rather than retried for ever').toBe(IDLE_PHASE);

    /*
     * **The two assertions the defect was about.** Both were false before:
     * the target stood at `'room.canteen:8:8'` and the metric did not move.
     */
    expect(prisoners.coldState.getActionTarget(prisoner), 'a target that outlived its room').toBeUndefined();
    expect(prisoners.actionSystem.getMetrics().unmetDemandCycles).toBe(before.unmetDemandCycles + 1);

    // Not counted as a route failure, because the route did not fail -- it
    // succeeded and then had nowhere to arrive. The two numbers mean different
    // things and this is the one that separates them.
    expect(prisoners.actionSystem.getMetrics().routeFailures).toBe(before.routeFailures);

    /*
     * And the player-visible half: the HUD projection no longer names a
     * demolished room. `projectPrisonerDetail` publishes
     * `targetRoomInstanceId` whatever the phase, which is why clearing the cold
     * state is what fixes this rather than anything in the projection.
     */
    const detail = projectPrisonerDetail(prisoners, prisoner);
    expect(detail?.currentAction?.phase).toBe('idle');
    expect(detail?.currentAction?.targetRoomInstanceId, 'the HUD named a room the player had already demolished').toBeUndefined();
  });

  it('recovers: the prisoner takes the cell meal instead and hunger rises again', () => {
    // The consequence that makes the reset worth having rather than merely
    // tidy. ADR 0041's fallback needs a clean `idle` to reconsider from, and
    // `action.eat-in-cell` is what a prison with no canteen offers.
    const runtime = prisonWithACanteen();
    const prisoners = runtime.prisoners;
    const prisoner = prisoners.entityStore.getIdByIndex(0);
    const index = prisoners.entityStore.getIndex(prisoner);

    for (let tick = runtime.kernel.tick + 1; tick <= 6_000; tick += 1) {
      stepTo(runtime, tick);
      if (prisoners.currentAction.phase[index] === TRAVELLING_PHASE && prisoners.coldState.getActionTarget(prisoner) === CANTEEN_ID) break;
    }
    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CANTEEN_RECT }));
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.canteen')).toEqual([]);

    const performingTicks: Record<string, number> = {};
    for (let tick = runtime.kernel.tick + 1; tick <= 9_000; tick += 1) {
      stepTo(runtime, tick);
      const actionIndex = prisoners.currentAction.actionIndex[index]!;
      if (prisoners.currentAction.phase[index] !== 2 || actionIndex < 0) continue;
      const id = DEFAULT_ACTIONS[actionIndex]!.id;
      performingTicks[id] = (performingTicks[id] ?? 0) + 1;
    }

    expect(performingTicks['action.eat-in-cell'] ?? 0, 'the prisoner never fell back after the canteen was demolished').toBeGreaterThan(0);
    expect(performingTicks['action.eat-meal'], 'nothing can reach a canteen that no longer exists').toBeUndefined();
  });
});
