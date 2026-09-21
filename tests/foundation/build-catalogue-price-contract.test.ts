import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { BUILDABLE_REGISTRY, type BuildableDefinition } from '../../src/simulation/construction/definition';
import { placementCostMinorUnits } from '../../src/simulation/economy/placement-cost';
import { buildCatalogueRowLabel } from '../../src/ui/hud/build-panel';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import type { HudBuildableViewModel } from '../../src/ui/hud/view-model';

/**
 * **Issue #1160's first exit criterion, at a layer that runs without a
 * browser.**
 *
 * The criterion reads *"every buildable reachable through the new catalogue,
 * with the cost the simulation reports rather than one the panel computed"*.
 *
 * **It is already walked, and this file is not the thing that walks it.**
 * `tests/browser/ui-build-catalogue-price.spec.ts` derives its expectation
 * from `BUILDABLE_REGISTRY` and `placementCostMinorUnits`, opens the real
 * assembled application, and requires the set of `data-buildable` row ids to
 * equal the set of registry keys with each row quoting its own figure. That is
 * the criterion, in the only place the *wiring* is observable -- the
 * composition root touches `document`, so no unit test can call it -- and it
 * is a stronger reachability check than anything here, because it reads rows
 * out of a rendered panel rather than re-deriving which rows there would be.
 *
 * This file was written believing that walk did not exist. It does. What is
 * left is the part that walk cannot cover here and two assertions it does not
 * make:
 *
 *  1. **It needs a browser and the real app.** That spec is one of the specs
 *     that load `/index.html` and wait on `#game-root canvas`, so it needs
 *     Chromium and the Git LFS art the repository does not always have
 *     provisioned. A contract at the foundation layer over the same content
 *     runs in the gate every agent can run, in milliseconds.
 *  2. **It asserts `toContain(price)`.** A substring is satisfied equally by
 *     `Brick wall - 80` and `Brick wall - 80 per segment`, so inverting
 *     `buildCatalogueRowLabel`'s per-segment branch passes it. That branch is
 *     a player-visible claim about money -- a drag of twelve wall segments
 *     costs twelve times the quoted figure -- so this file asserts the whole
 *     rendered sentence rather than a substring of it.
 *  3. **Nothing pinned the divergence condition.** `placement-cost.ts` states
 *     that the retired panel formula and the simulation's agree today and stop
 *     agreeing the moment a row names two materials. That was an unguarded
 *     claim about 21 rows; the last test here is its guard.
 *
 * ## What this file adds that `object-buildable-cost-contract.test.ts` does not
 *
 * That file pins the *rule* a row's materials follow -- one material, 30 work
 * per place it provides -- over the 19 object rows. It never converts a row
 * into money and never looks at what the player is shown. This one starts from
 * the same registry and ends at the **rendered sentence**, over all 21 rows
 * including the two that place no object, which is the other half and the half
 * the criterion actually asks about.
 *
 * ## Why the expected number is recomputed here rather than imported
 *
 * Asserting `label(placementCostMinorUnits(x)) === label(placementCostMinorUnits(x))`
 * is a tautology. So the expected total is summed in this file, directly off
 * `src/content/procurement-catalog.ts`, and the assertion is that the sentence
 * the panel produces states **that** number. The test therefore fails if the
 * catalogue's prices move and the projection does not, or the reverse.
 */

/** Every buildable there is, in registry order. */
const buildables: readonly BuildableDefinition[] = [...BUILDABLE_REGISTRY.values()];

/**
 * The expected total, summed here rather than taken from the function under
 * test: unit price times quantity over **every** requirement.
 */
function expectedTotalMinorUnits(definition: BuildableDefinition): number | undefined {
  let total = 0;
  for (const requirement of definition.materialsRequired) {
    const material = procurableMaterial(requirement.itemId);
    if (material === undefined) return undefined;
    total += material.unitPriceMinorUnits * requirement.quantity;
  }
  return total;
}

/**
 * The composition root's label rule, re-derived (`buildableLabelKey`,
 * `src/main.ts`): an object buildable is labelled by the object it places, and
 * the two rows that place no object are named by a table there.
 *
 * `src/main.ts` exports nothing and no test imports it, so this is a second
 * statement of the rule rather than a call to it -- which is this file's
 * weakest point and is named as such in the report that accompanies it. What
 * makes it worth having anyway is the `continue` the rule feeds: a buildable
 * whose label key is `undefined` is **silently dropped** from the catalogue,
 * so "reachable" and "labelled" are the same question, and nothing before this
 * file asked it of all 21.
 */
const UNPLACING_ROW_LABEL: Readonly<Record<string, string>> = {
  'wall-brick': HUD_MESSAGE_KEY.buildableWallBrick,
  'door-wooden': HUD_MESSAGE_KEY.buildableDoorWooden,
};

function labelKeyFor(definition: BuildableDefinition): string | undefined {
  const objectId = definition.placesObjectId;
  if (objectId !== undefined) return defaultObjectRegistry.getById(objectId)?.nameKey;
  return UNPLACING_ROW_LABEL[definition.id];
}

