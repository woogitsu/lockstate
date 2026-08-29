import { createWalkReading, type WalkReading } from '../locomotion';
import {
  packRenderActorFields,
  RENDER_ACTOR_POPULATION_GUARD,
  RENDER_ACTOR_POPULATION_PRISONER,
  RENDER_ACTORS_SUBTILE_UNITS,
  RenderActorsKeyframeWriter,
} from '../protocol/render-actors-payload';

/**
 * The worker's half of the render delta channel: one keyframe, read off the
 * live simulation.
 *
 * ADR 0040 slice 1 for prisoners, slice 2 for guards (this file used to write
 * prisoners only, with a comment naming guards as a later slice's job -- this
 * is that slice). This is the counterpart of
 * `src/rendering/feed/actors-from-snapshot.ts` -- the same two populations, the
 * same two sources of truth per population, the same refusal to invent a field
 * -- with one difference that is the entire point: `actorsFromSnapshot` reads a
 * *captured session bundle*, so producing it costs a full
 * `captureSessionSnapshot`, while this reads the live prisoner component arrays
 * and the live `GuardRoster` directly and costs one walk of each.
 *
 * ### Strictly a read
 *
 * It calls nothing on the kernel, steps nothing, and writes nothing but the
 * buffer it returns. That is the property `publishClockState` and
 * `publishStatusCounts` already have and the reason a channel on a wall-clock
 * cadence cannot change what a tick computes -- ADR 0009's replay guarantee is
 * a product promise, and `tests/determinism/render-delta-publication.test.ts`
 * is where this claim is executable rather than commented.
 *
 * ### Which slots are live, and why the ledger is asked
 *
 * `PositionComponent`'s arrays are index-keyed over the entity store's
 * allocated prefix, not over the live population: nothing clears a component
 * array when an entity is destroyed, so a freed slot inside that prefix still
 * holds its previous occupant's tile. `EntityStore.isIndexAlive` is the
 * liveness ledger that says which slot is an actual prisoner, and
 * `getIdByIndex` is the only thing that carries the generation counter an
 * `EntityId` is packed from -- a recycled slot must not inherit the pooled
 * sprite of the prisoner that used to occupy it.
 *
 * `RenderGuardSource` needs no such ledger: `GuardRoster.allGuardIds()` is
 * already exactly the live set (its own `Map`, nothing clears an entry from
 * it today -- see `actors-from-snapshot.ts`'s "No liveness join" paragraph,
 * which states the same fact for the snapshot channel this mirrors).
 *
 * ### Why a guard record always carries zero velocity and zero heading
 *
 * `GuardRecord.tileX`/`tileY` update only on arrival (`patrol-system.ts`);
 * ADR 0059 gave prisoners a `LocomotionStore` between two tiles and left
 * guards on that convention. There is no sub-tile position or velocity to
 * read for a guard, so writing one would be inventing simulation state this
 * layer does not have -- the same refusal `RenderActorSource.locomotion`'s own
 * comment states for prisoners, applied to a population that genuinely has
 * nothing to read.
 *
 * ### Two passes, deliberately
 *
 * The buffer's size is a function of the live count, so the count has to be
 * known before the first byte is written. The first pass reads one liveness
 * flag per allocated slot and the second writes one record per live actor;
 * growing a buffer instead would allocate and copy, which is what this format
 * exists to stop. Guards need only the second pass, because
 * `RenderGuardSource.allGuardIds()` already answers the count.
 */

/** The narrow slice of `PrisonerOperationsRuntime` this reads. Structural, so a test needs no session. */
export interface RenderActorSource {
  readonly entityStore: {
    readonly maxActiveIndex: number;
    isIndexAlive(index: number): boolean;
    getIdByIndex(index: number): number;
  };
  readonly position: {
    readonly tileX: Int32Array;
    readonly tileY: Int32Array;
  };
  /**
   * Where a walking actor is *between* the tiles `position` holds, and how
   * fast ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
   *
   * Read rather than differenced: this is the only reason the payload can
   * carry a velocity at all without the renderer inventing one, which is the
   * refusal `actors-from-snapshot.ts` states and `actors-from-delta.ts`
   * keeps.
   */
  readonly locomotion: {
    read(key: number, tileX: number, tileY: number, out: WalkReading): WalkReading;
  };
}

