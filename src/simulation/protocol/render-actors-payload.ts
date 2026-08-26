/**
 * The bytes a `simulation/delta` carries, and the only definition of them.
 *
 * ADR 0040 decides that actor state reaches the renderer as an unsolicited
 * `simulation/delta` whose `versionedPayload` uses the `array-buffer`
 * transport, so that the main thread's boundary cost stops scaling with the
 * population: `arrayBufferPayloadSchema` (`./types.ts`) validates a schema id,
 * a content type and a `byteLength` cross-check and never walks the body,
 * where `jsonValueSchema` recurses through every element of a session bundle.
 *
 * ### Why the layout lives in `protocol/`
 *
 * Two modules read these bytes and they sit on opposite sides of the worker
 * boundary: `src/simulation/worker/render-actors-keyframe.ts` writes them and
 * `src/rendering/feed/actors-from-delta.ts` reads them. A wire format with a
 * copy on each side is a format that drifts, so the header words, the record
 * width, the flag bits and both halves of the codec are defined here once --
 * beside `transferables.ts`, which already knows this message carries a
 * buffer, and `types.ts`, which already declares the envelope.
 *
 * ### The layout
 *
 * Little-endian, header then records then removals:
 *
 * | Words | Meaning |
 * | --- | --- |
 * | `u32[0]` | layout version (`1`) |
 * | `u32[1]` | flags; bit 0 set = keyframe (the record list is the complete live set) |
 * | `u32[2]` | `recordCount` |
 * | `u32[3]` | `removedCount` |
 * | then `recordCount` x 4 words | `u32` entity id, `u32` packed fields, `i32` tileX, `i32` tileY |
 * | then `removedCount` x 1 word | `u32` entity id no longer live |
 *
 * Sixteen bytes per actor. `packEntityId` returns `>>> 0`
 * (`src/simulation/entity/entity-store.ts`), so an id is exactly one `u32`,
 * and tile coordinates are plain `i32` because that is exactly what
 * `PositionComponent` holds -- nothing here is invented, which is the rule
 * `src/rendering/feed/actors-from-snapshot.ts` already sets for this data.
 *
 * ### Endianness is written out rather than inherited
 *
 * Both halves go through `DataView` with an explicit `true`. A `Uint32Array`
 * view would be faster and would agree with itself on every machine this ships
 * to, but it would make the format mean "whatever this CPU does", which is a
 * property of the reader rather than of the bytes. The measured cost of the
 * explicit form is recorded in `docs/RENDERING.md` beside the payload size.
 *
 * ### What slice 1 does not carry
 *
 * No motion and no facing. The simulation updates an actor's position only on
 * arrival at a resolved route's destination
 * (`src/simulation/prisoners/components.ts`, `action-system.ts`), so there is
 * no velocity to publish; a channel at any cadence delivers fresher teleports,
 * not walking. Differencing publications on the main thread to produce one
 * would be a renderer-side movement model, which `AGENTS.md` boundary 1
 * forbids and which `actors-from-snapshot.ts` already refuses for snapshots.
 * The `flags` word and the removal list are in the layout from the start so
 * that the changed-only messages ADR 0040 puts in a later slice need no
 * version bump.
 */

/** The payload's `schemaId`, checked by the receiver before it reads a byte. */
export const RENDER_ACTORS_SCHEMA_ID = 'lockstate.render-actors';

/**
 * The payload's `schemaVersion`, which is what versions this layout.
 *
 * ADR 0003 decision 5 puts the read model's version inside the payload rather
 * than in the envelope, so adding a motion vector and a facing ordinal to the
 * record is a bump here and no protocol change at all.
 */
export const RENDER_ACTORS_SCHEMA_VERSION = 1;

/** The payload's `contentType`. Names the bytes, so a wrong body is refused rather than misread. */
export const RENDER_ACTORS_CONTENT_TYPE = 'application/x-lockstate-render-actors';

/** `u32[0]`. Redundant with `RENDER_ACTORS_SCHEMA_VERSION` on purpose: a reader that has the buffer and not the envelope can still tell what it is holding. */
export const RENDER_ACTORS_LAYOUT_VERSION = 1;

