import { describe, expect, it } from 'vitest';
import { TopologyManager } from '../../src/simulation/rooms/topology';
import { chunkCoordinate, tileCoordinate, type ChunkPosition } from '../../src/simulation/world/coordinates';
import type { ParcelDefinition } from '../../src/simulation/world/parcel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { fullRuntimeState } from '../helpers/determinism-state';

/**
 * The classic silent determinism break: deriving simulation state by
 * iterating a `Map` or `Set`, whose order is insertion order -- a property
 * of *how a session happened to be built*, not of its state. A fresh run
 * and a snapshot-restored run insert in different orders (nearly every
 * `getSnapshot` in this codebase emits sorted entries), so the two diverge
 * without any obvious cause.
 *
 * Each test below states the canonical order the implementation must use.
 * Reverting a sort to `Map`/`Set` order, or to `localeCompare`, fails
 * these -- which is the point.
 */

const TILE = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('parcel lookup is ordered by state, not by registration history', () => {
  const overlappingBounds = { x: tileCoordinate(0), y: tileCoordinate(0), width: 8, height: 8 };
  const parcels: readonly ParcelDefinition[] = [
    { id: 'b-plot', bounds: overlappingBounds, basePrice: 100 },
    { id: 'A-plot', bounds: overlappingBounds, basePrice: 200 },
    { id: 'a-plot', bounds: overlappingBounds, basePrice: 300 },
    { id: 'B-plot', bounds: overlappingBounds, basePrice: 400 },
  ];

  function worldWith(order: readonly ParcelDefinition[]): SparseWorld {
    const world = new SparseWorld(32);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    for (const parcel of order) world.registerParcel(parcel);
    return world;
  }

  it('lists parcels in code-unit order, not locale collation order', () => {
    // `localeCompare` would produce ['a-plot','A-plot','b-plot','B-plot'] on a
    // full-ICU runtime and something else again on a different ICU build.
    // Code-unit order is spec-defined and identical everywhere.
    expect(worldWith(parcels).getAllParcels().map((parcel) => parcel.id)).toEqual(['A-plot', 'B-plot', 'a-plot', 'b-plot']);
  });

  it('resolves an overlapped tile to the same parcel regardless of registration order', () => {
    // `registerParcel` does not reject overlaps, so "first match wins" is a
    // real decision -- and it decides `isTileOwned`, and through it
    // `canBuildAt`.
    const forwards = worldWith(parcels);
    const backwards = worldWith([...parcels].reverse());

    expect(forwards.getParcelAtTile(TILE(3, 3))?.id).toBe('A-plot');
    expect(backwards.getParcelAtTile(TILE(3, 3))?.id).toBe(forwards.getParcelAtTile(TILE(3, 3))?.id);
  });

  it('survives a world snapshot round trip with the same lookup answer', () => {
    const built = worldWith([...parcels].reverse());
    built.setParcelOwned('A-plot', true);
    const restored = SparseWorld.fromSnapshot(built.snapshot());

    expect(restored.getAllParcels().map((parcel) => parcel.id)).toEqual(built.getAllParcels().map((parcel) => parcel.id));
    expect(restored.getParcelAtTile(TILE(3, 3))?.id).toBe(built.getParcelAtTile(TILE(3, 3))?.id);
    expect(restored.isTileOwned(TILE(3, 3))).toBe(built.isTileOwned(TILE(3, 3)));
    expect(restored.snapshot()).toEqual(built.snapshot());
  });
});

