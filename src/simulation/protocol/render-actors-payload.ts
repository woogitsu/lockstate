import { LOCOMOTION_SUBTILE_UNITS } from '../locomotion';

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
 * | then `recordCount` x 5 words | `u32` entity id, `u32` packed fields, `i32` x, `i32` y, `i16` velocity x + `i16` velocity y |
 * | then `removedCount` x 1 word | `u32` entity id no longer live |
 *
 * Twenty bytes per actor. `packEntityId` returns `>>> 0`
 * (`src/simulation/entity/entity-store.ts`), so an id is exactly one `u32`.
 *
 * **Position is in sub-tile units, not tiles**, and velocity is in sub-tile
 * units per wall-clock second. `RENDER_ACTORS_SUBTILE_UNITS` is
 * `LOCOMOTION_SUBTILE_UNITS` re-exported rather than a scale of this format's
 * own: an actor's position between two tiles is exactly what
 * `LocomotionStore` holds, and converting it here would be inventing a
 * precision the simulation does not have. That is the same rule
 * `src/rendering/feed/actors-from-snapshot.ts` sets for this data, applied to
 * a quantity that now exists.
 *
 * ### Why velocity is per wall-clock second and not per tick
 *
 * The receiver uses it to advance a published position across the gap between
 * two publications, and that gap is measured in wall-clock milliseconds by a
 * requestAnimationFrame loop. A per-tick velocity would make the renderer
 * responsible for knowing the kernel's step duration *and* the player's
 * current speed multiplier -- two facts it would have to track from
 * `simulation/clock-state` and would get wrong for one frame after every speed
 * change. The worker knows both, so it does the multiplication.
 *
 * ### Endianness is written out rather than inherited
 *
 * Both halves go through `DataView` with an explicit `true`. A `Uint32Array`
 * view would be faster and would agree with itself on every machine this ships
 * to, but it would make the format mean "whatever this CPU does", which is a
 * property of the reader rather than of the bytes. The measured cost of the
 * explicit form is recorded in `docs/RENDERING.md` beside the payload size.
 *
 * ### What layout 1 did not carry, and why layout 2 does
 *
 * > This section read: *"No motion and no facing. The simulation updates an
 * > actor's position only on arrival at a resolved route's destination
 * > (`components.ts`, `action-system.ts`), so there is no velocity to publish;
 * > a channel at any cadence delivers fresher teleports, not walking."* Every
 * > word of that was true of the simulation it described, and
 * > [ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
 * > is the decision that stopped it being true: an actor covers the tiles
 * > between two rooms at a fixed speed, so there is a position between tiles
 * > and a velocity, and both are simulation state rather than something this
 * > layer differenced out of two publications. The refusal the paragraph
 * > states still stands for anything the simulation does *not* say -- see
 * > `actors-from-delta.ts` for what the receiver still declines to invent.
 *
 * Still not carried: an animation clip, an animation phase, or any statement
 * about which artwork draws a population. Those are renderer decisions
 * (ADR 0014) and the payload names a population *ordinal*.
 *
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
export const RENDER_ACTORS_SCHEMA_VERSION = 2;

/** The payload's `contentType`. Names the bytes, so a wrong body is refused rather than misread. */
export const RENDER_ACTORS_CONTENT_TYPE = 'application/x-lockstate-render-actors';

/**
 * `u32[0]`. Redundant with `RENDER_ACTORS_SCHEMA_VERSION` on purpose: a reader
 * that has the buffer and not the envelope can still tell what it is holding.
 *
 * **1 until ADR 0059, 2 since.** Layout 1 carried a whole-tile `i32` position
 * and nothing else, because the simulation had no motion to publish; layout 2
 * carries a sub-tile position, a velocity and a heading, because it does. ADR
 * 0003 decision 5 puts the read model's version inside the payload for exactly
 * this, so the bump costs no protocol change and no envelope change.
 */
export const RENDER_ACTORS_LAYOUT_VERSION = 2;

/** `u32[1]` bit 0: the record list is the complete live set rather than the actors that changed. */
export const RENDER_ACTORS_KEYFRAME_FLAG = 1;

/** Words before the first record. */
export const RENDER_ACTORS_HEADER_WORDS = 4;

/** Words per record: entity id, packed fields, x, y, and the two packed velocity halves. */
export const RENDER_ACTORS_RECORD_WORDS = 5;

/**
 * Sub-tile units in one tile: the fixed-point scale a position and a velocity
 * in this payload are expressed in.
 *
 * Re-exported from `src/simulation/locomotion` rather than declared, so the
 * two cannot drift and so a reader can see that the wire carries the
 * simulation's own precision unconverted.
 */
export const RENDER_ACTORS_SUBTILE_UNITS = LOCOMOTION_SUBTILE_UNITS;

/** Bytes per word. Every field in this layout is exactly one word wide. */
export const RENDER_ACTORS_WORD_BYTES = 4;

/**
 * The population an actor belongs to, in the low byte of the packed-fields
 * word.
 *
 * `RENDER_ACTOR_POPULATION_GUARD` is the "later slice" this comment used to
 * point at (ADR 0040 slice 2, landed alongside this sentence): guards are the
 * second member, decoded in `actors-from-snapshot.ts` and encoded here in
 * `render-actors-keyframe.ts`, with `actor.guard.base` as their asset id.
 */
export const RENDER_ACTOR_POPULATION_PRISONER = 0;

/**
 * The guard population ordinal (ADR 0040 slice 2). Guards do not walk
 * continuously the way ADR 0059 gave prisoners -- `patrol-system.ts` still
 * moves a `GuardRecord.tileX`/`tileY` only on arrival -- so a guard record
 * always carries zero velocity and zero heading; see
 * `render-actors-keyframe.ts` for where that is written and
 * `docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md`'s open
 * question 4 for why that is a deliberate, separate decision from whether to
 * draw them at all (`docs/research/2026-08-28-drawing-guards.md`).
 */
export const RENDER_ACTOR_POPULATION_GUARD = 1;

/** The low byte of the packed-fields word. Bits 8-11 hold the heading; the remaining 20 bits are reserved and are written as zero. */
export const RENDER_ACTOR_POPULATION_MASK = 0xff;

/**
 * A render-space actor id that cannot collide across populations.
 *
 * `packEntityId` uses the full 32 bits of a `u32` (20 index bits, 12
 * generation bits) inside *one* `EntityStore`, and prisoners and guards are
 * two different stores that both start handing out index 0 at generation 0
 * (`src/simulation/runtime/new-session.ts`'s `actorIdentity` comment states
 * the same fact for names: "`prisoners` and `securityGuards` each hand out id
 * `0`"). So the raw wire/`GuardRecord` entity id is only unique *within* a
 * population, and `ActorLayer` pools sprites in one `Map<number, …>` keyed by
 * `RenderActor.id` across all of them. Composing the population into the id
 * here -- rather than leaving two actors from different populations able to
 * share a key -- is what stops a guard and a prisoner at index 0 from
 * silently taking over one another's pooled sprite.
 *
 * `population * 2**32 + entityId` keeps every prisoner id exactly what it
 * already was (`RENDER_ACTOR_POPULATION_PRISONER` is `0`, so the multiply is a
 * no-op) and puts every other population in its own disjoint band above
 * `2**32`, still a safe integer at these sizes and nowhere near
 * `Number.MAX_SAFE_INTEGER`.
 */
export function composeRenderActorId(population: number, entityId: number): number {
  return population * 2 ** 32 + entityId;
}

/**
 * The heading, as two biased two-bit signs in bits 8-9 and 10-11 of the
 * packed-fields word: `-1`, `0` or `1` per axis, stored as the value plus one.
 *
 * A heading rather than a direction ordinal, because which of the eight
 * authored sprite directions a sign pair maps to is a *rendering* decision --
 * `src/rendering/assets/direction.ts` owns it, reads the contract's
 * `+x` east / `+y` south frame, and is the single place that interpretation
 * lives. Putting an ordinal on the wire would make the worker the second place.
 *
 * Two bits an axis rather than a byte because it costs nothing: the word had
 * 24 reserved bits and now has 20.
 */
const HEADING_BIAS = 1;
const HEADING_MASK = 0b11;
const HEADING_X_SHIFT = 8;
const HEADING_Y_SHIFT = 10;

export function packRenderActorFields(population: number, headingX = 0, headingY = 0): number {
  return (
    (population & RENDER_ACTOR_POPULATION_MASK) |
    (((headingX + HEADING_BIAS) & HEADING_MASK) << HEADING_X_SHIFT) |
    (((headingY + HEADING_BIAS) & HEADING_MASK) << HEADING_Y_SHIFT)
  );
}

export function renderActorPopulation(packedFields: number): number {
  return packedFields & RENDER_ACTOR_POPULATION_MASK;
}

export function renderActorHeadingX(packedFields: number): number {
  return ((packedFields >>> HEADING_X_SHIFT) & HEADING_MASK) - HEADING_BIAS;
}

export function renderActorHeadingY(packedFields: number): number {
  return ((packedFields >>> HEADING_Y_SHIFT) & HEADING_MASK) - HEADING_BIAS;
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
  /** Position in sub-tile units: `tile * RENDER_ACTORS_SUBTILE_UNITS + offset`. */
  readonly subX: Int32Array;
  readonly subY: Int32Array;
  /** Velocity in sub-tile units per wall-clock second. Zero on both axes for an actor standing still. */
  readonly velocitySubX: Int16Array;
  readonly velocitySubY: Int16Array;
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

  public writeRecord(
    entityId: number,
    packedFields: number,
    subX: number,
    subY: number,
    velocitySubX: number,
    velocitySubY: number,
  ): void {
    if (this.written >= this.recordCount) {
      throw new Error(`A render-actors keyframe sized for ${String(this.recordCount)} records was handed another.`);
    }
    const offset =
      (RENDER_ACTORS_HEADER_WORDS + this.written * RENDER_ACTORS_RECORD_WORDS) * RENDER_ACTORS_WORD_BYTES;
    this.view.setUint32(offset, entityId, true);
    this.view.setUint32(offset + RENDER_ACTORS_WORD_BYTES, packedFields, true);
    this.view.setInt32(offset + 2 * RENDER_ACTORS_WORD_BYTES, subX, true);
    this.view.setInt32(offset + 3 * RENDER_ACTORS_WORD_BYTES, subY, true);
    // Two `i16` in the fifth word. A velocity is bounded by the walking speed
    // and the speed ladder's ceiling -- 128 sub-tile units a tick at x4 is
    // 10,240 a second -- so sixteen bits is still room to spare (a third of the
    // range), and a whole word an axis would be four bytes an actor for
    // nothing. A speed ladder reaching x16, or a walk three times this one,
    // would be the thing that overflows it.
    this.view.setInt16(offset + 4 * RENDER_ACTORS_WORD_BYTES, velocitySubX, true);
    this.view.setInt16(offset + 4 * RENDER_ACTORS_WORD_BYTES + 2, velocitySubY, true);
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
  const subX = new Int32Array(recordCount);
  const subY = new Int32Array(recordCount);
  const velocitySubX = new Int16Array(recordCount);
  const velocitySubY = new Int16Array(recordCount);
  for (let record = 0; record < recordCount; record += 1) {
    const offset = (RENDER_ACTORS_HEADER_WORDS + record * RENDER_ACTORS_RECORD_WORDS) * RENDER_ACTORS_WORD_BYTES;
    entityIds[record] = view.getUint32(offset, true);
    packedFields[record] = view.getUint32(offset + RENDER_ACTORS_WORD_BYTES, true);
    subX[record] = view.getInt32(offset + 2 * RENDER_ACTORS_WORD_BYTES, true);
    subY[record] = view.getInt32(offset + 3 * RENDER_ACTORS_WORD_BYTES, true);
    velocitySubX[record] = view.getInt16(offset + 4 * RENDER_ACTORS_WORD_BYTES, true);
    velocitySubY[record] = view.getInt16(offset + 4 * RENDER_ACTORS_WORD_BYTES + 2, true);
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
    subX,
    subY,
    velocitySubX,
    velocitySubY,
    removed,
  };
}
