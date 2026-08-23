import type { EntityId } from '../entity/entity-store';
import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';
import { assertValidActorNamePool, PLACEHOLDER_ACTOR_NAME_POOL, type ActorNamePool } from './name-pool';

/**
 * Actor identity: the name a prisoner or a staff member is known by.
 *
 * ## Category: allocated identity, not a derived value (ADR 0012 / ADR 0015)
 *
 * [ADR 0012](../../../docs/adr/0012-derived-identifier-reproducibility.md)
 * requires every identifier that can influence state, cross a save
 * boundary or appear in challenge evidence to declare itself as either an
 * **allocated identity** (minted once, snapshotted, only ever carried) or a
 * **derived value** (recomputed from the state it describes, never
 * persisted). A name is an allocated identity, and this module says so
 * explicitly because ADR 0012 forbids leaving the category implicit.
 *
 * The tempting alternative was to derive a name from the entity id plus a
 * named RNG stream at read time -- nothing stored, nothing in the save
 * envelope, the same prison always yielding the same names. Three facts
 * about this codebase rule it out:
 *
 * 1. **An `EntityId` names a storage slot, not a person.** `EntityStore`
 *    recycles a destroyed index through `freeIndices` and bumps a 12-bit
 *    generation counter. A derived name would therefore be a function of
 *    *which slot an actor happened to land in and how many times that slot
 *    had been reused*, not of the actor. Any change to allocation policy
 *    -- reserving index ranges, compacting on load, pooling entities for
 *    off-map actors -- silently renames the entire prison.
 * 2. **The generation counter wraps, so ids repeat.** `destroy()` does
 *    `(generation + 1) & 0xFFF`: after 4,096 destroy/spawn cycles at one
 *    index the id is identical to the one the *first* occupant of that
 *    slot had. A derived name would hand the 4,097th occupant the first
 *    occupant's name. An allocated one cannot: the first occupant's entry
 *    was released when they were destroyed.
 * 3. **Ids are not unique across populations.** Prisoners live in
 *    `PrisonerOperationsRuntime`'s `EntityStore` and staff live in
 *    `GuardRoster`'s own, separate one. Both hand out id `0`. A name
 *    derived from the id alone would give a prisoner and a guard the same
 *    name; this registry is therefore keyed by `(kind, entityId)`, and
 *    that key is the part a derived scheme has no way to reconstruct.
 *
 * Deriving would also make player renaming structurally impossible, since
 * the name would be recomputed on every read.
 *
 * ## Determinism (ADR 0004, ADR 0009, `docs/DETERMINISM.md`)
 *
 * Storing a name does not weaken the product guarantee, because the
 * guarantee is that the same seed and command stream produce the same
 * session -- not that a name is recomputable from an id. Minting draws
 * from the dedicated `identity.actor-name` stream, at a defined point in
 * the tick pipeline, in canonical entity order. The same seed plus the
 * same command stream therefore mints the same names in the same order;
 * they are then carried rather than recomputed, exactly as ADR 0012
 * requires of an allocated identity.
 *
 * The stream is its own name for the usual reason: a draw here must not be
 * able to shift `prisoners.classification`'s sequence, or naming a new
 * arrival would change how the arrival after them was classified.
 *
 * ## Localization (ADR 0011)
 *
 * ADR 0011 names three namespaces -- stable id, message key, translated
 * text -- and forbids simulation code from producing the third. A proper
 * name is none of the three. It is player-facing *state*, like a tile
 * coordinate that happens to be a string: never authored into a catalog,
 * never translated, identical in every locale. It carries no `nameKey`,
 * and `src/content/` gains nothing from it.
 *
 * The projections expose `givenName` and `familyName` separately rather
 * than one composed string, so the simulation does not bake in a
 * name-ordering convention that is a presentation choice.
 */

/** Declared order. Snapshots and canonical iteration follow this, never `Map` insertion order. */
export const ACTOR_KINDS = ['prisoner', 'staff'] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface ActorName {
  readonly givenName: string;
  readonly familyName: string;
}

