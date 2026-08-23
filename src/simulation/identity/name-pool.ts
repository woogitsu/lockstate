/**
 * Placeholder name pool for actor identity.
 *
 * **This is not a content deliverable.** It exists so a HUD roster row has
 * something to label itself with (`docs/HUD_PROJECTIONS.md` gaps 1 and 2)
 * and is expected to be replaced wholesale by authored content later. It
 * deliberately lives inside `src/simulation/identity/` rather than in
 * `src/content/`, because a person's name is **not localizable content**:
 * it is never translated, so it has no `nameKey`, no catalog entry and no
 * place in the ADR 0011 message-key machinery. See `actor-identity.ts` for
 * the full argument.
 *
 * ## Replacing this pool
 *
 * `ActorIdentityRegistry` takes the pool as a constructor argument, so a
 * replacement is a call-site change, not an edit here. Any replacement
 * must keep these properties:
 *
 * - **ASCII only.** Names are compared and sorted with code-unit ordering
 *   (`docs/DETERMINISM.md` forbids `localeCompare`) and they are hashed
 *   into determinism state. ASCII keeps that trivially reproducible and
 *   stops a Unicode normalisation form becoming load-bearing.
 * - **Ordered and stable.** The declared order is half of the
 *   seed-to-name mapping: reordering the list changes which name a
 *   *future* draw produces. It does **not** rename anybody who already
 *   exists, because a name is stored state rather than a function of the
 *   pool -- that is exactly what the allocated-identity decision buys.
 *   A reorder still makes two players on different builds disagree about a
 *   brand-new arrival, so treat the pool as versioned content.
 * - **No duplicates, no empty entries.** `assertValidActorNamePool`
 *   enforces both; a duplicate would silently bias the distribution.
 *
 * The set below is deliberately plain: a spread of common European,
 * Middle Eastern, South American and West African forms, none attached to
 * a public figure, and no gender model anywhere in the simulation to
 * attach them to.
 */

export interface ActorNamePool {
  /** Stable id for the pool, so a save or a log can say which one produced a name. */
  readonly id: string;
  readonly givenNames: readonly string[];
  readonly familyNames: readonly string[];
}

/** ASCII letters plus the two punctuation marks real names actually use. */
const NAME_PATTERN = /^[A-Za-z][A-Za-z'-]*$/;

export function assertValidActorNamePool(pool: ActorNamePool): void {
  if (pool.id.length === 0) throw new RangeError('An actor name pool needs a stable id.');
  const lists = [
    ['givenNames', pool.givenNames],
    ['familyNames', pool.familyNames],
  ] as const;

  for (const [label, entries] of lists) {
    if (entries.length === 0) throw new RangeError(`Actor name pool ${pool.id} has no ${label}.`);
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!NAME_PATTERN.test(entry)) {
        throw new RangeError(`Actor name pool ${pool.id} has a non-ASCII or empty ${label} entry: ${JSON.stringify(entry)}.`);
      }
      if (seen.has(entry)) throw new RangeError(`Actor name pool ${pool.id} repeats the ${label} entry ${JSON.stringify(entry)}.`);
      seen.add(entry);
    }
  }
}

export const PLACEHOLDER_ACTOR_NAME_POOL: ActorNamePool = {
  id: 'placeholder.v1',
  givenNames: [
    'Adan', 'Alma', 'Bram', 'Carla', 'Dario', 'Delia', 'Ewan', 'Fiona',
    'Gustav', 'Hana', 'Ibrahim', 'Ines', 'Jonas', 'Kira', 'Lars', 'Lena',
    'Malik', 'Marta', 'Nadia', 'Noel', 'Omar', 'Petra', 'Quinn', 'Rafal',
    'Rosa', 'Samir', 'Sonia', 'Tomas', 'Ursula', 'Viktor', 'Wanda', 'Yusuf',
  ],
  familyNames: [
    'Abara', 'Bakker', 'Costa', 'Dolan', 'Eriksen', 'Farkas', 'Gruber', 'Haddad',
    'Ivanov', 'Jansen', 'Kowal', 'Lindqvist', 'Marek', 'Novak', 'Okafor', 'Pereira',
    'Quintero', 'Rossi', 'Sandoval', 'Tamm', 'Ueda', 'Varga', 'Wagner', 'Xavier',
    'Yilmaz', 'Zielen', 'Balogh', 'Cabrera', 'Duarte', 'Engel', 'Fontaine', 'Guerra',
  ],
};
