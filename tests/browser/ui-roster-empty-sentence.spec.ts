import { defaultMessageCatalogEn } from '../../src/services/localization';
import { expect, test } from './network-changed-fixture';

/**
 * **What a brand-new prison's roster says, read off the page a player loads.**
 *
 * The owner ruled the sentence on 2026-09-03, choosing it among candidates put
 * to them, and it is asserted here byte for byte:
 *
 * > No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.
 *
 * **Corrected in place on 2026-09-19, on the owner's ruling, and the earlier
 * wording is deliberately not kept beside it.** The owner's 2026-09-03
 * sentence named one of `room.cell`'s four authored requirements -- the bed --
 * and #933 measured the cost: a player who follows it literally is short a
 * toilet, and the panel that would say so arrives selected on another room
 * type. Offered a corrected sentence *beside* theirs or theirs *edited*, the
 * owner chose *"Poprawić Twoje zdanie w miejscu"* ("correct your sentence in
 * place"), knowing that this repository normally keeps a superseded text
 * visible. The supersession is recorded in the commit and the pull request;
 * the catalogue carries one sentence. The words are ours under `AGENTS.md`'s
 * fourth reservation as narrowed on 2026-09-04, their **truth** is not, and
 * `tests/foundation/cell-instruction-requirement-contract.test.ts` is what
 * keeps them complete against the catalogue.
 *
 * ## Why this is a `.spec.ts` and not one more harness case
 *
 * `tests/browser/ui-shell.spec.ts` already drives the Regime panel from a
 * hand-written `HudPrisonerRosterViewModel` with `total: 0, everAdmitted:
 * false`, and that is the right shape for the panel's *branching* -- it is
 * where the three roster states (nothing asked, never admitted, fully
 * discharged) are told apart. What it cannot say is that the state it feeds
 * the panel is **the state a new game actually starts in**: the view model is
 * supplied by the test, so a change that stopped `projectPrisonerRoster` ever
 * reporting `everAdmitted: false` to the real page would leave every one of
 * those cases green with the sentence unreachable in play.
 *
 * So this file starts from `index.html`, presses *New prison*, and opens the
 * Regime tab with nothing else done to the prison. Nothing between the worker
 * and the words is stubbed: the projection runs in the simulation worker, the
 * pull is `src/main.ts`'s own `refreshPrisonerRoster` on the `select-tab`
 * intent, and the sentence is resolved by the page's localizer out of the
 * bundled catalogue.
 *
 * `.playtest.ts` is not collected by CI (`playwright.config.ts` matches only
 * `*.spec.ts`), so a permanent gate on a ruled sentence has to be a spec.
 *
 * ## The literal, and why the key is checked beside it rather than instead
 *
 * The expected text is typed out here rather than read from
 * `defaultMessageCatalogEn`. Reading it from the catalogue would make the
 * assertion hold for *any* wording -- the fixture would be supplying both
 * sides of the comparison, which `docs/TESTING.md` forbids -- and the whole
 * subject of this file is that one specific ruled sentence is what a player
 * reads. The catalogue is still consulted, for the one thing a literal cannot
 * check: that the page resolved a **key** at all rather than painting text
 * that happens to match.
 *
 * ## What it does not cover
 *
 * **The prison that emptied out -- no longer uncovered, and no longer this
 * file's gap.** This paragraph read: *"That state draws no sentence today, it
 * is owed its own, and authoring one is the owner's under `AGENTS.md`'s fourth
 * exclusion."* The owner ruled it on 2026-09-03 -- *"This prison is empty.
 * Take somebody in to start again."* -- so `roster-panel.ts` no longer gates
 * the box on `everAdmitted` at all; it gates the *wording* on it, and an empty
 * roster always draws a line. The companion gate is
 * `ui-shell.spec.ts`'s *"a prison everybody has left says so in its own
 * sentence, not the new-prison one"*, which was rewritten in the same commit
 * and now asserts both directions: the new-prison sentence absent, the
 * emptied-out sentence present. **This file is still only about the
 * never-admitted state**, and deliberately so -- what it uniquely proves is
 * that the state a real new game starts in is reachable in play, which a
 * hand-fed view model cannot say.
 */

