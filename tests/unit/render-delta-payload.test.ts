import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeRenderActorsPayload,
  packRenderActorFields,
  RENDER_ACTOR_POPULATION_GUARD,
  RENDER_ACTOR_POPULATION_PRISONER,
  RenderActorsKeyframeWriter,
} from '../../src/simulation/protocol/render-actors-payload';
import { encodeRenderActorsKeyframe, type RenderGuardSource } from '../../src/simulation/worker/render-actors-keyframe';
import { actorsFromDelta } from '../../src/rendering/feed/actors-from-delta';
import { selectActorPose } from '../../src/rendering/actors/actor-pose';
import { GUARD_ACTOR_ASSET_ID, PRISONER_ACTOR_ASSET_ID } from '../../src/rendering/feed/actors-from-snapshot';
import { LOCOMOTION_SUBTILE_UNITS, type WalkReading } from '../../src/simulation/locomotion';
import { readRenderActorsPayload, writeRenderActorsPayload } from '../helpers/render-actors-reader';

/**
 * The wire format of ADR 0040's render delta, checked against the ADR and not
 * against itself.
 *
 * Every assertion here goes through `tests/helpers/render-actors-reader.ts`,
 * which is a transcription of the ADR's layout table with literal offsets and
 * no import of the production module. That is deliberate and it is the point of
 * the file: `expect(decode(encode(x))).toEqual(x)` is true of any encoder
 * paired with its own inverse, so it would hold for a layout that swapped
 * `tileX` and `tileY`, wrote big-endian or used a header of the wrong width.
 * The bytes are the contract, so the bytes are what is asserted.
 *
 * Both directions are covered, because a codec can be wrong in one of them:
 * the production writer is read by hand, and the production reader is handed a
 * buffer built by hand.
 */

const ROOT = join(__dirname, '../..');

/**
 * A stand-in for the prisoner store, so the encoder can be driven with literal
 * positions.
 *
 * The locomotion half is a stand-in too: a real `LocomotionStore` would make
 * these cases about how a walk advances, which
 * `tests/unit/simulation-locomotion.test.ts` is for. What this file is about is
 * the bytes, so the reading is handed over as a literal.
 */
function sourceOf(
  actors: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly walk?: { readonly offsetX?: number; readonly offsetY?: number; readonly velocityX?: number; readonly velocityY?: number; readonly headingX?: number; readonly headingY?: number };
  }[],
  alive?: readonly boolean[],
) {
  const tileX = new Int32Array(actors.length);
  const tileY = new Int32Array(actors.length);
  actors.forEach((actor, index) => {
    tileX[index] = actor.x;
    tileY[index] = actor.y;
  });
  const byKey = new Map(actors.map((actor, index) => [index, actor]));
  return {
    entityStore: {
      maxActiveIndex: actors.length - 1,
      isIndexAlive: (index: number) => alive?.[index] ?? true,
      getIdByIndex: (index: number) => actors[index]!.id,
    },
    position: { tileX, tileY },
    locomotion: {
      read(key: number, atX: number, atY: number, out: WalkReading): WalkReading {
        const walk = byKey.get(key)?.walk;
        out.subX = atX * LOCOMOTION_SUBTILE_UNITS + (walk?.offsetX ?? 0);
        out.subY = atY * LOCOMOTION_SUBTILE_UNITS + (walk?.offsetY ?? 0);
        out.velocitySubX = walk?.velocityX ?? 0;
        out.velocitySubY = walk?.velocityY ?? 0;
        out.headingX = (walk?.headingX ?? 0) as -1 | 0 | 1;
        out.headingY = (walk?.headingY ?? 0) as -1 | 0 | 1;
        return out;
      },
    },
  };
}

/** Twenty ticks a wall-clock second: the kernel's 50 ms step at speed 1. */
const TICKS_PER_SECOND = 20;

