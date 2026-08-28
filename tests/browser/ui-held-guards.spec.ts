import { type Page, expect, test } from '@playwright/test';
import type { HudHeldGuardsViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * Which guards are held, and the control that releases one, in a real browser
 * ([ADR 0034](../../docs/adr/0034-releasing-a-claimed-guard.md), answering
 * [ADR 0033](../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)
 * open question 3).
 *
 * ## Why this cannot be proven below this layer
 *
 * Because the claim is that **a claimed guard can be got back on a phone**, and
 * every part of that is a browser answer. The default Vitest environment is
 * `node` (`docs/TESTING.md`), so nothing headless can call `createStaffPanel` at
 * all -- and a fake DOM could not settle it either, because the failure this
 * repository has actually shipped twice is a control that is laid out,
 * hit-tests to itself and is not on screen (#220, and #285's fourth delivery row
 * 7.9px below the fold). Only `getBoundingClientRect` tells that apart from a
 * control a player can press.
 *
 * ## Why the arrival state is different here from the delivery rows'
 *
 * The delivery rows sit inside the buy disclosure, so they cost the Build panel
 * nothing until it is opened, and that measurement is what decided their
 * placement. **This block has no disclosure to hide behind**, so it does take
 * height the moment the simulation reports a held guard -- and it can, for a
 * reason that is a fact about `mountHud` rather than a hope: it builds one panel
 * for the rail's `.hud__side` slot and shows exactly one of Build, Rooms, Staff,
 * Intake and Regime, keyed on the active tab. The Staff panel is never laid out beside
 * the Build panel, so the height budget that panel has been fixed for twice
 * (#143, #174) is not a constraint on this one, and `.ui-panel.hud-staff` already
 * carries `overflow-y: auto` so that whatever the rail cannot give it is its own
 * to scroll.
 *
 * That makes the assertion here a *different* one from the deliveries': not "it
 * costs nothing closed" but **"every Release the player can see is inside the
 * panel, at every viewport, and the panel scrolls to the ones that are not"**.
 * Both numbers are measured below rather than asserted as adequate.
 *
 * ## What each block measures
 *
 * - **Nothing until something is asked**, and a sentence rather than a blank
 *   rectangle when the answer is "nobody is held".
 * - **Aiming.** Three held guards, the *second* released, and the assertion is
 *   about the two that were not pressed. A release cannot be undone -- there is
 *   no inverse command -- so a control that released "the next one" would be
 *   wrong in a way nothing else could compensate for.
 * - **Pooled rows re-aim.** The row that named guard 4 must release guard 9 once
 *   a publication puts guard 9 in it.
 * - **Reachability at every viewport**, including 375x812, which is the viewport
 *   this repository has shipped laid-out-but-unreachable controls at.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** Every viewport `ui-pending-deliveries.spec.ts` visits, so the two surfaces are measured alike. */
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1280, 720],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/** The four claim kinds' derived label keys, so a row's sentence is a real one. */
const CLAIM_KEY = {
  deployment: 'guard-claim.deployment.name',
  'incident-response': 'guard-claim.incident-response.name',
  search: 'guard-claim.search.name',
  unattributed: 'guard-claim.unattributed.name',
} as const;

function guard(entityId: number, claim: keyof typeof CLAIM_KEY, named = true) {
  return {
    entityId,
    claimLabelKey: CLAIM_KEY[claim],
    ...(named ? { roleLabelKey: 'staff-role.guard.name' } : {}),
  };
}

/**
 * `held` guards held, showing the first three, which is what the reader asks for
 * and what the block draws.
 *
 * Five by default: more than the rows, so the "and N more" line is exercised in
 * the same state the reachability assertions run in -- that line is the tallest
 * version of the block and therefore the one the panel's box has to hold.
 */
function heldGuards(held = 5): HudHeldGuardsViewModel {
  return {
    held,
    unassigned: 8 - held,
    guards: [guard(0, 'incident-response'), guard(1, 'search'), guard(2, 'deployment')].slice(0, Math.min(held, 3)),
  };
}

async function openSecurityTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('security'))).toBe(true);
}

const probe = (page: Page) => page.evaluate(() => window.lockstateUiHarness.staffProbe());
const intents = (page: Page) => page.evaluate(() => window.lockstateUiHarness.hudIntents());
const report = (page: Page, model: HudHeldGuardsViewModel | undefined) =>
  page.evaluate((next) => window.lockstateUiHarness.reportHeldGuards(next), model);