/**
 * The read side, and all a projection is ever given. Narrow on purpose: a
 * projection must not be able to mint, rename or release.
 */
export interface ActorIdentitySource {
  getName(kind: ActorKind, entityId: EntityId): ActorName | undefined;
}

/**
 * The mint side, and all a spawning subsystem is ever given -- narrow so
 * that `IntakeSystem` cannot rename or release, only name a new arrival.
 */
export interface ActorIdentityMinter {
  assign(kind: ActorKind, entityId: EntityId, rng: Xoshiro128StarStar): ActorName;
}

export interface ActorIdentityEntry {
  readonly kind: ActorKind;
  readonly entityId: EntityId;
  readonly givenName: string;
  readonly familyName: string;
}

export const ACTOR_IDENTITY_SNAPSHOT_VERSION = 1 as const;

export interface ActorIdentitySnapshot {
  readonly version: typeof ACTOR_IDENTITY_SNAPSHOT_VERSION;
  /** Which pool minted these names. Diagnostic only -- stored names stay authoritative if the pool is later replaced. */
  readonly poolId: string;
  /** Canonical order: `ACTOR_KINDS` declared order, then ascending entity id. */
  readonly entries: readonly ActorIdentityEntry[];
}

export interface ActorIdentityRegistryOptions {
  readonly pool?: ActorNamePool;
  /**
   * How many times minting re-draws to avoid handing out a full name
   * another *live* actor already has. Bounded rather than exhaustive: a
   * population larger than the pool must still be nameable, and real
   * prisons do contain two people with the same name. Raising this cannot
   * break determinism (the retry condition is a pure function of registry
   * state) but it does change the drawn sequence, so it is a save-visible
   * constant, not a tuning knob.
   */
  readonly uniquenessAttempts?: number;
}

const DEFAULT_UNIQUENESS_ATTEMPTS = 8;

/**
 * Separator for the composite full-name key. A character the pool pattern
 * forbids and `validated()` rejects, so `{'A B', 'C'}` and `{'A', 'B C'}`
 * can never collide on one key.
 */
const FULL_NAME_SEPARATOR = '|';

function fullNameKey(name: ActorName): string {
  return `${name.givenName}${FULL_NAME_SEPARATOR}${name.familyName}`;
}

function assertEntityId(entityId: EntityId): void {
  if (!Number.isInteger(entityId) || entityId < 0) {
    throw new RangeError(`Actor identity needs a non-negative integer entity id, got ${String(entityId)}.`);
  }
}

function actorKindIndex(kind: ActorKind): number {
  const index = ACTOR_KINDS.indexOf(kind);
  if (index < 0) throw new RangeError(`Unknown actor kind: ${String(kind)}.`);
  return index;
}

/**
 * The name RNG stream. Claimed by this module and drawn from by nothing
 * else: `prisoners.classification`, `contraband.detection` and
 * `contraband.intelligence` are the only other streams a session
 * registers, and none of them ever names anybody.
 *
 * A session must register this stream (`deriveXoshiroState(masterSeed,
 * ACTOR_IDENTITY_RNG_STREAM)`) before any actor is minted --
 * `NamedRngStreams.get` throws for an unregistered name rather than
 * inventing an unseeded generator, which is the behaviour we want.
 */
export const ACTOR_IDENTITY_RNG_STREAM = 'identity.actor-name';

/**
 * Names for prisoners and staff, keyed by `(kind, entityId)`.
 *
 * Owned by the session rather than by either population, because it spans
 * both `EntityStore`s and because its snapshot is a session-level concern
 * (see the persistence handoff in this change's PR).
 */
export class ActorIdentityRegistry implements ActorIdentitySource {
  private readonly pool: ActorNamePool;
  private readonly uniquenessAttempts: number;
  private readonly byKind = new Map<ActorKind, Map<EntityId, ActorName>>();
  /** Multiset of the full names currently held, so minting can spot a live collision in O(1). */
  private readonly fullNameCounts = new Map<string, number>();

