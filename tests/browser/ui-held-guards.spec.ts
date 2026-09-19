import { type Page, expect, test } from './network-changed-fixture';
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
 * **The difference this section is named for closed on 2026-08-31, and from the
 * other side.** Issue #703 ruling 2 took the delivery rows out of the buy
 * disclosure, so they no longer cost the Build panel nothing until it is opened;
 * `build-deliveries-outside-the-fold.spec.ts` now makes of them exactly the
 * claim the paragraph above makes of these Release controls -- laid out, a real
 * tap target, on screen where they fit and reached by the panel's own scroll
 * where they do not. Nothing about *this* block changed; what changed is that
 * the two surfaces are now measured the same way, which is the better end for
 * this section to have.
 *
 * ## What each block measures
 *
 * - **Nothing until something is asked**, and a sentence rather than a blank
 *   rectangle when the answer is "nobody is held".
 * - **Aiming.** Three held guards, the *second* released, and the assertion is
 *   about the two that were not pressed. A release cannot be undone -- there is
 *   no inverse command -- so a control that released "the next one" would be
 *   wrong in a way nothing else could compensate for.
 * - **Pooled rows never re-aim.** A place in this list names one guard for as
 *   long as that guard is held, and a new one only appears in a place that has
 *   been visibly blank for `HELD_GUARD_ROW_SETTLE_MS`. This block asserted the
 *   opposite until 2026-09-17; `src/ui/hud/pooled-row-binding.ts` carries why,
 *   and the test below carries the inversion.
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
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
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

  test('never re-aims a pooled row, so a press cannot reach a guard the row never named (#877)', async ({
    page,
  }) => {
    /*
     * **The gate for the Staff panel's half of #877, and it replaces a test
     * that asserted the opposite** -- the same inversion
     * `ui-build-queue.spec.ts` records for the Build panel's queue under #860,
     * arriving here fourteen days later because #877 closed with this block
     * *"not yet measured"*.
     *
     * The replaced test was called *"re-aims a pooled row at the guard that is
     * in it now, not the one that was"*, and the defect it guarded was real:
     * the rows are pooled -- `HELD_GUARD_ROW_LIMIT` of them, reused, because
     * each Release joins the HUD's busy group and `createBusyGroup` has `add`
     * and no `remove` -- so a handler that captured its guard id at
     * construction would release whoever sat in that row two publications ago.
     * Reading the id at press time closed that, and this file proved it.
     *
     * It did not close the other direction, and the other direction is worse.
     * Reading at press time makes the id **current**; it does not make it the
     * id the player read. The label and the id are written in the same
     * synchronous paint, so a press on a row the list has re-pointed submits
     * precisely the new id and nothing on the code path can tell. And this list
     * re-points **with no press from the player at all**: a hold ends when the
     * search or the incident response that owns the guard does. So the row must
     * not be re-pointed, and both halves are asserted here -- the press reaches
     * the guard the row names, and the place a guard left names nobody until it
     * has been blank for `HELD_GUARD_ROW_SETTLE_MS`.
     *
     * **What this test deliberately does not assert, measured 2026-09-17.**
     * `ui-pending-deliveries.spec.ts`' twin asserts that the surviving rows keep
     * their boxes to the pixel; this one cannot, and the reason is worth having
     * in writing rather than as a missing line. `.hud__side` carries
     * `margin-top: auto`, so this rail is anchored to the **bottom** of the
     * viewport and a block that changes height moves its own rows rather than
     * the space below them. A held row's sentence is two lines where a delivery
     * row's is one, so blanking the label makes the row shorter, and the block
     * shrinks under it: measured here, the three Release boxes sat at y=602,
     * y=656 and y=711 before the publication and at y=599, y=651 and y=706
     * after. Three to five pixels under a 44px control is not what #877 is
     * about, but it is not nothing either, and the same anchoring produces a
     * **full row** of movement in the one-held-guard state -- see #1294, which
     * carries that measurement and is not this pull request's subject.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, {
      held: 4,
      unassigned: 4,
      guards: [guard(4, 'search'), guard(5, 'deployment'), guard(6, 'incident-response')],
    });

    const before = await probe(page);
    expect(before.held.rows.map((row) => row.guardId)).toEqual(['4', '5', '6']);
    expect(before.held.moreText).toContain('1');

    /*
     * Guard 4's search ends and guard 9 is claimed by an incident response,
     * between two publications and with no press from the player. Under
     * `rows[i] = guards[i]` this moved guard 5 up into the place guard 4's
     * label was in, guard 6 into guard 5's, and guard 9 into guard 6's -- three
     * Release controls, all of them now aimed at somebody the player never read
     * there.
     */
    await report(page, {
      held: 4,
      unassigned: 4,
      guards: [guard(5, 'deployment'), guard(6, 'incident-response'), guard(9, 'incident-response')],
    });
    const advanced = await probe(page);
    expect(advanced.held.rows.map((row) => row.guardId)).toEqual(['', '5', '6']);
    // The freed place keeps its box rather than collapsing, because collapsing
    // it would slide the two rows below it up a row's height into whatever
    // pointer is resting there -- the same defect by geometry instead of by
    // binding.
    expect(advanced.held.rows).toHaveLength(3);
    // It names nobody and says so: no label, and `aria-disabled` rather than
    // `disabled`, because `createBusyGroup` assigns `disabled` to every member
    // on every busy transition and would clear it. The authority that stops a
    // press is `row.guardId === undefined` in the panel, not this attribute.
    expect(advanced.held.rows[0]?.labelText).toBe('');
    expect(
      await page.evaluate(
        () =>
          document
            .querySelectorAll('.hud-staff__held-row')[0]
            ?.querySelector('.ui-action')
            ?.getAttribute('aria-disabled') ?? null,
      ),
    ).toBe('true');
    // Guard 9 could not be drawn, so guard 9 is counted behind the line rather
    // than put in a place a pointer may be resting on: two of four are drawn.
    expect(advanced.held.moreText).toContain('2');

    /*
     * The settle window, which is the half a first version of this rule shipped
     * without. A publication arriving inside it does not fill the place guard 4
     * left, even though it carries a guard with no row of his own.
     */
    await report(page, {
      held: 4,
      unassigned: 4,
      guards: [guard(5, 'deployment'), guard(6, 'incident-response'), guard(9, 'incident-response')],
    });
    expect((await probe(page)).held.rows.map((row) => row.guardId)).toEqual(['', '5', '6']);

    // Past the window the waiting guard takes it, so the block does not go on
    // drawing two rows for four held guards for ever.
    await page.waitForTimeout(1_200);
    await report(page, {
      held: 4,
      unassigned: 4,
      guards: [guard(5, 'deployment'), guard(6, 'incident-response'), guard(9, 'incident-response')],
    });
    const refilled = await probe(page);
    expect(refilled.held.rows.map((row) => row.guardId)).toEqual(['9', '5', '6']);
    expect(refilled.held.moreText).toContain('1');

    /*
     * And a press reaches the guard the row names, throughout. Guard 4 is gone
     * from the DOM entirely -- a re-aiming pool would have put a live control
     * where his label was -- and guard 6, whom the player has been reading in
     * the same place since the first publication, is who the press releases.
     */
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(4))).toBe(false);
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(6))).toBe(true);
    const dispatched = (await intents(page)).filter((intent) => intent.includes('release-guard'));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('6');
  });

  test('draws its rows again after the tab has been away, with no publication to unstick it (#877, #88)', async ({
    page,
  }) => {
    /*
     * The Staff panel's half of the same regression the Build panel's queue
     * shipped under #860 and this block nearly shipped again: nothing refreshes
     * this list from another tab, so leaving the Staff tab publishes
     * `undefined` and `paintHeld` empties every pooled place. A `freedAtMs`
     * stamped there puts every place inside its settle window, and the
     * publication that arrives when the player comes back is refused by all
     * three -- with no later publication to unstick them once the window
     * expires, because a held guard's list only moves when the simulation says
     * so. `app-shell.spec.ts`'s #88 sweep is where that is otherwise found.
     *
     * A place with no box carries no settle window: see `pooled-row-binding.ts`.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSecurityTab(page);
    await report(page, heldGuards(3));
    expect((await probe(page)).held.rows).toHaveLength(3);

    /*
     * `report(page, undefined)` and not only a tab click, because the two are
     * different facts and only the first is the one under test. Leaving the tab
     * hides the whole Staff panel, which takes this block's box away without
     * `paintHeld` running at all; what `src/main.ts:2542` does beside that is
     * `applyHeldGuards(undefined)` -- *"leaving takes the block off, because
     * from here on nothing is refreshing it"* -- and that is the call that
     * empties the pooled places. A tab click through this harness does not make
     * it, so a test that only clicked would pass whatever `paintHeld` did with
     * `freedAtMs` and prove nothing.
     */
    await report(page, undefined);
    expect((await probe(page)).held.blockLaidOut).toBe(false);
    await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
    await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
    await report(page, heldGuards(3));

    const returned = await probe(page);
    expect(returned.held.rows.map((row) => row.guardId)).toEqual(['0', '1', '2']);
    for (const row of returned.held.rows) {
      expect(row.releaseHasOffsetParent, `guard ${row.guardId}'s Release has no offsetParent`).toBe(true);
      expect(row.releaseDisabled, `guard ${row.guardId}'s Release is disabled`).toBe(false);
      expect(row.releaseBox?.height ?? 0, `guard ${row.guardId}'s Release has no height`).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(2))).toBe(true);
    const dispatched = (await intents(page)).filter((intent) => intent.includes('release-guard'));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('2');
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
