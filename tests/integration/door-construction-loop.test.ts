import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { DOOR_EDGE_NUMERIC_ID } from '../../src/simulation/construction';
import { constructedDoorIdFor } from '../../src/simulation/navigation/door';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';

/**
 * **A player buys a plank, builds a wooden door, and the prison has a door.**
 *
 * The loop `door-wooden` has been unable to close since #16. Every step goes
 * through the real kernel, the real decoder and the real session command
 * router, in the shape `object-placement-loop.test.ts` established: nothing
 * calls `DoorRegistry.register` or `SparseWorld.setLeftEdge` by hand, because a
 * test that did would prove the registry works and say nothing about whether a
 * command can reach it.
 *
 * ## What was true before, and is measured here as being false now
 *
 * The Build panel offered a Wooden Door, `ProcurementSystem` charged for a
 * plank, `ConstructionSystem` spent it over sixty ticks, and the order reached
 * `'completed'` having changed nothing: no edge value, no door, nothing in the
 * save, nothing on screen. It was the one buildable in the registry that could
 * not finish meaningfully, and `definition.ts` said so in its own comment.
 *
 * ## Where this file stops
 *
 * At the simulation, and that has not changed -- but the HUD question this
 * paragraph left open has been answered, so the paragraph is corrected rather
 * than deleted.
 *
 * It read: *"The **panel's numeric route still hides its edge chooser for a
 * door** (`occupiesEdge` is `category === 'wall'` in `src/main.ts`), so a door
 * submitted through the two number fields lands on whichever edge was last
 * selected rather than on one the player chose. That is a HUD surface question
 * and it is left open deliberately."* It was, and issue #531 is where it was
 * closed: `src/main.ts` now publishes `occupiesEdge: occupiesTileEdge(
 * definition)`, so the coordinate form offers a door the same chooser it offers
 * a wall, and `intentEdge` in `src/ui/hud/build-panel.ts` stops any hidden
 * chooser's retained value from riding along on a command.
 *
 * What still holds is where this file stops. The world's pointer gesture
 * already fills the edge in, which is the route this file exercises by naming
 * one; the panel's half is asserted in `tests/unit/ui-hud-build-panel.test.ts`
 * and `tests/foundation/composition-root-contract.test.ts`, because nothing
 * headless can mount the panel or import the composition root.
 */

const SEED = 0xd0021;
const PRISON_ID = 'door-loop-prison';

/** Inside the one chunk a new prison owns, and clear of anything else. */
const DOOR_TILE = { x: 12, y: 9 } as const;
const DOOR_EDGE = 'west' as const;
const DOOR_ID = constructedDoorIdFor(at(DOOR_TILE), 'left');

/** The branded `TilePosition` for a plain literal above. */
function at(position: { readonly x: number; readonly y: number }): TilePosition {
  return { x: tileCoordinate(position.x), y: tileCoordinate(position.y) };
}

/** Dispatches one command through the kernel, at the sequence the kernel is expecting. */
function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison with one plank bought and one door ordered -- the two commands a
 * player sends.
 *
 * The plank is bought *first*, for the reason `object-placement-loop.test.ts`
 * gives: `ProcurementSystem` delivers after `PROCUREMENT_DELIVERY_DELAY_TICKS`,
 * and an order submitted against an empty container waits in
 * `materials-pending`, which is exactly where every `door-wooden` order in a
 * default session has always started.
 */
function prisonWithDoorOrdered(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(
    runtime,
    'place-door',
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: 'door-1',
      definitionId: 'door-wooden',
      x: DOOR_TILE.x,
      y: DOOR_TILE.y,
      edge: DOOR_EDGE,
      transactionId: 'door-gesture',
    }),
  );
  return runtime;
}

