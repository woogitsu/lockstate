import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import {
  ActorIdentityRegistry,
  assertValidActorNamePool,
  type ActorNamePool,
} from '../../src/simulation/identity';
import {
  AUTHORED_ACTOR_NAME_POOLS,
  AUTHORED_FAMILY_NAME_COUNT,
  AUTHORED_GIVEN_NAME_COUNT,
} from '../../src/simulation/identity/name-pools';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';

/**
 * The authored name pools of `src/simulation/identity/name-pools/`, gated.
 *
 * `tests/unit/actor-identity.test.ts` already gates
 * `PLACEHOLDER_ACTOR_NAME_POOL` and `assertValidActorNamePool`'s rejections.
 * This file is about the authored content that replaces it, and it is a
 * separate file for one reason: the pools have **no reader in `src/`**.
 * `ActorIdentityRegistry` still defaults to the placeholder, because which
 * pool a prison draws from is `Proposed` and not accepted
 * ([ADR 0094](../../docs/adr/0094-which-names-a-prison-draws-from.md)). Data
 * with no reader is data nothing would notice breaking, so every property the
 * ADR relies on is asserted here rather than left to the day a call site
 * appears.
 *
 * ## Why this re-states properties `assertValidActorNamePool` already checks
 *
 * It does not. `assertValidActorNamePool` checks a pool it is *handed*;
 * nothing hands it these nine. The first `it` below is the only thing in the
 * repository that does, and without it a duplicate or a non-ASCII entry in
 * any of 2,520 authored names would ship green. The negative case at the end
 * is what proves that assertion has teeth rather than being a call whose
 * argument happens never to be bad.
 */

/** Every pool, with the language tag its file and id carry, for a legible failure diff. */
const POOLS: readonly { readonly tag: string; readonly pool: ActorNamePool }[] = AUTHORED_ACTOR_NAME_POOLS.map(
  (pool) => ({ tag: pool.id, pool }),
);

