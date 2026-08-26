import { describe, expect, it } from 'vitest';
import { OBJECT_CATEGORY_NAME_KEYS, objectCategorySchema } from '../../src/content/object-catalog';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { BUILDABLE_REGISTRY, buildableObjectCategory } from '../../src/simulation/construction/definition';

/**
 * What the Build panel's category filter has to divide, and whether the
 * taxonomy it borrows actually covers the thing it is dividing
 * ([ADR 0035](../../docs/adr/0035-buildable-catalogue-category-filter.md)).
 *
 * The filter reuses `src/content/object-catalog.ts`'s seven authored
 * categories rather than authoring an eighth vocabulary, and #390's argument
 * for that is that the taxonomy "exists and nothing reads it for layout". This
 * file is where the *coverage* half of that argument is checked, because it is
 * false as stated: two of the registry's rows place no object at all, so two
 * rows have no object category and would fall out of a filter built from the
 * seven alone.
 *
 * Every expectation below is **written out** rather than derived from the
 * registry. A test that grouped the registry with the same join the code uses
 * and then asserted the groups were consistent would assert nothing (#375);
 * and one that recomputed the counts would go green on the day a content row
 * landed in the wrong group, which is the only day this file matters.
 */
describe('every buildable belongs to exactly one catalogue group', () => {
  /**
   * The 21 rows of `BUILDABLE_REGISTRY`, by the group the Build panel's filter
   * puts each one in, at the tree this contract was written against.
   *
   * `undefined` is the group for a buildable that places no object, and it has
   * exactly two members: `wall-brick`, which is edge geometry, and
   * `door-wooden`, which is a fact about a tile edge registered in
   * `DoorRegistry` rather than an object addressed by an anchor tile. Neither
   * has an `ObjectCategory` and neither can be given one without inventing an
   * object for it, so the host names them a group of their own -- see
   * `buildableCategory` in `src/main.ts`.
   *
   * **A new content row must edit this table**, and that is the point rather
   * than the maintenance cost: a buildable is a data row with no layout review
   * attached (#390), and this is the review. The two singletons are here for
   * the same reason -- `security` and `storage` each hold one row today, so
   * "is a category with one row worse than no category" is a question with a
   * number, and a phase that fills them out will show up here as a table edit.
   */
  const EXPECTED_GROUPS: Readonly<Record<string, readonly string[]>> = {
    furniture: [
      'bed-wooden',
      'bench-wooden',
      'bookshelf-wooden',
      'chair-wooden',
      'desk-wooden',
      'dining-table-wooden',
    ],
    utility: ['loading-dock-door-wooden', 'utility-panel-brick', 'washing-machine-brick', 'waste-bin-brick'],
    'food-service': ['fridge-brick', 'prep-counter-brick', 'stove-brick'],
    medical: ['medical-bed-wooden', 'medicine-cabinet-wooden'],
    sanitation: ['shower-head-brick', 'toilet-brick'],
    security: ['security-console-brick'],
    storage: ['storage-rack-wooden'],
    // The two rows the object taxonomy does not reach.
    '': ['door-wooden', 'wall-brick'],
  };

  it('puts each of the twenty-one rows in the group this contract names', () => {
    const actual: Record<string, string[]> = {};
    for (const definition of BUILDABLE_REGISTRY.values()) {
      const group = buildableObjectCategory(definition) ?? '';
      (actual[group] ??= []).push(definition.id);
    }
    for (const ids of Object.values(actual)) ids.sort();

    const expected = Object.fromEntries(
      Object.entries(EXPECTED_GROUPS).map(([group, ids]) => [group, [...ids].sort()]),
    );
    expect(actual).toEqual(expected);
  });

  it('accounts for every row in the registry exactly once', () => {
    const listed = Object.values(EXPECTED_GROUPS).flat();
    expect(new Set(listed).size, 'a buildable id is listed in two groups above').toBe(listed.length);
    expect([...listed].sort()).toEqual([...BUILDABLE_REGISTRY.keys()].sort());
  });

  /**
   * The number the filter is worth, stated as an assertion rather than left in
   * a pull-request body: the largest group is what a filtered list is at its
   * worst, and it is what the browser measurement is a measurement *of*.
   */
  it('leaves the largest group well under the whole registry', () => {
    const largest = Math.max(...Object.values(EXPECTED_GROUPS).map((ids) => ids.length));
    expect(largest).toBe(6);
    expect(BUILDABLE_REGISTRY.size).toBe(21);
  });
});

/**
 * Seven authored categories, seven names, and the enforcement is the *type*
 * rather than this test: `OBJECT_CATEGORY_NAME_KEYS` is a
 * `Record<ObjectCategory, LocalizationKey>`, so a category added to
 * `objectCategorySchema` without a name fails `pnpm typecheck`. What a type
 * cannot check is that the key resolves to a sentence, which is this.
 */
describe('every object category can be named on screen', () => {
  it('names every member of the schema, and no member it does not have', () => {
    expect(Object.keys(OBJECT_CATEGORY_NAME_KEYS).sort()).toEqual([...objectCategorySchema.options].sort());
  });

  it('resolves every name in the bundled default locale', () => {
    const missing = Object.entries(OBJECT_CATEGORY_NAME_KEYS)
      .filter(([, key]) => typeof defaultMessageCatalogEn.messages[key] !== 'string')
      .map(([category]) => category);
    expect(missing, 'an object category has no entry in src/content/default-locale-en.ts').toEqual([]);
  });
});
