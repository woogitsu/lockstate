import { describe, expect, it } from 'vitest';
import {
  BUILD_EDGES,
  ConstructionSystem,
  DEFAULT_BUILD_EDGE,
  WALL_EDGE_NUMERIC_ID,
  createBuildOrder,
  createConstructionCommandHandler,
  isBuildEdge,
  resolveBuildEdge,
  type BuildEdge,
} from '../../src/simulation/construction';
import type { ConstructionSnapshot } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SAVE_SCHEMA_VERSION, createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, unpackCommand } from '../../src/simulation/protocol/commands';
import { defaultRoomRegistry } from '../../src/simulation/rooms/definition';
import { RoomSystem } from '../../src/simulation/rooms/system';
import { TopologyManager } from '../../src/simulation/rooms/topology';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * Issue #74: completing a build order must change the world.
 *
 * The point of this file is the difference between "a wall exists in the edge
 * layer" and "a wall got there because somebody ordered it built". Nothing
 * below writes `setTopEdge`/`setLeftEdge` by hand: every wall is placed by a
 * `PlaceBuildOrder` command going through the real kernel, the real command
 * handler, the real materials provider and the real lifecycle, and the world
 * is only ever *read*.
 */

const CHUNK_0 = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

function tile(x: number, y: number) {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

/** A loaded, owned single-chunk world, matching what a fresh session gets. */
function loadedWorld(size = 32): SparseWorld {
  const world = new SparseWorld(size);
  world.load(CHUNK_0);
  world.setOwned(CHUNK_0, true);
  return world;
}

/**
 * Runs a `ConstructionSystem` far enough for every submitted order to reach a
 * terminal state. A `wall-brick` needs 50 work at +10 per scheduled tick, and
 * the system is scheduled every 10 ticks, so ~80 ticks is the real cost of one
 * wall; 200 leaves room without depending on the exact number.
 */
function runToCompletion(kernel: Kernel, ticks = 200): void {
  for (let i = 0; i < ticks; i += 1) kernel.step();
}

describe('a build order carries the tile edge it occupies', () => {
  it('names only the two edges the world actually stores', () => {
    // `SparseWorld` has `topEdge` and `leftEdge` and nothing else: the south
    // edge of a tile *is* the north edge of the tile below it. A third or
    // fourth member here would be a second name for a slot that already has
    // one.
    expect([...BUILD_EDGES]).toEqual(['north', 'west']);
    expect(isBuildEdge('north')).toBe(true);
    expect(isBuildEdge('south')).toBe(false);
  });

  it('resolves an order that carries no edge to the documented default', () => {
    const withoutEdge = createBuildOrder('a', 'wall-brick', tile(1, 1));
    expect('edge' in withoutEdge).toBe(false); // absent, not `undefined`
    expect(resolveBuildEdge(withoutEdge)).toBe(DEFAULT_BUILD_EDGE);

    const withEdge = createBuildOrder('b', 'wall-brick', tile(1, 1), 'west');
    expect(withEdge.edge).toBe('west');
    expect(resolveBuildEdge(withEdge)).toBe('west');
  });

  it('carries the edge across the command protocol, and rejects a malformed one', () => {
    const packed = packCommand({
      type: 'PlaceBuildOrder',
      orderId: 'order-1',
      definitionId: 'wall-brick',
      x: 3,
      y: 4,
      edge: 'west',
    });
    const unpacked = unpackCommand(packed);
    expect(unpacked).not.toBeNull();
    expect(unpacked).toMatchObject({ type: 'PlaceBuildOrder', edge: 'west' });

    // An orientation the world has no slot for must not reach the simulation.
    const malformed = {
      ...packed,
      data: { type: 'PlaceBuildOrder', orderId: 'order-1', definitionId: 'wall-brick', x: 3, y: 4, edge: 'south' },
    };
    expect(unpackCommand(malformed as never)).toBeNull();

    // Omitting it entirely still parses -- that is what keeps a command
    // queued by an older build restorable.
    const noEdge = packCommand({ type: 'PlaceBuildOrder', orderId: 'order-2', definitionId: 'wall-brick', x: 0, y: 0 });
    expect(Object.keys(noEdge.data as object)).not.toContain('edge');
    expect(unpackCommand(noEdge)).toMatchObject({ type: 'PlaceBuildOrder' });
  });
});

describe('completing an order writes world geometry', () => {
  function placeWall(world: SparseWorld, edge: BuildEdge | undefined, at = tile(4, 6)): ConstructionSystem {
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    kernel.setCommandHandler(createConstructionCommandHandler(construction));
    kernel.submitCommand(
      'cmd-0',
      0,
      0,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: 'wall-0',
        definitionId: 'wall-brick',
        x: at.x,
        y: at.y,
        ...(edge === undefined ? {} : { edge }),
      }),
    );
    runToCompletion(kernel);
    expect(construction.getOrder('wall-0')?.state).toBe('completed');
    return construction;
  }

  it('writes the north edge, and only the north edge, for a north-edge order', () => {
    const world = loadedWorld();
    placeWall(world, 'north');

    expect(world.getTopEdge(tile(4, 6))).toBe(WALL_EDGE_NUMERIC_ID);
    expect(world.getLeftEdge(tile(4, 6))).toBe(0);
  });

  it('writes the west edge, and only the west edge, for a west-edge order', () => {
    const world = loadedWorld();
    placeWall(world, 'west');

    expect(world.getLeftEdge(tile(4, 6))).toBe(WALL_EDGE_NUMERIC_ID);
    expect(world.getTopEdge(tile(4, 6))).toBe(0);
  });

  it('applies the default edge to an order that names none', () => {
    const world = loadedWorld();
    placeWall(world, undefined);

    // `DEFAULT_BUILD_EDGE` is 'north'; asserting through the constant rather
    // than the literal keeps this test honest if the default is ever revisited.
    const expectTop = DEFAULT_BUILD_EDGE === 'north';
    expect(world.getTopEdge(tile(4, 6))).toBe(expectTop ? WALL_EDGE_NUMERIC_ID : 0);
    expect(world.getLeftEdge(tile(4, 6))).toBe(expectTop ? 0 : WALL_EDGE_NUMERIC_ID);
  });

  it('still bumps the chunk geometry revision, so TopologyManager recomputes', () => {
    const world = loadedWorld();
    const before = world.getChunk(CHUNK_0)?.geometryRevision ?? -1;
    placeWall(world, 'north');
    const after = world.getChunk(CHUNK_0)?.geometryRevision ?? -1;

    expect(after).toBeGreaterThan(before);
  });

  it('writes nothing to the edge layers for a buildable that is not edge geometry', () => {
    // A door is an `'object'` in `BUILDABLE_REGISTRY`. Writing it as an edge
    // would make it opaque to the flood fill -- a door that seals the room.
    const world = loadedWorld();
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    construction.submitOrder(createBuildOrder('door-0', 'door-wooden', tile(4, 6), 'north'));
    const before = world.getChunk(CHUNK_0)?.geometryRevision ?? -1;
    runToCompletion(kernel);

    expect(construction.getOrder('door-0')?.state).toBe('completed');
    expect(world.getTopEdge(tile(4, 6))).toBe(0);
    expect(world.getLeftEdge(tile(4, 6))).toBe(0);
    // But the topological change is still signalled, exactly as before #74.
    expect(world.getChunk(CHUNK_0)?.geometryRevision ?? -1).toBeGreaterThan(before);
  });
});

