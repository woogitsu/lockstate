import type { HudRegimeViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **The Regime panel's editor, pressed in a real browser** (issue #1167,
 * ADR 0113 slice 1's missing producer).
 *
 * ## What this covers that `pnpm test` cannot
 *
 * `nextAllowedCategories` and `lockedCategoryIdsFor` are pure and are proven
 * against a real kernel in `tests/integration/regime-editing-producer.test.ts`,
 * which takes the chain from the projection reply to the day the simulation
 * then runs. What that file cannot reach is whether `regime-panel.ts` puts
 * those decisions on a `<button>` a player can actually press:
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `createRegimePanel` cannot run there at all (`docs/TESTING.md`).
 *
 * So this spec asserts the two things only a browser can say. **That a press
 * produces the intent**, with the coordinates ADR 0113 section 3 names -- the
 * group, the tick the block starts on, and the whole category list rather than
 * a delta -- and **that the last remaining category cannot be pressed**, which
 * is the one place the panel refuses a gesture rather than letting a command
 * the schema would reject leave the page.
 *
 * ## Why the editor has to be opened first
 *
 * It arrives collapsed. Seven toggles per classification group is four wrapped
 * rows at 375px, and this panel shares `.hud__side` with a roster that is
 * already the taller half of it, so the section costs the layout one 44px
 * header until a player asks for it -- the same argument the Build panel's
 * queue block makes for itself. A spec that found the buttons without opening
 * the section would be asserting against a fold that had silently stopped
 * folding.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * Two groups, shaped the way the two the simulation declares are shaped: the
 * general population's running block allows three categories and the
 * high-risk one allows a single category.
 *
 * **The single-category row is the subject of the lock case and is not a
 * contrivance for it.** `HIGH_RISK_REGIME` has three blocks against
 * `GENERAL_POPULATION_REGIME`'s ten (`src/simulation/prisoners/regime.ts`), and
 * the integration test beside this one measures general population's own
 * opening block at exactly one category too -- a block down to its last
 * category is the ordinary state of this prison, not an edge of it.
 *
 * The two `startTickOfDay` values differ so the assertion on the intent cannot
 * pass with the wrong row's boundary on it.
 */
const TIMETABLE: HudRegimeViewModel = {
  groups: [
    {
      classificationGroupId: 'general-population',
      labelKey: 'classification-group.general-population.name',
      allowedCategoryLabelKeys: [
        'action-category.recreation.name',
        'action-category.hygiene.name',
        'action-category.free-association.name',
      ],
      blockProgressPercent: 42,
      startTickOfDay: 1_000,
      allowedCategoryIds: ['recreation', 'hygiene', 'free-association'],
    },
    {
      classificationGroupId: 'high-risk',
      labelKey: 'classification-group.high-risk.name',
      allowedCategoryLabelKeys: ['action-category.hygiene.name'],
      blockProgressPercent: 42,
      startTickOfDay: 600,
      allowedCategoryIds: ['hygiene'],
    },
  ],
};

/**
 * The `edit-regime-block` intents the page has produced, in order.
 *
 * Filtered rather than asserted whole, and the thing filtered out is the
 * reason: opening the Day-plan tab is itself an intent (`select-tab`), so a
 * bare list assertion would be asserting the navigation as well as the press
 * and would fail on any change to how a tab reports itself. What this spec is
 * about is what the *editor* sends.
 */
async function editIntents(page: Page): Promise<readonly unknown[]> {
  const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
  return intents
    .map((intent) => JSON.parse(intent) as { readonly kind: string })
    .filter((intent) => intent.kind === 'edit-regime-block');
}

test.describe('the Regime panel can change the day it reports', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a toggle press asks for the block the row is about, by the tick it starts on, with the whole list', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'))).toBe(true);
    await page.evaluate((regime) => window.lockstateUiHarness.reportRegime(regime), TIMETABLE);

    const editor = page.locator('.hud-regime__editor');
    await expect(editor, 'the editor is not on the panel at all').toBeVisible();
    // Collapsed on arrival: the toggles exist and are not laid out.
    await expect(
      page.locator(".hud-regime__editor-list .ui-toggles__option[data-toggle='work']").first(),
      'the editor arrived expanded, so its height is in the panel before a player asks for it',
    ).toBeHidden();

    await editor.locator('.ui-section__header').click();

    const generalPopulation = page.locator(".hud-regime__editor-list .ui-toggles[data-group='general-population']");
    // The state before the press, read off the control rather than assumed:
    // three on, and `work` is one of the four that are off.
    await expect(generalPopulation.locator(".ui-toggles__option[data-toggle='recreation']")).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(generalPopulation.locator(".ui-toggles__option[data-toggle='work']")).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await generalPopulation.locator(".ui-toggles__option[data-toggle='work']").click();

    expect(await editIntents(page)).toEqual([
      {
        kind: 'edit-regime-block',
        classificationGroupId: 'general-population',
        // The boundary of the row that was pressed, not the other row's 600 and
        // not an index: ADR 0113 section 3's reason is that the registry
        // reorders schedules on restore, so an index can mean a different block
        // after a reload.
        startTickOfDay: 1_000,
        // The whole list the block would then allow, in the vocabulary's own
        // order rather than in press order -- `work` lands third because
        // `ACTION_CATEGORIES` declares it third, not last because it was
        // pressed last.
        allowedCategoryIds: ['work', 'recreation', 'hygiene', 'free-association'],
      },
    ]);
  });

  test('the last remaining category cannot be switched off, and the panel says why rather than going quiet', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'))).toBe(true);
    await page.evaluate((regime) => window.lockstateUiHarness.reportRegime(regime), TIMETABLE);
    await page.locator('.hud-regime__editor .ui-section__header').click();

    const highRisk = page.locator(".hud-regime__editor-list .ui-toggles[data-group='high-risk']");
    const only = highRisk.locator(".ui-toggles__option[data-toggle='hygiene']");
    await expect(only, 'the block’s one allowed category does not read as on').toHaveAttribute('aria-pressed', 'true');
    await expect(only, 'the last remaining category can be switched off, and the command it sends is refused at decode').toBeDisabled();

    // The sentence, resolved through the real bundled catalogue rather than
    // asserted as a key: a locked control that does not say why is the shape
    // the owner's standing directive names.
    await expect(highRisk.locator('.ui-toggles__reason')).toHaveText(
      'A block has to allow at least one thing, so the last one cannot be switched off.',
    );

    // And the lock is per block rather than per panel: the other group has
    // three categories and every one of them is pressable.
    const generalPopulation = page.locator(".hud-regime__editor-list .ui-toggles[data-group='general-population']");
    await expect(generalPopulation.locator(".ui-toggles__option[data-toggle='hygiene']")).toBeEnabled();
    await expect(generalPopulation.locator('.ui-toggles__reason')).toBeHidden();

    // Nothing left the page.
    expect(await editIntents(page)).toEqual([]);
  });
});
