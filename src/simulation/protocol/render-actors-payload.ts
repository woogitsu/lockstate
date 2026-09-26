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
 * | `u32[4]` | the drawn world's marker (ADR 0099) |
 * | `u32[5]` | `roomCount` |
 * | then `recordCount` x 5 words | `u32` entity id, `u32` packed fields, `i32` x, `i32` y, `i16` velocity x + `i16` velocity y |
 * | then `removedCount` x 1 word | `u32` entity id no longer live |
 * | then `roomCount` x 3 words | `i32` anchor tile x, `i32` anchor tile y, `u32` condition ordinal |
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
 * ### What layout 2 did not carry, and why layout 3 does
 *
 * A statement that the *world* changed.
 * [ADR 0099](../../../docs/adr/0099-how-the-renderer-learns-the-world-changed.md)
 * measured a finished door drawn as an unbuilt ghost for 22-28 seconds
 * (issue #1037), because every one of `SimulationSnapshotFeed`'s `dirty` marks
 * is a fact about a message the main thread already has and a build order
 * completing is a fact about the simulation. `u32[4]` is that fact, in the
 * only form this payload is allowed to carry it: **a notification, not a
 * channel.** It is a monotone marker with no meaning beyond inequality with
 * the last one seen -- no tile, no chunk, no order id, no phase -- so the
 * receiver can do exactly one thing with it, which is ask for the snapshot it
 * already knows how to ask for. That is what keeps
 * `tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`
 * true by construction: a notification cannot split what a single capture
 * joins.
 *
 * Still not carried: an animation clip, an animation phase, or any statement
 * about which artwork draws a population. Those are renderer decisions
 * (ADR 0014) and the payload names a population *ordinal*.
 *
 * ### What layout 3 did not carry, and why layout 4 does
 *
 * Whether each room *works*. [ADR 0097](../../../docs/adr/0097-what-the-world-view-is-required-to-communicate.md)
 * decision 1 requires the world view to answer *"whether what is here
 * works"*, its decision 2 requires that answer to ride this channel rather
 * than the geometry pull -- *"a 30-second-stale claim about whether a cell is
 * working is a false claim"* -- and its accepted option A is exactly *"a
 * per-room-instance condition ordinal published beside the actors"*.
 * [ADR 0111](../../../docs/adr/0111-how-a-room-instances-rectangle-reaches-the-render-side.md)
 * decision 2 restates it and decision 1 sends the *rectangle* the other way,
 * on the geometry pull, so this block is a key and an ordinal and carries no
 * geometry at all.
 *
 * **Twelve bytes per room, and only for rooms the worker could answer about.**
 * An instance with no recorded rectangle (a V4 save, `RoomInstance.width`'s
 * own comment) has no perimeter to walk and contributes no row, which is the
 * absent answer ADR 0111 §4 asks for rather than a guessed one.
 *
 * Still not carried, deliberately: which mark is drawn for an ordinal, what
 * colour it is, and whether it is drawn at all. Those are renderer decisions,
 * and ADR 0111 decision 3 says publishing the rectangle licenses nothing drawn
 * with it.
 *
 * The `flags` word and the removal list are in the layout from the start so
 * that the changed-only messages ADR 0040 puts in a later slice need no
 * version bump.
 *
 * ### Layout 5: live incident response
 *
 * Bit 12 in each actor's packed fields says that a guard is currently claimed
 * by a live incident response. The worker reads this from
 * `IncidentResponseSystem.claimedGuardIds()`; the renderer selects the
 * Blender-authored radio gesture. No clip name, phase or visual effect crosses
 * the simulation boundary.
 *
 * ### Layout 6: active contraband search
 *
 * Bit 13 identifies guards claimed by a live contraband search job. It is
 * independent of incident response because both duties use the same guard
 * deployment phase. The worker publishes the claimant, not a renderer guess.
 *
 * ### Layout 7: open riot participant
 *
 * Bit 14 marks prisoners named in an open riot. The simulation already keeps
 * this indexed fact for regime selection; publishing it lets the renderer
 * show agitation in the world without interpreting incident events itself.
 *
 * ### Layout 8: open assault participants
 *
 * Bit 15 marks prisoners named in an open assault. The worker projects the
 * existing incident records once per publication. It does not decide who
 * attacked whom; both participants receive the same visual state.
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
export const RENDER_ACTORS_SCHEMA_VERSION = 8;

/** The payload's `contentType`. Names the bytes, so a wrong body is refused rather than misread. */
export const RENDER_ACTORS_CONTENT_TYPE = 'application/x-lockstate-render-actors';

/**
 * `u32[0]`. Redundant with `RENDER_ACTORS_SCHEMA_VERSION` on purpose: a reader
 * that has the buffer and not the envelope can still tell what it is holding.
 *
 * **1 until ADR 0059, 2 until ADR 0099, 3 until ADR 0097, 4 until the
 * incident-response gesture, 5 until search duty, 6 until riot art, 7 until assault art, 8 since.** Layout 1 carried a
 * whole-tile `i32` position and nothing else, because the simulation had no
 * motion to publish; layout 2 carries a sub-tile position, a velocity and a
 * heading, because it does; layout 3 adds the fifth header word ADR 0099
 * decision 2 puts the drawn world's marker in. ADR 0003 decision 5 puts the
 * read model's version inside the payload for exactly this, so each bump costs
 * no protocol change and no envelope change.
 *
 * **It moves in lockstep with `RENDER_ACTORS_SCHEMA_VERSION`**, which is what
 * layout 1 -> 2 did and what the constant above says it is for: the two
 * numbers answer the same question from either side of the envelope, and a
 * reader that trusted one while the other stood still would be trusting the
 * half it happened to have.
 */
export const RENDER_ACTORS_LAYOUT_VERSION = 8;

/** `u32[1]` bit 0: the record list is the complete live set rather than the actors that changed. */
export const RENDER_ACTORS_KEYFRAME_FLAG = 1;

/** Words before the first record. */
export const RENDER_ACTORS_HEADER_WORDS = 6;

/**
 * `u32[5]`. How many room-condition rows follow the removal list.
 *
 * ADR 0097 decision 2's channel, ADR 0111 decision 2's payload: a per-room
 * *condition* has to be refreshed at the delta's cadence rather than the
 * geometry pull's, because a thirty-second-stale claim about whether a cell
 * works is a false claim. The room's **rectangle** does not ride here -- it
 * rides the geometry pull with the rest of the geometry (ADR 0111 decision 1),
 * and this block carries only the key and the ordinal.
 */
export const RENDER_ACTORS_ROOM_COUNT_WORD = 5;

/**
 * `u32[4]`. The drawn world's marker: ADR 0099 decision 3's monotone counter,
 * meaning *"the drawn world is not what it was"* and meaning nothing else.
 *
 * The receiver compares it with the last one it saw and, on any inequality,
 * asks for a session snapshot through the request it already sends. It must
 * not be read as a tick, a count of anything, or a statement about *what*
 * changed: decision 3 bounds it to inequality precisely so that no partial
 * refresh can be built on it, because a partial refresh would let the renderer
 * hold a world assembled from more than one capture.
 *
 * Written as a `u32`, so it wraps. At the 100 ms publication ceiling a marker
 * that moved on every single publication would take 2**32 increments -- 13.6
 * years of wall clock -- to compare equal again, which is ADR 0099's open
 * question 2 answered in the direction the document expected: one word, and
 * monotone within any session anybody plays.
 */
export const RENDER_ACTORS_WORLD_REVISION_WORD = 4;

/** Words per record: entity id, packed fields, x, y, and the two packed velocity halves. */
export const RENDER_ACTORS_RECORD_WORDS = 5;

/**
 * Words per room-condition row: `i32` anchor x, `i32` anchor y, `u32` ordinal.
 *
 * ### Why the anchor tile is the key and the instance id is not
 *
 * An instance id is a string (`roomInstanceIdFor` is `catalogId:x:y` of the
 * room's north-west corner, `src/simulation/rooms/bounds-recovery.ts`), and a
 * string in a fixed-width binary block is a length prefix, a UTF-8 walk and a
 * padding rule for a key whose own two coordinates are already inside it.
 * **Two live instances cannot share an anchor tile**: `RoomZoningService.zone`
 * refuses `overlaps-existing-room` for any tile whose zoning value is
 * non-zero (`src/simulation/rooms/zoning.ts`), so a second rectangle can never
 * start on a tile the first one covers. The receiver joins these rows to the
 * rectangles the geometry pull published, by anchor, and a row whose anchor
 * matches no published room is dropped rather than drawn -- the
 * degrade-to-absence discipline ADR 0111 §4 asks for.
 */
export const RENDER_ACTORS_ROOM_WORDS = 3;

/**
 * The per-room condition ordinal, and it is exactly ADR 0108's `RoomAccess`
 * vocabulary rather than a second one.
 *
 * ADR 0097 decision 4 bounds this payload to *one* ordinal per room -- enough
 * for the player to know which room to look at, with the Rooms panel owing the
 * detail. `RoomAccess` is a vocabulary that already exists, is already
 * computed for that panel, and answers the one clause of the ADR's obligation
 * 2 that #1022's measurement is about: a sealed cell and a working one differ
 * by a door. No precedence order is invented here, because there is only one
 * question being answered -- ADR 0097 open question 3 (what the mark is for a
 * room in more than one kind of trouble) stays open, and a later ordinal that
 * answers more than access is a layout bump, not a re-reading of these values.
 *
 * `0` is written by nobody and means "no answer was published for this room".
 */
export const RENDER_ROOM_CONDITION_UNKNOWN = 0;
/** `'gap'`: the rectangle's boundary is not closed. Not a fault -- a yard is drawn this way on purpose. */
export const RENDER_ROOM_CONDITION_GAP = 1;
/** `'doorway'`: somebody can get in. The working room. */
export const RENDER_ROOM_CONDITION_DOORWAY = 2;
/** `'unreachable'`: the room has a door and nobody can reach it from outside. */
export const RENDER_ROOM_CONDITION_UNREACHABLE = 3;
/** `'no-way-in'`: the room is sealed and has no door at all. #1022's cell. */
export const RENDER_ROOM_CONDITION_NO_WAY_IN = 4;

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

/** The low byte of the packed-fields word. Bits 8-11 hold heading; bits 12-15 mark live visual states. */
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
/** Bit 12: this guard belongs to a live incident response. */
const INCIDENT_RESPONSE_SHIFT = 12;
/** Bit 13: this guard belongs to a live contraband search. */
const CONTRABAND_SEARCH_SHIFT = 13;
/** Bit 14: this prisoner participates in an open riot. */
const OPEN_RIOT_SHIFT = 14;
/** Bit 15: this prisoner participates in an open assault. */
const OPEN_ASSAULT_SHIFT = 15;

export function packRenderActorFields(population: number, headingX = 0, headingY = 0, incidentResponse = false, contrabandSearch = false, openRiot = false, openAssault = false): number {
  return (
    (population & RENDER_ACTOR_POPULATION_MASK) |
    (((headingX + HEADING_BIAS) & HEADING_MASK) << HEADING_X_SHIFT) |
    (((headingY + HEADING_BIAS) & HEADING_MASK) << HEADING_Y_SHIFT) |
    (incidentResponse ? 1 << INCIDENT_RESPONSE_SHIFT : 0) |
    (contrabandSearch ? 1 << CONTRABAND_SEARCH_SHIFT : 0) |
    (openRiot ? 1 << OPEN_RIOT_SHIFT : 0) |
    (openAssault ? 1 << OPEN_ASSAULT_SHIFT : 0)
  );
}

export function renderActorIncidentResponse(packedFields: number): boolean {
  return ((packedFields >>> INCIDENT_RESPONSE_SHIFT) & 1) === 1;
}

export function renderActorContrabandSearch(packedFields: number): boolean {
  return ((packedFields >>> CONTRABAND_SEARCH_SHIFT) & 1) === 1;
}

export function renderActorOpenRiot(packedFields: number): boolean {
  return ((packedFields >>> OPEN_RIOT_SHIFT) & 1) === 1;
}

export function renderActorOpenAssault(packedFields: number): boolean {
  return ((packedFields >>> OPEN_ASSAULT_SHIFT) & 1) === 1;
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
  /**
   * The drawn world's marker at the moment this keyframe was written
   * (`RENDER_ACTORS_WORLD_REVISION_WORD`).
   *
   * Compare it with the last one seen. Anything else read into it is a
   * reading ADR 0099 decision 3 forbids.
   */
  readonly worldRevision: number;
  readonly entityIds: Uint32Array;
  readonly packedFields: Uint32Array;
  /** Position in sub-tile units: `tile * RENDER_ACTORS_SUBTILE_UNITS + offset`. */
  readonly subX: Int32Array;
  readonly subY: Int32Array;
  /** Velocity in sub-tile units per wall-clock second. Zero on both axes for an actor standing still. */
  readonly velocitySubX: Int16Array;
  readonly velocitySubY: Int16Array;
  readonly removed: Uint32Array;
  /**
   * One entry per room the worker published a condition for, in the worker's
   * canonical instance-id order.
   *
   * The anchor tile is the join key onto the rectangles the geometry pull
   * carries (see `RENDER_ACTORS_ROOM_WORDS`), and the ordinal is one of the
   * `RENDER_ROOM_CONDITION_*` values. Empty for a session with no zoned rooms
   * and for every payload written at layout 3.
   */
  readonly roomAnchorX: Int32Array;
  readonly roomAnchorY: Int32Array;
  readonly roomConditions: Uint32Array;
}

export function renderActorsByteLength(recordCount: number, removedCount: number, roomCount = 0): number {
  return (
    (RENDER_ACTORS_HEADER_WORDS +
      recordCount * RENDER_ACTORS_RECORD_WORDS +
      removedCount +
      roomCount * RENDER_ACTORS_ROOM_WORDS) *
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
  private roomsWritten = 0;

  /**
   * `worldRevision` is required rather than defaulted, and that is the same
   * refusal `RenderGuardSource.locomotion` makes one file over: a default of
   * zero would publish *"the world has never changed"* on every keyframe, the
   * receiver would take the sixth `dirty` mark away without a word, and the
   * defect ADR 0099 exists to close would come back looking like a
   * thirty-second poll working as designed. A caller with nothing to report
   * has to say `0` in its own hand.
   */
  public constructor(
    public readonly recordCount: number,
    worldRevision: number,
    /**
     * How many room-condition rows this keyframe will carry, fixed at
     * construction for the reason `recordCount` is: it is part of the buffer's
     * size. A caller with nothing to say about rooms passes nothing and writes
     * a buffer byte-identical to the one layout 3 wrote plus one zero word.
     */
    public readonly roomCount = 0,
  ) {
    if (!Number.isInteger(recordCount) || recordCount < 0) {
      throw new Error(
        `A render-actors keyframe needs a non-negative integer record count, got ${String(recordCount)}.`,
      );
    }
    if (!Number.isInteger(worldRevision) || worldRevision < 0) {
      throw new Error(
        `A render-actors keyframe needs a non-negative integer world revision, got ${String(worldRevision)}.`,
      );
    }
    if (!Number.isInteger(roomCount) || roomCount < 0) {
      throw new Error(
        `A render-actors keyframe needs a non-negative integer room count, got ${String(roomCount)}.`,
      );
    }
    this.view = new DataView(new ArrayBuffer(renderActorsByteLength(recordCount, 0, roomCount)));
    this.view.setUint32(0, RENDER_ACTORS_LAYOUT_VERSION, true);
    this.view.setUint32(RENDER_ACTORS_WORD_BYTES, RENDER_ACTORS_KEYFRAME_FLAG, true);
    this.view.setUint32(2 * RENDER_ACTORS_WORD_BYTES, recordCount, true);
    // A keyframe is the complete live set, so nothing needs removing: an id
    // absent from the record list is an id the receiver drops.
    this.view.setUint32(3 * RENDER_ACTORS_WORD_BYTES, 0, true);
    // `>>> 0` rather than a range check: the marker is a `u32` that wraps by
    // design (see `RENDER_ACTORS_WORLD_REVISION_WORD`), and `setUint32` would
    // wrap it anyway -- doing it here means the value written is the value
    // this line names.
    this.view.setUint32(RENDER_ACTORS_WORLD_REVISION_WORD * RENDER_ACTORS_WORD_BYTES, worldRevision >>> 0, true);
    this.view.setUint32(RENDER_ACTORS_ROOM_COUNT_WORD * RENDER_ACTORS_WORD_BYTES, roomCount, true);
  }

  /**
   * Writes one room-condition row: the room's anchor tile and its ordinal.
   *
   * Separate from `writeRecord` rather than another argument to it, because
   * the two blocks are different lengths and are written by different walks --
   * one over the live actor population, one over the registered room
   * instances. The ordinal is range-checked here rather than masked: a value
   * this build has no meaning for would be silently drawn as some other
   * room's verdict, and a wrong verdict on the map is the exact failure
   * `AGENTS.md` reservation 4 is about.
   */
  public writeRoom(anchorTileX: number, anchorTileY: number, condition: number): void {
    if (this.roomsWritten >= this.roomCount) {
      throw new Error(`A render-actors keyframe sized for ${String(this.roomCount)} rooms was handed another.`);
    }
    if (!Number.isInteger(anchorTileX) || !Number.isInteger(anchorTileY)) {
      throw new Error(
        `A room-condition row needs integer anchor tile coordinates, got ${String(anchorTileX)},${String(anchorTileY)}.`,
      );
    }
    if (!Number.isInteger(condition) || condition < RENDER_ROOM_CONDITION_GAP || condition > RENDER_ROOM_CONDITION_NO_WAY_IN) {
      throw new Error(`A room-condition row carries an unknown condition ordinal: ${String(condition)}.`);
    }
    const offset =
      (RENDER_ACTORS_HEADER_WORDS +
        this.recordCount * RENDER_ACTORS_RECORD_WORDS +
        this.roomsWritten * RENDER_ACTORS_ROOM_WORDS) *
      RENDER_ACTORS_WORD_BYTES;
    this.view.setInt32(offset, anchorTileX, true);
    this.view.setInt32(offset + RENDER_ACTORS_WORD_BYTES, anchorTileY, true);
    this.view.setUint32(offset + 2 * RENDER_ACTORS_WORD_BYTES, condition, true);
    this.roomsWritten += 1;
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
    // The same refusal, for the same reason: a zeroed room row is
    // `{ anchor 0,0, condition 0 }`, and `RENDER_ROOM_CONDITION_UNKNOWN` at
    // the origin is a well-formed row the receiver would try to join.
    if (this.roomsWritten !== this.roomCount) {
      throw new Error(
        `A render-actors keyframe sized for ${String(this.roomCount)} rooms received ${String(this.roomsWritten)}.`,
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
  const worldRevision = view.getUint32(RENDER_ACTORS_WORLD_REVISION_WORD * RENDER_ACTORS_WORD_BYTES, true);
  const roomCount = view.getUint32(RENDER_ACTORS_ROOM_COUNT_WORD * RENDER_ACTORS_WORD_BYTES, true);

  const expected = renderActorsByteLength(recordCount, removedCount, roomCount);
  if (buffer.byteLength !== expected) {
    throw new Error(
      `A render-actors payload declaring ${String(recordCount)} records, ${String(removedCount)} removals and ${String(roomCount)} rooms must be ${String(expected)} bytes, got ${String(buffer.byteLength)}.`,
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

  const roomAnchorX = new Int32Array(roomCount);
  const roomAnchorY = new Int32Array(roomCount);
  const roomConditions = new Uint32Array(roomCount);
  // After the records and the removals, which is where the writer put them.
  const roomsAt =
    (RENDER_ACTORS_HEADER_WORDS + recordCount * RENDER_ACTORS_RECORD_WORDS + removedCount) *
    RENDER_ACTORS_WORD_BYTES;
  for (let room = 0; room < roomCount; room += 1) {
    const offset = roomsAt + room * RENDER_ACTORS_ROOM_WORDS * RENDER_ACTORS_WORD_BYTES;
    roomAnchorX[room] = view.getInt32(offset, true);
    roomAnchorY[room] = view.getInt32(offset + RENDER_ACTORS_WORD_BYTES, true);
    roomConditions[room] = view.getUint32(offset + 2 * RENDER_ACTORS_WORD_BYTES, true);
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
    worldRevision,
    entityIds,
    packedFields,
    subX,
    subY,
    velocitySubX,
    velocitySubY,
    removed,
    roomAnchorX,
    roomAnchorY,
    roomConditions,
  };
}
