import { describe, expect, it } from 'vitest';
import { PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy/treasury';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0106](../../docs/adr/0106-how-a-finished-wall-comes-down-without-a-keyboard.md):
 * **a finished wall has a pointer route to reversing it that never presses a
 * key.**
 *
 * ## The reachability gate this file is
 *
 * `docs/AGENT_WORKFLOW.md` §3 and issue #928 §6 agree that nothing gated the
 * *reachability* of a finished wall's removal before this command existed, and
 * ADR 0106's own §6 states what the gate must assert once one lands: build a
 * wall to completion, arm `Remove`, press the wall (not a queue row, not
 * `KeyZ`), and assert the edge value it wrote is gone and the treasury
 * reflects `destroysSpendOnCancel`'s existing no-refund rule for a completed
 * order -- the same figure `Undo` already produces for the same wall today.
 * `'construction wall is reachable through the RemoveWall route'` below is
 * that assertion, driven through the real kernel, the real decoder and the
 * real session command router (`createNewSimulationRuntime`), exactly as
 * `object-removal-loop.test.ts` and `command-success-notices.test.ts` drive
 * `RemoveObject` and `Undo` -- because the gap this closes was a *route*
 * being absent, not a function being wrong, and a test that called
 * `ConstructionSystem.cancelOrder` directly would prove that function works
 * without saying whether a press can reach it.
 *
 * **Mutate the production code and watch this test go red before trusting
 * it green.** Commenting out the `RemoveWall` branch in
 * `src/simulation/runtime/session-commands.ts` (or making
 * `unpackCommand` reject the type) removes the only route this file drives,
 * and every assertion below that depends on it fails. That was done by hand
 * while writing this file; see the report for the actual red output.
 */

const WALL = 'wall-brick';
const BED = 'bed-wooden';
const CELL = 'room.cell';

/** `wall-brick`'s one material requirement, read from the catalogue rather than written down (`docs/TESTING.md`). */
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((m) => [m.itemId, m.unitPriceMinorUnits]));
const WALL_COST_MINOR_UNITS = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;

/**
 * All of this file's tiles are inside the starting 32x32 chunk
 * (`createNewSimulationRuntime` owns `(0,0)`), and each test below claims its
 * own patch of it so builds in one test cannot collide with another's.
 */
const CELL_RECT = { x: 10, y: 20, width: 2, height: 3 } as const;
const BED_TILE = { x: 10, y: 20 } as const;
/** The edge this file's main scenario builds and removes. */
const WALL_TILE = { x: 4, y: 4 } as const;

function tile(x: number, y: number) {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

function createSession(seed = 0x106) {
  const runtime = createNewSimulationRuntime(seed);
  let sequence = 0;

  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };

  const run = (ticks: number): void => {
    for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  };

  /** Steps until the order reaches `state`, failing on the tick budget rather than hanging forever. */
  const runUntilState = (orderId: string, state: string, limit = 600): void => {
    for (let step = 0; step < limit; step += 1) {
      if (runtime.construction.getOrder(orderId)?.state === state) return;
      runtime.kernel.step();
    }
    throw new Error(`${orderId} never reached ${state}; it is ${String(runtime.construction.getOrder(orderId)?.state)}`);
  };

  return { runtime, send, run, runUntilState };
}