  public constructor(options: ActorIdentityRegistryOptions = {}) {
    this.pool = options.pool ?? PLACEHOLDER_ACTOR_NAME_POOL;
    assertValidActorNamePool(this.pool);
    const attempts = options.uniquenessAttempts ?? DEFAULT_UNIQUENESS_ATTEMPTS;
    if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('uniquenessAttempts must be a positive integer.');
    this.uniquenessAttempts = attempts;
    for (const kind of ACTOR_KINDS) this.byKind.set(kind, new Map<EntityId, ActorName>());
  }

  public get poolId(): string {
    return this.pool.id;
  }

  public get size(): number {
    let total = 0;
    for (const kind of ACTOR_KINDS) total += this.namesOf(kind).size;
    return total;
  }

  private namesOf(kind: ActorKind): Map<EntityId, ActorName> {
    const names = this.byKind.get(kind);
    if (names === undefined) throw new RangeError(`Unknown actor kind: ${String(kind)}.`);
    return names;
  }

  public getName(kind: ActorKind, entityId: EntityId): ActorName | undefined {
    return this.namesOf(kind).get(entityId);
  }

  public has(kind: ActorKind, entityId: EntityId): boolean {
    return this.namesOf(kind).has(entityId);
  }

  /**
   * Mints a name for an actor that does not have one yet, and returns the
   * existing name -- **without drawing** -- for one that does.
   *
   * The no-draw-when-present half is load-bearing. A second call for the
   * same actor (a re-entrant intake pass, a restore that replays a tick, a
   * defensive caller) must not advance the stream, or the *next* actor's
   * name would depend on how many times the caller asked. That is why this
   * is idempotent rather than throwing on a duplicate.
   */
  public assign(kind: ActorKind, entityId: EntityId, rng: Xoshiro128StarStar): ActorName {
    assertEntityId(entityId);
    const names = this.namesOf(kind);
    const existing = names.get(entityId);
    if (existing !== undefined) return existing;

    const name = this.draw(rng);
    names.set(entityId, name);
    this.retain(name);
    return name;
  }

  /**
   * Overrides an actor's name. No RNG involvement at all, which is the
   * concrete thing storing a name buys that deriving one cannot: the name
   * is state, so a player -- or a future scenario author -- can set it.
   *
   * No command is wired to this yet; it is the API a rename command would
   * call, and it is here so the stored/derived decision is not quietly
   * reversible.
   */
  public rename(kind: ActorKind, entityId: EntityId, name: ActorName): void {
    assertEntityId(entityId);
    const names = this.namesOf(kind);
    const existing = names.get(entityId);
    if (existing === undefined) throw new RangeError(`Cannot rename ${kind} ${entityId}: it has no identity.`);
    const next = this.validated(name);
    names.set(entityId, next);
    this.forget(existing);
    this.retain(next);
  }

  /**
   * Drops an actor's identity. **Required** when the actor is destroyed:
   * `EntityStore` recycles the index, so a retained entry would eventually
   * hand the slot's next occupant the previous occupant's name.
   */
  public release(kind: ActorKind, entityId: EntityId): boolean {
    const names = this.namesOf(kind);
    const existing = names.get(entityId);
    if (existing === undefined) return false;
    names.delete(entityId);
    this.forget(existing);
    return true;
  }

  /**
   * Safety net for `release` not being called: drops every identity of
   * `kind` whose entity is no longer alive, in canonical ascending-id
   * order. Draws nothing, so it can never perturb the stream -- but it
   * mutates, so a projection must not call it.
   */
  public reconcile(kind: ActorKind, isAlive: (entityId: EntityId) => boolean): number {
    const names = this.namesOf(kind);
    const stale = [...names.keys()].sort((left, right) => left - right).filter((entityId) => !isAlive(entityId));
    for (const entityId of stale) this.release(kind, entityId);
    return stale.length;
  }