/** The application entry, as `app-shell.spec.ts` names it. */
const APP_URL = '/index.html';

/**
 * The ruled sentence, verbatim -- the owner's of 2026-09-03 as corrected in
 * place on their 2026-09-19 ruling (#933).
 *
 * Two sentences in one string, and the shape the owner ruled is kept: the
 * state, then the one thing a player can do about it. What the correction adds
 * is the other three requirements `room.cell` authors, none of them as a
 * figure that would rot when the catalogue moves.
 */
const RULED_SENTENCE = 'No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.';

/** The key the panel is supposed to have resolved to reach that text. */
const ROSTER_EMPTY_KEY = 'hud.regime.roster-empty';

/** `hud.<something>` still on screen means a key never resolved. */
const RAW_KEY = /\b(?:hud|save|account|brand)\.[a-z0-9-]+\.[a-z0-9.-]+/;

test.describe('the empty prisoner roster on the page a player loads', () => {
  test('a brand-new prison reads the owner’s ruled sentence, resolved from its key', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('#game-root canvas');
    await page.waitForSelector('.hud');
    await page.waitForSelector('.save-panel');

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    // The session has to *exist* before the roster is asked for anything --
    // `app-shell.spec.ts`'s `waitForSession` records what a press inside the
    // `simulation/initialize` window costs. A day of `1` is the worker's own
    // first clock publication, which follows `simulation/ready`.
    await expect(
      page.locator('.hud-clock__day'),
      'the prison was never created, so the roster has nothing to report on',
    ).toHaveText('1');

    // Nothing is built, nobody is admitted, and no clock is started: this is
    // the arrival state of the tab for every new player.
    await page.locator('.ui-tab[data-tab="day-plan"]').click();

    const roster = page.locator('.hud-regime__roster');
    await expect(roster, 'the Regime tab drew no roster block at all').toBeVisible();
    // From the projection, not from the panel's row budget: `data-total` is
    // `PrisonerRosterPage.total` over the whole live population.
    await expect(roster).toHaveAttribute('data-total', '0');
    // The half `ui-shell.spec.ts` cannot establish: a real new prison really
    // does report "nobody ever" rather than "everybody left".
    await expect(
      roster,
      'a new prison reported `everAdmitted`, so the state this sentence belongs to is unreachable in play',
    ).toHaveAttribute('data-ever-admitted', 'false');

    // The note line, excluding the "and N more" line that shares its class.
    const empty = roster.locator('.hud-regime__note:not(.hud-regime__roster-more)');
    await expect(empty, 'the empty prison drew a blank box instead of the sentence').toBeVisible();
    await expect(empty).toHaveText(RULED_SENTENCE);
    await expect(roster.getByRole('button', { name: RULED_SENTENCE })).toBeVisible();
    await empty.press('Enter');
    await expect(page.locator('.hud')).toHaveAttribute('data-active-tab', 'build');
    await expect(page.locator('.hud-build__arm')).toBeFocused();

    // No row is drawn under it, and nothing claims to be withholding rows.
    expect(await roster.locator('.hud-regime__roster-row:not([hidden])').count()).toBe(0);
    await expect(roster.locator('.hud-regime__roster-more')).toBeHidden();

    // What the literal above cannot check: that this text arrived through the
    // localizer. If the key were missing the panel would paint the key itself,
    // and if the catalogue held different words the page would be rendering
    // something other than what the owner ruled.
    expect(
      defaultMessageCatalogEn.messages[ROSTER_EMPTY_KEY],
      `${ROSTER_EMPTY_KEY} must carry the owner's ruled sentence in the bundled default locale`,
    ).toBe(RULED_SENTENCE);
    const panelText = await page.locator('.hud-regime').innerText();
    expect(panelText, `an unresolved message key is on screen: ${panelText}`).not.toMatch(RAW_KEY);
  });
});
