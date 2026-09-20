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
 * | `u32[4]` | the drawn world's marker |
 * | then `recordCount` x 5 words | `u32` entity id, `u32` packed fields, `i32` x, `i32` y, `i16` velocity x + `i16` velocity y |
 * | then `removedCount` x 1 word | `u32` entity id no longer live |
 *
 * Little-endian, four bytes a word, **twenty** bytes a record, **twenty**
 * bytes of header.
 *
 * **Sixteen bytes a record until ADR 0059's layout 2.** Layout 1's record was
 * `u32` id, `u32` fields and two whole-tile `i32`s; the position is now in
 * sub-tile units and there is a velocity beside it. Transcribed from the
 * amended table for the same reason the original was transcribed from the
 * first one.
 *
 * **A four-word header until ADR 0099's layout 3.** `u32[4]` is that
 * document's marker -- decision 2 puts the notification on this channel as
 * *"one header word"*, and decision 3 says it is a monotone counter with no
 * meaning beyond inequality. This reader transcribes it as a number and reads
 * nothing into it, which is exactly what a reader written against the
 * production decoder could not be trusted to do.
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
  /** Sub-tile units, 256 to a tile. */
  readonly subX: number;
  readonly subY: number;
  /** Sub-tile units per wall-clock second. */
  readonly velocitySubX: number;
  readonly velocitySubY: number;
}

export interface ReadRenderActorsPayload {
  readonly layoutVersion: number;
  readonly flags: number;
  readonly keyframe: boolean;
  readonly recordCount: number;
  readonly removedCount: number;
  /** `u32[4]`, ADR 0099's marker. A number, and nothing is read into it here. */
  readonly worldRevision: number;
  readonly records: readonly ReadRenderActorRecord[];
  readonly removed: readonly number[];
  /** `u32[5]` and the three-word rows after the removals: ADR 0097's per-room condition block (layout 4). */
  readonly roomCount: number;
  readonly rooms: readonly ReadRenderRoomCondition[];
}

export interface ReadRenderRoomCondition {
  readonly anchorTileX: number;
  readonly anchorTileY: number;
  readonly condition: number;
}

/** Reads the bytes as the ADR's table describes them. Throws on any length the table cannot explain. */
export function readRenderActorsPayload(buffer: ArrayBuffer): ReadRenderActorsPayload {
  const view = new DataView(buffer);
  if (buffer.byteLength < 24) {
    throw new Error(`A payload is at least a six-word header: 24 bytes, got ${String(buffer.byteLength)}.`);
  }
  const layoutVersion = view.getUint32(0, true);
  const flags = view.getUint32(4, true);
  const recordCount = view.getUint32(8, true);
  const removedCount = view.getUint32(12, true);
  const worldRevision = view.getUint32(16, true);
  const roomCount = view.getUint32(20, true);

  const expected = 24 + recordCount * 20 + removedCount * 4 + roomCount * 12;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `${String(recordCount)} records, ${String(removedCount)} removals and ${String(roomCount)} rooms is ${String(expected)} bytes, got ${String(buffer.byteLength)}.`,
    );
  }

  const records: ReadRenderActorRecord[] = [];
  for (let record = 0; record < recordCount; record += 1) {
    const at = 24 + record * 20;
    records.push({
      entityId: view.getUint32(at, true),
      packedFields: view.getUint32(at + 4, true),
      subX: view.getInt32(at + 8, true),
      subY: view.getInt32(at + 12, true),
      velocitySubX: view.getInt16(at + 16, true),
      velocitySubY: view.getInt16(at + 18, true),
    });
  }

  const removed: number[] = [];
  for (let index = 0; index < removedCount; index += 1) {
    removed.push(view.getUint32(24 + recordCount * 20 + index * 4, true));
  }

  const rooms: ReadRenderRoomCondition[] = [];
  for (let index = 0; index < roomCount; index += 1) {
    const at = 24 + recordCount * 20 + removedCount * 4 + index * 12;
    rooms.push({
      anchorTileX: view.getInt32(at, true),
      anchorTileY: view.getInt32(at + 4, true),
      condition: view.getUint32(at + 8, true),
    });
  }

  return {
    layoutVersion,
    flags,
    keyframe: (flags & 1) === 1,
    recordCount,
    removedCount,
    worldRevision,
    records,
    removed,
    roomCount,
    rooms,
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
  /** `u32[4]`. Required, so a caller cannot write a header word it forgot it had. */
  readonly worldRevision: number;
  readonly records: readonly ReadRenderActorRecord[];
  readonly removed: readonly number[];
  /** The three-word rows after the removals: ADR 0097's per-room condition block (layout 4). Omitted is "no rooms", which is a zero in `u32[5]`. */
  readonly rooms?: readonly ReadRenderRoomCondition[];
}): ArrayBuffer {
  const rooms = payload.rooms ?? [];
  const buffer = new ArrayBuffer(24 + payload.records.length * 20 + payload.removed.length * 4 + rooms.length * 12);
  const view = new DataView(buffer);
  view.setUint32(0, payload.layoutVersion, true);
  view.setUint32(4, payload.flags, true);
  view.setUint32(8, payload.records.length, true);
  view.setUint32(12, payload.removed.length, true);
  view.setUint32(16, payload.worldRevision, true);
  view.setUint32(20, rooms.length, true);
  payload.records.forEach((record, index) => {
    const at = 24 + index * 20;
    view.setUint32(at, record.entityId, true);
    view.setUint32(at + 4, record.packedFields, true);
    view.setInt32(at + 8, record.subX, true);
    view.setInt32(at + 12, record.subY, true);
    view.setInt16(at + 16, record.velocitySubX, true);
    view.setInt16(at + 18, record.velocitySubY, true);
  });
  payload.removed.forEach((entityId, index) => {
    view.setUint32(24 + payload.records.length * 20 + index * 4, entityId, true);
  });
  rooms.forEach((room, index) => {
    const at = 24 + payload.records.length * 20 + payload.removed.length * 4 + index * 12;
    view.setInt32(at, room.anchorTileX, true);
    view.setInt32(at + 4, room.anchorTileY, true);
    view.setUint32(at + 8, room.condition, true);
  });
  return buffer;
}
