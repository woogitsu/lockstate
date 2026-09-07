import { type Page, expect, test } from '@playwright/test';
import {
  buildAndPopulate,
  fastForwardToMax,
  installTee,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

/**
 * **Can a player read this game?** — a legibility pass, not a mechanics one.
 *
 * ## What it judges
 *
 * Presentation only. Three sibling passes judge the first twenty minutes, the
 * mid-game and building; this one judges whether what those passes see can be
 * *read*, which is disjoint from whether it works. The owner's standing design
 * directive is *"gra ma być łatwa przyjazna do grania, a nie jakieś ukryte
 * funkcje"* — easy and friendly to play, not full of hidden features — and a
 * readout a player cannot decode is a hidden feature however visible it is.
 *
 * ## Acts
 *
 * 1. **375x812, every tab.** For each of the five tabs: what is clipped by an
 *    ancestor's `overflow`, what overflows its own box, what scrolls with no
 *    static sign that it scrolls, and what is laid out entirely outside the
 *    viewport. Screenshot per tab.
 * 2. **The status strip in two seconds.** Every chip's rendered text, in DOM
 *    order, with its character count and its rendered box — at 1440x900 and
 *    at 375x812 — so the report can say what a player's eye lands on and what
 *    it never reaches.
 * 3. **Colour alone.** Every rendered `[data-tone]` on the page with its
 *    computed foreground, background and the contrast of each against the
 *    surface behind it, plus whether the same element carries a word. A state
 *    distinguished only by hue is a state some players cannot distinguish.
 * 4. **Wordless readouts.** Every visible leaf whose whole text is a number,
 *    a symbol or nothing, with the accessible name available beside it.
 * 5. **Every sentence.** The full visible prose of every panel, dumped so it
 *    can be read against itself.
 *
 * Acts 2-5 run twice: on a fresh prison, and again on a **built and populated**
 * one, because an empty prison hides every readout that only has something to
 * say once there is something to say.
 *
 * ## It is not a gate
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so
 * **nothing in CI collects this file.** A playtest is evidence, never a gate.
 * Run it with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5401 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-can-a-player-read-this.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or every actor atlas fails to decode
 * and the run reports a world with nobody in it — and passes anyway.
 *
 * Findings: `docs/research/2026-09-03-can-a-player-read-this.md`.
 */

const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

const TABS = ['overview', 'build', 'rooms', 'security', 'regime'] as const;
type TabId = (typeof TABS)[number];

interface Clip {
  readonly selector: string;
  readonly what: string;
  readonly detail: string;
}

/**
 * Every legibility failure the DOM can be asked about directly, in one page
 * evaluation.
 *
 * Four separate questions, deliberately not merged: an element can overflow
 * its own box without being clipped (the box just spills), be clipped by an
 * ancestor without overflowing anything itself, scroll without saying so, or
 * sit off the viewport entirely. They have different cures and a single
 * "broken" flag would hide which one applies.
 */
async function probeLegibility(page: Page): Promise<{
  readonly clipped: readonly Clip[];
  readonly overflowing: readonly Clip[];
  readonly silentScrollers: readonly Clip[];
  readonly offViewport: readonly Clip[];
  readonly viewport: { readonly width: number; readonly height: number };
}> {
  return page.evaluate(() => {
    const describe = (node: Element): string => {
      const el = node as HTMLElement;
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('hud') || c.startsWith('ui-') || c.startsWith('save')).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${cls === '' ? '' : `.${cls}`}`;
    };

    const clipped: Clip[] = [];
    const overflowing: Clip[] = [];
    const silentScrollers: Clip[] = [];
    const offViewport: Clip[] = [];

    const roots = document.querySelectorAll('.hud, .save-panel');
    const seen = new Set<Element>();
    for (const root of roots) {
      for (const node of [root, ...root.querySelectorAll('*')]) {
        if (seen.has(node)) continue;
        seen.add(node);
        const el = node as HTMLElement;
        if (el.hidden) continue;
        const rects = el.getClientRects();
        if (rects.length === 0) continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.opacity === '0') continue;

        const selector = describe(el);
        const text = (el.textContent ?? '').trim().slice(0, 60);

        // 1. Does the element's own content spill its own padding box?
        const spillX = el.scrollWidth - el.clientWidth;
        const spillY = el.scrollHeight - el.clientHeight;
        const scrollsX = /auto|scroll/.test(style.overflowX);
        const scrollsY = /auto|scroll/.test(style.overflowY);
        if (spillX > 1 && !scrollsX && style.overflowX !== 'hidden') {
          overflowing.push({ selector, what: 'content wider than its box', detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} (+${spillX}px), overflow-x: ${style.overflowX}` });
        }
        if (spillY > 1 && !scrollsY && style.overflowY !== 'hidden') {
          overflowing.push({ selector, what: 'content taller than its box', detail: `scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight} (+${spillY}px), overflow-y: ${style.overflowY}` });
        }

        // 2. A scroll container with no scrollbar gutter and no other static
        //    sign gives a player nothing to notice. `offsetWidth - clientWidth`
        //    minus the borders is the gutter a classic scrollbar occupies; an
        //    overlay scrollbar occupies zero and appears only while scrolling.
        if ((scrollsY && spillY > 1) || (scrollsX && spillX > 1)) {
          const gutterY = el.offsetWidth - el.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
          const gutterX = el.offsetHeight - el.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
          silentScrollers.push({
            selector,
            what: scrollsY ? 'scrolls vertically' : 'scrolls horizontally',
            detail: `hidden ${scrollsY ? spillY : spillX}px of ${scrollsY ? el.scrollHeight : el.scrollWidth}px; scrollbar gutter ${scrollsY ? gutterY.toFixed(1) : gutterX.toFixed(1)}px; scrollbar-width: ${style.scrollbarWidth}; text starts "${text}"`,
          });
        }

        // 3. Clipped by an ancestor that hides its overflow.
        for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
          const ps = getComputedStyle(parent);
          if (!/hidden|clip|auto|scroll/.test(ps.overflow + ps.overflowX + ps.overflowY)) continue;
          const pb = parent.getBoundingClientRect();
          const outBottom = box.bottom - pb.bottom;
          const outRight = box.right - pb.right;
          const outLeft = pb.left - box.left;
          const outTop = pb.top - box.top;
          const worst = Math.max(outBottom, outRight, outLeft, outTop);
          if (worst > 2) {
            const side = worst === outBottom ? 'below' : worst === outRight ? 'past the right edge' : worst === outLeft ? 'past the left edge' : 'above';
            clipped.push({
              selector,
              what: `clipped ${side} ${describe(parent)}`,
              detail: `${worst.toFixed(1)}px outside; element ${box.width.toFixed(0)}x${box.height.toFixed(0)} @${box.left.toFixed(0)},${box.top.toFixed(0)} in ${pb.width.toFixed(0)}x${pb.height.toFixed(0)} @${pb.left.toFixed(0)},${pb.top.toFixed(0)}; overflow ${ps.overflowX}/${ps.overflowY}; text "${text}"`,
            });
            break;
          }
        }

        // 4. Laid out beyond the viewport with nothing scrolling it there.
        if (box.top > window.innerHeight || box.bottom < 0 || box.left > window.innerWidth || box.right < 0) {
          offViewport.push({ selector, what: 'entirely outside the viewport', detail: `${box.width.toFixed(0)}x${box.height.toFixed(0)} @${box.left.toFixed(0)},${box.top.toFixed(0)}; viewport ${window.innerWidth}x${window.innerHeight}; text "${text}"` });
        }
      }
    }
    return { clipped, overflowing, silentScrollers, offViewport, viewport: { width: window.innerWidth, height: window.innerHeight } };
  });
}

