import {
  composeRenderActorId,
  RENDER_ACTOR_POPULATION_GUARD,
  RENDER_ACTOR_POPULATION_PRISONER,
  RENDER_ACTORS_SUBTILE_UNITS,
  renderActorHeadingX,
  renderActorHeadingY,
  renderActorIncidentResponse,
  renderActorContrabandSearch,
  renderActorOpenRiot,
  renderActorPopulation,
  type RenderActorsPayload,
} from '../../simulation/protocol/render-actors-payload';
import { DEFAULT_FACING, directionFromMovement } from '../assets/direction';
import { GUARD_ACTOR_ASSET_ID, PRISONER_ACTOR_ASSET_ID } from './actors-from-snapshot';
import type { MutableRenderActor } from './render-feed';

/** Every population ordinal this build has authored art for, and the asset id it draws with. */
const KNOWN_POPULATION_ASSETS: ReadonlyMap<number, string> = new Map([
  [RENDER_ACTOR_POPULATION_PRISONER, PRISONER_ACTOR_ASSET_ID],
  [RENDER_ACTOR_POPULATION_GUARD, GUARD_ACTOR_ASSET_ID],
]);

/**
 * The renderer's view of a `simulation/delta` keyframe.
 *
 * The sibling of `actorsFromSnapshot`, over the other source the same actors
 * can arrive on, and it keeps that module's rule exactly: it reads what was
 * published and invents nothing.
 *
 * > **This module used to say the opposite about motion, and the paragraph is
 * > kept rather than replaced because it was right about the code it
 * > described.** It read: *"`deltaX`/`deltaY` are `0`, so `selectActorPose`
 * > chooses the idle clip. That is a statement about the payload, not about
 * > the prisoner. The simulation updates a position only on arrival at a
 * > resolved route's destination … so there is no velocity for the channel to
 * > carry however often it fires."* Since
 * > [ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
 * > an actor covers the tiles between two rooms and has a position between
 * > them and a heading, so layout 2 carries all three and this function reads
 * > them. **The refusal that paragraph was defending is unchanged**: nothing
 * > here differences two publications, and a field the payload does not carry
 * > is still a field this module leaves alone.
 *
 * - `tileX`/`tileY` are continuous, which is what `RenderActor` has always
 *   declared them to be: the payload's sub-tile integers divided by
 *   `RENDER_ACTORS_SUBTILE_UNITS`. No rounding, because an actor between two
 *   tiles is where the simulation says it is.
 * - `deltaX`/`deltaY` are tiles per wall-clock second, the unit
 *   `RenderActor` declares and the unit the payload already publishes in --
 *   the worker did the conversion, where the clock's speed multiplier is
 *   known.
 * - `facing` is the published heading resolved through
 *   `directionFromMovement`, which is the single place the direction
 *   contract's `+x` east / `+y` south frame is interpreted. An actor that has
 *   never walked publishes heading `0, 0`, and the field is then **left
 *   unset** rather than written as south: an omitted field says "no facing was
 *   published", and `actor-pose.ts` applies its own documented
 *   `DEFAULT_FACING`.
 * - `assetId` is a renderer-side decision about which authored art draws a
 *   population, resolved through the generated manifest (ADR-0014). The payload
 *   carries a population *ordinal*, not an asset id, which is the same
 *   separation `actors-from-snapshot.ts` keeps.
 *
 * ### Why an unknown population is dropped rather than drawn
 *
 * ADR 0040 reserves the packed-fields word's low byte for the population.
 * This paragraph used to say ADR 0040 "puts guards in a later slice", and this
 * function recognised only the prisoner ordinal accordingly. ADR 0040 slice 2
 * is that later slice, and `RENDER_ACTOR_POPULATION_GUARD` is now in
 * `KNOWN_POPULATION_ASSETS` beside the prisoner ordinal. **The refusal this
 * paragraph states is unchanged by adding a second known ordinal** -- it was
 * never "every population but the first is dropped", it was "a population
 * this build has no asset for is dropped", and a third, fourth or later
 * population still falls through `KNOWN_POPULATION_ASSETS` the same way the
 * second used to: a build that has not learned an ordinal has no asset for
 * it, and the alternatives to dropping are both worse: drawing it as a
 * prisoner would put the wrong art on screen with nothing reporting it, and
 * refusing the whole payload would blank a prison over one unknown record.
 */
export function actorsFromDelta(payload: RenderActorsPayload): MutableRenderActor[] {
  const actors: MutableRenderActor[] = [];
  for (let record = 0; record < payload.recordCount; record += 1) {
    const packedFields = payload.packedFields[record]!;
    const population = renderActorPopulation(packedFields);
    const assetId = population === RENDER_ACTOR_POPULATION_PRISONER && renderActorOpenRiot(packedFields)
      ? 'actor.prisoner.riot'
      : population === RENDER_ACTOR_POPULATION_GUARD && renderActorIncidentResponse(packedFields)
      ? 'actor.guard.response'
      : population === RENDER_ACTOR_POPULATION_GUARD && renderActorContrabandSearch(packedFields)
        ? 'actor.guard.search'
        : KNOWN_POPULATION_ASSETS.get(population);
    if (assetId === undefined) continue;
    const headingX = renderActorHeadingX(packedFields);
    const headingY = renderActorHeadingY(packedFields);
    actors.push({
      // `composeRenderActorId` folds the population into the id: the wire's
      // entity id is only unique *within* one population's `EntityStore`, and
      // prisoners and guards are two different stores that both start at
      // index 0 -- see its own comment in `render-actors-payload.ts`.
      id: composeRenderActorId(population, payload.entityIds[record]!),
      assetId,
      tileX: payload.subX[record]! / RENDER_ACTORS_SUBTILE_UNITS,
      tileY: payload.subY[record]! / RENDER_ACTORS_SUBTILE_UNITS,
      deltaX: payload.velocitySubX[record]! / RENDER_ACTORS_SUBTILE_UNITS,
      deltaY: payload.velocitySubY[record]! / RENDER_ACTORS_SUBTILE_UNITS,
      ...(population === RENDER_ACTOR_POPULATION_GUARD && renderActorIncidentResponse(packedFields) ? { incidentResponse: true } : {}),
      ...(population === RENDER_ACTOR_POPULATION_GUARD && !renderActorIncidentResponse(packedFields) && renderActorContrabandSearch(packedFields) ? { contrabandSearch: true } : {}),
      ...(population === RENDER_ACTOR_POPULATION_PRISONER && renderActorOpenRiot(packedFields) ? { openRiot: true } : {}),
      // `exactOptionalPropertyTypes` is on, so "no facing" has to be an absent
      // key rather than an explicit `undefined`.
      ...(headingX === 0 && headingY === 0 ? {} : { facing: directionFromMovement(headingX, headingY, DEFAULT_FACING) }),
    });
  }
  return actors;
}