/**
 * The scope item this issue is really about: a room becomes enclosed
 * *because walls were built*.
 *
 * Every wall below arrives as a `PlaceBuildOrder` on the real session
 * runtime -- real kernel, real command queue, real `ContainerMaterialsProvider`
 * drawing real bricks out of the session's construction container. The world
 * is never written to by the test.
 */
describe('a room becomes enclosed because walls were built', () => {
  /** The 12 edge segments that seal the 3x3 block of tiles x=5..7, y=5..7. */
  const PERIMETER: readonly { readonly x: number; readonly y: number; readonly edge: BuildEdge }[] = [
    // North side: the top edge of the room's own first row.
    { x: 5, y: 5, edge: 'north' },
    { x: 6, y: 5, edge: 'north' },
    { x: 7, y: 5, edge: 'north' },
    // South side: the top edge of the row *below* the room.
    { x: 5, y: 8, edge: 'north' },
    { x: 6, y: 8, edge: 'north' },
    { x: 7, y: 8, edge: 'north' },
    // West side: the left edge of the room's own first column.
    { x: 5, y: 5, edge: 'west' },
    { x: 5, y: 6, edge: 'west' },
    { x: 5, y: 7, edge: 'west' },
    // East side: the left edge of the column *right of* the room.
    { x: 8, y: 5, edge: 'west' },
    { x: 8, y: 6, edge: 'west' },
    { x: 8, y: 7, edge: 'west' },
  ];

  const INSIDE = tile(6, 6);
  const OUTSIDE = tile(1, 1);

  function session() {
    const runtime = createNewSimulationRuntime(1);
    // The role `new-session.ts` documents for session/scenario setup: stock
    // the well-known construction container so orders can consume real
    // materials. 12 walls x 2 bricks, with headroom.
    runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('brick', 100);
    return runtime;
  }

  function submitPerimeter(runtime: ReturnType<typeof session>): void {
    PERIMETER.forEach((segment, index) => {
      runtime.kernel.submitCommand(
        `cmd-${String(index).padStart(2, '0')}`,
        index,
        0,
        packCommand({
          type: 'PlaceBuildOrder',
          // Zero-padded so the canonical (ascending id) processing order is
          // also the readable order.
          orderId: `wall-${String(index).padStart(2, '0')}`,
          definitionId: 'wall-brick',
          x: segment.x,
          y: segment.y,
          edge: segment.edge,
          transactionId: 'perimeter',
        }),
      );
    });
  }

  /** Recomputes topology the way a host would: from the world's own chunk states. */
  function recompute(runtime: ReturnType<typeof session>): TopologyManager {
    const chunk = runtime.world.getChunk(CHUNK_0);
    expect(chunk).toBeDefined();
    runtime.topology.update([chunk!]);
    return runtime.topology;
  }

  it('leaves inside and outside in one region while the walls are only ordered', () => {
    const runtime = session();
    submitPerimeter(runtime);
    runtime.kernel.step(); // commands dispatched; no order has completed yet

    for (const segment of PERIMETER) {
      const at = tile(segment.x, segment.y);
      expect(segment.edge === 'north' ? runtime.world.getTopEdge(at) : runtime.world.getLeftEdge(at)).toBe(0);
    }

    const topology = recompute(runtime);
    expect(topology.getTopologyId(INSIDE)).toBe(topology.getTopologyId(OUTSIDE));
  });

  it('separates inside from outside once the orders complete', () => {
    const runtime = session();
    submitPerimeter(runtime);
    runToCompletion(runtime.kernel);

    for (let index = 0; index < PERIMETER.length; index += 1) {
      expect(runtime.construction.getOrder(`wall-${String(index).padStart(2, '0')}`)?.state).toBe('completed');
    }

    const topology = recompute(runtime);
    const inside = topology.getTopologyId(INSIDE);
    const outside = topology.getTopologyId(OUTSIDE);

    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
    expect(inside).not.toBe(outside);

    // Every tile of the 3x3 interior is in that one region, and no tile
    // outside it is -- a separated region, not an artefact of one lookup.
    for (let y = 5; y <= 7; y += 1) {
      for (let x = 5; x <= 7; x += 1) {
        expect(topology.getTopologyId(tile(x, y)), `${x},${y}`).toBe(inside);
      }
    }
    expect(topology.getTopologyId(tile(4, 6))).toBe(outside);
    expect(topology.getTopologyId(tile(8, 6))).toBe(outside);
    expect(topology.getTopologyId(tile(6, 4))).toBe(outside);
    expect(topology.getTopologyId(tile(6, 8))).toBe(outside);
  });

  it('the materials the walls consumed really left the session container', () => {
    const runtime = session();
    submitPerimeter(runtime);
    runToCompletion(runtime.kernel);

    // 12 walls x 2 bricks out of the 100 deposited. If the orders had stalled
    // in materials-pending the assertions above could never have passed, and
    // this says so in one number.
    expect(runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('brick')).toBe(100 - 24);
  });

  it('RoomSystem stops reporting the enclosure requirement as missing', () => {
    const runtime = session();
    submitPerimeter(runtime);
    runToCompletion(runtime.kernel);
    const topology = recompute(runtime);

    const rooms = new RoomSystem(runtime.world, topology, defaultRoomRegistry);
    const cell = defaultRoomRegistry.getById('room.cell');
    expect(cell).toBeDefined();

    const enclosed = rooms.validateRoom(topology.getTopologyId(INSIDE), cell!.numericId);
    const unknownRegion = rooms.validateRoom(0, cell!.numericId);

    // `validateRoom`'s enclosure test is a mock (docs/HUD_PROJECTIONS.md gap
    // 14): it asks only whether the region has an id. What this asserts is
    // that the interior the walls created *has* one and an unmapped region
    // does not -- the object requirements below it are still unmet, which is
    // why `isValid` is not the assertion.
    expect(enclosed.missingRequirements).not.toContain('Room must be enclosed by walls and doors');
    expect(unknownRegion.missingRequirements).toContain('Room must be enclosed by walls and doors');
  });
});