/** Every chip in the status strip, in DOM order, with its box and its text. */
async function probeStrip(page: Page) {
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll('.hud-strip__metrics .ui-stat')];
    return chips.map((chip) => {
      const el = chip as HTMLElement;
      const box = el.getBoundingClientRect();
      const label = el.querySelector('.ui-stat__label');
      const value = el.querySelector('.ui-stat__value');
      const badge = el.querySelector('.ui-badge');
      const bar = el.querySelector('.ui-bar');
      const sr = [...el.querySelectorAll('.ui-sr-only, .sr-only, [class*="sr-only"]')].map((n) => (n.textContent ?? '').trim());
      const visible = (el.innerText ?? '').replace(/\n+/g, ' ').trim();
      return {
        metric: el.getAttribute('data-metric') ?? '?',
        tone: el.getAttribute('data-tone') ?? 'none',
        label: (label?.textContent ?? '').trim(),
        value: (value?.textContent ?? '').trim(),
        badge: badge === null ? null : { text: (badge.textContent ?? '').trim(), tone: badge.getAttribute('data-tone') ?? 'none' },
        bar: bar === null ? null : { filled: bar.querySelectorAll('[data-filled="true"]').length, total: bar.querySelectorAll('.ui-bar__segment').length, tone: bar.getAttribute('data-tone') ?? 'none', label: (bar.getAttribute('aria-label') ?? '').trim() },
        srOnly: sr,
        visibleText: visible,
        visibleChars: visible.replace(/\s/g, '').length,
        box: { w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.left), y: Math.round(box.top) },
        inViewport: box.right <= window.innerWidth + 0.5 && box.bottom <= window.innerHeight + 0.5 && box.left >= -0.5 && box.top >= -0.5,
      };
    });
  });
}

