import { chunkCoordinate, compareChunkPositions, tileCoordinate, type ChunkPosition, type TilePosition } from '../world/coordinates';
import { constantDeploymentSchedule, type DeploymentSchedule } from './deployment-schedule';
import type { SecuritySectorDefinition, SecuritySectorRegistry } from './sector';

/**
 * The one security sector every session has, derived from the world rather
 * than authored ([ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md),
 * answering [ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)
 * decision 9 and issue #396).
 *
 * ## What was missing, measured
 *
 * `SecuritySectorRegistry.register` had exactly one caller in `src/`:
 * `restoreSessionSystems`, reading `security.sectorDefinitions` out of a save
 * payload. `createNewSimulationRuntime` registered nothing. So a session a
 * player can start held **zero** sectors, and a sector is what the whole
 * security tier hangs off:
 *
 * - `DeploymentSystem.assignUnassignedGuards` iterates `sectors.all()`, so no
 *   hired guard was ever posted anywhere.
 * - `PatrolSystem` walks a sector's `patrolRoute`.
 * - `IncidentTriggerSystem` iterates `incidentSectorIds`.
 * - `IncidentResponseSystem` reads `requireDefinition(incident.sectorId).postTile`
 *   for a responder's destination and sets lockdown by sector id.
 *
 * ## Three empty registries, not one
 *
 * Issue #396 names the sector, and the sector alone is not enough — which is
 * worth stating here because it is the part that is easy to get wrong and call
 * done. `DeploymentSystem.requiredGuardCountFor` answers `0` for a sector with
 * no `DeploymentSchedule`, and `IncidentTriggerSystem` samples only the sector
 * ids it was handed. A sector registered into an empty schedule list and an
 * empty watch list leaves deployment and incidents exactly as inert as they
 * were. So `applyDefaultSecuritySector` fills all three, and it is one function
 * rather than three call sites for that reason.
 *
 * ## Derived, and therefore re-derived rather than restored
 *
 * Everything here is a pure function of the world's chunk size and its owned
 * chunks, so a restored session derives what a live one derived and the two
 * cannot disagree. That is what lets this ship with **no save-schema bump**:
 * `SAVE_SCHEMA_VERSION` stays 5, no persisted field is added, and the payload's
 * own copy of the default sector (which a V5 capture writes, because
 * `captureSessionSystems` reads the whole registry) is redundant rather than
 * authoritative. It is the same reading `restore-session.ts` already takes of
 * room geometry and navigation caches: state that is genuinely derived is
 * recomputed on load, not carried.
 *
 * The useful consequence is that a save written **before** this existed gains
 * the sector on load, with no migration: its `sectorDefinitions`, `schedules`
 * and `watchedSectorIds` are all empty, and `applyDefaultSecuritySector` runs
 * after the payload is applied.
 */

/**
 * The default sector's id, and it is a constant rather than a derivation.
 *
 * A sector id is written into incident records, guard records, gang territory
 * claims, risk-tracker state and the save payload, so an id that moved with the
 * world would strand every one of them — the hazard #337 records for un-zoning.
 * Only the *post tile* is derived; the identity is fixed for the life of a
 * prison.
 *
 * `security-sector.` prefixed, in the shape `docs/CONTENT.md` uses for
 * catalogue ids, so it cannot collide with a scenario's `'sector-a'` or a
 * future player-drawn sector's id.
 */
export const DEFAULT_SECURITY_SECTOR_ID = 'security-sector.prison';

/**
 * `grade.general`: clearance 0, no required permission.
 *
 * The only defensible grade for a sector that covers the whole prison. A
 * classified grade would gate doors against the staff roles that have to reach
 * every part of a prison, and it would be a classification policy nobody
 * authored — the grade is the sector's policy (issue #26), and this sector has
 * no policy because nobody drew it.
 */
export const DEFAULT_SECURITY_SECTOR_GRADE_ID = 'grade.general';