describe('taking an order back removes the geometry it wrote', () => {
  function completedWall(edge: BuildEdge = 'north') {
    const world = loadedWorld();
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    kernel.setCommandHandler(createConstructionCommandHandler(construction));
    kernel.submitCommand(
      'cmd-0',
      0,
      0,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: 'wall-0',
        definitionId: 'wall-brick',
        x: 4,
        y: 6,
        edge,
        transactionId: 'tx-1',
      }),
    );
    runToCompletion(kernel);
    expect(construction.getOrder('wall-0')?.state).toBe('completed');
    return { world, construction, kernel };
  }

  function edgeValue(world: SparseWorld, edge: BuildEdge): number {
    return edge === 'north' ? world.getTopEdge(tile(4, 6)) : world.getLeftEdge(tile(4, 6));
  }

  it('cancelling a completed order clears the wall it built', () => {
    const { world, construction } = completedWall('north');
    expect(edgeValue(world, 'north')).toBe(WALL_EDGE_NUMERIC_ID);

    construction.cancelOrder('wall-0');

    expect(construction.getOrder('wall-0')?.state).toBe('cancelled');
    expect(edgeValue(world, 'north')).toBe(0);
  });

  it('cancelling clears a west-edge wall from the left edge layer', () => {
    const { world, construction } = completedWall('west');
    expect(edgeValue(world, 'west')).toBe(WALL_EDGE_NUMERIC_ID);

    construction.cancelOrder('wall-0');

    expect(edgeValue(world, 'west')).toBe(0);
  });

  it('bumps the geometry revision on the way back out', () => {
    const { world, construction } = completedWall('north');
    const before = world.getChunk(CHUNK_0)?.geometryRevision ?? -1;

    construction.cancelOrder('wall-0');

    // Removing a wall is as much a topological change as adding one; without
    // this bump `TopologyManager` would keep the sealed region forever.
    expect(world.getChunk(CHUNK_0)?.geometryRevision ?? -1).toBeGreaterThan(before);
  });

  it('undo removes the wall a completed order built', () => {
    const { world, construction, kernel } = completedWall('north');
    expect(edgeValue(world, 'north')).toBe(WALL_EDGE_NUMERIC_ID);

    kernel.submitCommand('cmd-undo', 1, kernel.tick, packCommand({ type: 'Undo' }));
    kernel.step();

    expect(construction.getOrder('wall-0')?.state).toBe('cancelled');
    expect(edgeValue(world, 'north')).toBe(0);
  });

  it('redo puts the wall back', () => {
    const { world, construction, kernel } = completedWall('north');
    kernel.submitCommand('cmd-undo', 1, kernel.tick, packCommand({ type: 'Undo' }));
    kernel.step();
    expect(edgeValue(world, 'north')).toBe(0);

    kernel.submitCommand('cmd-redo', 2, kernel.tick, packCommand({ type: 'Redo' }));
    runToCompletion(kernel);

    expect(construction.getOrder('wall-0')?.state).toBe('completed');
    expect(edgeValue(world, 'north')).toBe(WALL_EDGE_NUMERIC_ID);
  });

  it('does not delete a second order\'s wall standing on the same edge', () => {
    const world = loadedWorld();
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    // Nothing rejects two orders claiming one edge, so cancelling one must
    // not silently erase the other's wall.
    construction.submitOrder(createBuildOrder('wall-a', 'wall-brick', tile(4, 6), 'north'));
    construction.submitOrder(createBuildOrder('wall-b', 'wall-brick', tile(4, 6), 'north'));
    runToCompletion(kernel);
    expect(construction.getOrder('wall-a')?.state).toBe('completed');
    expect(construction.getOrder('wall-b')?.state).toBe('completed');

    construction.cancelOrder('wall-a');
    expect(world.getTopEdge(tile(4, 6))).toBe(WALL_EDGE_NUMERIC_ID);

    construction.cancelOrder('wall-b');
    expect(world.getTopEdge(tile(4, 6))).toBe(0);
  });

  it('still refuses to cancel an order that is already terminal', () => {
    const { construction } = completedWall('north');
    construction.cancelOrder('wall-0');
    expect(() => construction.cancelOrder('wall-0')).toThrow(/Cannot cancel order in state cancelled/);
  });
});