  /** Canonical order: declared kind order, then ascending entity id. Never `Map` insertion order. */
  public entries(): readonly ActorIdentityEntry[] {
    const entries: ActorIdentityEntry[] = [];
    for (const kind of ACTOR_KINDS) {
      const names = this.namesOf(kind);
      const ids = [...names.keys()].sort((left, right) => left - right);
      for (const entityId of ids) {
        const name = names.get(entityId)!;
        entries.push({ kind, entityId, givenName: name.givenName, familyName: name.familyName });
      }
    }
    return entries;
  }

  public getSnapshot(): ActorIdentitySnapshot {
    return { version: ACTOR_IDENTITY_SNAPSHOT_VERSION, poolId: this.pool.id, entries: this.entries() };
  }

  /**
   * Replaces the whole registry. A `poolId` that disagrees with the
   * configured pool is *not* an error: stored names stay authoritative
   * precisely so that swapping the pool cannot rename an existing
   * population.
   */
  public loadSnapshot(snapshot: ActorIdentitySnapshot): void {
    if (snapshot.version !== ACTOR_IDENTITY_SNAPSHOT_VERSION) {
      throw new RangeError(`Unsupported actor identity snapshot version ${String(snapshot.version)}.`);
    }
    for (const kind of ACTOR_KINDS) this.namesOf(kind).clear();
    this.fullNameCounts.clear();

    // Sorted rather than trusted: a snapshot that arrived out of order must
    // restore to the same registry a canonical one does, or two restores of
    // equivalent saves would disagree on nothing but order.
    const entries = [...snapshot.entries].sort(
      (left, right) => actorKindIndex(left.kind) - actorKindIndex(right.kind) || left.entityId - right.entityId,
    );
    for (const entry of entries) {
      assertEntityId(entry.entityId);
      const names = this.namesOf(entry.kind);
      if (names.has(entry.entityId)) throw new RangeError(`Actor identity snapshot repeats ${entry.kind} ${entry.entityId}.`);
      const name = this.validated({ givenName: entry.givenName, familyName: entry.familyName });
      names.set(entry.entityId, name);
      this.retain(name);
    }
  }

  private validated(name: ActorName): ActorName {
    if (name.givenName.length === 0 || name.familyName.length === 0) throw new RangeError('An actor name needs a given name and a family name.');
    if (name.givenName.includes(FULL_NAME_SEPARATOR) || name.familyName.includes(FULL_NAME_SEPARATOR)) {
      throw new RangeError(`An actor name may not contain ${FULL_NAME_SEPARATOR}.`);
    }
    return { givenName: name.givenName, familyName: name.familyName };
  }

  private retain(name: ActorName): void {
    const key = fullNameKey(name);
    this.fullNameCounts.set(key, (this.fullNameCounts.get(key) ?? 0) + 1);
  }

  private forget(name: ActorName): void {
    const key = fullNameKey(name);
    const count = this.fullNameCounts.get(key) ?? 0;
    if (count <= 1) this.fullNameCounts.delete(key);
    else this.fullNameCounts.set(key, count - 1);
  }

  /**
   * Two draws per attempt, retried while the pair is already held by a
   * live actor. The retry condition reads only registry state, so the
   * number of draws is a function of simulation state -- reproducible on
   * every client -- and never of wall-clock, iteration or call order.
   */
  private draw(rng: Xoshiro128StarStar): ActorName {
    let candidate: ActorName = this.drawOnce(rng);
    for (let attempt = 1; attempt < this.uniquenessAttempts; attempt += 1) {
      if (!this.fullNameCounts.has(fullNameKey(candidate))) return candidate;
      candidate = this.drawOnce(rng);
    }
    return candidate;
  }

  private drawOnce(rng: Xoshiro128StarStar): ActorName {
    const givenName = this.pool.givenNames[rng.nextInt(this.pool.givenNames.length)]!;
    const familyName = this.pool.familyNames[rng.nextInt(this.pool.familyNames.length)]!;
    return { givenName, familyName };
  }
}
