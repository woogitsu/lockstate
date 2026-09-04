/**
 * Playtest, 2026-09-04 — **a player with no mouse at all.**
 *
 * Not a gate. `.playtest.ts`, collected only by
 * `tests/browser/playwright.playtest.config.ts`, never by the CI config.
 *
 * The question: *a person plays this game with a keyboard and nothing else —
 * no mouse, no trackpad, no pointer of any kind. What can they reach, what is
 * walled off from them, and does the game ever tell them which is which?*
 *
 * Every act below drives the assembled application with `page.keyboard` and
 * nothing else, under a document-level tripwire that fails the act if any
 * trusted `pointerdown`/`mousedown` reaches the page. The findings are in
 * `docs/research/2026-09-04-keyboard-only.md`.
 *
 * Run one act:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5312 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-keyboard-only.playtest.ts -g "act 1"
 * ```
 */
import { expect, test, type Page } from '@playwright/test';

import { installTee, openApp, panelText, sentCommands } from './playtest-harness';

/* ------------------------------------------------------------------ */
/* the tripwire: this file may not touch a pointer                      */
/* ------------------------------------------------------------------ */

/**
 * Fails the act if a *trusted* pointer press ever reaches the page.
 *
 * Copied in intent from `tests/browser/app-shell.spec.ts`'s keyboard specs:
 * a keyboard-only claim is worth nothing if the run quietly clicked. Only
 * `isTrusted` presses count, because the application's own synthetic
 * `element.click()` calls (a `<label>` forwarding to its input, say) are not a
 * pointer a player owns.
 */
async function installTrustedPointerTripwire(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = (event: Event): void => {
      if (!event.isTrusted) return;
      (window as unknown as { lockstateTrustedPointerPresses?: string[] }).lockstateTrustedPointerPresses ??= [];
      (window as unknown as { lockstateTrustedPointerPresses: string[] }).lockstateTrustedPointerPresses.push(event.type);
    };
    document.addEventListener('pointerdown', record, true);
    document.addEventListener('mousedown', record, true);
  });
}

async function assertNoPointerWasUsed(page: Page): Promise<void> {
  const presses = await page.evaluate(
    () => (window as unknown as { lockstateTrustedPointerPresses?: string[] }).lockstateTrustedPointerPresses ?? [],
  );
  expect(presses, 'this act used a pointer, so nothing it measured is a keyboard-only claim').toEqual([]);
}

/* ------------------------------------------------------------------ */
/* what has focus, in a player's words                                  */
/* ------------------------------------------------------------------ */

interface FocusStop {
  /** `TAG.class#id`, enough to find the node in the source. */
  readonly node: string;
  /** What the control says on screen — its own text, trimmed to one line. */
  readonly says: string;
  /** The accessible name a screen reader would announce, where one differs. */
  readonly name: string;
  readonly role: string;
  /** `outlineStyle` as computed while it holds keyboard focus. `none` is invisible focus. */
  readonly outline: string;
  /** Is the control inside the visible viewport, and does it have a box at all? */
  readonly visible: boolean;
}

async function focusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return { node: String(active?.nodeName ?? 'null'), says: '', name: '', role: '', outline: '', visible: false };
    const classes = active.className.split(/\s+/u).filter((c) => c.length > 0).slice(0, 2).join('.');
    const style = getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    const label = active.getAttribute('aria-label') ?? '';
    const text = (active.textContent ?? '').replace(/\s+/gu, ' ').trim();
    return {
      node: `${active.tagName}${classes === '' ? '' : `.${classes}`}${active.id === '' ? '' : `#${active.id}`}`,
      says: text.slice(0, 60),
      name: (label === '' ? text : label).slice(0, 60),
      role: active.getAttribute('role') ?? '',
      outline: `${style.outlineStyle}/${style.outlineWidth}`,
      visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0,
    };
  });
}

/**
 * Walks `Tab` (or `Shift+Tab`) until focus returns to where it started, or the
 * bound is hit, and answers with every stop on the way.
 *
 * A walk that never returns to its start inside `bound` presses is itself the
 * finding — either the order is longer than a player will ever walk, or focus
 * is trapped.
 */