/** `u32[1]` bit 0: the record list is the complete live set rather than the actors that changed. */
export const RENDER_ACTORS_KEYFRAME_FLAG = 1;

/** Words before the first record. */
export const RENDER_ACTORS_HEADER_WORDS = 4;

/** Words per record: entity id, packed fields, tileX, tileY. */
export const RENDER_ACTORS_RECORD_WORDS = 4;

/** Bytes per word. Every field in this layout is exactly one word wide. */
export const RENDER_ACTORS_WORD_BYTES = 4;

/**
 * The population an actor belongs to, in the low byte of the packed-fields
 * word.
 *
 * One member today. Guards are the other population whose tiles the
 * simulation already holds, and ADR 0040 puts them in their own slice with
 * their own asset choice; the ordinal exists now so that adding them is a
 * value and not a layout change.
 */
export const RENDER_ACTOR_POPULATION_PRISONER = 0;

/** The low byte of the packed-fields word. The remaining 24 bits are reserved and are written as zero. */
export const RENDER_ACTOR_POPULATION_MASK = 0xff;

export function packRenderActorFields(population: number): number {
  return population & RENDER_ACTOR_POPULATION_MASK;
}

export function renderActorPopulation(packedFields: number): number {
  return packedFields & RENDER_ACTOR_POPULATION_MASK;
}

/**
 * A decoded payload, in the structure-of-arrays form the encoder wrote it in.
 *
 * Deliberately not an array of record objects. The receiver allocates one
 * `RenderActor` per live actor and there is no reason to allocate a second
 * short-lived object beside it; SoA is also what the simulation side holds, so
 * neither end has to transpose.
 */
export interface RenderActorsPayload {
  readonly layoutVersion: number;
  readonly keyframe: boolean;
  readonly recordCount: number;
  readonly entityIds: Uint32Array;
  readonly packedFields: Uint32Array;
  readonly tileX: Int32Array;
  readonly tileY: Int32Array;
  readonly removed: Uint32Array;
}

export function renderActorsByteLength(recordCount: number, removedCount: number): number {
  return (
    (RENDER_ACTORS_HEADER_WORDS + recordCount * RENDER_ACTORS_RECORD_WORDS + removedCount) *
    RENDER_ACTORS_WORD_BYTES
  );
}

/**
 * Writes one keyframe, record by record.
 *
 * A writer rather than a function over a materialised list, because the
 * producer's whole cost argument is that it walks the position SoA once and
 * allocates nothing per actor. Handing it an array of records first would
 * allocate exactly the garbage the buffer exists to avoid.
 *
 * `recordCount` is fixed at construction because it is the buffer's size. The
 * producer therefore has to know how many live actors it has before it starts
 * writing, which is one extra pass over a `Uint8Array` of liveness flags --
 * far cheaper than growing a buffer.
 */
export class RenderActorsKeyframeWriter {
  private readonly view: DataView;
  private written = 0;

  public constructor(public readonly recordCount: number) {
    if (!Number.isInteger(recordCount) || recordCount < 0) {
      throw new Error(
        `A render-actors keyframe needs a non-negative integer record count, got ${String(recordCount)}.`,
      );
    }
    this.view = new DataView(new ArrayBuffer(renderActorsByteLength(recordCount, 0)));
    this.view.setUint32(0, RENDER_ACTORS_LAYOUT_VERSION, true);
    this.view.setUint32(RENDER_ACTORS_WORD_BYTES, RENDER_ACTORS_KEYFRAME_FLAG, true);
    this.view.setUint32(2 * RENDER_ACTORS_WORD_BYTES, recordCount, true);
    // A keyframe is the complete live set, so nothing needs removing: an id
    // absent from the record list is an id the receiver drops.
    this.view.setUint32(3 * RENDER_ACTORS_WORD_BYTES, 0, true);
  }

