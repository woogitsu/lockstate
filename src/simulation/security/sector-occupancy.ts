import type { EntityId } from '../entity/entity-store';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import { DEFAULT_SECURITY_SECTOR_ID } from './default-sector';
import type { SecuritySectorDefinition } from './sector';

/**
 * **What a sector's occupants are**
 * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md),
 * answering [ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * open question 1).
 *
 * ## The question, and why it had to be answered here
 *
 * `IncidentTriggerSystem` takes a `SectorOccupantResolver` and uses its answer
 * for two things: the mean unmet-need pressure that decides whether a sector is
 * hot, and the participant list of the riot that opens. Until this module the
 * session's resolver counted **prisoners standing exactly on the sector's post
 * tile** — one tile out of the 1,024 a new prison owns. `ActionSystem` moves an
 * arriving prisoner onto their target room's anchor tile, so a housed prisoner
 * is never on the post tile and `needsPressure` was zero in any prison that
 * housed anybody. The only occupants a real session ever had were arrivals with
 * nowhere to sleep, who stay on the arrival tile — which happens to be the
 * derived post tile, and which is the whole reason a riot was reachable at all
 * (`docs/INCIDENTS.md`, "What that makes reachable, and the bound on it").
 *
 * ## The rule
 *
 * **The derived default sector is the prison, so its occupants are every living
 * prisoner standing on land the prison owns.** Any other sector keeps the
 * post-tile rule it has today.
 *
 * The asymmetry is the honest one rather than a shortcut, and ADR 0048 argues
 * it at length. `SecuritySectorDefinition` records no extent: a sector has a
 * grade, a set of governed doors, a post tile and optionally a patrol route,
 * and none of those is an area. The derived default sector is the one sector
 * whose area *is* known without being drawn — [ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md)
 * derives it from owned land, gives it `grade.general` on the stated grounds
 * that it "covers the whole prison", and calls it `security-sector.prison`. A
 * sector somebody else registered has an area only they know, so inventing one
 * for it would be this module deciding a containment rule for sectors that do
 * not exist yet — the mistake `src/simulation/worker/projection-catalog.ts`
 * names in its own words about room-to-sector mapping ("inventing a spatial
 * containment rule *here*, in the wiring, would be the worst place in the
 * repository to decide it").
 *
 * ## Ownership, not chunk membership
 *
 * `world.isTileOwned` is the one definition of "is this tile part of the
 * prison" (`src/simulation/world/tile-ownership.ts`, ADR 0019), shared with the
 * renderer so the two cannot drift. Asking the chunk grid directly would be a
 * second definition of ownership *and* would tie a game rule to a storage
 * parameter: `AGENTS.md` boundary 8 makes chunking a storage representation and
 * ADR 0004 chose 32 by benchmark, so a sector whose extent was "one chunk"
 * would change meaning if that benchmark were ever re-run.
 *
 * ## Cost
 *
 * One pass over the live prisoner indices, with one ownership test each — the
 * same `O(population)` walk the post-tile rule already did, with a more
 * expensive predicate. Measured on this tree, per pass:
 *
 * | prisoners | `resolveSectorOccupants` | `countSectorOccupants` | post-tile rule |
 * | --- | --- | --- | --- |
 * | 200 | 42 µs | 24 µs | 6 µs |
 * | 1,000 | 111 µs | 83 µs | 8 µs |
 * | 5,000 (`DEFAULT_PRISONER_CAPACITY`) | 535 µs | 385 µs | 35 µs |
 *
 * The list is walked once per sampling point (every 50 ticks) and the count
 * once per deployment update (every 10). At 200 prisoners that is about
 * 3 µs a tick amortised; at the 5,000 ceiling, about 57 µs a tick, or a tenth
 * of a percent of the 50 ms tick. It is not a per-tick full-map scan and it
 * builds no spatial index; `AGENTS.md` boundary 9's budgeted-work rule is about
 * pathfinding, and the analogy it invites is answered by the cadence rather
 * than by an index. What would change that is a second sector: the walk is per
 * sector, so the honest bound is `O(sectors x population)` and a prison with
 * tens of drawn sectors wants membership resolved once per sampling point
 * rather than once per sector.
 *
 * ## Determinism
 *
 * Ascending entity id, from a walk in index order followed by an explicit
 * sort — the ordering discipline ADR 0042 requires this rule to preserve
 * ("a richer occupancy model replaces the *contents* of that list, never its
 * ordering discipline"). No RNG, no `Map`/`Set` iteration, no clock.
 */