async function walkTabOrder(page: Page, key: 'Tab' | 'Shift+Tab', bound = 120): Promise<readonly FocusStop[]> {
  // The mark is on the *node*, not on what it says: two panels each have a
  // "Collapse" button and a fingerprint made of tag+text ended the walk on the
  // second one, eleven stops before the order really closed.
  const marker = `kbWalk${key === 'Tab' ? 'Fwd' : 'Back'}${Date.now() % 100000}`;
  const stops: FocusStop[] = [];
  for (let press = 0; press < bound; press += 1) {
    await page.keyboard.press(key);
    const alreadySeen = await page.evaluate((attribute) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      if (active.dataset[attribute] !== undefined) return true;
      active.dataset[attribute] = 'seen';
      return false;
    }, marker);
    if (alreadySeen && stops.length > 3) break;
    stops.push(await focusStop(page));
  }
  return stops;
}

function printOrder(label: string, stops: readonly FocusStop[]): void {
  console.log(`\n---- ${label}: ${stops.length} stops ----`);
  stops.forEach((stop, index) => {
    console.log(
      `${String(index + 1).padStart(3, ' ')}. ${stop.node}` +
        `${stop.role === '' ? '' : ` [role=${stop.role}]`}` +
        ` | says: ${JSON.stringify(stop.says)}` +
        ` | outline: ${stop.outline}` +
        ` | visible: ${stop.visible}`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* act 1 — the arrival screen, and the order a Tab actually produces    */
/* ------------------------------------------------------------------ */

test('act 1 — the focus order on arrival, forwards and backwards', async ({ page }) => {
  await installTee(page);
  await installTrustedPointerTripwire(page);
  await openApp(page);

  console.log('\n==== what the page says on arrival ====');
  console.log(await panelText(page, '.hud'));
  console.log('---- save panel ----');
  console.log(await panelText(page, '.save-panel'));

  const forwards = await walkTabOrder(page, 'Tab');
  printOrder('forwards from the document', forwards);

  // Back to the top, then the same walk backwards.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const backwards = await walkTabOrder(page, 'Shift+Tab');
  printOrder('backwards from the document', backwards);

  console.log(`\nforward stops: ${forwards.length}; backward stops: ${backwards.length}`);
  const invisible = forwards.filter((stop) => stop.outline.startsWith('none'));
  console.log(`stops with no focus outline at all: ${invisible.length}`);
  invisible.forEach((stop) => console.log(`  NO RING: ${stop.node} says ${JSON.stringify(stop.says)}`));
  const offscreen = forwards.filter((stop) => !stop.visible);
  console.log(`stops with no box on screen: ${offscreen.length}`);
  offscreen.forEach((stop) => console.log(`  OFFSCREEN: ${stop.node} says ${JSON.stringify(stop.says)}`));
  const unnamed = forwards.filter((stop) => stop.name.trim() === '');
  console.log(`stops that announce nothing: ${unnamed.length}`);
  unnamed.forEach((stop) => console.log(`  UNNAMED: ${stop.node}`));

  await assertNoPointerWasUsed(page);
});

/* ------------------------------------------------------------------ */
/* shared: getting a prison, with the keyboard alone                    */
/* ------------------------------------------------------------------ */

const TAB_BOUND = 60;

/** Presses `Tab` until `selector` holds focus; answers with the press count. */
async function tabTo(page: Page, description: string, selector: string, text?: string): Promise<number> {
  for (let presses = 1; presses <= TAB_BOUND; presses += 1) {
    await page.keyboard.press('Tab');
    const reached = await page.evaluate(
      ({ sel, want }) => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return false;
        if (!active.matches(sel)) return false;
        return want === null || (active.textContent ?? '').replace(/\s+/gu, ' ').trim() === want;
      },
      { sel: selector, want: text ?? null },
    );
    if (reached) return presses;
  }
  const ended = await focusStop(page);
  throw new Error(`${TAB_BOUND} Tab presses never reached ${description}; focus ended on ${ended.node} saying ${JSON.stringify(ended.says)}`);
}

async function createPrisonFromTheKeyboard(page: Page): Promise<{ readonly presses: number; readonly focusAfter: FocusStop }> {
  const presses = await tabTo(page, 'the New prison control', '.save-panel__button', 'New prison');
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__item')).toHaveCount(1, { timeout: 30_000 });
  return { presses, focusAfter: await focusStop(page) };
}

/* ------------------------------------------------------------------ */
/* act 2 — every tab, and what the keyboard reaches inside it           */
/* ------------------------------------------------------------------ */

test('act 2 — a prison, then the focus order inside all five tabs', async ({ page }) => {
  await installTee(page);
  await installTrustedPointerTripwire(page);
  await openApp(page);

  const created = await createPrisonFromTheKeyboard(page);
  console.log(`\n"New prison" is ${created.presses} Tab presses from arrival.`);
  console.log(`after the press, focus is on: ${created.focusAfter.node} saying ${JSON.stringify(created.focusAfter.says)}`);
  console.log('---- what the save panel says now ----');
  console.log(await panelText(page, '.save-panel'));

  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    const presses = await tabTo(page, `the ${id} tab`, `.ui-tab[data-tab="${id}"]`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    console.log(`\n================ tab "${id}" — ${presses} Tab presses to reach the tab button ================`);
    console.log(await panelText(page, '.hud__side'));
    // The walk starts from the tab button, so it measures the order a player
    // meets after choosing this tab, not one from an arbitrary position.
    const stops = await walkTabOrder(page, 'Tab');
    printOrder(`focus order with "${id}" open`, stops);
    const noRing = stops.filter((stop) => stop.outline.startsWith('none'));
    console.log(`  stops with no focus ring: ${noRing.length}${noRing.length === 0 ? '' : ` (${noRing.map((s) => s.node).join(', ')})`}`);
  }

  await assertNoPointerWasUsed(page);
});

/* ------------------------------------------------------------------ */
/* a camera probe that never touches a pointer                          */
/* ------------------------------------------------------------------ */

/**
 * Whether the world moved, read off the pixels rather than off a debug hook.
 *
 * There is no camera position on this page — `window.lockstateWorldSceneHarness`
 * exists only on the isolated world-scene harness, and the one instrument
 * `tests/browser/app-shell.spec.ts` uses instead (arm *Remove*, press a fixed
 * screen point, read the tile out of the `RemoveObject` it reports) is a
 * **mouse** press, which this file may not make.
 *
 * So: a clipped screenshot of a rectangle that is nothing but canvas, hashed.
 * The clock is paused and the prison is empty, so the only thing that can
 * change those pixels is the camera. The rectangle is chosen away from the HUD
 * so a control repainting itself cannot be mistaken for the world moving.
 */
async function bareCanvasRect(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await page.evaluate(() => {
    const { innerWidth: w, innerHeight: h } = window;
    // A 160x160 box every corner of which is canvas, walked from the middle out.
    for (let y = 40; y < h - 200; y += 20) {
      for (let x = 40; x < w - 200; x += 20) {
        const corners = [
          [x, y],
          [x + 160, y],
          [x, y + 160],
          [x + 160, y + 160],
          [x + 80, y + 80],
        ] as const;
        if (corners.every(([cx, cy]) => document.elementFromPoint(cx, cy)?.tagName.toLowerCase() === 'canvas')) {
          return { x, y, width: 160, height: 160 };
        }
      }
    }
    return null;
  });
  if (found === null) throw new Error('no 160x160 rectangle of bare canvas at this viewport to watch the world through');
  return found;
}

async function worldFingerprint(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<string> {
  // Two frames, so a pan that started on the press has been painted.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const shot = await page.screenshot({ clip, animations: 'disabled' });
  let hash = 0;
  for (const byte of shot) hash = (hash * 31 + byte) >>> 0;
  return `${shot.length}:${hash.toString(16)}`;
}

/* ------------------------------------------------------------------ */
/* act 3 — what a keyboard cannot reach at all                          */
/* ------------------------------------------------------------------ */

test('act 3 — the world, the minimap, and a select that also drives the camera', async ({ page }) => {
  await installTee(page);
  await installTrustedPointerTripwire(page);
  await openApp(page);
  await createPrisonFromTheKeyboard(page);

  // ---- 3a. what is focusable at all, and what is not -----------------
  const inventory = await page.evaluate(() => {
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => !node.hasAttribute('disabled'));
    const canvas = document.querySelector('canvas');
    const minimap = document.querySelector<HTMLElement>('.hud-minimap__surface');
    return {
      focusableCount: focusable.length,
      canvas:
        canvas === null
          ? 'ABSENT'
          : `tabIndex=${canvas.tabIndex} role=${canvas.getAttribute('role') ?? 'none'} aria-label=${canvas.getAttribute('aria-label') ?? 'none'}`,
      minimap:
        minimap === null
          ? 'ABSENT'
          : `tag=${minimap.tagName} tabIndex=${minimap.tabIndex} role=${minimap.getAttribute('role') ?? 'none'} says=${JSON.stringify((minimap.innerText ?? '').trim())}`,
      minimapIsFocusable: minimap !== null && focusable.includes(minimap),
      canvasIsFocusable: canvas !== null && focusable.includes(canvas as unknown as HTMLElement),
    };
  });
  console.log('\n---- 3a. the two surfaces a pointer owns ----');
  console.log(`focusable controls on the page: ${inventory.focusableCount}`);
  console.log(`world canvas: ${inventory.canvas} | in the tab order: ${inventory.canvasIsFocusable}`);
  console.log(`minimap surface: ${inventory.minimap}`);
  console.log(`minimap surface in the tab order: ${inventory.minimapIsFocusable}`);

  // Every key a player might try on the minimap, from the nearest thing that
  // *can* hold focus — the panel's own Collapse button — and then from the
  // surface itself, forced there the only way a keyboard cannot.
  await tabTo(page, 'the minimap panel collapse control', '.hud-minimap .ui-icon-button');
  for (const key of ['Enter', 'Space', 'ArrowRight', 'ArrowDown']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
  console.log(`after Enter/Space/arrows at the minimap, it still says: ${JSON.stringify(await panelText(page, '.hud-minimap__surface'))}`);

  // ---- 3b. the category filter, and the camera it also drives --------
  await tabTo(page, 'the Build tab', '.ui-tab[data-tab="build"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-build')).toBeVisible();
  const clip = await bareCanvasRect(page);
  console.log(`\n---- 3b. watching the world through ${JSON.stringify(clip)} ----`);

  await tabTo(page, 'the category filter', 'select.hud-build__category');
  const filterBefore = await page.locator('select.hud-build__category').inputValue();
  const worldBefore = await worldFingerprint(page, clip);
  // A control key with no binding, first: if the world changes under *this*
  // the instrument is measuring noise rather than the camera.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const worldControl = await worldFingerprint(page, clip);
  console.log(`control (Tab, Shift+Tab, no camera binding): world ${worldBefore === worldControl ? 'UNCHANGED' : 'CHANGED'}`);

  for (let index = 0; index < 4; index += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const filterAfter = await page.locator('select.hud-build__category').inputValue();
  const worldAfter = await worldFingerprint(page, clip);
  console.log(`four ArrowDown presses on the category filter: "${filterBefore}" -> "${filterAfter}"`);
  console.log(`  world ${worldBefore === worldAfter ? 'UNCHANGED' : 'ALSO MOVED'} (${worldBefore} -> ${worldAfter})`);
  console.log(`  what the page thinks owns the keyboard: ${(await focusStop(page)).node}`);

  await assertNoPointerWasUsed(page);
});

/* ------------------------------------------------------------------ */
/* act 4 — the same keyboard, in France                                 */
/* ------------------------------------------------------------------ */

/**
 * AZERTY, honestly: Playwright presses a **physical code**, which is exactly
 * what a keyboard sends. What changes between layouts is only which glyph is
 * printed on the key that sends it. So a French player reaching for the key
 * *labelled* `Z` presses `KeyW`, and one reaching for `-` presses `Digit6`.
 * Each row below is "the key a French player would press for this", and the
 * measurement is whether the game does that thing.
 */
const AZERTY_LABEL_TO_CODE: readonly { readonly printed: string; readonly code: string; readonly wanted: string }[] = [
  { printed: 'Z', code: 'KeyW', wanted: 'undo the last build change' },
  { printed: 'Q', code: 'KeyA', wanted: 'pan the camera left' },
  { printed: 'S', code: 'KeyS', wanted: 'pan the camera down' },
  { printed: 'D', code: 'KeyD', wanted: 'pan the camera right' },
  { printed: 'Y', code: 'KeyY', wanted: 'redo' },
  { printed: '-', code: 'Digit6', wanted: 'zoom out' },
  { printed: '+', code: 'Equal', wanted: 'zoom in' },
];

test('act 4 — QWERTY, AZERTY, and the keys nothing on screen names', async ({ page }) => {
  await installTee(page);
  await installTrustedPointerTripwire(page);
  await openApp(page);
  await createPrisonFromTheKeyboard(page);
  const clip = await bareCanvasRect(page);

  // Focus somewhere harmless and non-text, so the world context is active and
  // no field is swallowing the keys.
  await tabTo(page, 'the Overview tab', '.ui-tab[data-tab="overview"]');

  const moved = async (code: string, hold = 260): Promise<boolean> => {
    const before = await worldFingerprint(page, clip);
    await page.keyboard.down(code);
    await page.waitForTimeout(hold);
    await page.keyboard.up(code);
    return (await worldFingerprint(page, clip)) !== before;
  };

  console.log('\n---- 4a. the physical positions, on a QWERTY keyboard ----');
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'Equal', 'Minus', 'KeyZ', 'KeyY', 'KeyJ']) {
    console.log(`  ${code.padEnd(10, ' ')} -> world ${(await moved(code)) ? 'MOVED' : 'did not move'}`);
  }

  console.log('\n---- 4b. the same keys as a French player finds them printed ----');
  for (const row of AZERTY_LABEL_TO_CODE) {
    const did = await moved(row.code);
    console.log(
      `  a key printed "${row.printed}" sends ${row.code}; the player wants to ${row.wanted}; the world ${did ? 'MOVED' : 'did not move'}`,
    );
  }

  console.log('\n---- 4c. does anything on screen name a key at all? ----');
  const named = await page.evaluate(() => {
    const text = (document.body.innerText ?? '').replace(/\s+/gu, ' ');
    const wanted = ['arrow keys', 'undo', 'redo', 'Z', 'Ctrl', 'zoom', 'keyboard'];
    return wanted.map((needle) => `${needle}: ${text.toLowerCase().includes(needle.toLowerCase()) ? 'named' : 'NOT NAMED'}`);
  });
  named.forEach((line) => console.log(`  ${line}`));

  console.log('\n---- 4d. is there any control that rebinds a key? ----');
  const remap = await page.evaluate(() => {
    const text = (document.body.innerText ?? '').toLowerCase();
    const controls = Array.from(document.querySelectorAll<HTMLElement>('button, select, input'))
      .map((node) => (node.textContent ?? node.getAttribute('aria-label') ?? '').replace(/\s+/gu, ' ').trim().toLowerCase())
      .filter((label) => /bind|remap|control|key|shortcut|setting/u.test(label));
    return { mentionsRebinding: /rebind|remap|key binding|controls/u.test(text), controls };
  });
  console.log(`  any control whose label sounds like key binding: ${JSON.stringify(remap.controls)}`);
  console.log(`  does any sentence on the page mention rebinding: ${remap.mentionsRebinding}`);

  await assertNoPointerWasUsed(page);
});