describe('a finished wall is reachable through RemoveWall (ADR 0106)', () => {
  it('retires a wall-removal refusal band when RemoveWall next succeeds through its object arm (#1270)', () => {
    const session = createSession();
    const { runtime } = session;
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    session.send({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT });
    session.send({ type: 'PlaceObject', orderId: 'bed-1', definitionId: BED, x: BED_TILE.x, y: BED_TILE.y });
    session.runUntilState('bed-1', 'completed');

    session.send({ type: 'RemoveWall', x: 18, y: 19, edge: 'north' });
    expect(runtime.refusals.last?.reason).toBe('remove-wall.nothing-to-remove');
    expect(runtime.refusals.last?.routeDecidedSince).toBeUndefined();

    session.send({ type: 'RemoveWall', x: BED_TILE.x, y: BED_TILE.y, edge: 'north' });
    const instanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
    expect(runtime.prisoners.roomInstances.getById(instanceId)?.objectCapabilities).not.toContain('sleep-surface');
    expect(runtime.refusals.last).toMatchObject({
      sequence: 1,
      reason: 'remove-wall.nothing-to-remove',
      routeDecidedSince: true,
    });
    expect(runtime.refusals.count).toBe(1);
  });

  it('removes the completed wall, keeps every coin already spent, and accepts a re-drag at the catalogue price again', () => {
    const session = createSession();
    const { runtime } = session;

    session.send({ type: 'PlaceBuildOrder', orderId: 'wall-1', definitionId: WALL, x: WALL_TILE.x, y: WALL_TILE.y, edge: 'north' });
    session.runUntilState('wall-1', 'completed');

    expect(runtime.world.getTopEdge(tile(WALL_TILE.x, WALL_TILE.y)), 'the wall must really stand before the test presses it').toBeGreaterThan(0);
    const balanceAfterBuild = runtime.treasury.balanceMinorUnits;
    expect(balanceAfterBuild, 'the fixture must actually have spent something').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - WALL_COST_MINOR_UNITS,
    );

    // The press: arm Remove and press the wall. No queue row, no `KeyZ`.
    session.send({ type: 'RemoveWall', x: WALL_TILE.x, y: WALL_TILE.y, edge: 'north' });

    expect(runtime.world.getTopEdge(tile(WALL_TILE.x, WALL_TILE.y)), 'the edge value the order wrote is gone').toBe(0);
    expect(runtime.construction.getOrder('wall-1')?.state, 'the order really was reversed').toBe('cancelled');
    expect(
      runtime.treasury.balanceMinorUnits,
      "destroysSpendOnCancel('completed') is true regardless of the route -- the same figure Undo already produces for the same wall today",
    ).toBe(balanceAfterBuild);

    /*
     * The positive control (ADR 0106 §2): a standing wall's own `duplicateClaim`
     * refuses a second order on the same definition, location and edge while a
     * `'completed'` one still claims it -- so an *accepted* re-drag is the
     * cheap, player-visible assertion that the geometry really was reversed
     * and not merely hidden. If `RemoveWall` had left the edge value standing,
     * or left a phantom order still claiming it, this second `PlaceBuildOrder`
     * would come back refused with `build.duplicate-order` instead.
     */
    session.send({ type: 'PlaceBuildOrder', orderId: 'wall-2', definitionId: WALL, x: WALL_TILE.x, y: WALL_TILE.y, edge: 'north' });
    expect(runtime.construction.getOrder('wall-2')?.failReason, 'the re-drag must be accepted, not refused as a duplicate').toBeUndefined();
    session.runUntilState('wall-2', 'completed');

    expect(runtime.world.getTopEdge(tile(WALL_TILE.x, WALL_TILE.y)), 'the re-dragged wall really stands').toBeGreaterThan(0);
    expect(
      runtime.treasury.balanceMinorUnits,
      'the re-drag was charged the catalogue price again, exactly as a fresh wall is',
    ).toBe(balanceAfterBuild - WALL_COST_MINOR_UNITS);
  });

  it('refuses when the pressed tile holds no object, no in-flight object order, and no completed wall', () => {
    const session = createSession();
    session.send({ type: 'RemoveWall', x: 6, y: 6, edge: 'north' });
    // No order exists to have moved, no edge to have cleared -- the only
    // observable fact is that nothing threw and nothing was created.
    expect(session.runtime.world.getTopEdge(tile(6, 6))).toBe(0);
  });

  it('does not reach a wall that is still being built -- that route is the queue row and Undo, not this one', () => {
    const session = createSession();
    const { runtime } = session;
    session.send({ type: 'PlaceBuildOrder', orderId: 'wall-in-flight', definitionId: WALL, x: 8, y: 8, edge: 'north' });
    expect(runtime.construction.getOrder('wall-in-flight')?.state, 'must not have finished yet').not.toBe('completed');

    session.send({ type: 'RemoveWall', x: 8, y: 8, edge: 'north' });

    expect(
      runtime.construction.getOrder('wall-in-flight')?.state,
      "an in-flight wall is out of this command's scope by design (ADR 0106 §5)",
    ).not.toBe('cancelled');
    expect(runtime.world.getTopEdge(tile(8, 8)), 'nothing was written for an order that has not completed').toBe(0);
  });

  it('resolves the falsifier the ADR names: a tile carrying both a placed object and a completed wall removes the object, and leaves the wall standing', () => {
    /*
     * ADR 0106's own weakest claim: "an implementer finding that a tile
     * bordering both a placed object and a completed wall produces an
     * ambiguous resolution... would move option 1's cost toward option 2's."
     * This is that tile, built for real: a bed anchored on the same tile a
     * completed wall's north edge sits on. The falsifier does not hold --
     * `RemoveWall`'s own session-command branch tries the object arm first,
     * unconditionally, so the object wins and the wall is never touched by
     * this press.
     */
    const session = createSession();
    const { runtime } = session;
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    session.send({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT });
    session.send({ type: 'PlaceObject', orderId: 'bed-1', definitionId: BED, x: BED_TILE.x, y: BED_TILE.y });
    // A real, order-backed wall on the bed's own north edge -- not the
    // perimeter helper's direct edge write, so `completedOrderClaimingEdge`
    // has a genuine order to find if this press reached it.
    session.send({ type: 'PlaceBuildOrder', orderId: 'wall-under-bed', definitionId: WALL, x: BED_TILE.x, y: BED_TILE.y, edge: 'north' });
    session.runUntilState('wall-under-bed', 'completed');

    const instanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
    expect(runtime.prisoners.roomInstances.getById(instanceId)?.objectCapabilities, 'the bed must really be standing first').toContain('sleep-surface');

    session.send({ type: 'RemoveWall', x: BED_TILE.x, y: BED_TILE.y, edge: 'north' });

    expect(
      runtime.prisoners.roomInstances.getById(instanceId)?.objectCapabilities,
      'the object arm won: the bed is gone',
    ).not.toContain('sleep-surface');
    expect(
      runtime.construction.getOrder('wall-under-bed')?.state,
      'the wall order was never reached by this press',
    ).toBe('completed');
    expect(runtime.world.getTopEdge(tile(BED_TILE.x, BED_TILE.y)), 'the wall is left standing').toBeGreaterThan(0);
  });
});