/**
 * The drawn world's marker for a case that is not about it (ADR 0099).
 *
 * Named rather than a bare `0` at thirteen call sites, so that the two cases
 * below that *are* about the marker read as the exception they are. `0` is the
 * honest value for the rest: none of them has a world at all, and the encoder
 * requires the argument precisely so that the absence has to be stated.
 */
const NO_WORLD_CHANGE = 0;
const SUB = LOCOMOTION_SUBTILE_UNITS;

/**
 * A stand-in `GuardRoster`, so the encoder's guard pass can be driven with
 * literal tiles. `walk` is `sourceOf`'s own optional field, for the same
 * reason: since [ADR 0088](../../docs/adr/0088-does-a-guard-walk-to-its-post.md)
 * a guard's `locomotion.read` is not a fixed zero, and this file's subject is
 * the bytes it writes, not how a walk advances.
 */
function guardSourceOf(
  guards: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly walk?: { readonly offsetX?: number; readonly offsetY?: number; readonly velocityX?: number; readonly velocityY?: number; readonly headingX?: number; readonly headingY?: number };
  }[],
): RenderGuardSource {
  const byId = new Map(guards.map((guard) => [guard.id, guard]));
  return {
    allGuardIds: () => guards.map((guard) => guard.id),
    getTile: (entityId: number) => {
      const guard = byId.get(entityId);
      if (guard === undefined) throw new Error(`No such guard ${String(entityId)}.`);
      return { x: guard.x, y: guard.y };
    },
    locomotion: {
      read(key: number, atX: number, atY: number, out: WalkReading): WalkReading {
        const walk = byId.get(key)?.walk;
        out.subX = atX * LOCOMOTION_SUBTILE_UNITS + (walk?.offsetX ?? 0);
        out.subY = atY * LOCOMOTION_SUBTILE_UNITS + (walk?.offsetY ?? 0);
        out.velocitySubX = walk?.velocityX ?? 0;
        out.velocitySubY = walk?.velocityY ?? 0;
        out.headingX = (walk?.headingX ?? 0) as -1 | 0 | 1;
        out.headingY = (walk?.headingY ?? 0) as -1 | 0 | 1;
        return out;
      },
    },
  };
}

