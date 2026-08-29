import { describe, expect, it } from 'vitest';
import v4YardFixture from '../fixtures/persistence/save-v4-yard.json';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * What a restored room that recorded no rectangle is (issue #559,
 * [ADR 0074](../../docs/adr/0074-what-a-restored-room-that-recorded-no-rectangle-is.md)).
 *
 * ## The defect, and why this file is not a round trip through one object
 *
 * `tests/fixtures/persistence/save-v4-yard.json` was **not composed by this
 * branch**. It was produced by checking out `94adf1c` (v0.0.61) -- a shipped
 * build whose `SAVE_SCHEMA_VERSION` is 4 -- in a detached worktree and running
 * that build's own path: `createNewSimulationRuntime` -> the `ZoneRoom` command
 * for an 8x8 `room.yard` at (4,4) -> 50 ticks -> `captureSessionSnapshot` ->
 * `createSaveEnvelope`. Every byte in it, checksum included, is what a V4 build
 * wrote. That is the whole point: a save/restore fixture that saves what it has
 * just built proves the codec agrees with itself and proves nothing about a
 * payload an older build wrote.
 *
 * It is a real population and not a hypothetical one. `84e1c61` gave the player
 * a Rooms tab that can zone a room at 2026-08-25 16:59 and `6cededc` moved the
 * schema to V5 at 20:08 the same day, with twelve tagged releases between them
 * (v0.0.49 .. v0.0.61) and `room.yard` in the catalogue throughout.
 *
 * ## What this pins
 *
 * 1. **The number a player sees.** A restored 8x8 yard admits 4 prisoners at
 *    once, which is what the same yard zoned in this build admits. Before the
 *    fix it admitted `Infinity`, which is #554/ADR 0071's defect surviving the
 *    save path.
 * 2. **Where the 8x8 comes from.** The V4 payload's own world section, whose
 *    zoning plane `RoomZoningService.zone` painted with `room.yard`'s
 *    numericId. Nothing is invented and no default is chosen.
 * 3. **The residue, deliberately.** An instance the plane cannot support keeps
 *    its absent bounds and ADR 0071's unbounded ceiling, so that nobody later
 *    "fixes" that into a silent guess.
 * 4. **Why this is not a migration.** A payload restored and re-captured is a
 *    *current-version* save that still carries the boundless row, so the class
 *    of save needing repair is not confined to V4 and a repair inside
 *    `migrateSaveEnvelopeV4ToV5` would never be offered it.
 *
 * ## The expected numbers
 *
 * `8`, `8` and `4` are literals. 8x8 is the rectangle the V4 build was told to
 * zone; 4 is `floor(64 / 16)` worked out here rather than recomputed from
 * `TILES_PER_OPEN_GROUND_PLACE`, so that a change to that constant fails this
 * file with a reason instead of moving its expectation along with it.
 */

const YARD_INSTANCE_ID = 'room.yard:4:4';
const YARD_ANCHOR = { x: 4, y: 4 } as const;
const YARD_RECT = { width: 8, height: 8 } as const;
/** `floor(8 * 8 / 16)`. Written out, not imported -- see this file's header. */
const YARD_PLACES = 4;

