import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import {
  ACTOR_IDENTITY_RNG_STREAM,
  ActorIdentityRegistry,
  assertValidActorNamePool,
  PLACEHOLDER_ACTOR_NAME_POOL,
  type ActorNamePool,
} from '../../src/simulation/identity';
import { Kernel } from '../../src/simulation/kernel/kernel';
import {
  projectPrisonerDetail,
  projectPrisonerRoster,
  projectStaff,
} from '../../src/simulation/presentation';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const CLASSIFICATION_RNG_STREAM = 'prisoners.classification';

function streamsFor(seed: number): NamedRngStreams {
  return new NamedRngStreams([
    { name: CLASSIFICATION_RNG_STREAM, state: deriveXoshiroState(seed, CLASSIFICATION_RNG_STREAM) },
    { name: ACTOR_IDENTITY_RNG_STREAM, state: deriveXoshiroState(seed, ACTOR_IDENTITY_RNG_STREAM) },
  ]);
}

function loneStream(seed: number): Xoshiro128StarStar {
  return new Xoshiro128StarStar(deriveXoshiroState(seed, ACTOR_IDENTITY_RNG_STREAM).words);
}

// ---------------------------------------------------------------------------
// The decision itself: a name is an allocated identity, not a value derived
// from an entity id (ADR 0012 / ADR 0015).
// ---------------------------------------------------------------------------