/**
 * Every rendered tone-bearing element, with the contrast of its foreground
 * against its own painted background and of that background against the
 * surface behind it.
 *
 * Computed from `getComputedStyle`, walking ancestors for the first opaque
 * background, so the numbers are what the compositor actually produced rather
 * than what the token file says it should have.
 */
async function probeTones(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string): [number, number, number, number] => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      const body = m?.[1];
      if (body === undefined) return [0, 0, 0, 0];
      const parts = body.split(/[,\s/]+/).filter((p) => p !== '').map(Number);
      const at = (i: number): number => parts[i] ?? 0;
      return [at(0) / 255, at(1) / 255, at(2) / 255, parts.length > 3 ? at(3) : 1];
    };
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = (rgb: readonly number[]) => 0.2126 * lin(rgb[0] ?? 0) + 0.7152 * lin(rgb[1] ?? 0) + 0.0722 * lin(rgb[2] ?? 0);
    const cr = (a: readonly number[], b: readonly number[]) => {
      const la = lum(a); const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const over = (fg: readonly number[], a: number, bg: readonly number[]): number[] =>
      fg.map((c, i) => c * a + (bg[i] ?? 0) * (1 - a));

    // The first opaque paint behind `el`, composited down the ancestor chain.
    const behind = (el: Element): readonly number[] => {
      const stack: { readonly rgb: readonly number[]; readonly alpha: number }[] = [];
      for (let n: Element | null = el.parentElement; n !== null; n = n.parentElement) {
        const [r, g, b, a] = parse(getComputedStyle(n).backgroundColor);
        if (a === 0) continue;
        stack.push({ rgb: [r, g, b], alpha: a });
        if (a >= 1) break;
      }
      let base: readonly number[] = [0, 0, 0];
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const layer = stack[i];
        if (layer === undefined) continue;
        base = over(layer.rgb, layer.alpha, base);
      }
      return base;
    };

    const out: Record<string, unknown>[] = [];
    for (const node of document.querySelectorAll('.hud [data-tone], .save-panel [data-tone], .hud [data-kind], .save-panel [data-kind]')) {
      const el = node as HTMLElement;
      if (el.hidden || el.getClientRects().length === 0) continue;
      const style = getComputedStyle(el);
      const surface = behind(el);
      const [br, bg, bb, ba] = parse(style.backgroundColor);
      const painted: readonly number[] = ba === 0 ? surface : over([br, bg, bb], ba, surface);
      const [fr, fg2, fb, fa] = parse(style.color);
      const fore: readonly number[] = fa >= 1 ? [fr, fg2, fb] : over([fr, fg2, fb], fa, painted);
      const text = (el.innerText ?? el.textContent ?? '').replace(/\n+/g, ' ').trim();
      out.push({
        selector: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(/\s+/)[0] ?? ''}`,
        tone: el.getAttribute('data-tone') ?? el.getAttribute('data-kind'),
        text: text.slice(0, 48),
        hasWords: /[A-Za-z]{3}/.test(text),
        fg: style.color,
        bg: style.backgroundColor,
        fgOnOwnBg: Number(cr(fore, painted).toFixed(2)),
        ownBgOnSurface: Number(cr(painted, surface).toFixed(2)),
        fgOnSurface: Number(cr(fore, surface).toFixed(2)),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      });
    }
    return out;
  });
}

/** Every visible leaf whose whole text carries no word. */
async function probeWordless(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, unknown>[] = [];
    for (const node of document.querySelectorAll('.hud *, .save-panel *')) {
      const el = node as HTMLElement;
      if (el.children.length > 0) continue;
      if (el.hidden || el.getClientRects().length === 0) continue;
      const text = (el.textContent ?? '').trim();
      const svg = el.querySelector === undefined ? null : el.closest('svg');
      if (svg !== null) continue;
      if (text === '') continue;
      if (/[A-Za-z]{2}/.test(text)) continue;
      // Walk up for anything that names it.
      let named = '';
      for (let n: Element | null = el; n !== null && named === ''; n = n.parentElement) {
        const label = n.getAttribute('aria-label') ?? '';
        const title = n.getAttribute('title') ?? '';
        if (label !== '') named = `aria-label="${label}"`;
        else if (title !== '') named = `title="${title}"`;
        if (n.classList.contains('hud') || n.classList.contains('save-panel')) break;
      }
      const parentText = (el.parentElement?.innerText ?? '').replace(/\n+/g, ' ').trim();
      out.push({
        selector: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 2).join('.')}`,
        text,
        named: named === '' ? 'NOTHING NAMES IT' : named,
        siblingText: parentText.slice(0, 70),
      });
    }
    return out;
  });
}

