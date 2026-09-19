import { type Page, expect, test } from './network-changed-fixture';

/**
 * **The rail's aside slot is never smaller than what it holds** (issue
 * [#1312](https://github.com/woogitsu/lockstate/issues/1312)).
 *
 * ## The defect this file is the gate over
 *
 * `.hud__aside` is the rail's host slot: a chrome row of two 44px tap targets
 * and the save panel below it. It is `flex: 1 1 0`, so it asks the rail for no
 * height of its own and takes whatever `.hud__side` leaves -- with
 * `min-height: 25%` as the floor under that, which `hud.css` derives against a
 * 482.8px rail at 900x600.
 *
 * A quarter is a floor while the rail is tall. Under a 200 % browser page zoom
 * it is not one: the rail at a 1280x720 window is **214px**, a quarter of it is
 * 54px, and the slot's own content is **88px** -- a 46px chrome row and the
 * save panel's 26px header, neither of which can shrink. The slot has no
 * `overflow` of its own, so the difference spilled over the panel below at
 * `overflow: visible`, where no gesture reaches it.
 *
 * Measured on `ab3bf7ba` before the repair, `.hud__aside` reported
 * `scrollHeight - clientHeight` of **34px at 1280x720@100 %, 32px at
 * 1024x768@100 % and 18px at 900x600@75 %** -- the three combinations
 * `docs/IDENTITY_V5_ROLLOUT.md` and `docs/VISUAL_IDENTITY.md` both record as
 * *cleared* during the rollout, each failing on this element **alone**. That is
 * content the interface draws and the player cannot reach, which constitution
 * article 8's *"Brak utraty treści i działań"* forbids through ADR 0112
 * decision 1.
 *
 * Bisected to **`d4986dfa`** (#1201), which moved the alerts fold into
 * `.hud__side` below 720px and priced it against this slot's slack at 375x812,
 * where there is 436px of it. At a halved viewport there is none: across that
 * commit the rail is unchanged at 202.8px and `.hud__side` goes 108.2 -> 144.1,
 * straight out of this slot.
 *
 * ## Why a spec and not the playtest that found it
 *
 * `tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts` is the
 * instrument that measured all 36 combinations, and **no gate collects it** --
 * `tests/browser/browser-suites.ts` gives the reason, and #1312's own report
 * gives the consequence: *"A number that moves only when a person runs it by
 * hand cannot announce that it has gone stale. Between `2559eb14` and
 * `ab3bf7ba` nobody ran it."* This file is the three rows of that sweep which
 * the rollout claims as cleared, asserted rather than reported, so that the
 * next change to the rail's arithmetic says so on the way in.
 *
 * It deliberately does **not** assert the sweep's other four measurements, nor
 * the other 33 combinations. 16 of 36 still fail after this repair and pinning
 * that set would pin the defect in place -- which is the objection the playtest
 * itself raises to being turned into a gate. What is asserted here is one
 * invariant that is never honestly false: **a box the player cannot scroll must
 * not be smaller than the content inside it.**
 *
 * ## Watched red
 *
 * With `hud.css`'s floor put back to a bare `min-height: 25%`, all three cases
 * fail with the spills quoted above. With the repair in place, all three report
 * 0.
 */

const APP_URL = '/index.html';

const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'lockstate.settings.accessibility';

/**
 * Window size and interface scale, exactly as the sweep names them. The CSS
 * viewport is halved in each axis because that is what a 200 % browser page
 * zoom does to layout, and it is what the sweep does -- Playwright's Chromium
 * cannot be driven to a page zoom through the public API.
 */
const CASES = [
  { window: '1280x720', width: 1280, height: 720, scale: 1 },
  { window: '1024x768', width: 1024, height: 768, scale: 1 },
  { window: '900x600', width: 900, height: 600, scale: 0.75 },
] as const;

async function openAppAtScale(page: Page, scale: number): Promise<void> {
  await page.addInitScript(
    ({ key, uiScale }) => {
      try {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
      } catch {
        // A browser that will not store anything still boots; the assertion
        // below re-reads `--ui-scale` rather than assuming this landed.
      }
    },
    { key: ACCESSIBILITY_SETTINGS_STORAGE_KEY, uiScale: scale },
  );
  await page.goto(APP_URL);
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

test.describe("the rail's aside slot under a 200 % page zoom (#1312)", () => {
  for (const { window: label, width, height, scale } of CASES) {
    test(`keeps .hud__aside's content inside its own box at ${label}@${Math.round(scale * 100)}%`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: Math.round(width / 2), height: Math.round(height / 2) });
      await openAppAtScale(page, scale);

      // Non-vacuity, both halves. A scale that did not arrive would measure a
      // different combination than the one this test is named for, and an
      // empty slot has no box at all (`.hud__aside:empty { display: none }`).
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim()),
        `the stored interface scale did not arrive at ${label}`,
      ).toBe(String(scale));
      expect(
        await page.locator('.hud__aside > *').count(),
        `the rail's aside slot drew nothing at ${label}, so this case measures an empty box`,
      ).toBeGreaterThan(0);

      const slot = await page.locator('.hud__aside').evaluate((aside) => ({
        client: aside.clientHeight,
        scroll: aside.scrollHeight,
        overflowY: getComputedStyle(aside).overflowY,
      }));

      // The reason the spill is unreachable rather than merely present, and the
      // reason this assertion is about content fitting rather than about the
      // slot scrolling: were the slot ever given its own scrollport, the
      // sentence below would stop being the right one to assert.
      expect(
        slot.overflowY,
        `.hud__aside now scrolls (${slot.overflowY}) at ${label}, so the invariant this file asserts needs re-deriving`,
      ).toBe('visible');

      expect(
        slot.scroll - slot.client,
        `.hud__aside is ${slot.client}px around ${slot.scroll}px of content at ${label}@${Math.round(scale * 100)}%, ` +
          `so ${slot.scroll - slot.client}px of it is drawn where no gesture reaches it`,
      ).toBeLessThanOrEqual(1);
    });
  }
});
