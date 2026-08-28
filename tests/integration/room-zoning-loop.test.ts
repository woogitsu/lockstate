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

/** An arbitrary non-zero edge value; the layers store a numeric id and enclosure cares only that one is present. */
const WALL = 7;

/**
 * Walls a rectangle's perimeter, on the two edges the world stores.
 *
 * Needed since `RoomZoningService.zone` began refusing an `enclosed` room whose
 * perimeter is open (the ADR "Must a zoned room be enclosed"): `room.cell` and
 * `room.canteen` both author `enclosed`, so a rectangle dragged over the
 * starter prison's open ground is now `not-enclosed` and never reaches the
 * behaviour these cases are about.
 *
 * Written directly rather than through `PlaceBuildOrder`, and that is a
 * deliberate limit on what this file claims. A real player buys bricks and
 * waits for ten wall orders; this writes the edges the completed orders would
 * have written, because the subject here is the `ZoneRoom` command path and not
 * the construction one. `tests/integration/door-construction-loop.test.ts` is
 * the file that refuses to shortcut the edge layer, for the opposite reason.
 *
 * **Called only where the zoning is meant to be accepted.** The refusal cases
 * below deliberately do not wall: `x: 40, y: 40` must stay outside the
 * materialised world, and `setTopEdge`/`setLeftEdge` would grow it there.
 */