describe('global topology ids are derived from world geometry, not from chunk-processing order', () => {
  function fourChunkWorld(): SparseWorld {
    const world = new SparseWorld(4);
    for (const position of chunkPositions()) {
      world.load(position);
      world.setOwned(position, true);
    }
    // A full-height wall on the vertical seam at global x=4 splits what
    // would otherwise be one connected region, so there is genuinely more
    // than one global id to hand out.
    for (let y = 0; y < 8; y += 1) world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
    return world;
  }

  const chunkPositions = (): readonly ChunkPosition[] => [
    { x: chunkCoordinate(0), y: chunkCoordinate(0) },
    { x: chunkCoordinate(1), y: chunkCoordinate(0) },
    { x: chunkCoordinate(0), y: chunkCoordinate(1) },
    { x: chunkCoordinate(1), y: chunkCoordinate(1) },
  ];

  function topologyIds(world: SparseWorld, chunkOrder: readonly ChunkPosition[]): readonly number[] {
    const manager = new TopologyManager(world);
    manager.update(chunkOrder.map((position) => world.getChunk(position)!));
    const ids: number[] = [];
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) ids.push(manager.getTopologyId(TILE(x, y)));
    return ids;
  }

  it('assigns the same ids whatever order chunks were processed in', () => {
    const world = fourChunkWorld();
    const inOrder = topologyIds(world, chunkPositions());
    const reversed = topologyIds(fourChunkWorld(), [...chunkPositions()].reverse());
    const shuffled = topologyIds(fourChunkWorld(), [chunkPositions()[2]!, chunkPositions()[0]!, chunkPositions()[3]!, chunkPositions()[1]!]);

    expect(reversed).toEqual(inOrder);
    expect(shuffled).toEqual(inOrder);

    // Non-vacuous: the wall really did split the world into more than one
    // global region, so there was an id-assignment choice to get wrong.
    expect(new Set(inOrder).size).toBeGreaterThan(1);
  });
});

describe('search jobs and room instances are ordered canonically, not by registration history', () => {
  it('advances active search jobs in ascending order id, even though they were queued b-then-a', () => {
    // `SearchSystem.update` iterates in this order and each job's detection
    // check draws from the shared `contraband.detection` stream, so this is
    // what decides which draw each concealed item is checked against. The
    // behavioural consequence -- a snapshot round trip changing which
    // contraband is found -- is pinned in
    // `snapshot-restore-fidelity.test.ts`; this keeps the canonical order
    // itself visible.
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    runtime.kernel.step();
    expect(runtime.searchSystem.getSnapshot().active.map(([id]) => id)).toEqual(['search-a', 'search-b']);
  });

  it('lists room instances in ascending instance id, even though they were registered out of order', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell').map((instance) => instance.instanceId)).toEqual(['cell-1', 'cell-2', 'cell-3', 'cell-4']);
    // `findAvailable` returns the first of that order, so accommodation
    // assignment is a function of registry state, not of registration order.
    expect(runtime.prisoners.roomInstances.findAvailable('room.cell', 'sleep-surface')?.instanceId).toBe('cell-1');
  });

  it('plays out identically when every incidental registration order is reversed', () => {
    // Rooms, doors, sectors, schedules, containers, job workers, carry jobs
    // and gangs are all read through canonically ordered accessors, so the
    // order they were registered in is not part of the run. If any of those
    // accessors fell back to `Map`/`Set` order, this diverges -- and so
    // would a snapshot-restored session, which re-registers them sorted.
    const asBuilt = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(asBuilt);
    for (let tick = 0; tick < 250; tick += 1) asBuilt.kernel.step();

    const reversed = buildDeterminismScenario(SCENARIO_SEED, { reverseIncidentalRegistrationOrder: true });
    submitScenarioCommands(reversed);
    for (let tick = 0; tick < 250; tick += 1) reversed.kernel.step();

    expect(fullRuntimeState(reversed)).toEqual(fullRuntimeState(asBuilt));
  });

  it('runs a full session to identical state twice, covering every ordered iteration above at once', () => {
    const first = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(first);
    for (let tick = 0; tick < 250; tick += 1) first.kernel.step();

    const second = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(second);
    for (let tick = 0; tick < 250; tick += 1) second.kernel.step();

    expect(fullRuntimeState(second)).toEqual(fullRuntimeState(first));
  });
});