describe('construction iterates its orders in a canonical order', () => {
  it('resolves two orders claiming one edge by id, not by insertion order', () => {
    // Both orders write the same value today, so the observable consequence
    // is the *snapshot*: an insertion-ordered snapshot re-inserted by
    // `restore()` would hand a restored session a different iteration order
    // than the live one it came from.
    const forwards = new ConstructionSystem(loadedWorld());
    forwards.submitOrder(createBuildOrder('wall-a', 'wall-brick', tile(1, 1), 'north'));
    forwards.submitOrder(createBuildOrder('wall-b', 'wall-brick', tile(1, 1), 'north'));

    const backwards = new ConstructionSystem(loadedWorld());
    backwards.submitOrder(createBuildOrder('wall-b', 'wall-brick', tile(1, 1), 'north'));
    backwards.submitOrder(createBuildOrder('wall-a', 'wall-brick', tile(1, 1), 'north'));

    expect(forwards.snapshot().orders.map((order) => order.id)).toEqual(['wall-a', 'wall-b']);
    expect(backwards.snapshot().orders.map((order) => order.id)).toEqual(['wall-a', 'wall-b']);
  });

  it('a restored session writes the same geometry as the one it was captured from', () => {
    const build = (ids: readonly string[]): SparseWorld => {
      const world = loadedWorld();
      const construction = new ConstructionSystem(world);
      const kernel = new Kernel();
      kernel.registerSystem(construction);
      for (const id of ids) {
        construction.submitOrder(createBuildOrder(id, 'wall-brick', tile(2, 3), id === 'wall-a' ? 'north' : 'west'));
      }
      runToCompletion(kernel);
      return world;
    };

    const live = build(['wall-a', 'wall-b']);
    const reversed = build(['wall-b', 'wall-a']);

    expect(reversed.getTopEdge(tile(2, 3))).toBe(live.getTopEdge(tile(2, 3)));
    expect(reversed.getLeftEdge(tile(2, 3))).toBe(live.getLeftEdge(tile(2, 3)));
    expect(reversed.snapshot()).toEqual(live.snapshot());
  });
});