function wallRoom(
  runtime: SimulationRuntime,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): void {
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  for (let x = rect.x; x <= right; x += 1) {
    runtime.world.setTopEdge(tile(x, rect.y), WALL);
    runtime.world.setTopEdge(tile(x, bottom + 1), WALL);
  }
  for (let y = rect.y; y <= bottom; y += 1) {
    runtime.world.setLeftEdge(tile(rect.x, y), WALL);
    runtime.world.setLeftEdge(tile(right + 1, y), WALL);
  }
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

    wallRoom(runtime, { x: 4, y: 6, width: 2, height: 3 });
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
    wallRoom(runtime, { x: 4, y: 6, width: 2, height: 3 });
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

/**
 * Issue #337: **un-zoning one of two adjacent same-type rooms took both, and
 * made an empty room beside an occupied one unremovable.**
 *
 * Everything below goes through the real kernel, the real decoder, the real
 * session command router, the real construction system and the real intake
 * system. Nothing calls `RoomZoningService` or `RoomInstanceRegistry` directly:
 * the defect is reachable from two player drags, so the proof is too.
 *
 * The save round trip is the second half. What resolves a tile to a room
 * instance is the instance's own rectangle, which lives in
 * `simulation.prisoners.roomInstanceDefinitions` and has since ADR 0028 phase 1
 * -- so if that rectangle did not survive a save, un-zoning a restored prison
 * would fall back to the old region behaviour and take the neighbour again.
 * Asserted after a real `createSaveEnvelope` -> `decodeSaveEnvelope` ->
 * `restoreSimulationRuntime`, not after an in-memory copy.
 */
describe('un-zoning one of two adjacent same-type rooms (#337)', () => {
  /** Two `room.cell`s at their authored 2x3 minimum, sharing the edge at x = 6. */
  const LEFT = { x: 4, y: 6, width: 2, height: 3 } as const;
  const RIGHT = { x: 6, y: 6, width: 2, height: 3 } as const;
  const leftId = roomInstanceIdFor(CELL, tile(LEFT.x, LEFT.y));
  const rightId = roomInstanceIdFor(CELL, tile(RIGHT.x, RIGHT.y));

  function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
    runtime.kernel.step();
  }

  function stepTo(runtime: SimulationRuntime, target: number): void {
    while (runtime.kernel.tick < target) runtime.kernel.step();
  }

  function submitUnzoneRoom(
    runtime: SimulationRuntime,
    id: string,
    rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  ): void {
    submit(runtime, id, packCommand({ type: 'UnzoneRoom', ...rect }));
  }

  /** Two adjacent cells zoned as two separate drags -- the gesture the issue describes. */
  function prisonWithTwoAdjacentCells(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoom(runtime, LEFT);
    wallRoom(runtime, RIGHT);
    submitZoneRoom(runtime, 'cmd-zone-left', { roomId: CELL, ...LEFT });
    submitZoneRoom(runtime, 'cmd-zone-right', { roomId: CELL, ...RIGHT });
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms, 'two drags, two rooms').toBe(2);
    return runtime;
  }

  it('removes only the room the drag covers, and the survivor is still there after a save and load', () => {
    const runtime = prisonWithTwoAdjacentCells();

    submitUnzoneRoom(runtime, 'cmd-unzone-left', LEFT);

    expect(runtime.prisoners.roomInstances.getById(rightId), 'the neighbour must survive the drag').toBeDefined();
    expect(runtime.prisoners.roomInstances.getById(leftId), 'and the covered room must go').toBeUndefined();
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(1);
    expect(runtime.world.getZoning(tile(RIGHT.x, RIGHT.y)), 'the survivor keeps its paint').toBe(
      defaultRoomContentRegistry.getById(CELL)!.numericId,
    );
    expect(runtime.world.getZoning(tile(LEFT.x, LEFT.y)), 'the removed room loses its own').toBe(0);

    const restored = saveAndLoad(runtime);

    // The rectangle is what resolves a tile to an instance, so a restore that
    // lost it would answer this differently. Read back as the player would see
    // it, then proven load-bearing by a second removal on the restored prison.
    expect(restored.prisoners.roomInstances.getById(rightId)).toMatchObject({
      anchorTile: tile(RIGHT.x, RIGHT.y),
      width: RIGHT.width,
      height: RIGHT.height,
    });
    expect(projectStatusCounts(restored, restored.kernel.tick).rooms).toBe(1);

    // Re-zone the space the removal freed, then un-zone the *new* room. If the
    // restored prison had fallen back to region removal, this drag would take
    // the survivor with it.
    submitZoneRoom(restored, 'cmd-rezone-left', { roomId: CELL, ...LEFT });
    expect(projectStatusCounts(restored, restored.kernel.tick).rooms).toBe(2);
    submitUnzoneRoom(restored, 'cmd-unzone-left-again', { x: LEFT.x, y: LEFT.y, width: 1, height: 1 });

    expect(restored.prisoners.roomInstances.getById(rightId), 'still the neighbour, on a restored prison').toBeDefined();
    expect(restored.prisoners.roomInstances.getById(leftId)).toBeUndefined();
    expect(projectStatusCounts(restored, restored.kernel.tick).rooms).toBe(1);
  });

  it('leaves an admitted prisoner housed in the neighbour the drag did not cover', () => {
    const runtime = prisonWithTwoAdjacentCells();
    // One bed, in the right-hand cell only, so intake can only house the
    // arrival there -- the left cell derives `residentCapacity: 0`.
    submit(
      runtime,
      'buy-plank',
      packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }),
    );
    submit(
      runtime,
      'place-bed',
      packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: RIGHT.x, y: RIGHT.y }),
    );
    stepTo(runtime, 200);
    submit(
      runtime,
      'admit',
      packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 10_000, priorIncidents: 0, x: 16, y: 16 }),
    );
    stepTo(runtime, 240);

    const arrival = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(arrival), 'the bed is in the right-hand cell').toBe(rightId);
    expect(runtime.prisoners.roomInstances.occupancyOf(rightId)).toBe(1);

    // The drag the player reaches for: remove the empty cell they mis-dragged.
    submitUnzoneRoom(runtime, 'cmd-unzone-left', LEFT);

    // Accepted -- an empty room is removable even though its neighbour is
    // occupied.
    expect(runtime.prisoners.roomInstances.getById(leftId), 'the empty room must go').toBeUndefined();
    expect(runtime.world.getZoning(tile(LEFT.x, LEFT.y))).toBe(0);

    // And the occupant is not stranded: the room they name still exists, still
    // holds them, and still reads as occupied on the strip.
    expect(runtime.prisoners.coldState.getAccommodation(arrival)).toBe(rightId);
    expect(runtime.prisoners.roomInstances.getById(rightId), 'the room that reference names must exist').toBeDefined();
    expect(runtime.prisoners.roomInstances.occupantsOf(rightId)).toEqual([arrival]);
    expect(projectStatusCounts(runtime, runtime.kernel.tick)).toMatchObject({
      rooms: 1,
      roomCapacity: 1,
      roomOccupants: 1,
    });
  });
});

/**
 * Issue #478: **a room with a resident used to be refused, unconditionally
 * and for ever** -- there was no command anywhere in `src/` that moved a
 * prisoner out of accommodation, so a cell zoned in the wrong place and then
 * filled by an ordinary admission could never be un-zoned again for the life
 * of the session. This reproduces the trap end to end (zone, furnish, admit,
 * attempt the removal) and then proves both halves of the fix: the removal
 * now succeeds by relocating the resident when the prison has anywhere else
 * to put them, and it still refuses -- exactly as before -- when it does not.
 *
 * Real admission path throughout (#375): nothing here calls
 * `RoomInstanceRegistry.assign` or `PrisonerColdState.setAccommodation`
 * directly. The occupant is housed by the real `AdmitPrisoner` command
 * running the real intake pipeline, which is the condition the fix is
 * actually measured against.
 */