/** A structured clone through JSON -- how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function restoredFromTheV4Fixture(): SimulationRuntime {
  const decoded = decodeSaveEnvelope(throughStorage(v4YardFixture));
  if (!decoded.ok) throw new Error(`the V4 fixture must decode for this file to mean anything: ${JSON.stringify(decoded.error)}`);
  expect(decoded.migrated, 'a V4 fixture must reach the current version through the migration chain').toBe(true);
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 0).runtime;
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

describe('a V4 save that recorded no room rectangle', () => {
  it('is a genuine V4 envelope carrying a boundless yard row and the tiles that describe it', () => {
    // The fixture self-check: this file's subject is what a V4 build wrote, so
    // it states what that is before asserting anything about the restore. It
    // passes with or without the fix -- that is what makes it a description of
    // the input rather than of the behaviour.
    const fixture = v4YardFixture as unknown as {
      saveSchemaVersion: number;
      payload: {
        world: { chunks: readonly { zoning?: unknown }[] };
        simulation: { prisoners: { roomInstanceDefinitions: readonly Record<string, unknown>[] } };
      };
    };

    expect(fixture.saveSchemaVersion).toBe(4);
    expect(fixture.payload.simulation.prisoners.roomInstanceDefinitions).toEqual([
      {
        instanceId: YARD_INSTANCE_ID,
        roomCatalogId: 'room.yard',
        anchorTile: YARD_ANCHOR,
        // The two derived fields V5 removed. No width, no height: the V4 shape
        // has nowhere to put them.
        capacity: 0,
        objectCapabilities: [],
      },
    ]);
    expect(fixture.payload.world.chunks[0]?.zoning, 'the rectangle is only recoverable because the plane is in the payload').toBeDefined();
  });

  it('restores a yard bounded by the ground the save says it covers, not an unbounded one', () => {
    const restored = restoredFromTheV4Fixture();
    const instance = restored.prisoners.roomInstances.getById(YARD_INSTANCE_ID);

    expect(instance, 'the V4 row must register, or the rest of this test is vacuous').toBeDefined();
    expect(instance?.width).toBe(YARD_RECT.width);
    expect(instance?.height).toBe(YARD_RECT.height);

    const ceiling = restored.prisoners.roomInstances.concurrentUseCapacityFor(instance!, undefined);
    expect(ceiling).toBe(YARD_PLACES);
    expect(ceiling, 'issue #559 is that this was Infinity, so the claim gate never refused').not.toBe(Number.POSITIVE_INFINITY);
  });

  it('refuses the fifth prisoner at once, which is what the ceiling is for', () => {
    // The ceiling stated as the thing a player can find out rather than as a
    // field: four prisoners get into the restored yard for a capability-free
    // action and the fifth does not. Before the fix all sixty-four did.
    const restored = restoredFromTheV4Fixture();
    const registry = restored.prisoners.roomInstances;

    for (let entity = 1; entity <= YARD_PLACES; entity += 1) {
      expect(registry.claimUse(YARD_INSTANCE_ID, entity as never), `prisoner ${entity} must get in`).toBe(true);
    }
    expect(registry.claimUse(YARD_INSTANCE_ID, (YARD_PLACES + 1) as never)).toBe(false);
    expect(registry.totalUseClaims).toBe(YARD_PLACES);
    expect(registry.findAvailableForUse('room.yard')).toBeUndefined();
  });

  it('agrees with the same yard zoned in this build, which is the asymmetry #559 reports', () => {
    /*
     * Two independent paths to one number: the restore recovers 8x8 from the
     * zoning plane, and `RoomZoningService.zone` takes 8x8 from the player's
     * own drag. They are not two readings of one computation -- the second
     * never consults the plane at all -- so their agreement is a statement
     * about the save path rather than about arithmetic.
     */
    const live = createNewSimulationRuntime(0x5eed);
    submit(live, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 }));
    const zoned = live.prisoners.roomInstances.getById(YARD_INSTANCE_ID);
    expect(zoned, 'the live zoning must succeed, or this comparison has one side').toBeDefined();

    const restored = restoredFromTheV4Fixture();
    const migrated = restored.prisoners.roomInstances.getById(YARD_INSTANCE_ID);

    expect(live.prisoners.roomInstances.concurrentUseCapacityFor(zoned!, undefined)).toBe(YARD_PLACES);
    expect(restored.prisoners.roomInstances.concurrentUseCapacityFor(migrated!, undefined)).toBe(YARD_PLACES);
  });

  it('writes nothing back to the save: the recovery is recomputed on every load', () => {
    // ADR 0074's shape, and ADR 0033's before it. The decode returns the
    // payload as the migration chain left it -- boundless -- and the rectangle
    // exists only in the restored runtime. A save repaired on disk could not be
    // re-examined if the recovery were ever found wrong.
    const decoded = decodeSaveEnvelope(throughStorage(v4YardFixture));
    if (!decoded.ok) throw new Error('the V4 fixture must decode');

    expect(decoded.value.payload.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: YARD_INSTANCE_ID, roomCatalogId: 'room.yard', anchorTile: YARD_ANCHOR },
    ]);
  });

  it('repairs a current-version save too, which a migration could not have reached', () => {
    /*
     * The measurement that decides where this fix lives. Restoring the V4
     * payload and capturing it again produces an envelope at the *current*
     * version -- it decodes with `migrated: false` -- and on `main` that
     * envelope still carried a row with no rectangle. So the class of save
     * needing repair was never "V4 saves"; a repair inside
     * `migrateSaveEnvelopeV4ToV5` would have been offered this one exactly
     * once and never again.
     *
     * With the recovery at restore time the re-captured save carries the
     * rectangle, *and* a save that somehow still lacks one is repaired on the
     * load after that. Both halves are asserted.
     */
    const first = restoredFromTheV4Fixture();
    while (first.kernel.tick < 60) first.kernel.step();
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-test',
      prisonId: 'v4-yard-prison',
      revision: 2,
      createdAt: 1_756_000_000_002,
      updatedAt: 1_756_000_000_003,
      ...captureSessionSnapshot(first),
    });

    const again = decodeSaveEnvelope(throughStorage(envelope));
    if (!again.ok) throw new Error('the re-captured save must decode');
    expect(again.migrated, 'this must be a current-version save, or it is not the case being described').toBe(false);
    expect(again.value.payload.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: YARD_INSTANCE_ID, roomCatalogId: 'room.yard', anchorTile: YARD_ANCHOR, ...YARD_RECT },
    ]);

    const second = restoreSimulationRuntime(again.value.payload as unknown as SessionSnapshotBundle, 0).runtime;
    const instance = second.prisoners.roomInstances.getById(YARD_INSTANCE_ID);
    expect(second.prisoners.roomInstances.concurrentUseCapacityFor(instance!, undefined)).toBe(YARD_PLACES);
  });

  it('leaves a row the plane cannot support unbounded, and says so on purpose', () => {
    /*
     * The residue ADR 0071 decision 2 keeps. Strip the zoning plane out of the
     * V4 payload and the row has nothing to recover from: no rectangle is
     * invented, and the ceiling stays `Infinity` rather than becoming a guess
     * at a room the player never drew. This is the assertion that stops the
     * asymmetry being an implicit consequence of a missing field.
     */
    const stripped = throughStorage(v4YardFixture) as {
      checksum: string;
      payload: { world: { chunks: { zoning?: unknown }[] } };
    };
    for (const chunk of stripped.payload.world.chunks) delete chunk.zoning;

    const decoded = decodeSaveEnvelope(stripped);
    // The checksum covers the payload as written, so editing it invalidates
    // the envelope -- which is correct, and is why the restore is driven from
    // the payload directly here rather than through `decodeSaveEnvelope`.
    expect(decoded).toMatchObject({ ok: false, error: { code: 'checksum-mismatch' } });

    const decodedIntact = decodeSaveEnvelope(throughStorage(v4YardFixture));
    if (!decodedIntact.ok) throw new Error('the V4 fixture must decode');
    const payload = JSON.parse(JSON.stringify(decodedIntact.value.payload)) as {
      world: { chunks: { zoning?: unknown }[] };
    };
    for (const chunk of payload.world.chunks) delete chunk.zoning;

    const restored = restoreSimulationRuntime(payload as unknown as SessionSnapshotBundle, 0).runtime;
    const instance = restored.prisoners.roomInstances.getById(YARD_INSTANCE_ID);

    expect(instance?.width).toBeUndefined();
    expect(restored.prisoners.roomInstances.concurrentUseCapacityFor(instance!, undefined)).toBe(Number.POSITIVE_INFINITY);
  });

  it('recovers identically for two sessions restored from one payload', () => {
    // Determinism, at the level that matters for a save: the recovery is a
    // function of the payload, so two restores of it agree.
    const a = restoredFromTheV4Fixture();
    const b = restoredFromTheV4Fixture();

    expect(a.prisoners.roomInstances.getSnapshot()).toEqual(b.prisoners.roomInstances.getSnapshot());
    expect(a.prisoners.roomInstances.getById(YARD_INSTANCE_ID)).toEqual(b.prisoners.roomInstances.getById(YARD_INSTANCE_ID));
  });

  it('recovers the rectangle the plane actually holds, tile for tile', () => {
    // The provenance of the 8x8, read off the restored world rather than
    // assumed: the plane carries exactly those 64 tiles under `room.yard`'s
    // numericId, and the recovered rectangle is that region.
    const restored = restoredFromTheV4Fixture();
    let painted = 0;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        if (restored.world.getZoning({ x: tileCoordinate(x), y: tileCoordinate(y) }) === 9) painted += 1;
      }
    }

    expect(painted).toBe(YARD_RECT.width * YARD_RECT.height);
    expect(restored.prisoners.roomInstances.getById(YARD_INSTANCE_ID)).toMatchObject({
      anchorTile: YARD_ANCHOR,
      width: YARD_RECT.width,
      height: YARD_RECT.height,
    });
  });
});
