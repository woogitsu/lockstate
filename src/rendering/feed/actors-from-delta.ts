import {
  RENDER_ACTOR_POPULATION_PRISONER,
  renderActorPopulation,
  type RenderActorsPayload,
} from '../../simulation/protocol/render-actors-payload';
import { PRISONER_ACTOR_ASSET_ID } from './actors-from-snapshot';
import type { RenderActor } from './render-feed';

/**
 * The renderer's view of a `simulation/delta` keyframe.
 *
 * The sibling of `actorsFromSnapshot`, over the other source the same actors
 * can arrive on, and it keeps that module's rule exactly: it reads what was
 * published and invents nothing.
 *
 * - `deltaX`/`deltaY` are `0`, so `selectActorPose` chooses the idle clip. That
 *   is a statement about the payload, not about the prisoner. The simulation
 *   updates a position only on arrival at a resolved route's destination
 *   (`src/simulation/prisoners/action-system.ts` teleports and says so), so
 *   there is no velocity for the channel to carry however often it fires.
 *   Differencing two publications here would be a renderer-side movement model,
 *   which `AGENTS.md` boundary 1 forbids -- the same refusal
 *   `actors-from-snapshot.ts` makes about two snapshots, and it does not become
 *   permissible at a shorter interval.
 * - `facing` is left unset, so `actor-pose.ts` applies its documented
 *   `DEFAULT_FACING`. An omitted field says "no facing was published".
 * - `assetId` is a renderer-side decision about which authored art draws a
 *   population, resolved through the generated manifest (ADR-0014). The payload
 *   carries a population *ordinal*, not an asset id, which is the same
 *   separation `actors-from-snapshot.ts` keeps.
 *
 * ### Why an unknown population is dropped rather than drawn
 *
 * ADR 0040 reserves the packed-fields word's low byte for the population and
 * puts guards in a later slice. A build that has not learned an ordinal has no
 * asset for it, and the alternatives to dropping are both worse: drawing it as
 * a prisoner would put the wrong art on screen with nothing reporting it, and
 * refusing the whole payload would blank a prison over one unknown record.
 */
export function actorsFromDelta(payload: RenderActorsPayload): readonly RenderActor[] {
  const actors: RenderActor[] = [];
  for (let record = 0; record < payload.recordCount; record += 1) {
    if (renderActorPopulation(payload.packedFields[record]!) !== RENDER_ACTOR_POPULATION_PRISONER) continue;
    actors.push({
      id: payload.entityIds[record]!,
      assetId: PRISONER_ACTOR_ASSET_ID,
      tileX: payload.tileX[record]!,
      tileY: payload.tileY[record]!,
      // Defaults, not simulation state -- see the note above.
      deltaX: 0,
      deltaY: 0,
    });
  }
  return actors;
}