/**
 * The narrow slice of `GuardRoster` this reads. Structural, so a test needs no
 * session -- the same reason `RenderActorSource` is an interface and not the
 * prisoner runtime type itself.
 *
 * No `entityStore`/liveness member, unlike `RenderActorSource`: `allGuardIds`
 * is already the live set (see the module comment's "Which slots are live"
 * section), and no `locomotion` member, because a guard has none to read.
 */
export interface RenderGuardSource {
  allGuardIds(): readonly number[];
  getTile(entityId: number): { readonly x: number; readonly y: number };
}

/**
 * The complete live prisoner and guard populations as one keyframe buffer.
 *
 * `guards` is optional so a caller with no `GuardRoster` handy -- every
 * existing test that predates ADR 0040 slice 2 -- keeps encoding prisoners
 * alone; omitting it is exactly "this session has no guards", the same
 * meaning an empty roster would produce.
 *
 * Emitted in ascending entity-index order within each population --
 * prisoners in the canonical order `EntityQuery.execute` walks (ADR 0005),
 * then guards in `allGuardIds`'s ascending entity-id order -- so the same
 * session produces the same bytes on every client and after a save/restore
 * round trip. Nothing downstream depends on the order -- `ActorLayer` keys
 * sprites by id -- but a projection with an arbitrary order is a needless
 * place for two clients to differ.
 */
export function encodeRenderActorsKeyframe(
  source: RenderActorSource,
  ticksPerWallSecond: number,
  guards?: RenderGuardSource,
): ArrayBuffer {
  if (!Number.isFinite(ticksPerWallSecond) || ticksPerWallSecond <= 0) {
    throw new RangeError(`A render-actors keyframe needs a positive tick rate to express velocity in, got ${String(ticksPerWallSecond)}.`);
  }
  const { entityStore, position, locomotion } = source;
  // The same agreement `actorsFromSnapshot` takes between its two sections,
  // taken here between the ledger and the component arrays: a component array
  // shorter than the store's high-water mark would otherwise be read past its
  // end.
  const lastIndex = Math.min(entityStore.maxActiveIndex, position.tileX.length - 1, position.tileY.length - 1);

  let liveCount = 0;
  for (let index = 0; index <= lastIndex; index += 1) {
    if (entityStore.isIndexAlive(index)) liveCount += 1;
  }

  const guardIds = guards?.allGuardIds() ?? [];
  const writer = new RenderActorsKeyframeWriter(liveCount + guardIds.length);
  // One reading, refilled per actor: the whole cost argument for this encoder
  // is that it allocates nothing per actor, and `WalkReading` is documented as
  // filled in place for that reason.
  const reading = createWalkReading();
  for (let index = 0; index <= lastIndex; index += 1) {
    if (!entityStore.isIndexAlive(index)) continue;
    locomotion.read(index, position.tileX[index]!, position.tileY[index]!, reading);
    writer.writeRecord(
      entityStore.getIdByIndex(index),
      packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER, reading.headingX, reading.headingY),
      reading.subX,
      reading.subY,
      // Sub-tile units a *tick* become sub-tile units a wall-clock second
      // here, where the clock's speed multiplier is known. Rounded rather than
      // truncated so a slow walk at x1 is not published as standing still;
      // `LOCOMOTION_SUBTILE_UNITS` is a power of two and the speeds are whole
      // numbers, so at the shipped values it is exact anyway.
      Math.round(reading.velocitySubX * ticksPerWallSecond),
      Math.round(reading.velocitySubY * ticksPerWallSecond),
    );
  }

  // Guards: zero velocity and zero heading on every record, because a
  // `GuardRecord` tile updates only on arrival -- see the module comment's
  // "Why a guard record always carries zero velocity and zero heading".
  if (guards !== undefined) {
    for (const guardId of guardIds) {
      const tile = guards.getTile(guardId);
      writer.writeRecord(
        guardId,
        packRenderActorFields(RENDER_ACTOR_POPULATION_GUARD, 0, 0),
        tile.x * RENDER_ACTORS_SUBTILE_UNITS,
        tile.y * RENDER_ACTORS_SUBTILE_UNITS,
        0,
        0,
      );
    }
  }

  return writer.finish();
}