describe('a bought plank becomes a door the simulation can see', () => {
  it('registers nothing while the order is only ordered, and a door when it finishes', () => {
    const runtime = prisonWithDoorOrdered();

    // Accepted and waiting for the plank -- the state every `door-wooden` order
    // reached before, and the one it used to leave for `'completed'` with
    // nothing to show for it.
    expect(runtime.construction.getOrder('door-1')?.state).toBe('approved');
    expect(runtime.navigation.doors.all()).toEqual([]);
    expect(runtime.world.getLeftEdge(at(DOOR_TILE))).toBe(0);
    expect(runtime.refusals.count, 'neither command may be refused').toBe(0);

    // 100 ticks of delivery delay, then three progress ticks of ten each on a
    // ten-tick schedule. 200 is comfortably past both and is not a boundary.
    stepTo(runtime, 200);

    expect(runtime.construction.getOrder('door-1')?.state).toBe('completed');
    expect(runtime.navigation.doors.all().map((door) => door.id)).toEqual([DOOR_ID]);
    expect(runtime.navigation.doors.getById(DOOR_ID)).toEqual({
      id: DOOR_ID,
      position: { x: DOOR_TILE.x, y: DOOR_TILE.y },
      side: 'left',
      state: 'closed',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    // Both halves. The edge value is what makes the room behind it enclosed and
    // gives the renderer something to draw; the registry row is what makes it
    // passable. Neither alone is a door.
    expect(runtime.world.getLeftEdge(at(DOOR_TILE))).toBe(DOOR_EDGE_NUMERIC_ID);
  });

  it('really spent the plank, so the door was built out of a bought material', () => {
    const runtime = prisonWithDoorOrdered();
    stepTo(runtime, 200);

    // One plank in, one plank consumed. If the order had stalled in
    // `materials-pending` the assertions above could never have passed, and
    // this says so in one number.
    expect(runtime.containers.require('construction-materials').quantityOf('item.wood-plank')).toBe(0);
    // The order keeps the record of what it consumed -- that is what a cancel
    // refunds from -- so the plank left the container and is accounted for.
    expect(runtime.construction.getOrder('door-1')?.materialsAllocated).toEqual([
      { itemId: 'item.wood-plank', quantity: 1 },
    ]);
  });

  it('carries the door through a save, at the edge value and the state it was built with', () => {
    const runtime = prisonWithDoorOrdered();
    stepTo(runtime, 200);

    const bundle = captureSessionSnapshot(runtime);
    expect(bundle.simulation?.navigation.doors).toEqual([
      {
        id: DOOR_ID,
        position: { x: DOOR_TILE.x, y: DOOR_TILE.y },
        side: 'left',
        state: 'closed',
        requiredSecurityClearance: 0,
        costMultiplier: 1,
      },
    ]);

    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: PRISON_ID,
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    // The door and the edge under it come back together. They travel by
    // different routes -- the door through the navigation section, the edge
    // value through the world snapshot's RLE'd `leftEdge` plane -- so a save
    // that carried one and not the other would show up here.
    expect(restored.navigation.doors.all()).toEqual(runtime.navigation.doors.all());
    expect(restored.world.getLeftEdge(at(DOOR_TILE))).toBe(DOOR_EDGE_NUMERIC_ID);
    // And the id is minted from the edge, so the restored session agrees about
    // it without the save having had to teach it anything (ADR 0012).
    expect(restored.navigation.doors.getByEdge(at(DOOR_TILE), 'left')?.id).toBe(DOOR_ID);
  });

  it('produces byte-identical state for the same command order', () => {
    const left = prisonWithDoorOrdered();
    const right = prisonWithDoorOrdered();
    stepTo(left, 200);
    stepTo(right, 200);

    // Nothing about building a door draws from an RNG stream, so two sessions
    // given the same commands agree exactly -- including on the door id, which
    // is the property that makes portal ordering a function of geometry.
    expect(left.navigation.doors.all()).toEqual(right.navigation.doors.all());
    expect(JSON.stringify(captureSessionSnapshot(left).simulation?.navigation)).toBe(
      JSON.stringify(captureSessionSnapshot(right).simulation?.navigation),
    );
  });
});