/**
 * One legibility sweep of the whole HUD at one viewport, printed.
 *
 * A factory rather than a bare function because both acts run exactly the same
 * sweep and only the stage label differs; two copies would drift.
 */
function makeSweep(page: Page, stage: string): (size: { width: number; height: number }) => Promise<void> {
  const log = (line: string): void => {
    console.log(`[read] ${line}`);
  };
  const shots = 'test-results/legibility';
  return async (size) => {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    log(`===== ${stage} @ ${size.width}x${size.height} =====`);

    const strip = await probeStrip(page);
    log(`-- status strip: ${strip.length} chips`);
    for (const chip of strip) {
      log(
        `   ${chip.metric.padEnd(13)} tone=${String(chip.tone).padEnd(8)} ${chip.box.w}x${chip.box.h}@${chip.box.x},${chip.box.y}` +
          `${chip.inViewport ? '' : '  OFF-VIEWPORT'} chars=${chip.visibleChars}` +
          ` text=${JSON.stringify(chip.visibleText)}` +
          (chip.badge === null ? '' : ` badge=${JSON.stringify(chip.badge.text)}(${chip.badge.tone})`) +
          (chip.bar === null ? '' : ` bar=${chip.bar.filled}/${chip.bar.total}(${chip.bar.tone}) aria=${JSON.stringify(chip.bar.label)}`) +
          (chip.srOnly.length === 0 ? '' : ` sr=${JSON.stringify(chip.srOnly)}`),
      );
    }
    log(`   strip box ${JSON.stringify(await page.locator('.hud-strip').boundingBox())}`);
    log(`   metrics row box ${JSON.stringify(await page.locator('.hud-strip__metrics').boundingBox())}`);

    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(500);
      const probe = await probeLegibility(page);
      log(`-- tab ${id}: viewport ${probe.viewport.width}x${probe.viewport.height}`);
      const say = (title: string, rows: readonly Clip[]): void => {
        if (rows.length === 0) {
          log(`   ${title}: none`);
          return;
        }
        log(`   ${title}: ${rows.length}`);
        for (const row of rows.slice(0, 16)) log(`     ${row.selector} — ${row.what} — ${row.detail}`);
        if (rows.length > 16) log(`     ...and ${rows.length - 16} more`);
      };
      say('CLIPPED by an ancestor', probe.clipped);
      say('OVERFLOWING its own box', probe.overflowing);
      say('SCROLLS with no static sign', probe.silentScrollers);
      say('OFF the viewport', probe.offViewport);
      await page.screenshot({ path: `${shots}/${stage}-${size.width}x${size.height}-${id}.png` });
    }

    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      const tones = await probeTones(page);
      const wordless = await probeWordless(page);
      log(`-- tab ${id}: ${tones.length} tone-bearing elements, ${wordless.length} wordless leaves`);
      for (const t of tones) {
        log(
          `   TONE ${String(t.tone).padEnd(9)} ${String(t.selector).padEnd(28)}` +
            ` fg/ownBg ${String(t.fgOnOwnBg).padStart(6)}:1  ownBg/surface ${String(t.ownBgOnSurface).padStart(6)}:1  fg/surface ${String(t.fgOnSurface).padStart(6)}:1` +
            ` ${t.hasWords ? 'has words' : 'NO WORDS'} ${t.fontSize}/${t.fontWeight} ${JSON.stringify(t.text)}`,
        );
      }
      for (const w of wordless) {
        log(`   WORDLESS ${String(w.selector).padEnd(34)} ${JSON.stringify(w.text).padEnd(12)} ${w.named} | around it: ${JSON.stringify(w.siblingText)}`);
      }
    }

    log(`-- prose, ${stage} @ ${size.width}x${size.height}`);
    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      for (const selector of ['.hud-strip', '.hud-intake', '.hud-build', '.hud-rooms', '.hud-staff', '.hud-regime', '.hud-alerts', '.hud__refusal', '.hud__events', '.save-panel']) {
        const text = await panelText(page, selector);
        if (text.includes('ABSENT') || text.includes('not laid out')) {
          log(`   [${id}] ${selector}: ${text.split(':').pop()?.trim()}`);
          continue;
        }
        log(`   [${id}] ${selector}:`);
        for (const line of text.split('\n')) log(`       | ${line}`);
      }
    }
  };
}

