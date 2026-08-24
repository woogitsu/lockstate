import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { packCommand } from '../../src/simulation/protocol/commands';
import { roomInstanceIdFor } from '../../src/simulation/rooms/zoning';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * Issue #261 step 3: **a `ZoneRoom` command registers a room instance, and
 * the status strip's `Rooms` count moves.**
 *
 * Before this, `ZoneRoom` was a fully formed command with a no-op consumer.
 * It had a schema, a `commandJson` case, a save representation and a handler
 * branch that did nothing, so the only thing in the whole application that
 * could register a room instance was the *restore* path -- which can only
 * give back a room some earlier session never had a way to create. The
 * `Rooms` counter on the strip was therefore structurally zero, in the same
 * class of lie `src/ui/hud/projection.ts` warns about for a money counter
 * with no economy.
 *
 * Everything below goes through the real kernel, the real decoder, the real
 * session command router and the real save envelope. Nothing calls
 * `RoomInstanceRegistry.register` or `SparseWorld.setZoning` by hand: a test
 * that did would prove the registry works and say nothing about whether a
 * command can reach it.
 *
 * `ZoneRoom` still has no *producer* -- no HUD control builds one, which is
 * why it keeps its entry in
 * `tests/foundation/unconsumed-command-contract.test.ts`. This is the
 * simulation half only.
 */

const SEED = 11;
const CELL = 'room.cell';
const PRISON_ID = 'zoning-round-trip-prison';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/** The full save path a session controller takes, including the storage round trip that destroys object identity. */
function saveAndLoad(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
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

  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
}

/** Dispatches one `ZoneRoom` through the kernel, at the sequence the kernel is expecting. */
function submitZoneRoom(
  runtime: SimulationRuntime,
  id: string,
  zone: { readonly roomId: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): void {
  runtime.kernel.submitCommand(
    id,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand({ type: 'ZoneRoom', ...zone }),
  );
  runtime.kernel.step();
}

describe('zoning a room through the real command path (#261)', () => {
  it('moves the Rooms count off zero, which nothing in the application could do before', () => {
    const runtime = createNewSimulationRuntime(SEED);

    // Both halves stated: a fresh prison has no rooms, and the count that
    // reports it is the one the worker actually publishes to the strip.
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId(CELL)).toEqual([]);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(0);

    submitZoneRoom(runtime, 'cmd-zone-1', { roomId: CELL, x: 4, y: 6, width: 2, height: 3 });

    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.rooms, 'the command must have registered a room instance').toBe(1);
    // The instance is real but empty: no objects exist to give it a capacity,
    // so the strip's capacity total is honestly still zero. Asserted so that
    // this stays a measured consequence rather than an unnoticed one.
    expect(counts.roomCapacity).toBe(0);

    const instance = runtime.prisoners.roomInstances.getById(roomInstanceIdFor(CELL, tile(4, 6)));
    expect(instance, 'the id must be the one derived from the anchor tile').toBeDefined();
    expect(instance!.anchorTile).toEqual(tile(4, 6));
    expect(runtime.roomZoning.recentRefusals(), 'an accepted zone must record no refusal').toEqual([]);

    // And the world changed too -- an instance registered without the zoning
    // plane painted would be a room with no shape, invisible to the renderer.
    expect(runtime.world.getZoning(tile(5, 8))).toBe(defaultRoomContentRegistry.getById(CELL)!.numericId);
  });

  it('survives a save and load, in both of the two places a zoned room lives', () => {
    const runtime = createNewSimulationRuntime(SEED);
    submitZoneRoom(runtime, 'cmd-zone-1', { roomId: CELL, x: 4, y: 6, width: 2, height: 3 });

    const restored = saveAndLoad(runtime);

    expect(projectStatusCounts(restored, restored.kernel.tick).rooms).toBe(1);
    expect(restored.prisoners.roomInstances.getById(roomInstanceIdFor(CELL, tile(4, 6)))?.anchorTile).toEqual(tile(4, 6));
    expect(restored.world.getZoning(tile(5, 8))).toBe(defaultRoomContentRegistry.getById(CELL)!.numericId);

    // The two halves are carried by two different parts of the payload -- the
    // instance by `simulation.prisoners.roomInstanceDefinitions`, the shape by
    // the world snapshot's per-chunk zoning plane -- so each is proven by a
    // refusal only that half can produce. Reading the count alone would pass
    // with the plane lost, and the next zone would silently overlap the room.
    submitZoneRoom(restored, 'cmd-zone-again', { roomId: CELL, x: 4, y: 6, width: 2, height: 3 });
    submitZoneRoom(restored, 'cmd-zone-overlap', { roomId: 'room.canteen', x: 5, y: 7, width: 6, height: 6 });

    expect(restored.roomZoning.recentRefusals().map((refusal) => refusal.reason)).toEqual([
      'duplicate-instance-id',
      'overlaps-existing-room',
    ]);
    expect(projectStatusCounts(restored, restored.kernel.tick).rooms, 'neither refusal may register anything').toBe(1);
  });

  it('refuses a zone on land the prison does not own, and changes nothing', () => {
    const runtime = createNewSimulationRuntime(SEED);
    // Chunk (0,0) is the only chunk a new session owns, so tile 40 is off the
    // materialised world entirely.
    submitZoneRoom(runtime, 'cmd-zone-far', { roomId: CELL, x: 40, y: 40, width: 2, height: 3 });

    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(0);
    expect(runtime.roomZoning.recentRefusals().map((refusal) => refusal.reason)).toEqual(['out-of-bounds']);
    // The refusal reason really is kept rather than reconstructed: it names
    // the tile that decided it and the tick it was decided at.
    expect(runtime.roomZoning.recentRefusals()[0]).toMatchObject({
      request: { roomCatalogId: CELL, x: 40, y: 40, width: 2, height: 3 },
      tile: tile(40, 40),
    });
  });

  it('leaves a nonsense room id at the boundary instead of registering it', () => {
    const runtime = createNewSimulationRuntime(SEED);
    submitZoneRoom(runtime, 'cmd-zone-unknown', { roomId: 'room.panopticon', x: 0, y: 0, width: 2, height: 2 });

    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(0);
    expect(runtime.roomZoning.recentRefusals().map((refusal) => refusal.reason)).toEqual(['unknown-room-type']);
    // An instance registered under an id the catalog does not define would be
    // invisible to every room projection (docs/HUD_PROJECTIONS.md gap 15) --
    // a room the player zoned and the HUD cannot count.
    expect(runtime.world.getZoning(tile(0, 0))).toBe(0);
  });
});
