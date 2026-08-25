import { describe, expect, it } from 'vitest';
import { intakeStageIndex } from '../../src/simulation/prisoners/components';
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
    // real decision -- it decides which parcel `getParcelAtTile` names, for
    // pricing, selection and UI. It no longer decides `isTileOwned`, which
    // asks whether any owned parcel contains the tile and so cannot depend on
    // the order at all (issue #93, ADR 0019).
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

  /**
   * The test above varies only chunk order *within one recompute*, so it
   * cannot see the second half of the property: every variant it builds gets
   * a fresh `TopologyManager`, and a fresh manager starts its counter at 1
   * however the counter is scoped. Issue #112 is what that blind spot hid --
   * the counter was instance state that no recompute reset, so the ids a
   * world ended up with were a function of how many times its geometry had
   * changed rather than of the geometry.
   *
   * These pin the missing axis: identical geometry reached by different
   * recompute histories, and a manager rebuilt over a world another manager
   * has been living on (the restore path, where `TopologyManager` is
   * reconstructed from scratch while the world is not).
   */
  function seal(world: SparseWorld, sealed: boolean): void {
    for (let y = 0; y < 8; y += 1) world.setLeftEdge(TILE(4, y), sealed ? 1 : 0);
  }

  function openFourChunkWorld(): SparseWorld {
    const world = fourChunkWorld();
    seal(world, false);
    return world;
  }

  function readIds(manager: TopologyManager): readonly number[] {
    const ids: number[] = [];
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) ids.push(manager.getTopologyId(TILE(x, y)));
    return ids;
  }

  function loadedChunks(world: SparseWorld) {
    return chunkPositions().map((position) => world.getChunk(position)!);
  }

  it('assigns the same ids whether the geometry was reached in one recompute or four', () => {
    const direct = fourChunkWorld();
    const directManager = new TopologyManager(direct);
    directManager.update(loadedChunks(direct));

    // Same end geometry, reached the long way: open -> sealed -> open ->
    // sealed, on one manager, so four recomputes have run against it.
    const lived = openFourChunkWorld();
    const livedManager = new TopologyManager(lived);
    livedManager.update(loadedChunks(lived));
    seal(lived, true);
    livedManager.update(loadedChunks(lived));
    seal(lived, false);
    livedManager.update(loadedChunks(lived));
    seal(lived, true);
    livedManager.update(loadedChunks(lived));

    // The two worlds really are the same world, edge by edge -- otherwise
    // this would be pinning a geometry difference and calling it determinism.
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        expect(lived.getLeftEdge(TILE(x, y))).toBe(direct.getLeftEdge(TILE(x, y)));
        expect(lived.getTopEdge(TILE(x, y))).toBe(direct.getTopEdge(TILE(x, y)));
      }
    }

    expect(readIds(livedManager)).toEqual(readIds(directManager));

    // Non-vacuous in the same way as above, and additionally: the ids must
    // start from 1, because "a function of the geometry" is what makes a
    // rebuilt manager agree with a lived one at all.
    expect([...new Set(readIds(directManager))].sort()).toEqual([1, 2]);
  });

  it('agrees with a manager rebuilt over a world an older manager has been living on', () => {
    const world = openFourChunkWorld();
    const lived = new TopologyManager(world);
    lived.update(loadedChunks(world));
    seal(world, true);
    lived.update(loadedChunks(world));

    const rebuilt = new TopologyManager(world);
    rebuilt.update(loadedChunks(world));

    // Not merely a shifted numbering. Before the fix the lived manager
    // reported left=2 / right=3 and the rebuilt one left=1 / right=2, so the
    // integer 2 named the left half in one and the right half in the other --
    // an association defect, which is why asserting on the whole id vector
    // rather than on its shape is the point of this test.
    expect(rebuilt.getTopologyId(TILE(0, 0))).toBe(lived.getTopologyId(TILE(0, 0)));
    expect(rebuilt.getTopologyId(TILE(7, 0))).toBe(lived.getTopologyId(TILE(7, 0)));
    expect(readIds(rebuilt)).toEqual(readIds(lived));
    expect(new Set(readIds(rebuilt)).size).toBeGreaterThan(1);
  });

  /**
   * The third axis, and the one #112's fix recorded under "Known limitations"
   * rather than closed: not the counter, and not chunk-processing order within
   * a recompute, but *which chunks contribute nodes at all*. `chunkTopologies`
   * was append-only -- `update()` skipped a non-loaded chunk instead of
   * dropping it -- so an unloaded chunk's regions stayed in the component walk
   * and the node set was a function of chunk **load** history.
   *
   * That is an association defect, not a numbering one, and the first test
   * below is built so the two cannot be confused: three chunks in a row, all
   * open, so LEFT and RIGHT are connected *only through* MIDDLE. A retained
   * MIDDLE therefore does not shift a label, it answers a different
   * connectivity question -- two loaded chunks bridged through space that is
   * not loaded. Content-addressing the ids would not have helped, because the
   * component being addressed is itself wrong.
   */
  const ROW = {
    left: { x: chunkCoordinate(0), y: chunkCoordinate(0) },
    middle: { x: chunkCoordinate(1), y: chunkCoordinate(0) },
    right: { x: chunkCoordinate(2), y: chunkCoordinate(0) },
  } as const;

  /**
   * Writes every edge *inside* one chunk, and no edge outside it. Staying
   * inside matters: `SparseWorld.setLeftEdge` loads the chunk it writes to, so
   * a helper that reached one tile past the boundary would silently load a
   * fourth chunk -- and, worse, could re-load a chunk the test had just
   * unloaded.
   */
  function openChunk(world: SparseWorld, position: { readonly x: number; readonly y: number }): void {
    for (let ly = 0; ly < 4; ly += 1) {
      for (let lx = 0; lx < 4; lx += 1) {
        const tile = TILE(position.x * 4 + lx, position.y * 4 + ly);
        world.setLeftEdge(tile, 0);
        world.setTopEdge(tile, 0);
      }
    }
  }

  function rowWorld(): SparseWorld {
    const world = new SparseWorld(4);
    for (const position of [ROW.left, ROW.middle, ROW.right]) {
      world.load(position);
      world.setOwned(position, true);
      openChunk(world, position);
    }
    return world;
  }

  const rowChunks = (world: SparseWorld) => [ROW.left, ROW.middle, ROW.right].map((position) => world.getChunk(position)!);

  const rowIds = (manager: TopologyManager) => ({
    left: manager.getTopologyId(TILE(0, 0)),
    middle: manager.getTopologyId(TILE(5, 0)),
    right: manager.getTopologyId(TILE(9, 0)),
  });

  it('does not bridge two loaded chunks through a chunk that has since unloaded', () => {
    // Lived: the manager processed MIDDLE while it was loaded, and MIDDLE
    // then unloaded with no geometry revision moving anywhere.
    const livedWorld = rowWorld();
    const lived = new TopologyManager(livedWorld);
    lived.update(rowChunks(livedWorld));
    livedWorld.unload(ROW.middle);
    lived.update(rowChunks(livedWorld));

    // Fresh: the identical world, with the manager built after the unload --
    // which is exactly the restore path, where `TopologyManager` is
    // reconstructed from scratch over a world that is not.
    const freshWorld = rowWorld();
    freshWorld.unload(ROW.middle);
    const fresh = new TopologyManager(freshWorld);
    fresh.update(rowChunks(freshWorld));

    // The two really are one world, so this pins a manager difference and not
    // a geometry difference smuggled in by the build order.
    expect(freshWorld.snapshot()).toEqual(livedWorld.snapshot());
    expect(rowIds(lived)).toEqual(rowIds(fresh));

    // Non-vacuous, and the substance rather than the shape: LEFT and RIGHT
    // are reachable from each other only through MIDDLE, so a retained
    // MIDDLE gives them one id and dropping it gives them two. Before
    // eviction the lived manager answered left=1 / right=1 against the fresh
    // manager's left=1 / right=2 -- the integer 1 naming LEFT-with-RIGHT in
    // one and LEFT alone in the other.
    const ids = rowIds(lived);
    expect(ids.left).toBeGreaterThan(0);
    expect(ids.right).toBeGreaterThan(0);
    expect(ids.left).not.toBe(ids.right);

    // And an unloaded chunk is named in neither. `getTopologyId` already
    // answered 0 for a chunk it had no topology for; the point is that it now
    // has none.
    expect(ids.middle).toBe(0);
  });

  it('assigns the same ids whether a chunk was loaded and dropped first or never processed', () => {
    // The load order the residue was recorded against, literally: load a
    // chunk, process it, unload it, load another -- versus reaching the same
    // loaded set without the manager ever seeing the first.
    const processedWorld = new SparseWorld(4);
    processedWorld.load(ROW.left);
    processedWorld.setOwned(ROW.left, true);
    openChunk(processedWorld, ROW.left);
    const processed = new TopologyManager(processedWorld);
    processed.update([processedWorld.getChunk(ROW.left)!]);
    processedWorld.unload(ROW.left);
    processedWorld.load(ROW.right);
    processedWorld.setOwned(ROW.right, true);
    openChunk(processedWorld, ROW.right);
    processed.update([processedWorld.getChunk(ROW.left)!, processedWorld.getChunk(ROW.right)!]);

    const skippedWorld = new SparseWorld(4);
    skippedWorld.load(ROW.left);
    skippedWorld.setOwned(ROW.left, true);
    openChunk(skippedWorld, ROW.left);
    skippedWorld.unload(ROW.left);
    skippedWorld.load(ROW.right);
    skippedWorld.setOwned(ROW.right, true);
    openChunk(skippedWorld, ROW.right);
    const skipped = new TopologyManager(skippedWorld);
    skipped.update([skippedWorld.getChunk(ROW.left)!, skippedWorld.getChunk(ROW.right)!]);

    expect(skippedWorld.snapshot()).toEqual(processedWorld.snapshot());

    // Before eviction the processed run answered right=2 / left=1 and the
    // skipped run right=1 / left=0: the integer 1 named RIGHT in one world
    // and the unloaded LEFT in the other.
    expect(processed.getTopologyId(TILE(9, 0))).toBe(skipped.getTopologyId(TILE(9, 0)));
    expect(processed.getTopologyId(TILE(0, 0))).toBe(skipped.getTopologyId(TILE(0, 0)));

    // Pinned as values too, so a change that made both sides agree on the
    // wrong answer would still fail: the only loaded chunk is the first
    // component, and the dropped one is named by nothing.
    expect(processed.getTopologyId(TILE(9, 0))).toBe(1);
    expect(processed.getTopologyId(TILE(0, 0))).toBe(0);
  });

  it('re-admits a chunk that is loaded again, with the ids it would have had all along', () => {
    // Eviction must not be a one-way door: a streaming world reloads chunks,
    // and a reloaded chunk has to rejoin the walk. The revision guard in
    // `update()` is what makes this worth pinning -- a reloaded chunk's
    // `geometryRevision` has not moved, so it is only re-processed because
    // eviction removed its retained entry.
    const world = rowWorld();
    const manager = new TopologyManager(world);
    manager.update(rowChunks(world));
    const whole = rowIds(manager);

    world.unload(ROW.middle);
    manager.update(rowChunks(world));
    expect(rowIds(manager).middle).toBe(0);

    world.load(ROW.middle);
    manager.update(rowChunks(world));

    expect(rowIds(manager)).toEqual(whole);
    // Non-vacuous: with all three loaded the row is one region, so this is
    // asserting a real merge and not three zeroes.
    expect(whole.left).toBe(1);
    expect(whole.middle).toBe(1);
    expect(whole.right).toBe(1);
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
  });

  it('fills cells from the front of that order as intake actually assigns them, arrival by arrival', () => {
    // Asking `findAvailable` directly only pins what the registry answers.
    // `IntakeSystem` is the caller whose answer reaches state, and nothing
    // made it use that answer: an intake that walked the same sorted list
    // backwards -- packing arrivals from `cell-4` down -- leaves both the
    // registry accessor above and every run-against-run determinism
    // comparison in this file unchanged, because both runs would pack
    // backwards identically. Naming the instances is what distinguishes
    // them.
    //
    // The scenario admits four prisoners in a fixed order into an empty
    // prison, and nothing destroys a prisoner entity, so ascending entity
    // index is admission order -- the same order `EntityQuery.execute()`
    // hands them to `IntakeSystem.update`.
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    // Four intake firings (ticks 0, 5, 10, 15) carry an arrival from
    // 'queued' to a terminal stage.
    for (let tick = 0; tick < 20; tick += 1) runtime.kernel.step();

    const admissionOrder = Array.from({ length: runtime.prisoners.entityStore.maxActiveIndex + 1 }, (_, index) =>
      runtime.prisoners.entityStore.getIdByIndex(index),
    );

    // Four arrivals, the four lowest cell ids, in admission order -- which is
    // the whole of what this case is named for, and it did not used to hold.
    // The second arrival classifies 'high-risk' under this seed, and
    // `DEFAULT_ACCOMMODATION_POLICY` prefers `room.solitary-cell` for that
    // group, of which this scenario registers no instance at all. That used to
    // end the arrival in the terminal `'failed'` stage holding no
    // accommodation, so this sequence read `['cell-1', undefined, 'cell-2',
    // 'cell-3']` and left `cell-4` free -- a hole in the very front-to-back
    // fill the case exists to measure.
    //
    // The policy now names an ordinary cell as high-risk's fallback, and
    // `IntakeSystem.resolveExistingTarget` takes it because the prison holds
    // no instance of the preferred type at all. So the arrival is housed
    // rather than stranded, and the fill has no hole in it. Nothing about the
    // *order* moved: each arrival still takes the lowest free instance in
    // canonical order at the tick it is assigned.
    expect(admissionOrder.map((entityId) => runtime.prisoners.coldState.getAccommodation(entityId))).toEqual([
      'cell-1',
      'cell-2',
      'cell-3',
      'cell-4',
    ]);

    // And each of them reached a real accommodation rather than being parked:
    // `'completed'`, not `'failed'` and not still waiting on a cell that never
    // freed up.
    expect(admissionOrder.map((entityId) => runtime.prisoners.records.intakeStage[runtime.prisoners.entityStore.getIndex(entityId)])).toEqual([
      intakeStageIndex('completed'),
      intakeStageIndex('completed'),
      intakeStageIndex('completed'),
      intakeStageIndex('completed'),
    ]);
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