test.describe('can a player read this', () => {
  test.setTimeout(600_000);

  /**
   * Two acts as two tests, so each can be run alone with `-g`.
   *
   * Act A needs no simulation at all and takes under a minute; act B builds a
   * prison and is the one that suffers when the machine is busy. Splitting
   * them is what lets act A's findings be pushed while act B is still
   * running, per `docs/AGENT_WORKFLOW.md` §2's rule that nothing may exist
   * only in the container.
   */
  test('act A — a fresh prison, read at 1440x900 and at 375x812', async ({ page }) => {
    const sweep = makeSweep(page, 'fresh');
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await sweep(DESKTOP);
    await sweep(PHONE);
    console.log('[read] act A done');
  });

  test('act B — a built and populated prison, read at 1440x900 and at 375x812', async ({ page }) => {
    const sweep = makeSweep(page, 'populated');
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    // Built at 1440x900 because the reachable tile set the mouse route needs
    // is a desktop one (#878); the phone sweep then reads a prison that
    // exists rather than an empty world. The build is not the finding.
    await buildAndPopulate(page, { beds: 6, admits: 8, guards: 2, label: 'read-build' });
    await fastForwardToMax(page);
    await page.waitForTimeout(20_000);
    console.log(`[read] built and populated; strip now: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    await sweep(DESKTOP);
    await sweep(PHONE);
    console.log('[read] act B done');
  });
});