  public writeRecord(entityId: number, packedFields: number, tileX: number, tileY: number): void {
    if (this.written >= this.recordCount) {
      throw new Error(`A render-actors keyframe sized for ${String(this.recordCount)} records was handed another.`);
    }
    const offset =
      (RENDER_ACTORS_HEADER_WORDS + this.written * RENDER_ACTORS_RECORD_WORDS) * RENDER_ACTORS_WORD_BYTES;
    this.view.setUint32(offset, entityId, true);
    this.view.setUint32(offset + RENDER_ACTORS_WORD_BYTES, packedFields, true);
    this.view.setInt32(offset + 2 * RENDER_ACTORS_WORD_BYTES, tileX, true);
    this.view.setInt32(offset + 3 * RENDER_ACTORS_WORD_BYTES, tileY, true);
    this.written += 1;
  }

  /**
   * The finished buffer.
   *
   * Refuses a short write rather than shipping a keyframe whose tail is zeroed:
   * `{ id 0, tile 0,0 }` is a well-formed record, so the receiver would draw a
   * phantom prisoner at the origin and nothing would report it.
   */
  public finish(): ArrayBuffer {
    if (this.written !== this.recordCount) {
      throw new Error(
        `A render-actors keyframe sized for ${String(this.recordCount)} records received ${String(this.written)}.`,
      );
    }
    return this.view.buffer as ArrayBuffer;
  }
}

/**
 * Reads a payload, or throws.
 *
 * Throws rather than returning a partial view: the receiver's answer to a body
 * it cannot read is to keep the actors it already has, and it can only make
 * that choice if a malformed body is unambiguous. Every bound is checked
 * against the buffer's real length, because `arrayBufferPayloadSchema`
 * deliberately does not look inside -- it validates that `byteLength` matches
 * the buffer and nothing about what the bytes mean, which is exactly the
 * property that makes the boundary cost flat in the population.
 */
export function decodeRenderActorsPayload(buffer: ArrayBuffer): RenderActorsPayload {
  if (buffer.byteLength < RENDER_ACTORS_HEADER_WORDS * RENDER_ACTORS_WORD_BYTES) {
    throw new Error(
      `A render-actors payload needs at least a ${String(RENDER_ACTORS_HEADER_WORDS)}-word header, got ${String(buffer.byteLength)} bytes.`,
    );
  }
  const view = new DataView(buffer);
  const layoutVersion = view.getUint32(0, true);
  const flags = view.getUint32(RENDER_ACTORS_WORD_BYTES, true);
  const recordCount = view.getUint32(2 * RENDER_ACTORS_WORD_BYTES, true);
  const removedCount = view.getUint32(3 * RENDER_ACTORS_WORD_BYTES, true);

  const expected = renderActorsByteLength(recordCount, removedCount);
  if (buffer.byteLength !== expected) {
    throw new Error(
      `A render-actors payload declaring ${String(recordCount)} records and ${String(removedCount)} removals must be ${String(expected)} bytes, got ${String(buffer.byteLength)}.`,
    );
  }

  const entityIds = new Uint32Array(recordCount);
  const packedFields = new Uint32Array(recordCount);
  const tileX = new Int32Array(recordCount);
  const tileY = new Int32Array(recordCount);
  for (let record = 0; record < recordCount; record += 1) {
    const offset = (RENDER_ACTORS_HEADER_WORDS + record * RENDER_ACTORS_RECORD_WORDS) * RENDER_ACTORS_WORD_BYTES;
    entityIds[record] = view.getUint32(offset, true);
    packedFields[record] = view.getUint32(offset + RENDER_ACTORS_WORD_BYTES, true);
    tileX[record] = view.getInt32(offset + 2 * RENDER_ACTORS_WORD_BYTES, true);
    tileY[record] = view.getInt32(offset + 3 * RENDER_ACTORS_WORD_BYTES, true);
  }

  const removed = new Uint32Array(removedCount);
  const removalsAt =
    (RENDER_ACTORS_HEADER_WORDS + recordCount * RENDER_ACTORS_RECORD_WORDS) * RENDER_ACTORS_WORD_BYTES;
  for (let index = 0; index < removedCount; index += 1) {
    removed[index] = view.getUint32(removalsAt + index * RENDER_ACTORS_WORD_BYTES, true);
  }

  return {
    layoutVersion,
    keyframe: (flags & RENDER_ACTORS_KEYFRAME_FLAG) === RENDER_ACTORS_KEYFRAME_FLAG,
    recordCount,
    entityIds,
    packedFields,
    tileX,
    tileY,
    removed,
  };
}
