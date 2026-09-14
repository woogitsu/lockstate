import { DEFAULT_LOCALE } from '../../src/content/localization';
import { formatNumber } from '../../src/services/localization/format';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { placementCostMinorUnits } from '../../src/simulation/economy';
import { type Page, expect, test } from './network-changed-fixture';

/**
 * **Every buildable is reachable through the catalogue, at the price the
 * simulation reports** -- issue #1160's first exit criterion, in the assembled
 * application.
 *
 * ## What it is a gate over
 *
 * Until 2026-09-14 the Build panel computed the figure beside each catalogue
 * row itself:
 * `buildable.material.unitPriceMinorUnits * buildable.material.quantityPerPlacement`.
 * That is the interface recomputing a finance figure, which constitution
 * article 4 and `AGENTS.md` boundary 1 forbid from two directions, and it
 * priced the *first purchasable* requirement rather than every one of them.
 * `placementCostMinorUnits` (`src/simulation/economy/placement-cost.ts`) is
 * where the arithmetic lives now, and the composition root puts its answer on
 * `HudBuildableViewModel.placementCostMinorUnits`.
 *
 * ## Why a browser spec, when the arithmetic has a unit test
 *
 * `tests/unit/economy-placement-cost.test.ts` owns the function and drives the
 * two cases the shipped registry cannot reach. What it cannot reach is the
 * *wiring*: that `buildCatalogue` in `src/main.ts` calls that function at all,
 * and that the panel renders its answer rather than a product of its own.
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, and `src/main.ts`
 * touches `document`, so neither the composition root nor `createBuildPanel`
 * can be called from a unit test -- a mutation in either is unobservable
 * there rather than untested (`docs/AGENT_WORKFLOW.md`).
 *
 * ## Why it asserts the number and not "the row has digits in it"
 *
 * A row reading `Brick wall · 40` satisfies every weaker claim and is the
 * defect: it is the *toilet's* price on the wall's row, which is what a panel
 * pricing the wrong requirement would produce. So each row is checked against
 * the figure the simulation computes for that row's own definition, derived
 * here from the registry rather than written down as a literal, and the set of
 * figures is required to have more than one member so that a catalogue which
 * quoted one price for everything could not pass.
 */

const APP_URL = '/index.html';

/** Loads the real application entry and waits for the renderer and the HUD. */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
}

/**
 * What the simulation says each shipped buildable's placement costs.
 *
 * Derived from `BUILDABLE_REGISTRY` and `placementCostMinorUnits`, which is the
 * same pair the composition root reads -- so a price moving in
 * `src/content/procurement-catalog.ts` moves this expectation with it, and a
 * *row* losing its price does not.
 */
const EXPECTED = new Map(
  [...BUILDABLE_REGISTRY.values()].map((definition) => [
    definition.id,
    placementCostMinorUnits(definition.materialsRequired),
  ]),
);

test.describe('the Build catalogue quotes the simulation (#1160)', () => {
  test('every buildable has a row, and each row carries its own price', async ({ page }) => {
    await openApp(page);
    await page.locator('.ui-tab[data-tab="build"]').click();
    const rows = page.locator('.hud-build__list [data-buildable]');
    await expect(rows.first()).toBeVisible();

    // Every definition the registry holds: the criterion is "every buildable
    // reachable", so a catalogue that silently dropped one must fail here.
    const ids = await rows.evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset['buildable'] ?? ''),
    );
    expect(new Set(ids)).toEqual(new Set(EXPECTED.keys()));

    const distinct = new Set<string>();
    for (const [id, cost] of EXPECTED) {
      expect(cost, `${id} must be priced by the simulation`).not.toBeUndefined();
      const price = formatNumber(DEFAULT_LOCALE, cost as number);
      distinct.add(price);
      const text = await page.locator(`.hud-build__list [data-buildable="${id}"]`).innerText();
      expect(text, `${id} should quote ${price}`).toContain(price);
    }

    // A panel that quoted one figure for every row would satisfy every
    // assertion above if the registry happened to be uniform. It is not, and
    // this is what keeps the assertions above load-bearing.
    expect(distinct.size).toBeGreaterThan(1);
  });
});
