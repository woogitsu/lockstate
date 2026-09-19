import { decodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../../simulation/entity/entity-codec';
import { packEntityId } from '../../simulation/entity/entity-store';
import {
  composeRenderActorId,
  RENDER_ACTOR_POPULATION_GUARD,
  RENDER_ACTOR_POPULATION_PRISONER,
} from '../../simulation/protocol/render-actors-payload';
import type { EncodedSessionSystems } from '../../simulation/runtime/session-systems';
import type { RenderActor } from './render-feed';

/**
 * The renderer's view of the prisoners and guards a session snapshot carries.
 *
 * This is the actor counterpart of `structuresFromConstruction`: a projection
 * of one section of `SessionSnapshotBundle` into immutable view data, reading
 * the bundle's own encoded form and never a live simulation object
 * (`AGENTS.md` boundary 1). It builds plain values, so it is unit-testable
 * with no canvas and no worker.
 *
 * ### Which two sections it needs, and why both
 *
 * `simulation.prisoners.components` is **index-keyed over the entity store's
 * allocated prefix**, not over the live population: nothing clears a component
 * array when an entity is destroyed, so a freed slot inside that prefix still
 * holds its previous occupant's position. `entities` is the liveness ledger
 * that says which of those slots is an actual prisoner, and it is also the only
 * thing that carries the generation counters an `EntityId` is built from. So a
 * bundle missing either section yields no actors rather than a guessed
 * population. A migrated V2 save legitimately has neither;
 * `restoreSimulationRuntime` rejects the one combination that is incoherent
 * (`simulation` without `entities`) outright, and the renderer's answer to a
 * bundle it cannot read actors from is to draw the world without them rather
 * than to draw nothing.
 *
 * ### What the snapshot does not carry
 *
 * A snapshot is a set of positions at one instant. It carries no velocity, no
 * facing and no asset id, and this function invents none of them:
 *
 * - `deltaX`/`deltaY` are `0`, which makes `selectActorPose` choose the idle
 *   clip for every prisoner. That is a statement about the snapshot, not about
 *   the prisoner: a prisoner walking across the yard is still drawn standing,
 *   because nothing in the bundle says which way they are going. Differencing
 *   two snapshots would not fix it either -- they are seconds apart, so the
 *   result would be a renderer-side movement model rather than simulation
 *   state.
 * - `facing` is left unset, so `actor-pose.ts` applies its documented
 *   `DEFAULT_FACING`. An omitted field says "no facing was published"; a
 *   written one would say the simulation chose south.
 * - `assetId` is a renderer-side decision about which authored art draws the
 *   prisoner population. It is the constant below, resolved through the
 *   generated manifest like every other logical asset id (ADR-0014).
 *
 * ### Guards
 *
 * This section used to say guards are "deliberately not decoded here: that is
 * a separate step with its own asset choice, and this one is scoped to
 * prisoners." ADR 0040 named that separate step slice 2 and it is this change:
 * `simulation.security.guards.records` is decoded below, as
 * `GuardRecord.tileX`/`tileY`, into `GUARD_ACTOR_ASSET_ID`. Two things stay
 * true of the sentence it replaced rather than being reopened by it --
 *
 * - **No liveness join.** `GuardRoster.getSnapshot` (`guard-roster.ts`) builds
 *   `records` from `this.records.keys()`, a `Map` nothing currently deletes
 *   from -- there is no guard destroy path in `src/` today, unlike the
 *   prisoner store this function already joins against `entities` for. So
 *   every record here is a live guard and reading `records` directly is
 *   correct now; it stops being correct the day a guard can be destroyed, and
 *   whichever change adds that inherits updating this comment and this
 *   function together, the same pairing prisoners already have.
 * - **No motion.** `deltaX`/`deltaY` are `0` for a guard for the same reason
 *   they are `0` for a prisoner read from a snapshot: this is one instant, and
 *   guards additionally have no continuous position to publish even on the
 *   delta channel -- ADR 0059 gave prisoners a locomotion store between two
 *   tiles and left guards on the "position updates only on arrival"
 *   convention it documents guards still follow. Composing a walk from two
 *   snapshots seconds apart is the renderer-side movement model this module
 *   already refuses to invent.
 *
 * `docs/research/2026-08-28-drawing-guards.md` is the record of the one
 * decision this needed that no ADR had taken: ADR 0059 open question 4 leaves
 * "should a teleporting guard be drawn at all" unanswered on purpose, and that
 * record answers it rather than the answer being invented silently here.
 *
 * ### Cost
 *
 * Called once per applied snapshot -- seconds apart -- and never per frame.
 * It walks the allocated prefix once (one liveness read per slot, the same
 * walk ADR 0005 measured at ~0.6 ms for 5,000 entities) and allocates one
 * object per *live* prisoner, plus one more per guard: `GuardRoster.getSnapshot`
 * (`guard-roster.ts`) says a headcount realistic sessions keep in the tens, not
 * the thousands, so the guard loop below adds an amount this comment's
 * measurements do not need to restate. `decodeEntityStoreSnapshot` additionally
 * rebuilds the store's three capacity-shaped typed arrays -- seven bytes a
 * slot, so ~34 KiB at `DEFAULT_PRISONER_CAPACITY`'s 5,000. That is paid to
 * reuse the one decoder that validates these runs rather than to open-code a
 * second reader of the same encoding, and it is dwarfed by the full bundle
 * capture the worker performs to answer each poll.
 *
 * Nothing here culls. `ActorLayer.update` takes the visible range and does a
 * numeric range test per actor, which is the renderer's single culling rule;
 * a second one here would need a camera this side of the seam does not have.
 */

/** Logical asset id for the prisoner population, resolved through the generated manifest (ADR-0014). Never a filename. */
export const PRISONER_ACTOR_ASSET_ID = 'actor.prisoner.base';

/**
 * Logical asset id for the guard population, resolved through the generated
 * manifest (ADR-0014). Already published: `public/assets/actors/asset-registry.json`
 * lists `actor.guard.base` beside `actor.prisoner.base`, with its own
 * `idle`/`walk` clips and atlas manifest, so this decode needed no new art.
 */
export const GUARD_ACTOR_ASSET_ID = 'actor.guard.base';

export function actorsFromSnapshot(
  simulation: EncodedSessionSystems | undefined,
  entities: EncodedEntityStoreSnapshot | undefined,
): readonly RenderActor[] {
  if (simulation === undefined || entities === undefined) return [];

  const components = simulation.prisoners.components;
  const store = decodeEntityStoreSnapshot(entities);

  // Both bounds come from the same capture of the same store, so they agree:
  // `activeLength` is written as `maxActiveIndex + 1`. Taking the smaller of
  // the two is what keeps a bundle whose sections disagree drawing the prefix
  // they do agree on, instead of reading past the end of an array.
  const lastIndex = Math.min(store.maxActiveIndex, components.activeLength - 1, store.alive.length - 1);

  const actors: RenderActor[] = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    if (store.alive[index] !== 1) continue;
    actors.push({
      // The packed `EntityId`, not the slot index: a recycled slot must not
      // inherit the pooled sprite of the prisoner that used to occupy it.
      // `composeRenderActorId` folds in the population so this can never
      // collide with a guard at the same raw index -- see its own comment.
      id: composeRenderActorId(RENDER_ACTOR_POPULATION_PRISONER, packEntityId(index, store.generations[index]!)),
      assetId: PRISONER_ACTOR_ASSET_ID,
      tileX: components.tileX[index]!,
      tileY: components.tileY[index]!,
      // Defaults, not simulation state -- see the note above.
      deltaX: 0,
      deltaY: 0,
    });
  }

  // Guards: see "### Guards" above for why `records` needs no liveness join
  // today and why there is no motion to publish.
  for (const [entityId, record] of simulation.security.guards.records) {
    actors.push({
      id: composeRenderActorId(RENDER_ACTOR_POPULATION_GUARD, entityId),
      assetId: GUARD_ACTOR_ASSET_ID,
      tileX: record.tileX,
      tileY: record.tileY,
      deltaX: 0,
      deltaY: 0,
    });
  }
  // Prisoners in ascending entity index (the canonical order
  // `EntityQuery.execute` walks, ADR 0005), then guards in `allGuardIds`'
  // ascending entity-id order (`GuardRoster`) -- two deterministic blocks, one
  // after the other, so the array is the same on every client and after a
  // save/restore round trip.
  //
  // **This order is now load-bearing for what a player sees, and the note here
  // used to say it was not.** It read: *"No hash reads it -- `ActorLayer` keys
  // sprites by id, so order decides nothing about identity -- but a projection
  // with an arbitrary order is a needless place for two clients to differ."*
  // Both halves of that were true of the renderer it described. What changed is
  // `src/rendering/actors/crowd-spread.ts` (#944): actors drawn on the same
  // point are separated by rank, and the rank is this array's order, so the
  // order now decides *which point inside a shared tile* each actor stands on
  // and therefore which of them the others overlap. Still no hash reads it, and
  // nothing about identity moved -- but changing this order is now a change to
  // the picture, not only to a projection nobody compares.
  return actors;
}
