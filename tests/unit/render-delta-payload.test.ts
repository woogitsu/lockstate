import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeRenderActorsPayload,
  packRenderActorFields,
  RENDER_ACTOR_POPULATION_PRISONER,
  RenderActorsKeyframeWriter,
} from '../../src/simulation/protocol/render-actors-payload';
import { encodeRenderActorsKeyframe } from '../../src/simulation/worker/render-actors-keyframe';
import { actorsFromDelta } from '../../src/rendering/feed/actors-from-delta';
import { PRISONER_ACTOR_ASSET_ID } from '../../src/rendering/feed/actors-from-snapshot';
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

/** A stand-in for the prisoner store, so the encoder can be driven with literal positions. */
function sourceOf(actors: readonly { readonly id: number; readonly x: number; readonly y: number }[], alive?: readonly boolean[]) {
  const tileX = new Int32Array(actors.length);
  const tileY = new Int32Array(actors.length);
  actors.forEach((actor, index) => {
    tileX[index] = actor.x;
    tileY[index] = actor.y;
  });
  return {
    entityStore: {
      maxActiveIndex: actors.length - 1,
      isIndexAlive: (index: number) => alive?.[index] ?? true,
      getIdByIndex: (index: number) => actors[index]!.id,
    },
    position: { tileX, tileY },
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

  it('writes a four-word header, then sixteen bytes per actor, little-endian', () => {
    const buffer = encodeRenderActorsKeyframe(
      sourceOf([
        { id: 7, x: 3, y: 11 },
        { id: 4_294_967_295, x: -2, y: 0 },
      ]),
    );

    // 16 header bytes + 2 x 16 record bytes, written out rather than computed
    // by the production helper that computes it.
    expect(buffer.byteLength).toBe(48);

    const read = readRenderActorsPayload(buffer);
    expect(read.layoutVersion).toBe(1);
    expect(read.flags).toBe(1);
    expect(read.keyframe).toBe(true);
    expect(read.recordCount).toBe(2);
    expect(read.removedCount).toBe(0);
    expect(read.records).toEqual([
      { entityId: 7, packedFields: 0, tileX: 3, tileY: 11 },
      { entityId: 4_294_967_295, packedFields: 0, tileX: -2, tileY: 0 },
    ]);
    expect(read.removed).toEqual([]);
  });

  it('is little-endian in the bytes, not merely in the reader', () => {
    /*
     * `readRenderActorsPayload` asks for little-endian, so it and a big-endian
     * writer would disagree -- but only about a value, and a test that read
     * `recordCount` as 16,777,216 would still be reporting a number. This
     * inspects the raw bytes, which is the one form the endianness claim has
     * that no reader can launder.
     */
    const buffer = encodeRenderActorsKeyframe(sourceOf([{ id: 0x01020304, x: 0, y: 0 }]));
    const bytes = new Uint8Array(buffer);
    // The layout version, word 0, is 1: low byte first.
    expect([...bytes.slice(0, 4)]).toEqual([1, 0, 0, 0]);
    // The first record's entity id, word 4.
    expect([...bytes.slice(16, 20)]).toEqual([0x04, 0x03, 0x02, 0x01]);
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
    );

    const read = readRenderActorsPayload(buffer);
    expect(read.recordCount).toBe(2);
    expect(read.records.map((record) => record.entityId)).toEqual([10, 12]);
    expect(read.records.map((record) => record.tileX)).toEqual([1, 3]);
  });

  it('tags every record with the prisoner population ordinal, in the low byte', () => {
    const buffer = encodeRenderActorsKeyframe(sourceOf([{ id: 1, x: 0, y: 0 }]));
    expect(readRenderActorsPayload(buffer).records[0]!.packedFields).toBe(0);
    expect(RENDER_ACTOR_POPULATION_PRISONER).toBe(0);
    // The reserved 24 bits are zero, so a later slice can use them without a
    // build in the field having written anything there.
    expect(packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER) >>> 8).toBe(0);
  });

  it('encodes an empty population as a bare header', () => {
    const buffer = encodeRenderActorsKeyframe(sourceOf([]));
    expect(buffer.byteLength).toBe(16);
    expect(readRenderActorsPayload(buffer).recordCount).toBe(0);
  });

  it('refuses to ship a keyframe whose records were not all written', () => {
    // A short write would leave a zeroed tail, and `{ id 0, tile 0,0 }` is a
    // well-formed record -- so the receiver would draw a phantom prisoner at
    // the origin and nothing would report it.
    const writer = new RenderActorsKeyframeWriter(2);
    writer.writeRecord(1, 0, 5, 6);
    expect(() => writer.finish()).toThrow(/sized for 2 records received 1/);
  });

  it('reads a buffer built by hand from the ADR table', () => {
    // The other direction: the production decoder driven by bytes it did not
    // write, so a decoder that agreed with its own writer about a wrong layout
    // has nowhere to hide.
    const buffer = writeRenderActorsPayload({
      layoutVersion: 1,
      flags: 1,
      records: [
        { entityId: 42, packedFields: 0, tileX: -7, tileY: 9 },
        { entityId: 43, packedFields: 1, tileX: 0, tileY: -1 },
      ],
      removed: [99],
    });

    const decoded = decodeRenderActorsPayload(buffer);
    expect(decoded.layoutVersion).toBe(1);
    expect(decoded.keyframe).toBe(true);
    expect(decoded.recordCount).toBe(2);
    expect([...decoded.entityIds]).toEqual([42, 43]);
    expect([...decoded.packedFields]).toEqual([0, 1]);
    expect([...decoded.tileX]).toEqual([-7, 0]);
    expect([...decoded.tileY]).toEqual([9, -1]);
    expect([...decoded.removed]).toEqual([99]);
  });

  it('reads a non-keyframe flag as one', () => {
    const buffer = writeRenderActorsPayload({ layoutVersion: 1, flags: 0, records: [], removed: [] });
    expect(decodeRenderActorsPayload(buffer).keyframe).toBe(false);
  });

  it('refuses a body whose length disagrees with its own header', () => {
    const buffer = writeRenderActorsPayload({
      layoutVersion: 1,
      flags: 1,
      records: [{ entityId: 1, packedFields: 0, tileX: 0, tileY: 0 }],
      removed: [],
    });
    expect(() => decodeRenderActorsPayload(buffer.slice(0, 30))).toThrow(/must be 32 bytes, got 30/);
    expect(() => decodeRenderActorsPayload(new ArrayBuffer(8))).toThrow(/at least a 4-word header/);
  });

  it('turns a decoded keyframe into actors that invent nothing', () => {
    const decoded = decodeRenderActorsPayload(
      writeRenderActorsPayload({
        layoutVersion: 1,
        flags: 1,
        records: [{ entityId: 5, packedFields: 0, tileX: 12, tileY: -3 }],
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

  it('drops a record whose population this build has no art for', () => {
    const decoded = decodeRenderActorsPayload(
      writeRenderActorsPayload({
        layoutVersion: 1,
        flags: 1,
        records: [
          { entityId: 5, packedFields: 0, tileX: 1, tileY: 1 },
          { entityId: 6, packedFields: 1, tileX: 2, tileY: 2 },
        ],
        removed: [],
      }),
    );

    // Population 1 is the ordinal ADR 0040 reserves for guards, whose asset
    // choice is its own slice. Drawing them as prisoners would be the wrong art
    // on screen with nothing reporting it.
    expect(actorsFromDelta(decoded).map((actor) => actor.id)).toEqual([5]);
  });
});