describe('why a name cannot be derived from an entity id', () => {
  it('pins that EntityStore hands the same id back after 4,096 destroy/spawn cycles at one index', () => {
    // `destroy()` bumps a 12-bit generation, so index 0's id cycles. A name
    // computed as f(entityId) would therefore hand the 4,097th occupant of a
    // slot the *first* occupant's name. This is the fact the stored decision
    // rests on, so it is pinned rather than left in a comment.
    const store = new EntityStore(4);
    const first = store.spawn();

    let latest = first;
    for (let cycle = 0; cycle < 4_096; cycle += 1) {
      store.destroy(latest);
      latest = store.spawn();
      expect(store.getIndex(latest)).toBe(0); // the freed index is recycled immediately
      if (cycle < 4_095) expect(latest).not.toBe(first);
    }

    expect(latest).toBe(first);
  });

  it('keeps a prisoner and a staff member with the same numeric id apart', () => {
    // Prisoners live in `PrisonerOperationsRuntime`'s EntityStore and staff in
    // `GuardRoster`'s own, separate one; both hand out id 0. A name derived
    // from the id alone could not tell them apart.
    const registry = new ActorIdentityRegistry();
    const rng = loneStream(7);

    const prisoner = registry.assign('prisoner', 0, rng);
    const staff = registry.assign('staff', 0, rng);

    expect(registry.getName('prisoner', 0)).toEqual(prisoner);
    expect(registry.getName('staff', 0)).toEqual(staff);
    expect(registry.size).toBe(2);
  });

  it('lets a name be replaced, which a recomputed one could not be', () => {
    const registry = new ActorIdentityRegistry();
    const minted = registry.assign('prisoner', 3, loneStream(11));

    registry.rename('prisoner', 3, { givenName: 'Renamed', familyName: 'ByPlayer' });

    expect(registry.getName('prisoner', 3)).toEqual({ givenName: 'Renamed', familyName: 'ByPlayer' });
    expect(registry.getName('prisoner', 3)).not.toEqual(minted);
    // And it survives a save round-trip, because it is state rather than a draw.
    const restored = new ActorIdentityRegistry();
    restored.loadSnapshot(registry.getSnapshot());
    expect(restored.getName('prisoner', 3)).toEqual({ givenName: 'Renamed', familyName: 'ByPlayer' });
  });

  it('refuses to rename an actor that has no identity', () => {
    const registry = new ActorIdentityRegistry();
    expect(() => registry.rename('prisoner', 1, { givenName: 'A', familyName: 'B' })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Registry mechanics that the determinism guarantee rests on.
// ---------------------------------------------------------------------------

describe('ActorIdentityRegistry minting', () => {
  it('does not draw again for an actor that already has a name', () => {
    // A repeated `assign` must leave the stream exactly where it was, or the
    // *next* actor's name would depend on how many times a caller asked.
    const askedOnce = new ActorIdentityRegistry();
    const rngOnce = loneStream(3);
    askedOnce.assign('prisoner', 0, rngOnce);
    const nextAfterOne = askedOnce.assign('prisoner', 1, rngOnce);

    const askedThrice = new ActorIdentityRegistry();
    const rngThrice = loneStream(3);
    const first = askedThrice.assign('prisoner', 0, rngThrice);
    expect(askedThrice.assign('prisoner', 0, rngThrice)).toEqual(first);
    expect(askedThrice.assign('prisoner', 0, rngThrice)).toEqual(first);
    const nextAfterThree = askedThrice.assign('prisoner', 1, rngThrice);

    expect(nextAfterThree).toEqual(nextAfterOne);
  });

  it('avoids handing a live actor a full name another live actor already has', () => {
    // A two-name pool: without the uniqueness retry the second draw collides
    // with the first roughly half the time, so this holds for every seed only
    // if the retry is really there.
    const pool: ActorNamePool = { id: 'test.pair', givenNames: ['Only'], familyNames: ['Alpha', 'Beta'] };

    for (let seed = 0; seed < 24; seed += 1) {
      const registry = new ActorIdentityRegistry({ pool });
      const rng = loneStream(seed);
      const first = registry.assign('prisoner', 0, rng);
      const second = registry.assign('prisoner', 1, rng);
      expect(second.familyName).not.toBe(first.familyName);
    }
  });

  it('still names an actor once the pool is exhausted rather than looping or throwing', () => {
    const pool: ActorNamePool = { id: 'test.pair', givenNames: ['Only'], familyNames: ['Alpha', 'Beta'] };
    const registry = new ActorIdentityRegistry({ pool });
    const rng = loneStream(5);

    for (let entityId = 0; entityId < 6; entityId += 1) registry.assign('prisoner', entityId, rng);

    expect(registry.size).toBe(6);
    expect(new Set(registry.entries().map((entry) => entry.familyName))).toEqual(new Set(['Alpha', 'Beta']));
  });

  it('frees a released name so the next actor can be given it again', () => {
    const pool: ActorNamePool = { id: 'test.single', givenNames: ['Only'], familyNames: ['Alpha'] };
    const registry = new ActorIdentityRegistry({ pool });
    const rng = loneStream(9);

    registry.assign('prisoner', 0, rng);
    expect(registry.release('prisoner', 0)).toBe(true);
    expect(registry.release('prisoner', 0)).toBe(false);
    expect(registry.getName('prisoner', 0)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it('reconciles away identities whose entity is gone, without drawing', () => {
    const registry = new ActorIdentityRegistry();
    const rng = loneStream(13);
    for (const entityId of [0, 1, 2, 3]) registry.assign('prisoner', entityId, rng);
    const streamBefore = rng.snapshot().words;

    const dropped = registry.reconcile('prisoner', (entityId) => entityId % 2 === 0);

    expect(dropped).toBe(2);
    expect(registry.entries().map((entry) => entry.entityId)).toEqual([0, 2]);
    expect(rng.snapshot().words).toEqual(streamBefore);
  });

  it('rejects an entity id that is not a non-negative integer', () => {
    const registry = new ActorIdentityRegistry();
    expect(() => registry.assign('prisoner', -1, loneStream(1))).toThrow(RangeError);
    expect(() => registry.assign('prisoner', 1.5, loneStream(1))).toThrow(RangeError);
  });
});

describe('ActorIdentityRegistry snapshots', () => {
  it('emits entries in declared-kind then ascending-entity-id order, never insertion order', () => {
    const registry = new ActorIdentityRegistry();
    const rng = loneStream(21);
    // Deliberately reverse and interleave the insertion order.
    registry.assign('staff', 9, rng);
    registry.assign('prisoner', 8, rng);
    registry.assign('staff', 2, rng);
    registry.assign('prisoner', 1, rng);

    expect(registry.entries().map((entry) => `${entry.kind}:${entry.entityId}`)).toEqual([
      'prisoner:1',
      'prisoner:8',
      'staff:2',
      'staff:9',
    ]);
  });

  it('restores a shuffled snapshot to the same registry a canonical one produces', () => {
    const source = new ActorIdentityRegistry();
    const rng = loneStream(33);
    for (const entityId of [0, 1, 2, 3, 4]) source.assign('prisoner', entityId, rng);
    for (const entityId of [0, 1]) source.assign('staff', entityId, rng);
    const canonical = source.getSnapshot();

    const shuffled = { ...canonical, entries: [...canonical.entries].reverse() };
    const restored = new ActorIdentityRegistry();
    restored.loadSnapshot(shuffled);

    expect(restored.getSnapshot()).toEqual(canonical);

    // Restoring an already-restored snapshot must not drift.
    restored.loadSnapshot(restored.getSnapshot());
    expect(restored.getSnapshot()).toEqual(canonical);
  });

  it('carries the uniqueness bookkeeping across a restore', () => {
    const pool: ActorNamePool = { id: 'test.pair', givenNames: ['Only'], familyNames: ['Alpha', 'Beta'] };
    const source = new ActorIdentityRegistry({ pool });
    source.assign('prisoner', 0, loneStream(2));

    const restored = new ActorIdentityRegistry({ pool });
    restored.loadSnapshot(source.getSnapshot());
    const second = restored.assign('prisoner', 1, loneStream(2));

    expect(second.familyName).not.toBe(source.getName('prisoner', 0)!.familyName);
  });

  it('rejects a snapshot version it does not understand and a snapshot that repeats an actor', () => {
    const registry = new ActorIdentityRegistry();
    expect(() => registry.loadSnapshot({ version: 2 as unknown as 1, poolId: 'x', entries: [] })).toThrow(RangeError);
    expect(() =>
      registry.loadSnapshot({
        version: 1,
        poolId: 'x',
        entries: [
          { kind: 'prisoner', entityId: 4, givenName: 'A', familyName: 'B' },
          { kind: 'prisoner', entityId: 4, givenName: 'C', familyName: 'D' },
        ],
      }),
    ).toThrow(RangeError);
  });

  it('accepts a snapshot minted by a different pool, so replacing the pool cannot rename anyone', () => {
    const registry = new ActorIdentityRegistry({ pool: { id: 'other.v9', givenNames: ['Zeta'], familyNames: ['Omega'] } });
    registry.loadSnapshot({
      version: 1,
      poolId: PLACEHOLDER_ACTOR_NAME_POOL.id,
      entries: [{ kind: 'prisoner', entityId: 0, givenName: 'Marta', familyName: 'Novak' }],
    });

    expect(registry.getName('prisoner', 0)).toEqual({ givenName: 'Marta', familyName: 'Novak' });
    expect(registry.poolId).toBe('other.v9');
  });
});

describe('actor name pool', () => {
  it('accepts the shipped placeholder pool', () => {
    expect(() => assertValidActorNamePool(PLACEHOLDER_ACTOR_NAME_POOL)).not.toThrow();
  });

  it('rejects a duplicate, an empty list and a non-ASCII entry', () => {
    expect(() => assertValidActorNamePool({ id: 'dup', givenNames: ['Ada', 'Ada'], familyNames: ['Bo'] })).toThrow(RangeError);
    expect(() => assertValidActorNamePool({ id: 'empty', givenNames: [], familyNames: ['Bo'] })).toThrow(RangeError);
    expect(() => assertValidActorNamePool({ id: 'unicode', givenNames: ['Zoé'], familyNames: ['Bo'] })).toThrow(RangeError);
    expect(() => assertValidActorNamePool({ id: '', givenNames: ['Ada'], familyNames: ['Bo'] })).toThrow(RangeError);
  });

  it('shares no entry with the default locale catalog, so a name can never read as a translation (ADR 0011)', () => {
    // The localization-boundary test in `hud-projections.test.ts` fails any
    // projected string that equals a translation. A person's name is not a
    // translation, and this keeps that true as either side grows -- rather
    // than weakening that test to make room for names.
    const translations = new Set(defaultLocaleEnCatalog.values());
    const collisions = [...PLACEHOLDER_ACTOR_NAME_POOL.givenNames, ...PLACEHOLDER_ACTOR_NAME_POOL.familyNames].filter((name) =>
      translations.has(name),
    );
    expect(collisions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism through the real kernel and the real intake pipeline.
// ---------------------------------------------------------------------------

const PRISONER_COUNT = 8;
const TICKS = 120;

function runNamedScenario(seed: number, options: { readonly withIdentity?: boolean } = {}) {
  const registry = new ActorIdentityRegistry();
  const fixture = buildPrisonerScenarioFixture({
    cellCount: 6,
    capacity: 32,
    ...(options.withIdentity === false ? {} : { identity: registry }),
  });
  const kernel = new Kernel(0, 0, streamsFor(seed));
  fixture.registerOn(kernel);

  for (let index = 0; index < PRISONER_COUNT; index += 1) {
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000 + index * 137, priorIncidents: index % 4 }, fixture.originTile);
  }
  for (let tick = 0; tick < TICKS; tick += 1) kernel.step();

  return { fixture, kernel, registry };
}

function riskProfile(fixture: ReturnType<typeof runNamedScenario>['fixture']): readonly string[] {
  const profile: string[] = [];
  for (let index = 0; index <= fixture.prisoners.entityStore.maxActiveIndex; index += 1) {
    if (!fixture.prisoners.entityStore.isIndexAlive(index)) continue;
    profile.push(`${fixture.prisoners.records.riskTier[index]!}:${fixture.prisoners.records.classificationGroupIndex[index]!}`);
  }
  return profile;
}

describe('actor identity is deterministic through a real session', () => {
  it('mints the same names for two runs from the same seed', () => {
    const left = runNamedScenario(1_234);
    const right = runNamedScenario(1_234);

    expect(left.registry.entries()).toHaveLength(PRISONER_COUNT);
    expect(right.registry.getSnapshot()).toEqual(left.registry.getSnapshot());
  });

  it('mints different names for a different seed', () => {
    const left = runNamedScenario(1_234);
    const right = runNamedScenario(9_876);

    expect(right.registry.entries()).not.toEqual(left.registry.entries());
  });

  it('does not name a prisoner who has not reached reception yet', () => {
    const registry = new ActorIdentityRegistry();
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 8, identity: registry });
    const kernel = new Kernel(0, 0, streamsFor(5));
    fixture.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, fixture.originTile);
    for (let tick = 0; tick < 5; tick += 1) kernel.step(); // queued -> reception
    expect(registry.getName('prisoner', entityId)).toBeUndefined();

    for (let tick = 0; tick < 5; tick += 1) kernel.step(); // reception -> classification
    expect(registry.getName('prisoner', entityId)).toBeDefined();
  });

  it('cannot perturb the classification stream (named-stream isolation)', () => {
    // The whole point of `identity.actor-name` being its own stream: naming a
    // new arrival must not change how the arrival after them is classified.
    // Wiring identity to `prisoners.classification` instead makes these two
    // risk profiles disagree.
    const named = runNamedScenario(4_242);
    const unnamed = runNamedScenario(4_242, { withIdentity: false });

    expect(named.registry.size).toBe(PRISONER_COUNT);
    expect(unnamed.registry.size).toBe(0);
    expect(riskProfile(named.fixture)).toEqual(riskProfile(unnamed.fixture));
  });
});

// ---------------------------------------------------------------------------
// The HUD surface.
// ---------------------------------------------------------------------------

describe('identity reaches the HUD through the projections', () => {
  it('labels prisoner roster rows and the detail view when an identity source is supplied', () => {
    const { fixture, registry } = runNamedScenario(77);

    const unnamed = projectPrisonerRoster(fixture.prisoners, { limit: 50 });
    expect(unnamed.rows.every((row) => row.name === undefined)).toBe(true);

    const named = projectPrisonerRoster(fixture.prisoners, { limit: 50 }, { identity: registry });
    expect(named.rows).toHaveLength(PRISONER_COUNT);
    for (const row of named.rows) {
      expect(row.name).toEqual(registry.getName('prisoner', row.entityId));
    }

    const entityId = named.rows[0]!.entityId;
    const detail = projectPrisonerDetail(fixture.prisoners, entityId, { identity: registry })!;
    expect(detail.name).toEqual(registry.getName('prisoner', entityId));
    expect(projectPrisonerDetail(fixture.prisoners, entityId)!.name).toBeUndefined();
  });

  it('labels staff rows from the staff side of the registry, not the prisoner side', () => {
    // Both stores hand out id 0, so reading identity by entity id alone would
    // put a prisoner's name on a guard's row.
    const registry = new ActorIdentityRegistry();
    const roster = new GuardRoster(8);
    const guardId = roster.hire('staff-role.guard', { x: tileCoordinate(2), y: tileCoordinate(3) });

    registry.assign('prisoner', guardId, loneStream(1));
    registry.rename('prisoner', guardId, { givenName: 'Prisoner', familyName: 'Zero' });
    registry.assign('staff', guardId, loneStream(1));
    registry.rename('staff', guardId, { givenName: 'Guard', familyName: 'Zero' });

    const staff = projectStaff({ staff: roster }, 0, {}, { identity: registry });

    expect(staff.roster.rows[0]?.entityId).toBe(guardId);
    expect(staff.roster.rows[0]?.name).toEqual({ givenName: 'Guard', familyName: 'Zero' });
    expect(projectStaff({ staff: roster }, 0).roster.rows[0]?.name).toBeUndefined();
  });

  it('hands out a copy, never a reference into registry state', () => {
    const { fixture, registry } = runNamedScenario(88);
    const row = projectPrisonerRoster(fixture.prisoners, { limit: 1 }, { identity: registry }).rows[0]!;

    expect(row.name).not.toBe(registry.getName('prisoner', row.entityId));
    expect(row.name).toEqual(registry.getName('prisoner', row.entityId));
  });

  it('leaves the registry untouched when projecting', () => {
    const { fixture, registry } = runNamedScenario(99);
    const before = JSON.stringify(registry.getSnapshot());

    projectPrisonerRoster(fixture.prisoners, { limit: 50 }, { identity: registry });
    projectPrisonerDetail(fixture.prisoners, fixture.prisoners.entityStore.getIdByIndex(0), { identity: registry });

    expect(JSON.stringify(registry.getSnapshot())).toBe(before);
  });
});