function viewModelFor(definition: BuildableDefinition, labelKey: string): HudBuildableViewModel {
  const cost = placementCostMinorUnits(definition.materialsRequired);
  return {
    definitionId: definition.id,
    labelKey: labelKey as HudBuildableViewModel['labelKey'],
    occupiesEdge: definition.placesObjectId === undefined,
    placesObject: definition.placesObjectId !== undefined,
    categoryId: 'structure',
    categoryLabelKey: 'category.structure' as HudBuildableViewModel['categoryLabelKey'],
    ...(cost === undefined ? {} : { placementCostMinorUnits: cost }),
  } as HudBuildableViewModel;
}

describe('every buildable states the price the simulation reports (#1160 exit criterion 1)', () => {
  const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
  const t = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  it('walks every buildable there is, so this cannot pass vacuously', () => {
    // The count is the guard on the whole file: a 22nd row added without a
    // price, a label or a catalogue entry fails here first and says so.
    expect(BUILDABLE_REGISTRY.size).toBe(21);
    expect(buildables.length).toBe(21);
  });

  it('reaches every one of them: the label rule answers for all 21, so the catalogue drops none', () => {
    const unlabelled = buildables.filter((definition) => labelKeyFor(definition) === undefined);
    expect(unlabelled.map((definition) => definition.id)).toEqual([]);
  });

  it('names every one of them in real catalogue text, not in its own key', () => {
    for (const definition of buildables) {
      const key = labelKeyFor(definition);
      expect(key, `${definition.id} has no label key`).toBeDefined();
      const text = localizer.format(String(key));
      expect(text, `${String(key)} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it('prices every one of them: no row reaches the panel with no total to state', () => {
    // `undefined` is a real and honest answer for a buildable naming a
    // material nothing sells (`placement-cost.ts`), and today no row is one.
    // If that changes, the row shows a bare name and this says which row.
    const unpriced = buildables.filter(
      (definition) => placementCostMinorUnits(definition.materialsRequired) === undefined,
    );
    expect(unpriced.map((definition) => definition.id)).toEqual([]);
  });

  it('states, on every row, the number summed off the procurement catalogue', () => {
    // The criterion itself, walked. The expected figure is computed in this
    // file from content, so this is an equality between the shipped prices
    // and the shipped sentence rather than between a function and itself.
    const sentences: string[] = [];
    for (const definition of buildables) {
      const key = labelKeyFor(definition);
      expect(key, `${definition.id} has no label key`).toBeDefined();
      const expectedMinorUnits = expectedTotalMinorUnits(definition);
      expect(expectedMinorUnits, `${definition.id} has no expected total`).toBeDefined();

      const model = viewModelFor(definition, String(key));
      const total = model.placementCostMinorUnits;
      expect(total, `${definition.id} reached the panel with no total`).toBe(expectedMinorUnits);

      const rendered = buildCatalogueRowLabel(t, model, localizer.formatNumber(Number(total)));
      const name = localizer.format(String(key));
      const figure = localizer.formatNumber(Number(expectedMinorUnits));
      const expected = model.placesObject ? `${name} · ${figure}` : `${name} · ${figure} per segment`;
      expect(rendered, `${definition.id} states the wrong price`).toBe(expected);
      sentences.push(`${definition.id}\t${rendered}`);
    }
    expect(sentences.length).toBe(21);
  });

  it('says "per segment" on exactly the rows a single drag can multiply', () => {
    // `BuildTool.place` submits one order per deduplicated edge segment, so a
    // row routed through it is charged per segment and a flat price would
    // underquote a drag of several by that factor. The two rows that place no
    // object are exactly the two that take that route -- the wall, and the
    // door, which is `category: 'object'` but places a door on an edge rather
    // than an object on a tile (#531).
    const perSegment = buildables
      .filter((definition) => definition.placesObjectId === undefined)
      .map((definition) => definition.id);
    expect([...perSegment].sort()).toEqual(['door-wooden', 'wall-brick']);
  });

  it("agrees, today, with the formula the panel used to run -- and says why that is not luck", () => {
    /*
     * The retired panel formula was `unitPrice * quantityPerPlacement` over
     * the **first purchasable** requirement only. `placement-cost.ts`'s
     * docblock says the two agree today to the minor unit, and that they stop
     * agreeing the moment a row names two materials or an unpriced one.
     *
     * That sentence is an unguarded claim about 21 rows, so this is the guard.
     * It fails the day a row gains a second material -- which is not a defect
     * in that row, it is the day someone has to check that the *composition
     * root* still sums all of them.
     */
    for (const definition of buildables) {
      expect(definition.materialsRequired.length, `${definition.id} names more than one material`).toBe(1);
      const first = definition.materialsRequired[0]!;
      const material = procurableMaterial(first.itemId);
      expect(material, `${definition.id} names a material nothing sells`).toBeDefined();
      const retired = material!.unitPriceMinorUnits * first.quantity;
      expect(placementCostMinorUnits(definition.materialsRequired)).toBe(retired);
    }
  });
});