describe('a build order with an edge survives the save envelope', () => {
  /**
   * The envelope's `buildOrderSchema` is `.strict()`, so a key it does not
   * name is not merely dropped -- the whole save is rejected. Before the
   * optional `edge` was declared there, finishing a wall made the game
   * unsaveable, which a headless construction test could never notice.
   */
  const envelopeInput = (construction: ConstructionSnapshot, world: SparseWorld = loadedWorld()) => ({
    gameVersion: 'test',
    prisonId: 'prison-1',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    kernel: { tick: 0, expectedSequence: 0, rngStates: [], commands: [] },
    // The *same* world the orders were built in -- the wall lives in its edge
    // layer, not in the order, so snapshotting a fresh world would prove
    // nothing about whether the geometry survives.
    world: world.snapshot(),
    construction,
  });

  it('writes and reads back a finished wall on the current schema version', () => {
    const world = loadedWorld();
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    construction.submitOrder(createBuildOrder('wall-0', 'wall-brick', tile(4, 6), 'west'));
    runToCompletion(kernel);
    expect(construction.getOrder('wall-0')?.state).toBe('completed');
    expect(world.getLeftEdge(tile(4, 6))).toBe(WALL_EDGE_NUMERIC_ID);

    const envelope = createSaveEnvelope(envelopeInput(construction.snapshot(), world));
    expect(envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);

    // Writing is only half of it: the same envelope has to survive the
    // checksum and come back through `decodeSaveEnvelope`, which is the path
    // a load actually takes. Round-tripped through JSON first, because that
    // is what IndexedDB gives back.
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded.ok, decoded.ok ? '' : decoded.error.message).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(decoded.migrated).toBe(false); // written at the current version, so nothing had to be upgraded
    expect(decoded.value.payload.construction.orders[0]).toMatchObject({ id: 'wall-0', edge: 'west' });
    // The geometry itself rides in the world's own edge layer, so a restored
    // world still has the wall even though nothing re-runs the order.
    const restored = SparseWorld.fromSnapshot(decoded.value.payload.world);
    expect(restored.getLeftEdge(tile(4, 6))).toBe(WALL_EDGE_NUMERIC_ID);
    expect(restored.getTopEdge(tile(4, 6))).toBe(0);
  });

  it('still accepts one that carries none, so no migration is needed', () => {
    const construction = new ConstructionSystem(loadedWorld());
    construction.submitOrder(createBuildOrder('wall-0', 'wall-brick', tile(4, 6)));

    const envelope = createSaveEnvelope(envelopeInput(construction.snapshot()));
    expect(envelope.payload.construction.orders[0]).not.toHaveProperty('edge');

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded.ok).toBe(true);
  });

  it('rejects an edge the world has no slot for', () => {
    const construction: ConstructionSnapshot = {
      orders: [
        {
          id: 'wall-0',
          definitionId: 'wall-brick',
          location: tile(4, 6),
          edge: 'south' as never,
          state: 'planned',
          progress: 0,
          materialsAllocated: [],
        },
      ],
      undoStack: [],
      redoStack: [],
    };
    expect(() => createSaveEnvelope(envelopeInput(construction))).toThrow();
  });
});

describe('a save written before the edge field still loads', () => {
  it('restores an order with no edge and treats it as the documented default', () => {
    const world = loadedWorld();
    const construction = new ConstructionSystem(world);

    // Exactly the shape a V1/V2 `ConstructionSnapshot` holds: no `edge` key
    // anywhere, because the field did not exist when it was written.
    construction.restore({
      orders: [
        {
          id: 'legacy-wall',
          definitionId: 'wall-brick',
          location: tile(9, 9),
          state: 'in-progress',
          progress: 40,
          materialsAllocated: [{ itemId: 'brick', quantity: 2 }],
        },
      ],
      undoStack: [],
      redoStack: [],
    });

    const kernel = new Kernel();
    kernel.registerSystem(construction);
    runToCompletion(kernel);

    expect(construction.getOrder('legacy-wall')?.state).toBe('completed');
    expect(resolveBuildEdge(construction.getOrder('legacy-wall')!)).toBe(DEFAULT_BUILD_EDGE);
    expect(world.getTopEdge(tile(9, 9))).toBe(WALL_EDGE_NUMERIC_ID);
  });
});