/**
 * One guard, all day -- and since
 * [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md) decision 3
 * this is a **floor** rather than the whole requirement.
 *
 * A **directional default, not a balance decision**, in the same sense as
 * `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_NAVIGATION_SYSTEM_OPTIONS`; the
 * reasoning is stated so a later balance pass has something to disagree with.
 *
 * Zero is the value that requires no argument and is also the value that leaves
 * `DeploymentSystem` inert, so it is not available. One is chosen over any
 * larger number because of what the second guard is for:
 * `IncidentResponseSystem.claimableResponders` draws from
 * `GuardRoster.unassignedGuardIds()`, and a guard `DeploymentSystem` has posted
 * is `'on-post'` rather than `'unassigned'`. So the deployment requirement and
 * the responder pool come out of the same finite roster, and a requirement of
 * `n` means the first `n` guards a player hires can never respond to anything.
 * At one, the first hire is visibly posted and every hire after it is available
 * to an incident.
 *
 * **What ADR 0048 changed, and why that reasoning survives it.** A requirement
 * that never moves makes `staffingShortfall` -- `shortage / required` -- zero
 * for ever after the first hire, whatever the population, which is issue #442's
 * headline. `resolveOccupancyScaledGuardCount` in `sector-staffing.ts` therefore
 * raises this number by one per
 * `DEFAULT_SECTOR_PRISONERS_PER_GUARD` occupants. The paragraph above still
 * decides the *floor*, and its trade-off is now explicit rather than avoided: a
 * prison of `n` prisoners needs `ceil(n / 8)` guards posted **plus** a reserve
 * for `IncidentResponseSystem` to claim, and a player who hires exactly the
 * requirement will watch every incident lapse. That is the bound ADR 0036
 * decision 3 records, made visible by a requirement that grows.
 */
export const DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1;

/**
 * The world state the derivation reads, and nothing more.
 *
 * A structural type rather than `SparseWorld` itself: the derivation needs a
 * chunk size and an ordered list of owned chunks, and naming only those keeps
 * `src/simulation/security/**` from importing the world implementation for two
 * fields. `SparseWorld` satisfies it without being mentioned.
 */
export interface DefaultSecuritySectorWorld {
  readonly tileChunkSize: number;
  /** Any order: `postChunk` sorts, so determinism is this module's property rather than the implementer's. */
  ownedChunkPositions(): readonly ChunkPosition[];
}

/** The chunk the default sector's post tile sits in: the first chunk the world owns in canonical `(y, x)` order, or the origin chunk when it owns none. */
function postChunk(world: DefaultSecuritySectorWorld): ChunkPosition {
  /*
   * Sorted here even though `SparseWorld.ownedChunkPositions` already sorts.
   *
   * Not defensiveness for its own sake: `DefaultSecuritySectorWorld` is a
   * structural type, so anything with those two members satisfies it, and the
   * one thing this function must never do is answer differently for the same
   * set of chunks. Leaving the order to the caller would make determinism a
   * property of every present and future implementer rather than of this
   * function -- and the cost is a sort of a list that is one entry long in every
   * session a player can start.
   */
  const owned = [...world.ownedChunkPositions()].sort(compareChunkPositions);
  /*
   * The fallback is what makes the rule total, and a total rule is the point:
   * "no sector" is where issue #396 starts, so a world the derivation cannot
   * read must still produce one. A session a player starts owns chunk (0,0),
   * and nothing in `src/` un-owns a chunk, so this branch is reachable only
   * from a hand-written or hand-edited save — for which the origin chunk is
   * both the least surprising answer and the one every other world default in
   * this repository already uses.
   */
  return owned[0] ?? { x: chunkCoordinate(0), y: chunkCoordinate(0) };
}

/**
 * Where a guard posted to the default sector stands.
 *
 * **The middle of the first owned chunk**, which for a new session is tile
 * (16, 16) of a 32-tile world — and that coincidence with
 * `NEW_PRISON_ORIGIN_TILE` in `src/main.ts` is load-bearing in three separate
 * ways rather than incidental. Both are "the middle of owned land", so:
 *
 * 1. A guard hired through `HireStaff` is already standing on the post, so the
 *    first hire is posted without a route request that could fail.
 * 2. An admitted prisoner arrives there, and an arrival with nowhere to be
 *    housed *stays* there -- so the post tile is where a homeless population
 *    accumulates, which is what a responder walks to and what a player looking
 *    at the map sees.
 *
 *    **This used to say something stronger, and it is no longer true.** It read
 *    that an unhoused arrival "*is* a sector occupant ... so `resolveSectorOccupants`
 *    in `new-session.ts`, which counts prisoners standing exactly on the post
 *    tile, actually finds somebody", and called that placeholder "the reason a
 *    riot is reachable in a new session at all". It was: a housed prisoner was
 *    never an occupant of the only sector there is, so the trigger's needs term
 *    measured homelessness and nothing else.
 *    [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md) replaced
 *    that rule -- the derived sector is the prison, and its occupants are every
 *    prisoner standing on owned land -- so occupancy no longer depends on this
 *    coincidence. The other two reasons below are untouched by that change.
 * 3. It is on owned, walkable ground in a session a player can start, so a
 *    responder can route to it.
 *
 * **Derived from ownership rather than from zoned rooms**, deliberately. Rooms
 * are optional — a new prison has none, and "no sector until you zone
 * something" puts the tier back where #396 found it — while owned land is not.
 * One rule with no fallback beats two rules with a re-derivation trigger, and
 * it is what makes the answer stable: see ADR 0036 decision 4 for why the
 * derivation deliberately never re-runs.
 *
 * `Math.floor` of an odd chunk size rounds toward the origin; the value is
 * exact for every size ADR 0004 examined, all of which are even.
 */