describe('un-zoning an occupied room relocates its resident instead of refusing for ever (#478)', () => {
  const LEFT = { x: 4, y: 6, width: 2, height: 3 } as const;
  const RIGHT = { x: 6, y: 6, width: 2, height: 3 } as const;
  const leftId = roomInstanceIdFor(CELL, tile(LEFT.x, LEFT.y));
  const rightId = roomInstanceIdFor(CELL, tile(RIGHT.x, RIGHT.y));

  function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
    runtime.kernel.step();
  }

  function stepTo(runtime: SimulationRuntime, target: number): void {
    while (runtime.kernel.tick < target) runtime.kernel.step();
  }

  function submitUnzoneRoom(
    runtime: SimulationRuntime,
    id: string,
    rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  ): void {
    submit(runtime, id, packCommand({ type: 'UnzoneRoom', ...rect }));
  }

  it('moves the resident into the other cell and removes the room they left, when one is free', () => {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoom(runtime, LEFT);
    wallRoom(runtime, RIGHT);
    submitZoneRoom(runtime, 'cmd-zone-left', { roomId: CELL, ...LEFT });
    submitZoneRoom(runtime, 'cmd-zone-right', { roomId: CELL, ...RIGHT });
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms, 'two cells, so there is somewhere to relocate to').toBe(2);

    // A bed in each cell, so both can house a resident -- the destination has
    // to derive a real `residentCapacity` of its own, not merely exist.
    submit(
      runtime,
      'buy-planks',
      packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }),
    );
    submit(
      runtime,
      'place-bed-left',
      packCommand({ type: 'PlaceObject', orderId: 'bed-left', definitionId: 'bed-wooden', x: LEFT.x, y: LEFT.y }),
    );
    submit(
      runtime,
      'place-bed-right',
      packCommand({ type: 'PlaceObject', orderId: 'bed-right', definitionId: 'bed-wooden', x: RIGHT.x, y: RIGHT.y }),
    );
    stepTo(runtime, 300);

    submit(
      runtime,
      'admit',
      packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 10_000, priorIncidents: 0, x: 16, y: 16 }),
    );
    stepTo(runtime, 340);

    const arrival = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(arrival), 'housed in the left-hand cell').toBe(leftId);
    expect(runtime.prisoners.roomInstances.occupancyOf(leftId)).toBe(1);

    // The drag a player in trouble actually needs recovery from: the cell
    // their own resident already lives in.
    submitUnzoneRoom(runtime, 'cmd-unzone-left', LEFT);

    // Accepted this time -- the resident was relocated before the room went.
    expect(runtime.prisoners.roomInstances.getById(leftId), 'the vacated room must go').toBeUndefined();
    expect(runtime.world.getZoning(tile(LEFT.x, LEFT.y))).toBe(0);
    expect(runtime.prisoners.coldState.getAccommodation(arrival), 'moved into the surviving cell').toBe(rightId);
    expect(runtime.prisoners.roomInstances.occupantsOf(rightId)).toEqual([arrival]);
    expect(runtime.prisoners.roomInstances.occupancyOf(leftId), 'nothing left recorded against the removed id').toBe(0);
    // `recentRefusals()` is `RoomZoningService`'s own bounded window of *zone*
    // refusals only (`ZoneRoomRefusal`) -- an `UnzoneRoom` refusal never
    // reaches it and never could, so the session-wide `RefusalLog` is the
    // right place to check that nothing was refused.
    expect(runtime.refusals.last, 'accepted, so no refusal is standing').toBeUndefined();
    expect(projectStatusCounts(runtime, runtime.kernel.tick)).toMatchObject({ rooms: 1, roomOccupants: 1 });
  });

  it('still refuses, exactly as before, when the prison has nowhere else to put the resident', () => {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoom(runtime, LEFT);
    submitZoneRoom(runtime, 'cmd-zone-left', { roomId: CELL, ...LEFT });
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(1);

    submit(
      runtime,
      'buy-plank',
      packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }),
    );
    submit(
      runtime,
      'place-bed',
      packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: LEFT.x, y: LEFT.y }),
    );
    stepTo(runtime, 200);
    submit(
      runtime,
      'admit',
      packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 10_000, priorIncidents: 0, x: 16, y: 16 }),
    );
    stepTo(runtime, 240);

    const arrival = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(arrival)).toBe(leftId);

    submitUnzoneRoom(runtime, 'cmd-unzone-left', LEFT);

    // This prison's only accommodation is the cell the resident is standing
    // in, so there is genuinely nowhere to relocate them -- the refusal that
    // remains is the honest one, not a stranded control.
    expect(runtime.prisoners.roomInstances.getById(leftId), 'the occupied room must survive').toBeDefined();
    expect(runtime.prisoners.coldState.getAccommodation(arrival), 'the resident stays exactly where they were').toBe(leftId);
    expect(runtime.world.getZoning(tile(LEFT.x, LEFT.y))).not.toBe(0);
    expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
  });
});