describe('authored actor name pools', () => {
  it('ships nine pools with the declared ids, in the declared order', () => {
    // Pinned rather than derived from the directory listing: ADR 0094
    // decision 1 makes a pool immutable once it ships and the declared order
    // half of the seed-to-name mapping, so a rename or a reorder must fail
    // here and ship as a `v2` instead.
    expect(AUTHORED_ACTOR_NAME_POOLS.map((pool) => pool.id)).toEqual([
      'authored.ar.v1',
      'authored.de.v1',
      'authored.en.v1',
      'authored.es.v1',
      'authored.fr.v1',
      'authored.it.v1',
      'authored.pl.v1',
      'authored.sw.v1',
      'authored.tr.v1',
    ]);
  });

  it.each(POOLS)('$tag is a valid actor name pool', ({ pool }) => {
    expect(() => assertValidActorNamePool(pool)).not.toThrow();
  });

  it.each(POOLS)('$tag carries exactly 120 given and 160 family names', ({ pool }) => {
    // The owner's figure of 2026-09-02, not a derived one.
    expect(pool.givenNames).toHaveLength(AUTHORED_GIVEN_NAME_COUNT);
    expect(pool.familyNames).toHaveLength(AUTHORED_FAMILY_NAME_COUNT);
  });

  it.each(POOLS)('$tag is ASCII throughout, so no normalisation form is load-bearing', ({ pool }) => {
    // ADR 0094 Finding 2: the save checksum runs FNV-1a over the UTF-8 bytes
    // of the canonical JSON, so two Unicode normalisations of one name give
    // two checksums. ASCII is one form by construction. `NAME_PATTERN`
    // already implies this, and it is asserted separately because it is the
    // property the ADR argues about rather than an incidental consequence.
    const offenders = [...pool.givenNames, ...pool.familyNames].filter((name) => !/^[\x20-\x7E]+$/.test(name));
    expect(offenders).toEqual([]);
  });

  it.each(POOLS)('$tag shares no entry with the default locale catalogue (ADR 0011)', ({ pool }) => {
    // The same rule `actor-identity.test.ts` applies to the placeholder: the
    // localization-boundary check in `hud-projections.test.ts` fails any
    // projected string that equals a translation, and a person's name is not
    // a translation. Nine more pools is nine more chances for a name to
    // collide with a catalogue value, so the rule is applied to each.
    const translations = new Set(defaultLocaleEnCatalog.values());
    const collisions = [...pool.givenNames, ...pool.familyNames].filter((name) => translations.has(name));
    expect(collisions).toEqual([]);
  });

  it('has no duplicate pool id', () => {
    const ids = AUTHORED_ACTOR_NAME_POOLS.map((pool) => pool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each tradition 19,200 distinct full names, so the bounded re-draw is not the limit', () => {
    // ADR 0094's Consequences: `uniquenessAttempts` defaults to 8, so the
    // pool size is what decides whether a repeated full name reads as
    // coincidence or as the pool running out. 32 x 32 = 1,024 for the
    // placeholder; this asserts the figure the ADR quotes.
    for (const { pool } of POOLS) {
      expect(pool.givenNames.length * pool.familyNames.length).toBe(19_200);
    }
  });

  it('mints from an authored pool through the real registry and the real RNG', () => {
    // The pools are only data until something draws from them. This is not a
    // call site -- `new-session.ts` still takes the placeholder -- but it
    // proves the shape is drawable, so the day decision 2 is accepted the
    // wiring is the only new thing.
    for (const { pool } of POOLS) {
      const registry = new ActorIdentityRegistry({ pool });
      const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
      const name = registry.assign('prisoner', 0, rng);
      expect(pool.givenNames).toContain(name.givenName);
      expect(pool.familyNames).toContain(name.familyName);
      expect(registry.poolId).toBe(pool.id);
      // Idempotent for the same actor, and drawing nothing the second time,
      // which is the property `assign`'s docblock calls load-bearing.
      expect(registry.assign('prisoner', 0, rng)).toEqual(name);
    }
  });
});

describe('the authored-pool gate has teeth', () => {
  /** A real authored pool, damaged one way at a time. */
  function damaged(mutate: (pool: { givenNames: string[]; familyNames: string[] }) => void): ActorNamePool {
    const source = AUTHORED_ACTOR_NAME_POOLS[0]!;
    const draft = { givenNames: [...source.givenNames], familyNames: [...source.familyNames] };
    mutate(draft);
    return { id: `${source.id}.damaged`, givenNames: draft.givenNames, familyNames: draft.familyNames };
  }

  it('rejects a duplicate given name', () => {
    expect(() => assertValidActorNamePool(damaged((p) => { p.givenNames[1] = p.givenNames[0]!; }))).toThrow(RangeError);
  });

  it('rejects a duplicate family name', () => {
    expect(() => assertValidActorNamePool(damaged((p) => { p.familyNames[1] = p.familyNames[0]!; }))).toThrow(RangeError);
  });

  it('rejects an empty entry', () => {
    expect(() => assertValidActorNamePool(damaged((p) => { p.givenNames[0] = ''; }))).toThrow(RangeError);
  });

  it('rejects a non-ASCII entry, which is what the ASCII assertion above is guarding', () => {
    expect(() => assertValidActorNamePool(damaged((p) => { p.familyNames[0] = 'Wiśniewski'; }))).toThrow(RangeError);
  });

  it('rejects an entry carrying a space or a digit', () => {
    expect(() => assertValidActorNamePool(damaged((p) => { p.givenNames[0] = 'Anna Maria'; }))).toThrow(RangeError);
    expect(() => assertValidActorNamePool(damaged((p) => { p.givenNames[0] = 'Anna2'; }))).toThrow(RangeError);
  });

  it('rejects a pool whose count is wrong, through the size assertion rather than the validator', () => {
    // `assertValidActorNamePool` has no opinion on length beyond non-empty,
    // so 120 and 160 are this file's assertion to keep. Stated because a
    // reader could otherwise assume the validator covers it.
    const short = damaged((p) => { p.givenNames.pop(); });
    expect(() => assertValidActorNamePool(short)).not.toThrow();
    expect(short.givenNames).toHaveLength(AUTHORED_GIVEN_NAME_COUNT - 1);
  });
});