export function deriveDefaultSecuritySectorPostTile(world: DefaultSecuritySectorWorld): TilePosition {
  const chunk = postChunk(world);
  const middle = Math.floor(world.tileChunkSize / 2);
  return {
    x: tileCoordinate(chunk.x * world.tileChunkSize + middle),
    y: tileCoordinate(chunk.y * world.tileChunkSize + middle),
  };
}

/**
 * The default sector, whole.
 *
 * **No doors, and that is a decision rather than an omission.** A sector's
 * `doorIds` are its perimeter, and a perimeter is the one thing a derivation
 * cannot know: a new session has no doors at all, `SecuritySectorRegistry`
 * captures each governed door's baseline state at `register` time and has no
 * way to adopt a door built later, and governing *every* door would make a
 * severity-8 riot lock the player's cell doors and whatever else they had
 * built, in a prison with no perimeter for a lockdown to mean anything about.
 * So `setControlState` still moves this sector's control state and cascades
 * onto nothing — a lockdown is recorded and has no physical consequence. That
 * is the honest cost of a sector nobody drew, and it is the strongest argument
 * for the player-facing sector gesture ADR 0036 declines to build.
 *
 * **No patrol route**, for the same reason and with the same consequence:
 * `sector.ts` states that a sector may have static coverage with no route at
 * all, a route is an authored loop of waypoints, and a derived loop would be a
 * made-up path across whatever the player happens to have built. `PatrolSystem`
 * therefore stays inert.
 */
export function deriveDefaultSecuritySector(world: DefaultSecuritySectorWorld): SecuritySectorDefinition {
  return {
    id: DEFAULT_SECURITY_SECTOR_ID,
    gradeId: DEFAULT_SECURITY_SECTOR_GRADE_ID,
    doorIds: [],
    postTile: deriveDefaultSecuritySectorPostTile(world),
  };
}

/** The default sector's deployment requirement, as its own schedule. Constant across the day, so `assertGaplessDeploymentSchedule` holds by construction. */
export function deriveDefaultSecuritySectorSchedule(): DeploymentSchedule {
  return constantDeploymentSchedule(DEFAULT_SECURITY_SECTOR_ID, DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT);
}

/** The three collections the default sector has to reach, named so a caller cannot fill two of them and think it is done. */
export interface DefaultSecuritySectorTargets {
  readonly world: DefaultSecuritySectorWorld;
  readonly sectors: SecuritySectorRegistry;
  /** `runtime.securitySchedules` — read live by `DeploymentSystem`, so pushing into it after construction is how a requirement arrives. */
  readonly schedules: DeploymentSchedule[];
  /** `runtime.incidentSectorIds` — read live by `IncidentTriggerSystem`, same convention. */
  readonly watchedSectorIds: string[];
}

/**
 * Registers the default sector, its deployment requirement and its place on the
 * incident watch list — **idempotently**, and the idempotence is the contract
 * rather than a convenience.
 *
 * It is called twice on a restored session: once by
 * `createNewSimulationRuntime`, which `restoreSimulationRuntime` builds the
 * session with, and once at the end of `restoreSessionSystems`, after the
 * payload has been applied. The second call is what puts the sector back on a
 * save whose payload predates it (an old V5 save carries three empty lists, and
 * the restore clears and refills `securitySchedules` and `incidentSectorIds`
 * from them). Neither call may duplicate what the other did:
 * `SecuritySectorRegistry.register` throws on a duplicate id — correctly, since
 * it is guarding a corrupt save — and two identical schedules or two identical
 * watch entries would double a sector's demand and sample it twice.
 *
 * **Anything already present wins**, which is what makes this safe to call
 * after a payload rather than only before one: a save that carries a sector
 * under this id, a schedule for it, or a watch entry for it keeps its own,
 * whatever this derivation would have produced. The derivation is authoritative
 * only where the payload is silent.
 *
 * Deterministic and draws nothing: no RNG stream, no clock, no `Set`/`Map`
 * iteration order.
 */
export function applyDefaultSecuritySector(targets: DefaultSecuritySectorTargets): SecuritySectorDefinition {
  const definition = deriveDefaultSecuritySector(targets.world);

  const existing = targets.sectors.getDefinition(definition.id);
  if (existing === undefined) targets.sectors.register(definition);

  if (!targets.schedules.some((schedule) => schedule.sectorId === definition.id)) {
    targets.schedules.push(deriveDefaultSecuritySectorSchedule());
  }

  if (!targets.watchedSectorIds.includes(definition.id)) targets.watchedSectorIds.push(definition.id);

  return existing ?? definition;
}
