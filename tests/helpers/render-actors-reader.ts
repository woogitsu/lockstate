/**
 * An independent reader of the `simulation/delta` payload, written against ADR
 * 0040's layout table and against nothing else.
 *
 * ### Why this exists rather than a call to the production decoder
 *
 * `docs/TESTING.md` names the defect this avoids: **a fixture that supplies
 * both sides of a comparison**. Asserting that `decodeRenderActorsPayload`
 * agrees with `RenderActorsKeyframeWriter` compares a function's output to its
 * own inverse, so it holds for any pair of functions that are inverses --
 * including a pair that both put `tileY` where `tileX` belongs, both write
 * big-endian, or both use a five-word header. The whole layout could be wrong
 * and that assertion would stay green.
 *
 * So this reader is written from the table in the ADR:
 *
 * | Words | Meaning |
 * | --- | --- |
 * | `u32[0]` | layout version |
 * | `u32[1]` | flags; bit 0 set = keyframe |
 * | `u32[2]` | `recordCount` |
 * | `u32[3]` | `removedCount` |
 * | then `recordCount` x 4 words | `u32` entity id, `u32` packed fields, `i32` tileX, `i32` tileY |
 * | then `removedCount` x 1 word | `u32` entity id no longer live |
 *
 * Little-endian, four bytes a word, sixteen bytes a record.
 *
 * **It must never import `src/simulation/protocol/render-actors-payload.ts`.**
 * Every offset and width below is a literal for that reason, and
 * `tests/unit/render-delta-payload.test.ts` asserts the absence of that import
 * so the independence is checked rather than promised. Every number here is a
 * transcription of the ADR, which is the one document the production module and
 * this file are both answerable to.
 */

export interface ReadRenderActorRecord {
  readonly entityId: number;
  readonly packedFields: number;
  readonly tileX: number;
  readonly tileY: number;
}

export interface ReadRenderActorsPayload {
  readonly layoutVersion: number;
  readonly flags: number;
  readonly keyframe: boolean;
  readonly recordCount: number;
  readonly removedCount: number;
  readonly records: readonly ReadRenderActorRecord[];
  readonly removed: readonly number[];
}

/** Reads the bytes as the ADR's table describes them. Throws on any length the table cannot explain. */
export function readRenderActorsPayload(buffer: ArrayBuffer): ReadRenderActorsPayload {
  const view = new DataView(buffer);
  if (buffer.byteLength < 16) {
    throw new Error(`A payload is at least a four-word header: 16 bytes, got ${String(buffer.byteLength)}.`);
  }
  const layoutVersion = view.getUint32(0, true);
  const flags = view.getUint32(4, true);
  const recordCount = view.getUint32(8, true);
  const removedCount = view.getUint32(12, true);

  const expected = 16 + recordCount * 16 + removedCount * 4;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `${String(recordCount)} records and ${String(removedCount)} removals is ${String(expected)} bytes, got ${String(buffer.byteLength)}.`,
    );
  }

  const records: ReadRenderActorRecord[] = [];
  for (let record = 0; record < recordCount; record += 1) {
    const at = 16 + record * 16;
    records.push({
      entityId: view.getUint32(at, true),
      packedFields: view.getUint32(at + 4, true),
      tileX: view.getInt32(at + 8, true),
      tileY: view.getInt32(at + 12, true),
    });
  }

  const removed: number[] = [];
  for (let index = 0; index < removedCount; index += 1) {
    removed.push(view.getUint32(16 + recordCount * 16 + index * 4, true));
  }

  return {
    layoutVersion,
    flags,
    keyframe: (flags & 1) === 1,
    recordCount,
    removedCount,
    records,
    removed,
  };
}

/**
 * Writes the bytes the ADR's table describes, for the other direction.
 *
 * The production decoder has to be driven by a buffer it did not produce, or
 * the same self-comparison appears with the arrows reversed. This builds one by
 * hand from literal offsets.
 */
export function writeRenderActorsPayload(payload: {
  readonly layoutVersion: number;
  readonly flags: number;
  readonly records: readonly ReadRenderActorRecord[];
  readonly removed: readonly number[];
}): ArrayBuffer {
  const buffer = new ArrayBuffer(16 + payload.records.length * 16 + payload.removed.length * 4);
  const view = new DataView(buffer);
  view.setUint32(0, payload.layoutVersion, true);
  view.setUint32(4, payload.flags, true);
  view.setUint32(8, payload.records.length, true);
  view.setUint32(12, payload.removed.length, true);
  payload.records.forEach((record, index) => {
    const at = 16 + index * 16;
    view.setUint32(at, record.entityId, true);
    view.setUint32(at + 4, record.packedFields, true);
    view.setInt32(at + 8, record.tileX, true);
    view.setInt32(at + 12, record.tileY, true);
  });
  payload.removed.forEach((entityId, index) => {
    view.setUint32(16 + payload.records.length * 16 + index * 4, entityId, true);
  });
  return buffer;
}
