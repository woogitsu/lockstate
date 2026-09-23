import { describe, expect, it } from 'vitest';
import { BUILDABLE_REGISTRY, edgeNumericIdFor } from '../../src/simulation/construction/definition';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';

/**
 * **The two sentences about enclosure name what encloses (#935).**
 *
 * #921 measured that at the `not-enclosed` refusal the word *wall* appeared
 * nowhere on screen: the player was told the room was not enclosed and not what
 * encloses it. The Rooms panel's rule line said *"Must be enclosed"* and had the
 * same gap one step earlier. Both now name the buildables that close a side.
 *
 * ## Derived from the buildable registry, not restated
 *
 * What closes a side is decided in one place: `roomPerimeterEnclosure` reads a
 * perimeter edge's value, and `edgeNumericIdFor` is the only thing that gives a
 * buildable a non-zero one -- a `'wall'`-category row, or a row that
 * `placesDoor`. So the set of *kinds* below is computed from
 * `BUILDABLE_REGISTRY` through that function and compared as a set, in both
 * directions, the shape `cell-instruction-requirement-contract.test.ts` uses:
 *
 * - a new edge-closing kind (bars, a fence) with no phrase here fails, because
 *   the sentences have stopped naming everything that satisfies the rule;
 * - a phrase for a kind the registry no longer has fails, because they have
 *   started naming a remedy the code does not accept.
 *
 * A row that closes an edge and is neither a wall nor a door is reported under
 * its own id, so the failure names it.
 */

const SENTENCE_KEYS = ['hud.alert.refusal.zone.not-enclosed', 'hud.rooms.requirement-enclosed'] as const;

const REQUIRED_PHRASES: Readonly<Record<string, { readonly en: RegExp; readonly pl: RegExp }>> = {
  wall: { en: /\bwalls?\b/i, pl: /ścian/i },
  door: { en: /\bdoors?\b/i, pl: /\bdrzwi\b/i },
};

function edgeClosingKinds(): readonly string[] {
  const kinds = new Set<string>();
  for (const definition of BUILDABLE_REGISTRY.values()) {
    if (edgeNumericIdFor(definition) === 0) continue;
    if (definition.placesDoor !== undefined) kinds.add('door');
    else if (definition.category === 'wall') kinds.add('wall');
    else kinds.add(definition.id);
  }
  return [...kinds].sort();
}

describe('the enclosure sentences name what closes a side', () => {
  it('registers a phrase for exactly the kinds of buildable that close an edge', () => {
    const kinds = edgeClosingKinds();
    // Vacuity guard: a registry that closed no edge would make every check
    // below pass over an empty set.
    expect(kinds.length, 'no buildable closes an edge, so nothing here is being checked').toBeGreaterThan(0);
    expect(kinds).toEqual(Object.keys(REQUIRED_PHRASES).sort());
  });

  for (const key of SENTENCE_KEYS) {
    it(`names each of them in \`${key}\`, in English and in Polish`, () => {
      const en = defaultMessageCatalogEn.messages[key];
      const pl = messageCatalogPl.messages[key];
      expect(en, `${key} is not in the English catalogue`).toBeTypeOf('string');
      expect(pl, `${key} is not in the Polish catalogue`).toBeTypeOf('string');
      for (const kind of edgeClosingKinds()) {
        const phrase = REQUIRED_PHRASES[kind];
        expect(phrase, `no phrase is registered for the edge-closing kind \`${kind}\``).toBeDefined();
        expect(en, `the English ${key} does not name \`${kind}\`: ${String(en)}`).toMatch(phrase!.en);
        expect(pl, `the Polish ${key} does not name \`${kind}\`: ${String(pl)}`).toMatch(phrase!.pl);
      }
    });
  }
});