test.describe('the Staff panel held-guards block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  test('has no box at all until something has asked, at every viewport', async ({ page }) => {
    // "Nothing has asked" and "nobody is held" are different facts and must not
    // draw the same. This is the first, and it is the arrival state of every
    // session: the reader has not answered yet.
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openSecurityTab(page);

      const staff = await probe(page);
      expect(staff.visible, `panel missing at ${width}x${height}`).toBe(true);
      expect(staff.held.blockLaidOut, `held block has a box at ${width}x${height} before anything asked`).toBe(false);
      expect(staff.held.held).toBeNull();
      expect(staff.held.rows).toEqual([]);
    }
  });

  test('says nobody is assigned rather than drawing a blank rectangle', async ({ page }) => {
    // The second fact. A blank rectangle is indistinguishable from a broken one
    // -- the rule `hud.security.roles-empty` follows one section up in the same
    // panel.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, { held: 0, unassigned: 6, guards: [] });

    const { held } = await probe(page);
    expect(held.blockLaidOut).toBe(true);
    expect(held.held).toBe('0');
    expect(held.rows).toEqual([]);
    expect(held.emptyText.length).toBeGreaterThan(0);
    expect(held.emptyText).not.toContain('hud.');
    // The header still states the pair, so "nobody held" is a statement about
    // the roster rather than an absence.
    expect(held.summaryText).toContain('6');
  });

  test('states the whole roster rather than the rows it drew', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, heldGuards(5));

    const { held } = await probe(page);
    // Three rows, five held -- and the header and the overflow line both say
    // five rather than three, which is what makes the window honest.
    expect(held.rows).toHaveLength(3);
    expect(held.held).toBe('5');
    expect(held.summaryText).toContain('5');
    expect(held.summaryText).toContain('3'); // 8 - 5 free
    expect(held.moreText).toContain('2');
  });

  test('says what is holding each guard, in words rather than dotted keys', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, heldGuards(3));

    const { held } = await probe(page);
    expect(held.rows.map((row) => row.guardId)).toEqual(['0', '1', '2']);
    for (const row of held.rows) {
      expect(row.labelText.length).toBeGreaterThan(0);
      // ADR 0011's boundary, as a browser measurement: a key that reached the
      // screen unresolved would show up here as its own dotted text.
      expect(row.labelText).not.toContain('guard-claim.');
      expect(row.labelText).not.toContain('hud.');
      expect(row.labelText).not.toContain('{');
    }
    // And the three claim kinds really are three different sentences, which is
    // the whole reason the projection resolves the claim rather than reporting
    // the shared `'on-search'` phase.
    expect(new Set(held.rows.map((row) => row.labelText)).size).toBe(3);
  });

  test('names a guard the host cannot name a role for, so its row stays aimable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, { held: 1, unassigned: 5, guards: [guard(7, 'unattributed', false)] });

    const { held } = await probe(page);
    expect(held.rows).toHaveLength(1);
    expect(held.rows[0]?.guardId).toBe('7');
    expect(held.rows[0]?.labelText).toContain('7');
    expect(held.rows[0]?.releaseDisabled).toBe(false);
  });

  test('releases the guard that was pressed and leaves the others held', async ({ page }) => {
    /*
     * The aiming assertion, and the reason it is about the guards that were
     * *not* pressed: there is no inverse of a release, so a control that freed
     * "the next one" would be wrong in a way no other control could put right.
     * The second row is pressed deliberately -- a control that released the
     * first, or the last, would pass a one-row version of this test.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, heldGuards(3));

    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(1))).toBe(true);

    const dispatched = await intents(page);
    expect(dispatched.filter((intent) => intent.includes('release-guard'))).toHaveLength(1);
    // The intent names guard 1, and nothing else did.
    const release = dispatched.find((intent) => intent.includes('release-guard'));
    expect(release).toContain('1');
    expect(release).not.toContain('guardId=0');
    expect(release).not.toContain('guardId=2');
  });

  test('re-aims a pooled row at the guard that is in it now, not the one that was', async ({ page }) => {
    // The rows are pooled -- `HELD_GUARD_ROW_LIMIT` of them, reused -- because
    // each Release joins the HUD's busy group and `createBusyGroup` has `add`
    // and no `remove`. So the id has to be read at press time, and this is the
    // measurement that says it is.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, { held: 1, unassigned: 5, guards: [guard(4, 'search')] });
    expect((await probe(page)).held.rows[0]?.guardId).toBe('4');

    await report(page, { held: 1, unassigned: 5, guards: [guard(9, 'incident-response')] });
    expect((await probe(page)).held.rows[0]?.guardId).toBe('9');

    // The old id is gone from the DOM, so a press cannot reach it.
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(4))).toBe(false);
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(9))).toBe(true);
    const release = (await intents(page)).find((intent) => intent.includes('release-guard'));
    expect(release).toContain('9');
  });

  test('leaves every Release inside the panel at every viewport, scrolling to the ones that need it', async ({ page }) => {
    /*
     * The reachability measurement, and the one that would have caught #220 and
     * #285's fourth row. Every assertion is a box or an `offsetParent`, never a
     * text match: a control 7.9px below the panel's visible bottom has a full
     * box, an `offsetParent`, and hit-tests to itself.
     *
     * The tallest state is used deliberately -- three rows plus the "and N more"
     * line -- because that is the version of the block a small viewport has to
     * hold.
     */
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openSecurityTab(page);
      await report(page, heldGuards(5));

      const staff = await probe(page);
      const where = `${width}x${height}`;
      expect(staff.held.rows, `no rows at ${where}`).toHaveLength(3);

      for (const row of staff.held.rows) {
        const box = row.releaseBox;
        expect(box, `guard ${row.guardId} has no Release box at ${where}`).not.toBeNull();
        expect(row.releaseHasOffsetParent, `guard ${row.guardId} Release has no offsetParent at ${where}`).toBe(true);
        // A real box, not a collapsed one.
        expect(box!.width, `guard ${row.guardId} Release is ${box!.width}px wide at ${where}`).toBeGreaterThan(0);
        expect(box!.height, `guard ${row.guardId} Release is ${box!.height}px tall at ${where}`).toBeGreaterThan(0);
        // Inside the panel's own horizontal box, so a long sentence has not
        // pushed the button out sideways -- which is what `min-width: 0` on
        // `.hud-staff__held-text` is there to prevent.
        expect(box!.x, `guard ${row.guardId} Release starts left of the panel at ${where}`).toBeGreaterThanOrEqual(
          staff.panelBox!.x - 1,
        );
        expect(box!.right, `guard ${row.guardId} Release ends right of the panel at ${where}`).toBeLessThanOrEqual(
          staff.panelBox!.right + 1,
        );
      }

      // And the "nobody is assigned" sentence is *not* on screen above five held
      // guards. `heldEmpty` carries `.hud-staff__note` and nothing else, and the
      // `@media (max-height: 700px)` block in `hud.css` gives that class an
      // author `display: -webkit-box`, which beats the user agent's
      // `[hidden] { display: none }` -- so at 900x600, the one viewport in this
      // list 700px tall or shorter, the attribute said hidden and the browser
      // drew the line anyway, between the held rows and the count of the ones it
      // was denying the existence of. `.hud-staff__note[hidden]` is the guard
      // that closes it, and only a viewport that short can tell.
      //
      // Read with `innerText` rather than through `held.emptyText`, which cannot
      // answer this: that field takes the first laid-out `.hud-staff__note` in
      // the block, and the block ends with a permanent hint carrying the same
      // class, so it reports that hint the moment the empty line is correctly
      // gone. Only rendered text distinguishes the two.
      expect(
        await page.locator('.hud-staff__held').innerText(),
        `the "nobody is assigned" sentence is on screen beside five held guards at ${where}`,
      ).not.toContain('Nobody is assigned');

      // And vertically: either every Release is above the panel's fold, or the
      // panel can scroll to the ones that are not. Both are reachable; a control
      // below the fold in a panel that *cannot* scroll is not.
      const below = staff.held.rows.filter((row) => row.releaseBox!.bottom > staff.panelVisibleBottom + 1);
      if (below.length > 0) {
        expect(
          staff.panelOverflow,
          `${String(below.length)} Release control(s) are below the fold at ${where} and the panel does not scroll`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test('takes the block off when the tab leaves, rather than leaving ids nothing answers for', async ({ page }) => {
    // The other half of the cadence: `src/main.ts` refreshes this only while the
    // Security tab shows and clears the view model on the way out, because from
    // then on nothing is answering for these rows -- and each of them is a
    // control aimed at a guard id.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, heldGuards(3));
    expect((await probe(page)).held.rows).toHaveLength(3);

    await report(page, undefined);
    const { held } = await probe(page);
    expect(held.blockLaidOut).toBe(false);
    expect(held.rows).toEqual([]);
    // And no press can reach a row that is gone.
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(0))).toBe(false);
  });

  test('does not disturb the hire control it shares a panel with', async ({ page }) => {
    // The narrowing this section makes to ADR 0025's panel, measured: hiring is
    // still where it was, still labelled, still enabled. A section that pushed
    // the panel's own action out of reach would have traded one control for
    // another.
    await page.setViewportSize({ width: 900, height: 600 });
    await openSecurityTab(page);
    const before = await probe(page);
    await report(page, heldGuards(5));
    const after = await probe(page);

    expect(after.hireLabel).toBe(before.hireLabel);
    expect(after.hireDisabled).toBe(false);
    expect(after.options).toEqual(before.options);
    // And the hire button is still on screen -- the assertion the block's
    // arrival could plausibly have broken, since it takes real height.
    expect(await page.evaluate(() => window.lockstateUiHarness.clickHireStaff())).toBe(true);
    expect((await intents(page)).some((intent) => intent.includes('hire-staff'))).toBe(true);
  });
});
