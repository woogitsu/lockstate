import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
  migrateSaveEnvelopeV4ToV5,
} from '../../src/persistence/save-migrations';
import { wallRoomPerimeter } from '../helpers/room-walls';
import {
  SAVE_SCHEMA_VERSION,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
  type SaveEnvelopeV4,
} from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import type { JsonValue } from '../../src/shared/json';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * Save-schema V4 -> V5
 * ([ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 6): a room instance stops carrying its capacity and starts carrying
 * its **rectangle**, and placed objects get a section.
 *
 * ## What makes this migration lossless, and why it is a fact rather than an argument
 *
 * `RoomZoningService` is the only thing in `src/` that has ever registered a
 * room instance, and it registered `capacity: 0` with `objectCapabilities: []`
 * **unconditionally**. So every row any shipped build has ever written holds
 * exactly those two values, dropping them loses nothing that can be missed, and
 * the values the resolver recomputes at restore equal the ones dropped.
 *
 * The first test below **re-verifies that premise** rather than repeating it:
 * it zones a room through the real command path and reads the two fields off the
 * instance. If a future change gave a zoned room an authored capacity, that
 * assertion fails and this whole file's argument is known to have expired --
 * which is the point of measuring the premise instead of citing it.
 *
 * ## Where the V4 saves under test come from
 *
 * Two provenances, for the reason `save-v3-to-v4.test.ts` uses two:
 *
 * - **The checked-in V1 fixtures, walked forward by the three frozen steps.**
 *   Those saves carry no `simulation` section at all, which is the case this
 *   migration must leave completely alone, and it keeps
 *   `git diff -- tests/fixtures/` empty.
 * - **A real captured session, rewritten into the V4 room-instance shape.** A
 *   V4 payload and a V5 payload differ in nothing but those rows and the
 *   optional objects section, so a current capture with the rows put back into
 *   their old shape is exactly the byte shape a V4 build wrote -- and the values
 *   put back are the ones the premise test measures, not values invented here.
 */

/** A structured clone through JSON -- how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function v4EnvelopeFromV1(fixture: unknown): SaveEnvelopeV4 {
  return migrateSaveEnvelopeV3ToV4(migrateSaveEnvelopeV2ToV3(migrateSaveEnvelopeV1ToV2(fixture as SaveEnvelopeV1)));
}

const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const CELL_INSTANCE_ID = 'room.cell:4:6';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/** A session with one zoned cell and one bed standing in it, reached the way a player reaches both. */
function sessionWithABed(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(0x0b1ec7);
  submit(runtime, 'buy', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  while (runtime.kernel.tick < 200) runtime.kernel.step();
  return runtime;
}

/**
 * A genuine V4 envelope holding one zoned room, built by capturing a real
 * session and putting its room-instance rows back into the V4 shape.
 */
function v4EnvelopeWithARoom(): SaveEnvelopeV4 {
  const runtime = createNewSimulationRuntime(0x5ca1e);
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  const bundle = captureSessionSnapshot(runtime);
  if (bundle.simulation === undefined) throw new Error('a captured session must carry a simulation section');

  // The two things about a current capture that are newer than V4: the objects
  // section did not exist, and a room instance carried a capacity and a
  // capability list instead of a rectangle.
  const { objects: _objects, ...simulation } = bundle.simulation;
  const payload = {
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    simulation: {
      ...simulation,
      prisoners: {
        ...bundle.simulation.prisoners,
        roomInstanceDefinitions: bundle.simulation.prisoners.roomInstanceDefinitions.map((instance) => ({
          instanceId: instance.instanceId,
          roomCatalogId: instance.roomCatalogId,
          anchorTile: instance.anchorTile,
          capacity: 0,
          objectCapabilities: [],
        })),
      },
    },
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  };

  return {
    saveSchemaVersion: 4,
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'v4-prison',
    revision: 5,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    checksum: computeSaveChecksum(payload as unknown as JsonValue),
    payload,
  } as unknown as SaveEnvelopeV4;
}

describe('save-schema V4 -> V5 migration', () => {
  it('rests on a measured premise: a zoned room really is registered with no capacity and no capabilities', () => {
    // The fact the whole migration is lossless *because of*. Read off the real
    // command path rather than quoted from the ADR, so that if zoning ever
    // starts authoring a capacity this file fails instead of quietly migrating
    // a value it had assumed away.
    const runtime = createNewSimulationRuntime(3);
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));

    expect(runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
  });

  it('drops the two derived fields and fabricates no rectangle', () => {
    const v4 = v4EnvelopeWithARoom();
    const rows = v4.payload.simulation?.prisoners.roomInstanceDefinitions ?? [];
    expect(rows, 'the V4 input must carry a room instance for this test to mean anything').toHaveLength(1);
    expect(rows[0]).toEqual({
      instanceId: CELL_INSTANCE_ID,
      roomCatalogId: 'room.cell',
      anchorTile: { x: 4, y: 6 },
      capacity: 0,
      objectCapabilities: [],
    });

    const migrated = migrateSaveEnvelopeV4ToV5(v4);

    expect(migrated.saveSchemaVersion).toBe(5);
    // Identity and anchor, and **nothing else**: no `capacity`, no
    // `objectCapabilities`, and no invented `width`/`height`. `1x1` would assert
    // a room the player did not zone and `64x64` one that overlaps its
    // neighbours, so absence stays absence and the instance is attributed no
    // objects -- which is exactly its pre-object-placement behaviour.
    expect(migrated.payload.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: CELL_INSTANCE_ID, roomCatalogId: 'room.cell', anchorTile: { x: 4, y: 6 } },
    ]);
    // And no objects section is added: absence means "no object has been
    // placed", which is what every V4 build meant because no V4 build could
    // place one.
    expect(migrated.payload.simulation?.objects).toBeUndefined();
  });

  it('recomputes the values it dropped, and lands on the same ones', () => {
    // The other half of "lossless": what the restore *writes* for a migrated row
    // equals what V4 carried. Zero and empty in, zero and empty out.
    const migrated = migrateSaveEnvelopeV4ToV5(v4EnvelopeWithARoom());
    const restored = restoreSimulationRuntime(migrated.payload as unknown as SessionSnapshotBundle, 0).runtime;

    expect(restored.prisoners.roomInstances.getById(CELL_INSTANCE_ID)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    // The rectangle is genuinely unknown for a migrated row, and the instance
    // says so rather than claiming one.
    expect(restored.prisoners.roomInstances.getById(CELL_INSTANCE_ID)?.width).toBeUndefined();
    expect(restored.placedObjects.size).toBe(0);
  });

  it('decodes a real V4 save with a room in it through the whole chain', () => {
    // The end-to-end statement the two cases above make in halves: a V4
    // envelope that carries a room instance passes the V4 schema, walks the
    // migration, passes the *strict* V5 schema and comes out at the current
    // version. A migration that carried `capacity` across would fail here at
    // the V5 schema rather than at an assertion about a field.
    const result = decodeSaveEnvelope(throughStorage(v4EnvelopeWithARoom()));

    expect(result).toMatchObject({ ok: true, migrated: true });
    if (!result.ok) throw new Error('the V4 save must migrate for this test to be meaningful');
    expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.value.payload.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: CELL_INSTANCE_ID, roomCatalogId: 'room.cell', anchorTile: { x: 4, y: 6 } },
    ]);
  });

  it('carries a V4 save with no simulation section across untouched', () => {
    for (const fixture of [freshPrisonFixture, inProgressFixture]) {
      const v4 = v4EnvelopeFromV1(fixture);
      expect(v4.payload.simulation, 'the frozen V1 fixtures carry no simulation section').toBeUndefined();

      const migrated = migrateSaveEnvelopeV4ToV5(v4);

      expect(migrated.payload.simulation).toBeUndefined();
      // Byte-identical outside the version and the checksum, which is what
      // "nothing to reshape" has to mean for a save this migration cannot touch.
      expect(migrated.payload).toEqual(v4.payload);
      expect(migrated.checksum).toBe(computeSaveChecksum(migrated.payload as unknown as JsonValue));
    }
  });

  it('never mutates its input', () => {
    const v4 = v4EnvelopeWithARoom();
    const before = JSON.stringify(v4);
    migrateSaveEnvelopeV4ToV5(v4);
    expect(JSON.stringify(v4)).toBe(before);
  });

  it('walks a V1 fixture the whole way to the current version through the chain', () => {
    for (const fixture of [freshPrisonFixture, inProgressFixture]) {
      const result = decodeSaveEnvelope(throughStorage(fixture));
      expect(result).toMatchObject({ ok: true, migrated: true });
      if (!result.ok) return;
      expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(SAVE_SCHEMA_VERSION).toBe(5);
    }
  });

  it('rejects a corrupt V4 save at the version it was written, before the reshape matters', () => {
    const v4 = v4EnvelopeWithARoom();
    const corrupt = { ...v4, checksum: 'ffffffffffffffff' };

    const result = decodeSaveEnvelope(throughStorage(corrupt));

    expect(result).toMatchObject({ ok: false, error: { code: 'checksum-mismatch' } });
  });

  it('decodes a V5 save written by this build with its objects section intact', () => {
    // The forward direction, for completeness: a save this build writes carries
    // the section and the rectangle, and needs no migration at all.
    const bundle = captureSessionSnapshot(sessionWithABed());
    expect(bundle.simulation?.objects?.placedObjects).toEqual([
      { placedObjectId: 'object:4:6', objectId: 'object.bed', anchorTile: { x: 4, y: 6 }, orientation: 0 },
    ]);
    expect(bundle.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: CELL_INSTANCE_ID, roomCatalogId: 'room.cell', anchorTile: { x: 4, y: 6 }, width: 2, height: 3 },
    ]);
  });
});