/** The world state the rule reads, and nothing more — structural so a unit test needs no `SparseWorld`. */
export interface SectorOccupancyWorld {
  isTileOwned(tile: TilePosition): boolean;
}

/**
 * The prisoner population the rule walks. Structural, and deliberately the
 * *component* shape rather than `PrisonerOperationsRuntime`: this module needs
 * a liveness ledger and two coordinate planes, and naming only those keeps
 * `src/simulation/security/**` from importing the prisoner runtime.
 */
export interface SectorOccupancyPopulation {
  readonly entityStore: {
    readonly maxActiveIndex: number;
    isIndexAlive(index: number): boolean;
    getIdByIndex(index: number): EntityId;
  };
  readonly position: {
    readonly tileX: { readonly [index: number]: number | undefined };
    readonly tileY: { readonly [index: number]: number | undefined };
  };
}

/**
 * Whether `sector` covers the tile at `(tileX, tileY)`.
 *
 * Exported on its own because it is the rule, and a caller that wants to ask
 * about one prisoner should not have to build a list of all of them.
 */
export function sectorCoversTile(
  sector: SecuritySectorDefinition,
  world: SectorOccupancyWorld,
  tileX: number,
  tileY: number,
): boolean {
  if (sector.id !== DEFAULT_SECURITY_SECTOR_ID) {
    return tileX === sector.postTile.x && tileY === sector.postTile.y;
  }
  // Through `tileCoordinate` rather than a cast: the branded coordinate is the
  // repository's one statement that a tile index is a safe integer, and the
  // cost of re-establishing it is inside the figure measured above.
  return world.isTileOwned({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) });
}

/** Every living prisoner `sector` covers, ascending by entity id. */
export function resolveSectorOccupants(
  sector: SecuritySectorDefinition,
  world: SectorOccupancyWorld,
  prisoners: SectorOccupancyPopulation,
): readonly EntityId[] {
  const occupants: EntityId[] = [];
  for (let index = 0; index <= prisoners.entityStore.maxActiveIndex; index += 1) {
    if (!prisoners.entityStore.isIndexAlive(index)) continue;
    const tileX = prisoners.position.tileX[index];
    const tileY = prisoners.position.tileY[index];
    if (tileX === undefined || tileY === undefined) continue;
    if (sectorCoversTile(sector, world, tileX, tileY)) occupants.push(prisoners.entityStore.getIdByIndex(index));
  }
  return occupants.sort((left, right) => left - right);
}

/**
 * How many living prisoners `sector` covers.
 *
 * The same walk without the array, for `DeploymentSystem`'s per-capita
 * requirement: it asks once per sector on every deployment update (a 10-tick
 * cadence) and on every coverage report, and it wants a number rather than a
 * list of up to `DEFAULT_PRISONER_CAPACITY` entity ids. Deliberately a second
 * function over the same predicate rather than `resolveSectorOccupants(...).length`,
 * so the allocation is absent rather than merely discarded.
 */
export function countSectorOccupants(
  sector: SecuritySectorDefinition,
  world: SectorOccupancyWorld,
  prisoners: SectorOccupancyPopulation,
): number {
  let count = 0;
  for (let index = 0; index <= prisoners.entityStore.maxActiveIndex; index += 1) {
    if (!prisoners.entityStore.isIndexAlive(index)) continue;

    const tileX = prisoners.position.tileX[index];
    const tileY = prisoners.position.tileY[index];
    if (tileX === undefined || tileY === undefined) continue;
    if (sectorCoversTile(sector, world, tileX, tileY)) count += 1;
  }
  return count;
}
