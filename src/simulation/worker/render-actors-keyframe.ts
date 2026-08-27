import {
  packRenderActorFields,
  RENDER_ACTOR_POPULATION_PRISONER,
  RenderActorsKeyframeWriter,
} from '../protocol/render-actors-payload';

/**
 * The worker's half of the render delta channel: one keyframe, read off the
 * live simulation.
 *
 * ADR 0040 slice 1. This is the counterpart of
 * `src/rendering/feed/actors-from-snapshot.ts` -- the same population, the same
 * two sources of truth, the same refusal to invent a field -- with one
 * difference that is the entire point: `actorsFromSnapshot` reads a *captured
 * session bundle*, so producing it costs a full `captureSessionSnapshot`, while
 * this reads the live component arrays directly and costs one walk of the
 * allocated prefix.
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
 * ### Two passes, deliberately
 *
 * The buffer's size is a function of the live count, so the count has to be
 * known before the first byte is written. The first pass reads one liveness
 * flag per allocated slot and the second writes one record per live actor;
 * growing a buffer instead would allocate and copy, which is what this format
 * exists to stop.
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
}

/**
 * The complete live prisoner population as one keyframe buffer.
 *
 * Emitted in ascending entity-index order: the canonical order
 * `EntityQuery.execute` walks (ADR 0005), so the same session produces the same
 * bytes on every client and after a save/restore round trip. Nothing downstream
 * depends on the order -- `ActorLayer` keys sprites by id -- but a projection
 * with an arbitrary order is a needless place for two clients to differ.
 */
export function encodeRenderActorsKeyframe(source: RenderActorSource): ArrayBuffer {
  const { entityStore, position } = source;
  // The same agreement `actorsFromSnapshot` takes between its two sections,
  // taken here between the ledger and the component arrays: a component array
  // shorter than the store's high-water mark would otherwise be read past its
  // end.
  const lastIndex = Math.min(entityStore.maxActiveIndex, position.tileX.length - 1, position.tileY.length - 1);

  let liveCount = 0;
  for (let index = 0; index <= lastIndex; index += 1) {
    if (entityStore.isIndexAlive(index)) liveCount += 1;
  }

  const writer = new RenderActorsKeyframeWriter(liveCount);
  const packedFields = packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER);
  for (let index = 0; index <= lastIndex; index += 1) {
    if (!entityStore.isIndexAlive(index)) continue;
    writer.writeRecord(entityStore.getIdByIndex(index), packedFields, position.tileX[index]!, position.tileY[index]!);
  }
  return writer.finish();
}
