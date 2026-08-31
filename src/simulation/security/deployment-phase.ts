import type { TilePosition } from '../world/coordinates';
import type { DeploymentPhase } from './guard-roster';

/**
 * The one place "this guard is standing on its post" is decided.
 *
 * Two callers need the same sentence and would otherwise each own a copy:
 * `DeploymentSystem` asks it before requesting a route (a guard already
 * standing on the post tile does not need one, and a guard holding a post it
 * is not standing on is walked back to it), and the projection below asks it
 * to choose the word a roster row shows. A drifted copy would mean the panel
 * saying one thing and the simulation doing another about the same guard.
 */
export function isAtPost(tile: TilePosition, postTile: TilePosition): boolean {
  return tile.x === postTile.x && tile.y === postTile.y;
}

/** The slice of `SecuritySectorRegistry` the rule below reads, and nothing more. */
export interface SectorPostSource {
  getDefinition(sectorId: string): { readonly postTile: TilePosition } | undefined;
}

/**
 * What a roster row *says* a guard is doing: every `DeploymentPhase` the
 * simulation stores, plus one word it never stores.
 *
 * **`'returning'` is derived and is deliberately not a fifth
 * `DeploymentPhase`** (owner's ruling 24 of 2026-08-31, which supplied the
 * word; the state it names was measured and handed over as a question about
 * copy in `docs/research/2026-08-31-what-a-reload-keeps-and-what-it-says.md`
 * §C.1).
 *
 * ## What it is derived from, and why that is honest rather than a trick
 *
 * `'on-post'` is an assertion about a tile: the guard is standing on its
 * sector's `postTile`. `displayedDeploymentPhase` checks exactly that
 * assertion against the two pieces of state the row already carries -- the
 * guard's tile and its sector -- and when the assertion is false it says a
 * different word instead of repeating a false one. It is not a flag smuggled
 * through some unrelated field, and it is not an inference about how the
 * guard came to be there; it is the claim `On Post` makes, tested.
 *
 * The state that makes it true is what `GuardRoster.loadSnapshot` leaves
 * behind: a guard `'travelling'` at save time held a path request naming the
 * previous `NavigationSystem` instance's queue, so the restore drops the
 * request and settles the guard on `'on-post'` -- correctly, because there is
 * nothing left to wait for -- while its tile stays wherever the walk had got
 * to. Nothing else in `src/` produces a guard that is `'on-post'` away from
 * its post: `DeploymentSystem` sets the phase either on a guard already
 * standing there or immediately after moving it there, and `PatrolSystem`
 * sets it on a guard that has just completed a loop at the post or has had a
 * leg fail (which it re-paths from wherever the guard is, on its next
 * scheduled tick).
 *
 * ## What it costs, which is nothing that is persisted
 *
 * `DeploymentPhase` is written into every save (`save-schema.ts`'s
 * `guardRecordSchema`, `.strict()`, `SAVE_SCHEMA_VERSION` 5) and is read by
 * the coverage census, the deployment and patrol systems, the search and
 * incident claimants and the release service. A fifth member would have been
 * a widening of a persisted, closed enum -- allowed without a version bump
 * (ADR 0038 §1, and `docs/PERSISTENCE.md`'s ADR 0061 precedent) but not free:
 * an *older* build reading a save that recorded the new value refuses it as
 * `invalid-shape`. Deriving the word at projection time avoids that cost
 * entirely, and it avoids the larger one -- every `DeploymentPhase` reader
 * having to decide what the new member means to it.
 *
 * The label itself comes from `simulation-message-keys.ts`'s
 * `deployment-phase` group, as an `additionalIds` entry: an id that is
 * projected and is deliberately not in the source declaration, which is the
 * same shape `search-order-state`'s `'queued'` already has.
 */
export type DisplayedDeploymentPhase = DeploymentPhase | 'returning';

/**
 * The phase to show for one guard.
 *
 * Every phase but `'on-post'` passes through untouched -- `'travelling'`
 * already says the guard is walking, and a guard on search duty or with no
 * assignment is making no claim about a post. With no sector, or no sector
 * definition to read a post tile out of, the stored phase is the best thing
 * that can honestly be said, so it is what is said.
 */
export function displayedDeploymentPhase(
  phase: DeploymentPhase,
  sectorId: string | undefined,
  tile: TilePosition,
  sectors: SectorPostSource | undefined,
): DisplayedDeploymentPhase {
  if (phase !== 'on-post' || sectorId === undefined || sectors === undefined) return phase;
  const postTile = sectors.getDefinition(sectorId)?.postTile;
  if (postTile === undefined) return phase;
  return isAtPost(tile, postTile) ? phase : 'returning';
}