describe('the render delta payload matches the layout ADR 0040 specifies', () => {
  it('keeps the hand-written reader independent of the module it checks', () => {
    // The whole file's value rests on this. A helper that reached for the
    // production constants would be the self-comparison in a second file.
    const helper = readFileSync(join(ROOT, 'tests/helpers/render-actors-reader.ts'), 'utf8');
    expect(helper).not.toMatch(/from '.*render-actors-payload'/);
    expect(helper).not.toMatch(/RENDER_ACTORS_/);
  });

  it('writes a six-word header, then twenty bytes per actor, little-endian', () => {
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([
        { id: 7, x: 3, y: 11 },
        { id: 4_294_967_295, x: -2, y: 0 },
      ]),
      TICKS_PER_SECOND,
      NO_WORLD_CHANGE,
    );

    // 24 header bytes + 2 x 20 record bytes, written out rather than computed
    // by the production helper that computes it. **Sixteen until ADR 0099's
    // layout 3 added the fifth header word**, which is the whole of what a
    // notification costs on this channel: four bytes a publication, whatever
    // the population -- and **twenty until ADR 0097's layout 4 added the
    // sixth**, the room count, which costs four more and then twelve bytes for
    // each room the worker has a verdict for.
    expect(buffer.byteLength).toBe(64);

    const read = readRenderActorsPayload(buffer);
    expect(read.layoutVersion).toBe(6);
    expect(read.roomCount).toBe(0);
    expect(read.rooms).toEqual([]);
    expect(read.flags).toBe(1);
    expect(read.keyframe).toBe(true);
    expect(read.recordCount).toBe(2);
    expect(read.removedCount).toBe(0);
    expect(read.worldRevision).toBe(NO_WORLD_CHANGE);
    // A standing actor is exactly on its tile, which in sub-tile units is the
    // tile times 256, and its heading nibbles are the biased zero `0b0101`.
    expect(read.records).toEqual([
      { entityId: 7, packedFields: 0x0500, subX: 3 * SUB, subY: 11 * SUB, velocitySubX: 0, velocitySubY: 0 },
      { entityId: 4_294_967_295, packedFields: 0x0500, subX: -2 * SUB, subY: 0, velocitySubX: 0, velocitySubY: 0 },
    ]);
    expect(read.removed).toEqual([]);
  });

  it('writes a walking actor between two tiles, with a velocity per wall-clock second and a heading', () => {
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([{ id: 3, x: 4, y: 9, walk: { offsetX: -64, velocityX: -64, headingX: -1 } }]),
      TICKS_PER_SECOND,
      NO_WORLD_CHANGE,
    );

    const record = readRenderActorsPayload(buffer).records[0]!;
    // A quarter of a tile west of tile 4, moving west at 64 sub-tile units a
    // tick -- which is 1,280 a second at twenty ticks, and the multiplication
    // is the encoder's because only the worker knows the speed multiplier.
    expect(record.subX).toBe(4 * SUB - 64);
    expect(record.subY).toBe(9 * SUB);
    expect(record.velocitySubX).toBe(-64 * TICKS_PER_SECOND);
    expect(record.velocitySubY).toBe(0);
    // Heading `-1, 0`: biased to `0b00` on x and `0b01` on y, in bits 8-11.
    expect(record.packedFields).toBe(0x0400);
  });

  it('scales velocity by the clock speed the worker is running at, not by the kernel step alone', () => {
    const atOne = readRenderActorsPayload(
      encodeRenderActorsKeyframe(sourceOf([{ id: 3, x: 0, y: 0, walk: { velocityY: 64, headingY: 1 } }]), TICKS_PER_SECOND, NO_WORLD_CHANGE),
    ).records[0]!;
    const atFour = readRenderActorsPayload(
      encodeRenderActorsKeyframe(sourceOf([{ id: 3, x: 0, y: 0, walk: { velocityY: 64, headingY: 1 } }]), TICKS_PER_SECOND * 4, NO_WORLD_CHANGE),
    ).records[0]!;

    // The same walk, four times the wall-clock speed: the renderer advances a
    // published position by wall-clock seconds, so this is where the
    // multiplier has to be applied.
    expect(atFour.velocitySubY).toBe(atOne.velocitySubY * 4);
    expect(atOne.subY).toBe(atFour.subY);
  });

  it('is little-endian in the bytes, not merely in the reader', () => {
    /*
     * `readRenderActorsPayload` asks for little-endian, so it and a big-endian
     * writer would disagree -- but only about a value, and a test that read
     * `recordCount` as 16,777,216 would still be reporting a number. This
     * inspects the raw bytes, which is the one form the endianness claim has
     * that no reader can launder.
     */
    const buffer = encodeRenderActorsKeyframe(sourceOf([{ id: 0x01020304, x: 0, y: 0 }]), TICKS_PER_SECOND, NO_WORLD_CHANGE);
    const bytes = new Uint8Array(buffer);
    // The layout version, word 0, is 6: low byte first.
    expect([...bytes.slice(0, 4)]).toEqual([6, 0, 0, 0]);
    // The first record's entity id, word 6 -- word 4 is ADR 0099's marker and
    // word 5 is ADR 0097's room count, zero here because this source has no
    // rooms.
    expect([...bytes.slice(20, 24)]).toEqual([0, 0, 0, 0]);
    expect([...bytes.slice(24, 28)]).toEqual([0x04, 0x03, 0x02, 0x01]);
  });

  it('carries only the live slots, at their own ids', () => {
    // The defect this is about: `PositionComponent`'s arrays are index-keyed
    // over the allocated prefix and nothing clears a freed slot, so a payload
    // built without asking the liveness ledger draws the previous occupant.
    const buffer = encodeRenderActorsKeyframe(
      sourceOf(
        [
          { id: 10, x: 1, y: 1 },
          { id: 11, x: 2, y: 2 },
          { id: 12, x: 3, y: 3 },
        ],
        [true, false, true],
      ),
      TICKS_PER_SECOND,
      NO_WORLD_CHANGE,
    );

    const read = readRenderActorsPayload(buffer);
    expect(read.recordCount).toBe(2);
    expect(read.records.map((record) => record.entityId)).toEqual([10, 12]);
    expect(read.records.map((record) => record.subX)).toEqual([1 * SUB, 3 * SUB]);
  });

  it('tags every record with the prisoner population ordinal, in the low byte', () => {
    const buffer = encodeRenderActorsKeyframe(sourceOf([{ id: 1, x: 0, y: 0 }]), TICKS_PER_SECOND, NO_WORLD_CHANGE);
    expect(readRenderActorsPayload(buffer).records[0]!.packedFields & 0xff).toBe(0);
    expect(RENDER_ACTOR_POPULATION_PRISONER).toBe(0);
    // Bits 8-11 are the heading and bits 12 and up are still reserved, so a
    // later slice can use them without a build in the field having written
    // anything there. `0b0101` is the biased `0, 0` a standing actor carries.
    expect(packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER) >>> 8).toBe(0b0101);
    expect(packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER, -1, 1) >>> 8).toBe(0b1000);
    expect(packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER) >>> 12).toBe(0);
  });

  it('encodes an empty population as a bare header', () => {
    const buffer = encodeRenderActorsKeyframe(sourceOf([]), TICKS_PER_SECOND, NO_WORLD_CHANGE);
    expect(buffer.byteLength).toBe(24);
    expect(readRenderActorsPayload(buffer).recordCount).toBe(0);
  });

  it('refuses to ship a keyframe whose records were not all written', () => {
    // A short write would leave a zeroed tail, and `{ id 0, tile 0,0 }` is a
    // well-formed record -- so the receiver would draw a phantom prisoner at
    // the origin and nothing would report it.
    const writer = new RenderActorsKeyframeWriter(2, NO_WORLD_CHANGE);
    writer.writeRecord(1, 0, 5, 6, 0, 0);
    expect(() => writer.finish()).toThrow(/sized for 2 records received 1/);
  });

  it('reads a buffer built by hand from the ADR table', () => {
    // The other direction: the production decoder driven by bytes it did not
    // write, so a decoder that agreed with its own writer about a wrong layout
    // has nowhere to hide.
    const buffer = writeRenderActorsPayload({
      layoutVersion: 4,
      flags: 1,
      worldRevision: 4_294_967_295,
      records: [
        { entityId: 42, packedFields: 0, subX: -7 * SUB, subY: 9 * SUB, velocitySubX: 0, velocitySubY: 0 },
        { entityId: 43, packedFields: 1, subX: 0, subY: -1 * SUB - 32, velocitySubX: 0, velocitySubY: -1_280 },
      ],
      removed: [99],
    });

    const decoded = decodeRenderActorsPayload(buffer);
    expect(decoded.layoutVersion).toBe(4);
    expect(decoded.keyframe).toBe(true);
    expect(decoded.recordCount).toBe(2);
    // The top of the `u32` range, so a decoder reading the word as an `i32`
    // would hand back -1 and a decoder reading it at the wrong offset would
    // hand back a record field.
    expect(decoded.worldRevision).toBe(4_294_967_295);
    expect([...decoded.entityIds]).toEqual([42, 43]);
    expect([...decoded.packedFields]).toEqual([0, 1]);
    expect([...decoded.subX]).toEqual([-7 * SUB, 0]);
    expect([...decoded.subY]).toEqual([9 * SUB, -1 * SUB - 32]);
    expect([...decoded.velocitySubX]).toEqual([0, 0]);
    expect([...decoded.velocitySubY]).toEqual([0, -1_280]);
    expect([...decoded.removed]).toEqual([99]);
  });

  it('reads a non-keyframe flag as one', () => {
    const buffer = writeRenderActorsPayload({ layoutVersion: 4, flags: 0, worldRevision: 0, records: [], removed: [] });
    expect(decodeRenderActorsPayload(buffer).keyframe).toBe(false);
  });

  it('refuses a body whose length disagrees with its own header', () => {
    const buffer = writeRenderActorsPayload({
      layoutVersion: 4,
      flags: 1,
      worldRevision: 0,
      records: [{ entityId: 1, packedFields: 0, subX: 0, subY: 0, velocitySubX: 0, velocitySubY: 0 }],
      removed: [],
    });
    expect(() => decodeRenderActorsPayload(buffer.slice(0, 38))).toThrow(/must be 44 bytes, got 38/);
    expect(() => decodeRenderActorsPayload(new ArrayBuffer(8))).toThrow(/at least a 6-word header/);
  });

  it('turns a decoded keyframe into actors that invent nothing', () => {
    const decoded = decodeRenderActorsPayload(
      writeRenderActorsPayload({
        layoutVersion: 4,
        flags: 1,
        worldRevision: 0,
        // `0b0101 << 8` is the biased heading `0, 0`: an actor that has never
        // walked, which is what "no facing was published" looks like on the
        // wire.
        records: [{ entityId: 5, packedFields: 0b0101 << 8, subX: 12 * SUB, subY: -3 * SUB, velocitySubX: 0, velocitySubY: 0 }],
        removed: [],
      }),
    );

    expect(actorsFromDelta(decoded)).toEqual([
      { id: 5, assetId: PRISONER_ACTOR_ASSET_ID, tileX: 12, tileY: -3, deltaX: 0, deltaY: 0 },
    ]);
    // `facing` is absent rather than defaulted here: an omitted field says "no
    // facing was published", where a written one would say the simulation chose
    // one. `actor-pose.ts` owns the default.
    expect(Object.hasOwn(actorsFromDelta(decoded)[0]!, 'facing')).toBe(false);
  });

  it('turns a published sub-tile position, velocity and heading into what the renderer draws', () => {
    const decoded = decodeRenderActorsPayload(
      writeRenderActorsPayload({
        layoutVersion: 4,
        flags: 1,
        worldRevision: 0,
        records: [
          // Half a tile east of tile 12, walking east at five tiles a second,
          // heading `1, 0` -- biased `0b10` on x and `0b01` on y, so bits 8-11
          // read `0b0110`.
          { entityId: 5, packedFields: 0b0110 << 8, subX: 12 * SUB + SUB / 2, subY: -3 * SUB, velocitySubX: 5 * SUB, velocitySubY: 0 },
        ],
        removed: [],
      }),
    );

    expect(actorsFromDelta(decoded)).toEqual([
      { id: 5, assetId: PRISONER_ACTOR_ASSET_ID, tileX: 12.5, tileY: -3, deltaX: 5, deltaY: 0, facing: 'east' },
    ]);
  });

  it('drops a record whose population this build has no art for', () => {
    const decoded = decodeRenderActorsPayload(
      writeRenderActorsPayload({
        layoutVersion: 4,
        flags: 1,
        worldRevision: 0,
        records: [
          { entityId: 5, packedFields: (0b0101 << 8) | 0, subX: SUB, subY: SUB, velocitySubX: 0, velocitySubY: 0 },
          // Population 2: no ADR reserves a meaning for it yet, unlike 0 (prisoner)
          // and 1 (guard, ADR 0040 slice 2), which this build now recognises.
          { entityId: 6, packedFields: (0b0101 << 8) | 2, subX: 2 * SUB, subY: 2 * SUB, velocitySubX: 0, velocitySubY: 0 },
        ],
        removed: [],
      }),
    );

    // A population this build has no art for is dropped rather than drawn as a
    // prisoner or made to blank the whole payload -- see actors-from-delta.ts's
    // "Why an unknown population is dropped rather than drawn".
    expect(actorsFromDelta(decoded).map((actor) => actor.id)).toEqual([5]);
  });

  it('decodes population 1 as a guard, with its own asset id and its own id band (ADR 0040 slice 2)', () => {
    const decoded = decodeRenderActorsPayload(
      writeRenderActorsPayload({
        layoutVersion: 4,
        flags: 1,
        worldRevision: 0,
        records: [
          { entityId: 5, packedFields: (0b0101 << 8) | RENDER_ACTOR_POPULATION_PRISONER, subX: SUB, subY: SUB, velocitySubX: 0, velocitySubY: 0 },
          // Same raw entity id as the prisoner above: a guard and a prisoner
          // each come from their own `EntityStore` and can share a raw id.
          { entityId: 5, packedFields: (0b0101 << 8) | RENDER_ACTOR_POPULATION_GUARD, subX: 9 * SUB, subY: 4 * SUB, velocitySubX: 0, velocitySubY: 0 },
        ],
        removed: [],
      }),
    );

    const actors = actorsFromDelta(decoded);
    expect(actors).toHaveLength(2);
    expect(actors[0]).toMatchObject({ assetId: PRISONER_ACTOR_ASSET_ID, tileX: 1, tileY: 1 });
    expect(actors[1]).toMatchObject({ assetId: GUARD_ACTOR_ASSET_ID, tileX: 9, tileY: 4 });
    // The whole point of composing the id: sharing a raw entity id must not
    // collide into one pooled sprite in `ActorLayer`'s `Map<number, …>`.
    expect(actors[0]!.id).not.toBe(actors[1]!.id);
  });

  it("encodes a guard roster's tiles onto the same keyframe, at the guard population ordinal", () => {
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([{ id: 1, x: 0, y: 0 }]),
      TICKS_PER_SECOND,
      NO_WORLD_CHANGE,
      guardSourceOf([
        { id: 10, x: 6, y: 2 },
        { id: 11, x: 1, y: 8 },
      ]),
    );

    const read = readRenderActorsPayload(buffer);
    expect(read.recordCount).toBe(3);
    const guardRecords = read.records.slice(1);
    expect(guardRecords.map((record) => record.entityId)).toEqual([10, 11]);
    expect(guardRecords.map((record) => record.packedFields & 0xff)).toEqual([
      RENDER_ACTOR_POPULATION_GUARD,
      RENDER_ACTOR_POPULATION_GUARD,
    ]);
    expect(guardRecords.map((record) => [record.subX, record.subY])).toEqual([
      [6 * SUB, 2 * SUB],
      [1 * SUB, 8 * SUB],
    ]);
    // Neither guard here is mid-walk (`guardSourceOf`'s stand-in answers zero
    // for one with no `walk`), so both are motionless on the wire -- the same
    // "standing still" answer a prisoner's `locomotion.read` gives, not a
    // guard-specific rule. The next test is the one that used to be false.
    expect(guardRecords.every((record) => record.velocitySubX === 0 && record.velocitySubY === 0)).toBe(true);
  });

  it('selects the authored radio animation only for guards claimed by a live response', () => {
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([]), TICKS_PER_SECOND, NO_WORLD_CHANGE,
      guardSourceOf([{ id: 10, x: 6, y: 2 }, { id: 11, x: 1, y: 8 }]),
      undefined, [11],
    );
    const actors = actorsFromDelta(decodeRenderActorsPayload(buffer));
    expect(actors.map((actor) => actor.assetId)).toEqual(['actor.guard.base', 'actor.guard.response']);
    expect(actors.map((actor) => actor.incidentResponse ?? false)).toEqual([false, true]);
    expect(selectActorPose(actors[1]!)).toMatchObject({ clipId: 'respond' });
  });

  it('selects the Blender inspection animation only for guards claimed by a live search', () => {
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([]), TICKS_PER_SECOND, NO_WORLD_CHANGE,
      guardSourceOf([{ id: 10, x: 6, y: 2 }, { id: 11, x: 1, y: 8 }]),
      undefined, [], [11],
    );
    const actors = actorsFromDelta(decodeRenderActorsPayload(buffer));
    expect(actors.map((actor) => actor.assetId)).toEqual(['actor.guard.base', 'actor.guard.search']);
    expect(actors.map((actor) => actor.contrabandSearch ?? false)).toEqual([false, true]);
    expect(selectActorPose(actors[1]!)).toMatchObject({ clipId: 'search' });
  });

  it('does not apply a guard-only response bit to a prisoner record', () => {
    const writer = new RenderActorsKeyframeWriter(1, NO_WORLD_CHANGE);
    writer.writeRecord(3, packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER, 0, 0, true), 0, 0, 0, 0);
    const [actor] = actorsFromDelta(decodeRenderActorsPayload(writer.finish()));
    expect(actor?.assetId).toBe(PRISONER_ACTOR_ASSET_ID);
    expect(actor?.incidentResponse).toBeUndefined();
  });

  it('ignores a guard-only search bit on a prisoner and prioritizes response if both guard claims arrive', () => {
    const writer = new RenderActorsKeyframeWriter(2, NO_WORLD_CHANGE);
    writer.writeRecord(3, packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER, 0, 0, false, true), 0, 0, 0, 0);
    writer.writeRecord(4, packRenderActorFields(RENDER_ACTOR_POPULATION_GUARD, 0, 0, true, true), 0, 0, 0, 0);
    const [prisoner, guard] = actorsFromDelta(decodeRenderActorsPayload(writer.finish()));
    expect(prisoner?.assetId).toBe(PRISONER_ACTOR_ASSET_ID);
    expect(prisoner?.contrabandSearch).toBeUndefined();
    expect(guard?.assetId).toBe('actor.guard.response');
    expect(selectActorPose(guard!)).toMatchObject({ clipId: 'respond' });
  });

  it("carries a walking guard's sub-tile position and velocity, exactly like a prisoner's (ADR 0088)", () => {
    // **This is the case ADR 0059 could not carry**: it read "no
    // `LocomotionStore` reading for guards" here, and this test is the
    // correction rather than a silent edit (`docs/AGENT_WORKFLOW.md` §4) --
    // it fails against the encoder from before ADR 0088's `RenderGuardSource.locomotion`
    // existed, because `guardSourceOf` could not even be built without a
    // `locomotion` member for that encoder to call.
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([{ id: 1, x: 0, y: 0 }]),
      TICKS_PER_SECOND,
      NO_WORLD_CHANGE,
      guardSourceOf([{ id: 10, x: 6, y: 2, walk: { offsetX: 64, velocityX: 128, headingX: 1 } }]),
    );

    const read = readRenderActorsPayload(buffer);
    const guardRecord = read.records[1]!;
    expect(guardRecord.subX).toBe(6 * SUB + 64);
    expect(guardRecord.subY).toBe(2 * SUB);
    // Sub-tile units a tick become sub-tile units a wall-clock second here --
    // the same conversion `encodeRenderActorsKeyframe` applies to a walking
    // prisoner, at the same `TICKS_PER_SECOND`.
    expect(guardRecord.velocitySubX).toBe(128 * TICKS_PER_SECOND);
    expect(guardRecord.velocitySubY).toBe(0);
    // The population ordinal survives beside the heading, packed into the
    // same word (`packRenderActorFields` is the production encoder for both).
    expect(guardRecord.packedFields).toBe(packRenderActorFields(RENDER_ACTOR_POPULATION_GUARD, 1, 0));
  });

  it('omits the guards entirely when the caller passes none, exactly as it did before slice 2', () => {
    const buffer = encodeRenderActorsKeyframe(sourceOf([{ id: 1, x: 0, y: 0 }]), TICKS_PER_SECOND, NO_WORLD_CHANGE);
    expect(readRenderActorsPayload(buffer).recordCount).toBe(1);
  });
});
