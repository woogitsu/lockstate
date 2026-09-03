import { type Page, expect, test } from '@playwright/test';
import {
  buildAndPopulate,
  buy,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

/**
 * **The whole screen, read as one thing.**
 *
 * The sibling pass `playtest-2026-09-03-can-a-player-read-this.playtest.ts`
 * judges one surface at a time: what is clipped, what overflows, what contrast
 * a tone renders at. This one asks the five questions that only fall out when
 * the screen is taken as a single object a person is sitting in front of:
 *
 * 1. **Named or not.** Every visible run of digits in the HUD, and whether
 *    anything inside its own visual grouping says what it counts. The output
 *    is a count, so "how many unlabelled numbers are on screen" has an answer
 *    rather than an impression.
 * 2. **Fine, or never measured.** The same readouts on a prison where nothing
 *    has happened yet and on one that is running well. A readout that renders
 *    identically in both states cannot be used to tell them apart, and those
 *    are two very different things for a player to be told.
 * 3. **The moment it happens.** Something important is made to happen while
 *    the player is looking at a tab that does not report it. The whole
 *    document's text is diffed across the event, so the answer is "these
 *    bytes changed on screen" and not "the panel would have said so".
 * 4. **Three numbers that should move.** The world is changed so that each of
 *    three specific readouts must move, and each is read before and after with
 *    the clock paused first, because a live clock is still spending.
 * 5. **Pressable, or only dressed as it.** `addEventListener` is instrumented
 *    from before the first script runs, so every element on screen can be
 *    sorted by what it *looks* like against what it *does*.
 *
 * Not a gate: `tests/browser/playwright.config.ts` is `testMatch:
 * /.*\.spec\.ts$/` and never collects a `.playtest.ts`. Run it with
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5411 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-the-whole-screen-at-once.playtest.ts
 * ```
 */

const DESKTOP = { width: 1440, height: 900 } as const;
const TABS = ['overview', 'build', 'rooms', 'security', 'regime'] as const;

const log = (line: string): void => {
  console.log(`[screen] ${line}`);
};

/**
 * Where the screenshots go.
 *
 * **Not under `test-results/`, and that is a measured cost rather than a
 * preference.** Playwright wipes its `outputDir` -- `test-results` by default
 * -- before every run, so the first pass of this file wrote nine screenshots
 * there and the second pass deleted all nine before a single one had been
 * looked at. `LOCKSTATE_PLAYTEST_SHOTS` overrides; the fallback is a sibling
 * directory nothing else owns.
 */
const SHOTS = process.env['LOCKSTATE_PLAYTEST_SHOTS'] ?? 'playtest-shots';

/**
 * Records, for every element that ever gets one, which event types it is
 * listening for -- installed before the app's first script so nothing is
 * missed.
 *
 * A `WeakMap` keyed on the target rather than a data attribute, because a data
 * attribute would change what `getComputedStyle` and the app's own
 * `[data-*]` selectors see and the probe would then be measuring itself.
 */
async function installListenerCensus(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const census = new WeakMap<EventTarget, Set<string>>();
    (window as unknown as { lockstateListenerCensus: WeakMap<EventTarget, Set<string>> }).lockstateListenerCensus =
      census;
    const real = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patched(
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      const existing = census.get(this);
      if (existing === undefined) census.set(this, new Set([type]));
      else existing.add(type);
      real.call(this, type, listener, options);
    };
  });
}

interface NumberSighting {
  readonly token: string;
  readonly leafText: string;
  readonly leafSelector: string;
  readonly hops: number;
  readonly namerSelector: string;
  readonly namerText: string;
  readonly srOnly: string;
  readonly ariaOrTitle: string;
}

/**
 * Every visible run of digits inside the HUD, with the nearest thing that
 * names it and **how far away that thing is**.
 *
 * ## Why a distance and not a boolean
 *
 * The first version of this probe asked "is there a word inside the number's
 * smallest grouping", and its grouping walk stopped on any class matching
 * `^ui-[a-z]+$` -- which `ui-value` is. Every chip value in the strip
 * therefore reported its own `<span>` as its grouping, found no word in it,
 * and was counted UNNAMED. It is not: `PRISONERS` is a sibling 1 hop up.
 * That run claimed 71 unnamed tokens on a populated prison and the number was
 * an artifact of this function.
 *
 * So it now measures the thing that has no free parameters: `hops`, the number
 * of steps from the number's own leaf up to the **nearest ancestor whose text
 * contains a word of three or more letters**, plus that ancestor's whole text.
 * A player judges the pairing from those two facts -- 1 hop to a 12-character
 * ancestor is a labelled number; 6 hops to a 400-character panel is a number
 * sitting alone. `hops` is `-1` when no ancestor up to `.hud` has a word at
 * all, which is the only unarguable "nothing on screen names this".
 *
 * Screen-reader-only text is reported in its own column rather than counted as
 * naming, because this pass asks what is *on screen*.
 */
async function probeNumbers(page: Page): Promise<readonly NumberSighting[]> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c !== '').slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${cls === '' ? '' : `.${cls}`}`;
    };
    const isScreenReaderOnly = (el: HTMLElement): boolean => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        (box.width <= 1 && box.height <= 1) ||
        style.clip === 'rect(0px, 0px, 0px, 0px)' ||
        style.clipPath === 'inset(50%)'
      );
    };
    /** The visible text of `el`, with every screen-reader-only span removed. */
    const visibleTextOf = (el: HTMLElement): string => {
      let text = '';
      const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent ?? '';
          return;
        }
        if (!(node instanceof HTMLElement)) return;
        if (node.hidden || isScreenReaderOnly(node)) return;
        for (const child of node.childNodes) walk(child);
      };
      for (const child of el.childNodes) walk(child);
      return text.replace(/\s+/g, ' ').trim();
    };

    const out: NumberSighting[] = [];
    for (const root of document.querySelectorAll('.hud, .save-panel')) {
      for (const node of root.querySelectorAll('*')) {
        const el = node as HTMLElement;
        if (el.children.length > 0) continue;
        if (el.hidden || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.opacity === '0') continue;
        if (el.closest('svg') !== null) continue;
        if (isScreenReaderOnly(el)) continue;
        const leafText = (el.textContent ?? '').trim();
        if (!/\d/.test(leafText)) continue;
        // A leaf that already carries its own word is named at zero distance.
        const tokens = leafText.match(/-?[\d][\d,._:%\u00d7\/]*/g) ?? [leafText];

        let hops = -1;
        let namer: HTMLElement | undefined;
        let step = 0;
        for (let n: HTMLElement | null = el; n !== null; n = n.parentElement) {
          if (/[A-Za-z]{3}/.test(visibleTextOf(n))) {
            hops = step;
            namer = n;
            break;
          }
          if (n === root) break;
          step += 1;
        }
        const srOnly = [...el.parentElement?.querySelectorAll('*') ?? []]
          .filter((n) => n instanceof HTMLElement && isScreenReaderOnly(n))
          .map((n) => (n.textContent ?? '').trim())
          .filter((t) => t !== '')
          .join(' / ');
        const aria = el.getAttribute('aria-label') ?? el.parentElement?.getAttribute('aria-label') ?? '';
        const title = el.getAttribute('title') ?? el.parentElement?.getAttribute('title') ?? '';
        for (const token of tokens) {
          out.push({
            token,
            leafText: leafText.slice(0, 40),
            leafSelector: describe(el),
            hops,
            namerSelector: namer === undefined ? 'NONE' : describe(namer),
            namerText: namer === undefined ? '' : visibleTextOf(namer).slice(0, 90),
            srOnly: srOnly.slice(0, 70),
            ariaOrTitle: `${aria}${title === '' ? '' : ` | title=${title}`}`.slice(0, 70),
          });
        }
      }
    }
    return out;
  });
}

/** Chip-by-chip state of the strip: what it says, and in what tone. */
async function readStrip(page: Page): Promise<readonly Record<string, string>[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.hud-strip__metrics .ui-stat')].map((chip) => {
      const el = chip as HTMLElement;
      const badge = el.querySelector('.ui-badge');
      const bar = el.querySelector('.ui-bar');
      return {
        metric: el.getAttribute('data-metric') ?? '?',
        label: (el.querySelector('.ui-stat__label')?.textContent ?? '').trim(),
        value: (el.querySelector('.ui-stat__value')?.textContent ?? '').trim(),
        tone: el.getAttribute('data-tone') ?? 'none',
        badge: badge === null ? '' : `${(badge.textContent ?? '').trim()}(${badge.getAttribute('data-tone') ?? '-'})`,
        bar:
          bar === null
            ? ''
            : `${bar.querySelectorAll('[data-filled="true"]').length}/${bar.querySelectorAll('.ui-bar__segment').length}`,
        title: el.getAttribute('title') ?? '',
        visible: (el.innerText ?? '').replace(/\n+/g, ' · ').trim(),
      };
    }),
  );
}

/** Every tab's whole visible prose, keyed by tab, for diffing across an event. */
async function readWholeScreen(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  out['__strip'] = (await panelText(page, '.hud-strip')).replace(/\n+/g, ' | ');
  for (const id of TABS) {
    await tab(page, id).click();
    await page.waitForTimeout(300);
    out[id] = (await panelText(page, '.hud')).replace(/\n+/g, '\n');
  }
  return out;
}

/** What is on screen right now without changing tab -- the player's actual view. */
async function readCurrentView(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    const save = document.querySelector<HTMLElement>('.save-panel');
    return `${hud?.innerText ?? ''}\n---save---\n${save?.innerText ?? ''}`.replace(/\n{2,}/g, '\n').trim();
  });
}

function diffLines(before: string, after: string): { readonly gone: readonly string[]; readonly arrived: readonly string[] } {
  const a = new Set(before.split('\n').map((l) => l.trim()).filter((l) => l !== ''));
  const b = new Set(after.split('\n').map((l) => l.trim()).filter((l) => l !== ''));
  return {
    gone: [...a].filter((l) => !b.has(l)),
    arrived: [...b].filter((l) => !a.has(l)),
  };
}

interface Affordance {
  readonly selector: string;
  readonly text: string;
  readonly cursor: string;
  readonly role: string;
  readonly listeners: string;
  readonly looksPressable: boolean;
  readonly isPressable: boolean;
  readonly box: string;
}

/**
 * Every visible element sorted by what it looks like against what it does.
 *
 * *Looks* pressable: `cursor: pointer`, or a painted box with a border and a
 * background that is not its parent's -- the shape of a button. *Is*
 * pressable: a `<button>`/`<a href>`/`[role=button]`, or an element the
 * listener census saw take a `click`/`pointerdown`/`mousedown`.
 */
async function probeAffordances(page: Page): Promise<readonly Affordance[]> {
  return page.evaluate(() => {
    const census = (window as unknown as { lockstateListenerCensus?: WeakMap<EventTarget, Set<string>> })
      .lockstateListenerCensus;
    const describe = (el: Element): string => {
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c !== '').slice(0, 3).join('.');
      const data = el.getAttribute('data-metric') ?? el.getAttribute('data-tab') ?? '';
      return `${el.tagName.toLowerCase()}${cls === '' ? '' : `.${cls}`}${data === '' ? '' : `[${data}]`}`;
    };
    const out: Affordance[] = [];
    for (const root of document.querySelectorAll('.hud, .save-panel')) {
      for (const node of [root, ...root.querySelectorAll('*')]) {
        const el = node as HTMLElement;
        if (el.hidden || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.opacity === '0') continue;
        const box = el.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) continue;

        const listeners = census?.get(el);
        const listenerList = listeners === undefined ? [] : [...listeners];
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') ?? '';
        const isPressable =
          tag === 'button' ||
          (tag === 'a' && el.hasAttribute('href')) ||
          tag === 'input' ||
          tag === 'select' ||
          role === 'button' ||
          role === 'tab' ||
          listenerList.some((t) => /^(click|pointerdown|mousedown|keydown|change|input)$/.test(t));

        const parentBg = el.parentElement === null ? '' : getComputedStyle(el.parentElement).backgroundColor;
        const paintedBox =
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          style.backgroundColor !== parentBg &&
          parseFloat(style.borderTopWidth) + parseFloat(style.borderLeftWidth) > 0 &&
          parseFloat(style.paddingLeft) >= 4;
        const looksPressable = style.cursor === 'pointer' || paintedBox;

        /*
         * A label or an icon inside a real `<button>` inherits `cursor:
         * pointer` and has no listener of its own, so the first run of this
         * probe reported 101 "looks pressable and is not" on the Build tab and
         * almost all of them were the insides of controls that work. Only an
         * element with **no pressable ancestor** is a false affordance.
         */
        let insideSomethingPressable = false;
        for (let n: HTMLElement | null = el.parentElement; n !== null; n = n.parentElement) {
          const parentTag = n.tagName.toLowerCase();
          const parentRole = n.getAttribute('role') ?? '';
          const parentListeners = census?.get(n);
          if (
            parentTag === 'button' ||
            parentTag === 'label' ||
            (parentTag === 'a' && n.hasAttribute('href')) ||
            parentRole === 'button' ||
            parentRole === 'tab' ||
            [...(parentListeners ?? [])].some((t) => /^(click|pointerdown|mousedown)$/.test(t))
          ) {
            insideSomethingPressable = true;
            break;
          }
          if (n.classList.contains('hud') || n.classList.contains('save-panel')) break;
        }
        if (insideSomethingPressable && !isPressable) continue;

        if (!looksPressable && isPressable === false) continue;
        out.push({
          selector: describe(el),
          text: (el.innerText ?? '').replace(/\n+/g, ' · ').trim().slice(0, 46),
          cursor: style.cursor,
          role: role === '' ? tag : `${tag}[role=${role}]`,
          listeners: listenerList.length === 0 ? 'none' : listenerList.join(','),
          looksPressable,
          isPressable,
          box: `${Math.round(box.width)}x${Math.round(box.height)}`,
        });
      }
    }
    return out;
  });
}

/** The FUNDS chip's value, as a player reads it. */
async function fundsOnScreen(page: Page): Promise<string> {
  return (await page.locator('[data-metric="funds"] .ui-stat__value').innerText()).trim();
}

async function pauseClock(page: Page): Promise<void> {
  await page.locator('.hud-strip__transport button').nth(0).click();
  // The press is a simulation command and lands 36-55 ticks late; the wait is
  // for the clock to actually stop, not for the press to be delivered.
  await page.waitForTimeout(6000);
}

test.describe('the whole screen at once', () => {
  test.setTimeout(600_000);

  test('act 1 — every number on screen, and whether anything names it', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    for (const stage of ['fresh', 'populated'] as const) {
      if (stage === 'populated') {
        await buildAndPopulate(page, { beds: 6, admits: 8, guards: 2, label: 'screen' });
        await fastForwardToMax(page);
        await page.waitForTimeout(25_000);
      }
      log(`===== ACT 1 / ${stage} =====`);
      let named = 0;
      let unnamed = 0;
      for (const id of TABS) {
        await tab(page, id).click();
        await page.waitForTimeout(400);
        const sightings = await probeNumbers(page);
        log(`-- tab ${id}: ${sightings.length} number tokens on screen`);
        for (const s of sightings) {
          if (s.hops >= 0 && s.hops <= 2) named += 1;
          else unnamed += 1;
          log(
            `   hops=${String(s.hops).padStart(2)} ${JSON.stringify(s.token).padEnd(12)} leaf=${s.leafSelector.padEnd(34)}` +
              ` namer=${s.namerSelector.padEnd(30)} ${JSON.stringify(s.namerText)}` +
              (s.srOnly === '' ? '' : ` sr=${JSON.stringify(s.srOnly)}`) +
              (s.ariaOrTitle === '' ? '' : ` aria=${JSON.stringify(s.ariaOrTitle)}`),
          );
        }
        await page.screenshot({ path: `${SHOTS}/${stage}-${id}.png`, fullPage: false });
      }
      log(`ACT 1 / ${stage} TOTAL: ${named} tokens named within 2 hops, ${unnamed} named only further away or not at all, across the five tabs`);
      log(`ACT 1 / ${stage} strip: ${JSON.stringify(await readStrip(page))}`);
    }
  });

  test('act 2 — fine, or never measured', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    log('===== ACT 2 / a prison where nothing has happened yet =====');
    const freshStrip = await readStrip(page);
    for (const chip of freshStrip) log(`   FRESH ${(chip.metric ?? '?').padEnd(13)} ${JSON.stringify(chip.visible)} tone=${chip.tone} badge=${chip.badge} title=${JSON.stringify(chip.title)}`);
    const freshScreen = await readWholeScreen(page);

    await tab(page, 'overview').click();
    await buildAndPopulate(page, { beds: 8, admits: 6, guards: 3, label: 'act2' });
    await fastForwardToMax(page);
    await page.waitForTimeout(40_000);

    log('===== ACT 2 / a prison that is running well: 6 prisoners, 8 beds, 3 guards =====');
    const wellStrip = await readStrip(page);
    for (const chip of wellStrip) log(`   WELL  ${(chip.metric ?? '?').padEnd(13)} ${JSON.stringify(chip.visible)} tone=${chip.tone} badge=${chip.badge} title=${JSON.stringify(chip.title)}`);
    const wellScreen = await readWholeScreen(page);
    log(`   counts: ${JSON.stringify(await latestCounts(page))}`);

    log('-- chips that read IDENTICALLY on an unmeasured prison and a healthy one:');
    for (const fresh of freshStrip) {
      const well = wellStrip.find((c) => c.metric === fresh.metric);
      if (well === undefined) continue;
      if (fresh.visible === well.visible && fresh.tone === well.tone) {
        log(`   SAME ${(fresh.metric ?? '?').padEnd(13)} ${JSON.stringify(fresh.visible)} tone=${fresh.tone}`);
      } else {
        log(`   moved ${(fresh.metric ?? '?').padEnd(12)} ${JSON.stringify(fresh.visible)} -> ${JSON.stringify(well.visible)} tone ${fresh.tone} -> ${well.tone}`);
      }
    }
    for (const id of ['__strip', ...TABS]) {
      const d = diffLines(freshScreen[id] ?? '', wellScreen[id] ?? '');
      const freshLines = (freshScreen[id] ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
      const wellLines = new Set((wellScreen[id] ?? '').split('\n').map((l) => l.trim()));
      const shared = freshLines.filter((l) => wellLines.has(l));
      log(`-- tab ${id}: ${shared.length} of ${freshLines.length} lines are WORD-FOR-WORD the same on both prisons`);
      for (const line of shared) log(`   SAME | ${line}`);
      for (const line of d.arrived.slice(0, 20)) log(`   only on the healthy prison | ${line}`);
    }
  });

  test('act 3 — is it visible at the moment it happens', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await buildAndPopulate(page, { beds: 2, admits: 2, guards: 1, label: 'act3' });
    await fastForwardToMax(page);
    await page.waitForTimeout(20_000);

    /*
     * Event one: admissions with nowhere to put anybody. The Intake panel on
     * Overview reports it; the player is on Build, which is where a player who
     * has just finished building actually is.
     */
    await tab(page, 'build').click();
    await page.waitForTimeout(500);
    const beforeAdmit = await readCurrentView(page);
    log(`===== ACT 3 / event 1: six admissions into a two-bed prison, while looking at BUILD =====`);
    log(`   view before (Build tab):\n${beforeAdmit.split('\n').map((l) => `       | ${l}`).join('\n')}`);
    const admitFromOverview = async (times: number): Promise<void> => {
      await tab(page, 'overview').click();
      for (let i = 0; i < times; i += 1) {
        await page.locator('.hud-intake__admit').click();
        await page.waitForTimeout(200);
      }
      await tab(page, 'build').click();
    };
    await admitFromOverview(6);
    await page.waitForTimeout(12_000);
    const afterAdmit = await readCurrentView(page);
    const d1 = diffLines(beforeAdmit, afterAdmit);
    log(`   lines that ARRIVED on the Build tab when six prisoners had nowhere to sleep: ${d1.arrived.length}`);
    for (const line of d1.arrived) log(`   ARRIVED | ${line}`);
    for (const line of d1.gone) log(`   GONE    | ${line}`);
    log(`   what the Overview tab says now: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
    log(`   counts: ${JSON.stringify(await latestCounts(page))}`);

    /*
     * Event two: spend the prison into its overdraft while looking at Regime.
     * The FUNDS chip is on the strip, which is always on screen -- so this one
     * should pass, and a pass is the refuting sample for event one.
     */
    log(`===== ACT 3 / event 2: spend into the overdraft, while looking at REGIME =====`);
    /*
     * **The order is placed from the Build tab and then the player goes back to
     * Regime**, and the first version of this act got that wrong in a way worth
     * recording: it called `buy` while the Regime tab was open, and `buy`
     * addresses `.hud-build__list [data-buildable="wall-brick"]`, which is not
     * laid out there. Playwright's click has no default timeout, so the act sat
     * on an invisible control until the 600 s test timeout and event 2 produced
     * nothing at all. The event under test is the *balance crossing into the
     * overdraft*, which happens over the seconds after the press as deliveries
     * are paid for -- so the press being on another tab costs the measurement
     * nothing, as long as the watching is done from Regime.
     */
    await tab(page, 'build').click();
    await page.waitForTimeout(400);
    log(`   funds chip before the order: ${await fundsOnScreen(page)}`);
    await buy(page, 'wall-brick', 600);
    await tab(page, 'regime').click();
    await page.waitForTimeout(400);
    const beforeSpend = await readCurrentView(page);
    log(`   funds chip on returning to Regime: ${await fundsOnScreen(page)}`);
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(5000);
      log(`   t+${(i + 1) * 5}s on Regime: funds chip ${JSON.stringify(await fundsOnScreen(page))}`);
    }
    const afterSpend = await readCurrentView(page);
    const d2 = diffLines(beforeSpend, afterSpend);
    log(`   funds chip after: ${await fundsOnScreen(page)}`);
    log(`   lines that ARRIVED: ${d2.arrived.length}`);
    for (const line of d2.arrived) log(`   ARRIVED | ${line}`);
    for (const line of d2.gone) log(`   GONE    | ${line}`);
    log(`   strip now: ${JSON.stringify(await readStrip(page))}`);

    /*
     * And the whole prose of every tab, because act 2's line-set diff can only
     * say which lines are *new* and a line that is new in one tab and old in
     * another disappears from it. What a player can read is the text, printed.
     */
    log('===== ACT 3 / every sentence on every tab of this prison =====');
    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      log(`-- tab ${id}`);
      for (const line of (await readCurrentView(page)).split('\n')) log(`       | ${line}`);
    }
  });

  test('act 4 — three numbers made to move', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await buildAndPopulate(page, { beds: 6, admits: 4, guards: 1, label: 'act4' });
    await fastForwardToMax(page);
    await page.waitForTimeout(20_000);

    const snapshot = async (label: string): Promise<void> => {
      const strip = await readStrip(page);
      const pick = (id: string): string => strip.find((c) => c.metric === id)?.visible ?? '?';
      log(
        `   ${label.padEnd(34)} FUNDS=${JSON.stringify(pick('funds'))} EARNED=${JSON.stringify(pick('earned-today'))}` +
          ` COVERAGE=${JSON.stringify(pick('coverage'))} PRISONERS=${JSON.stringify(pick('prisoners'))}` +
          ` day=${(await page.locator('.hud-clock__day').innerText()).trim()} counts=${JSON.stringify(await latestCounts(page))}`,
      );
    };

    log('===== ACT 4 / number one: FUNDS, against a purchase =====');
    await pauseClock(page);
    await snapshot('paused, before the purchase');
    await buy(page, 'bed-wooden', 3);
    await page.waitForTimeout(8000);
    await snapshot('paused, after buying 3 beds');

    log('===== ACT 4 / number two: COVERAGE, against a hire =====');
    await tab(page, 'security').click();
    log(`   staff panel before: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    await fastForwardToMax(page);
    await page.waitForTimeout(4000);
    // Admit until somebody is unguarded, which is the rung the chip's word
    // changes on.
    await tab(page, 'overview').click();
    for (let i = 0; i < 8; i += 1) {
      await page.locator('.hud-intake__admit').click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(15_000);
    await pauseClock(page);
    await snapshot('paused, 12 prisoners on 1 guard');
    await tab(page, 'security').click();
    log(`   staff panel with 12 on 1 guard: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    for (let i = 0; i < 4; i += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(400);
    }
    await fastForwardToMax(page);
    await page.waitForTimeout(15_000);
    await pauseClock(page);
    await snapshot('paused, after hiring 4 more guards');
    await tab(page, 'security').click();
    log(`   staff panel after the hires: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

    log('===== ACT 4 / number three: EARNED TODAY, across a day boundary =====');
    await fastForwardToMax(page);
    for (let i = 0; i < 14; i += 1) {
      await page.waitForTimeout(10_000);
      const strip = await readStrip(page);
      log(
        `   t+${(i + 1) * 10}s day=${(await page.locator('.hud-clock__day').innerText()).trim()}` +
          ` progress=${(await page.locator('.hud-clock__day-progress').innerText()).trim()}` +
          ` EARNED=${JSON.stringify(strip.find((c) => c.metric === 'earned-today')?.visible ?? '?')}` +
          ` FUNDS=${JSON.stringify(strip.find((c) => c.metric === 'funds')?.visible ?? '?')}`,
      );
    }
  });

  test('act 5 — pressable, or only dressed as it', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await buildAndPopulate(page, { beds: 4, admits: 5, guards: 2, label: 'act5' });
    await fastForwardToMax(page);
    await page.waitForTimeout(20_000);

    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      const rows = await probeAffordances(page);
      const dressed = rows.filter((r) => r.looksPressable && !r.isPressable);
      const undressed = rows.filter((r) => !r.looksPressable && r.isPressable);
      log(`===== ACT 5 / tab ${id}: ${rows.length} candidates, ${dressed.length} LOOK pressable and are not, ${undressed.length} ARE pressable and do not look it =====`);
      for (const r of dressed) log(`   DRESSED-ONLY ${r.selector.padEnd(38)} ${r.box.padEnd(9)} cursor=${r.cursor.padEnd(8)} listeners=${r.listeners.padEnd(12)} ${JSON.stringify(r.text)}`);
      for (const r of undressed) log(`   NO-AFFORDANCE ${r.selector.padEnd(37)} ${r.box.padEnd(9)} cursor=${r.cursor.padEnd(8)} listeners=${r.listeners.padEnd(12)} role=${r.role} ${JSON.stringify(r.text)}`);
    }

    // The nine chips specifically, since one of them is documented as a thing
    // "pressing it is what a player reading the chip would go on to do".
    log('===== ACT 5 / the nine status chips, one by one =====');
    const chips = await page.evaluate(() => {
      const census = (window as unknown as { lockstateListenerCensus?: WeakMap<EventTarget, Set<string>> })
        .lockstateListenerCensus;
      return [...document.querySelectorAll('.hud-strip__metrics .ui-stat')].map((chip) => {
        const el = chip as HTMLElement;
        const own = census?.get(el);
        const inner = [...el.querySelectorAll('*')].filter((n) => (census?.get(n)?.size ?? 0) > 0).length;
        return {
          metric: el.getAttribute('data-metric') ?? '?',
          tag: el.tagName.toLowerCase(),
          cursor: getComputedStyle(el).cursor,
          tabIndex: el.tabIndex,
          role: el.getAttribute('role') ?? '',
          listeners: own === undefined ? [] : [...own],
          descendantsWithListeners: inner,
          title: el.getAttribute('title') ?? '',
        };
      });
    });
    for (const c of chips) log(`   CHIP ${c.metric.padEnd(13)} <${c.tag}> cursor=${c.cursor.padEnd(8)} tabIndex=${c.tabIndex} role=${JSON.stringify(c.role)} listeners=${JSON.stringify(c.listeners)} descendantsWithListeners=${c.descendantsWithListeners} title=${JSON.stringify(c.title)}`);

    // And whether a press on one does anything at all, measured rather than
    // inferred from the absence of a listener.
    for (const metric of ['prisoners', 'coverage', 'incidents', 'funds']) {
      const before = await readCurrentView(page);
      await page.locator(`[data-metric="${metric}"]`).click({ force: true });
      await page.waitForTimeout(800);
      const after = await readCurrentView(page);
      const d = diffLines(before, after);
      log(`   PRESS ${metric.padEnd(13)} changed ${d.arrived.length} line(s) on screen${d.arrived.length === 0 ? ' — NOTHING HAPPENED' : `: ${JSON.stringify(d.arrived.slice(0, 4))}`}`);
    }
  });
  /**
   * A sixth act, added after act 1 refuted the pass's own opening hypothesis.
   *
   * Act 1 asked how many numbers on screen are unlabelled and answered
   * "essentially none" -- 158 of 163 tokens name themselves one or two hops
   * away. So the question moved: the readouts *have* words, and the thing left
   * to check is whether the words change when the world does. This act takes
   * the one readout a new player asks about first -- **is the game running?** --
   * and measures whether the screen answers it, because a new session is
   * constructed paused and the whole sighted clock readout is `Day 1 / 0% /
   * x1`, which is what a running clock prints too (#629, 2026-08-30).
   *
   * `transportPressedStates` exists and sets `aria-pressed`, so the state is
   * on the wire. What this measures is whether it reaches a pixel: the
   * computed background, border and colour of each of the three buttons in
   * each of the three clock states, and the contrast between the pressed one
   * and its two neighbours.
   */
  test('act 6 — does the screen say whether the clock is running', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const readTransport = async (label: string): Promise<void> => {
      const rows = await page.evaluate(() => {
        const parse = (c: string): readonly number[] => {
          const m = /rgba?\(([^)]+)\)/.exec(c);
          const parts = (m?.[1] ?? '').split(/[,\s/]+/).filter((p) => p !== '').map(Number);
          return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255, parts[3] ?? 1];
        };
        const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        const lum = (rgb: readonly number[]): number =>
          0.2126 * lin(rgb[0] ?? 0) + 0.7152 * lin(rgb[1] ?? 0) + 0.0722 * lin(rgb[2] ?? 0);
        return [...document.querySelectorAll('.hud-strip__transport button')].map((node) => {
          const el = node as HTMLElement;
          const style = getComputedStyle(el);
          return {
            label: el.getAttribute('aria-label') ?? '',
            pressed: el.getAttribute('aria-pressed') ?? 'absent',
            disabled: el.hasAttribute('disabled'),
            background: style.backgroundColor,
            backgroundLuminance: Number(lum(parse(style.backgroundColor)).toFixed(4)),
            border: `${style.borderTopWidth} ${style.borderTopColor}`,
            color: style.color,
            outline: style.outlineWidth,
            boxShadow: style.boxShadow.slice(0, 40),
            opacity: style.opacity,
          };
        });
      });
      const speed = (await page.locator('.hud-clock__speed').innerText()).trim();
      const day = (await page.locator('.hud-clock__day').innerText()).trim();
      const progress = (await page.locator('.hud-clock__day-progress').innerText()).trim();
      log(`   ${label.padEnd(26)} sighted clock reads "Day ${day} / ${progress} / ${speed}"`);
      for (const r of rows) {
        log(
          `      ${r.label.padEnd(14)} aria-pressed=${r.pressed.padEnd(7)} bg=${r.background.padEnd(24)}` +
            ` L=${String(r.backgroundLuminance).padEnd(8)} border=${r.border.padEnd(28)} colour=${r.color} shadow=${JSON.stringify(r.boxShadow)}`,
        );
      }
      const luminances = rows.map((r) => r.backgroundLuminance);
      const distinct = new Set(luminances.map((l) => l.toFixed(4))).size;
      log(`      -> ${distinct} distinct button backgrounds out of ${rows.length}; luminances ${JSON.stringify(luminances)}`);
    };

    log('===== ACT 6 / the clock, in each of its states =====');
    await readTransport('as a new session arrives');
    // The tick is read from the worker rather than from the readout, so
    // "running" is a fact about the simulation and not about the paint.
    const t0 = await currentTick(page);
    await page.waitForTimeout(8000);
    const t1 = await currentTick(page);
    log(`   worker tick went ${t0} -> ${t1} over 8s with nothing pressed`);

    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(8000);
    await readTransport('after pressing Play');
    const t2 = await currentTick(page);
    await page.waitForTimeout(8000);
    log(`   worker tick went ${t2} -> ${await currentTick(page)} over 8s after Play`);

    await fastForwardToMax(page);
    await page.waitForTimeout(8000);
    await readTransport('after two Fast forwards');

    await page.locator('.hud-strip__transport button').nth(0).click();
    await page.waitForTimeout(8000);
    await readTransport('after pressing Pause');
    const t3 = await currentTick(page);
    await page.waitForTimeout(8000);
    log(`   worker tick went ${t3} -> ${await currentTick(page)} over 8s after Pause`);
  });

  /**
   * A seventh act, written after act 2 measured a healthy prison reading
   * **`6 · COVERAGE · Covered`** on the strip and **`GUARD COVERAGE 1 of 1
   * Covered`** on the Security panel at the same moment, with three guards
   * hired.
   *
   * Two readouts, one screen. They are not the same quantity:
   * `projectStatusMetrics`' `coverage` chip is `counts.prisonersCovered` --
   * **people on the covered rung** -- and the panel's summary is
   * `hud.security.coverage-summary`, `'{assigned} of {required}'`, over
   * `HudStaffCoverageViewModel`, which is **guards**. They also do not share a
   * derivation: the chip's word comes off `coverageTone`'s prisoner rungs and
   * the panel's off `describeStaffCoverage`'s guard shortage, and
   * `HudStaffCoverageViewModel.assigned` counts a guard *"already on post, or
   * still walking there"* while a prisoner is only on the covered rung once
   * somebody is actually standing the post.
   *
   * So the two can print different words about the same prison, and this act
   * samples them **in one page evaluation** -- not two reads a second apart,
   * which would make any disagreement a timing artifact -- once a second
   * across a hire and across the walk that follows it.
   */
  test('act 7 — two readouts called coverage, sampled together', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await buildAndPopulate(page, { beds: 6, admits: 6, guards: 0, label: 'act7' });

    /** Both coverage readouts, plus the staff count, in one evaluation. */
    const bothAtOnce = async (): Promise<Record<string, string>> =>
      page.evaluate(() => {
        const chip = document.querySelector<HTMLElement>('[data-metric="coverage"]');
        const panel = document.querySelector<HTMLElement>('.hud-staff__coverage');
        return {
          stripValue: (chip?.querySelector('.ui-stat__value')?.textContent ?? '?').trim(),
          stripBadge: (chip?.querySelector('.ui-badge')?.textContent ?? '(none)').trim(),
          stripTone: chip?.getAttribute('data-tone') ?? 'none',
          panelSummary: (panel?.querySelector('.hud-staff__coverage-summary')?.textContent ?? '?').trim(),
          panelBadge: (panel?.querySelector('.ui-badge')?.textContent ?? '(none)').trim(),
          panelTone: panel?.getAttribute('data-tone') ?? 'none',
          panelHint: (panel?.querySelector('.hud-staff__note')?.textContent ?? '').trim(),
          panelLaidOut: String(panel !== null && !panel.hidden && panel.getClientRects().length > 0),
          staffChip: (
            document.querySelector<HTMLElement>('[data-metric="staff"] .ui-stat__value')?.textContent ?? '?'
          ).trim(),
          prisonersChip: (
            document.querySelector<HTMLElement>('[data-metric="prisoners"] .ui-stat__value')?.textContent ?? '?'
          ).trim(),
        };
      });

    const sample = async (label: string, seconds: number): Promise<void> => {
      for (let i = 0; i < seconds; i += 1) {
        const both = await bothAtOnce();
        const agree = both['stripBadge'] === both['panelBadge'];
        log(
          `   ${label.padEnd(22)} t+${String(i).padStart(2)}s` +
            ` STRIP ${String(both['stripValue']).padStart(3)} "${String(both['stripBadge'])}" (${String(both['stripTone'])})` +
            ` | PANEL ${String(both['panelSummary']).padStart(7)} "${String(both['panelBadge'])}" (${String(both['panelTone'])})` +
            ` | prisoners=${String(both['prisonersChip'])} staff=${String(both['staffChip'])}` +
            ` | ${agree ? 'same word' : 'DIFFERENT WORDS ON ONE SCREEN'}` +
            ` | hint=${JSON.stringify(both['panelHint'])}`,
        );
        await page.waitForTimeout(1000);
      }
    };

    log('===== ACT 7 / six prisoners, nobody hired =====');
    // The Security tab has to be the open one for the panel to be laid out, so
    // both readouts are on screen together for a player as well as for a probe.
    await tab(page, 'security').click();
    await page.waitForTimeout(500);
    await fastForwardToMax(page);
    await sample('6 prisoners, 0 guards', 20);

    log('===== ACT 7 / across a single hire, and the walk to post that follows =====');
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    await page.locator('.hud-staff__hire').click();
    await sample('one guard hired', 60);

    log('===== ACT 7 / and a second hire =====');
    await page.locator('.hud-staff__hire').click();
    await sample('two guards hired', 45);
    log(`   counts: ${JSON.stringify(await latestCounts(page))}`);
    log(`   whole staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
  });

  /**
   * An eighth act, written after act 5's affordance sweep put
   * `span.ui-eyebrow.hud-minimap__placeholder` -- **"MINIMAP IS NOT AVAILABLE
   * YET"**, 198x26, `cursor: pointer`, no listener of its own -- on screen on
   * every one of the five tabs.
   *
   * `hud.ts` gives `.hud-minimap__surface` a real `click` listener that calls
   * `onMinimapNavigate` and moves the camera, and swaps the sentence for
   * `hud.minimap.navigable` **only once a click has actually landed
   * somewhere**. So the question this act answers by pressing rather than by
   * reading: on arrival the panel says the minimap is not available, and if a
   * press proves otherwise, the only player who is ever told is the one who
   * ignored the sentence.
   *
   * The sentence changing is itself the proof that the camera moved -- the
   * swap is gated on `onMinimapNavigate` returning `true` -- so this needs no
   * access to the camera, which `AGENTS.md` boundary 1 keeps out of the HUD
   * anyway.
   */
  test('act 8 — the minimap says it is not available, and then answers a click', async ({ page }) => {
    await installListenerCensus(page);
    await installTee(page);
    await page.setViewportSize(DESKTOP);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.waitForTimeout(3000);

    const describeMinimap = async (label: string): Promise<void> => {
      const state = await page.evaluate(() => {
        const census = (window as unknown as { lockstateListenerCensus?: WeakMap<EventTarget, Set<string>> })
          .lockstateListenerCensus;
        const surface = document.querySelector<HTMLElement>('.hud-minimap__surface');
        const placeholder = document.querySelector<HTMLElement>('.hud-minimap__placeholder');
        const panel = document.querySelector<HTMLElement>('.hud-minimap');
        const box = surface?.getBoundingClientRect();
        return {
          sentence: (placeholder?.textContent ?? '(absent)').trim(),
          surfaceCursor: surface === null ? '?' : getComputedStyle(surface).cursor,
          placeholderCursor: placeholder === null ? '?' : getComputedStyle(placeholder).cursor,
          surfaceListeners: [...(census?.get(surface as EventTarget) ?? [])].join(',') || 'none',
          surfaceRole: surface?.getAttribute('role') ?? '(none)',
          surfaceTag: surface?.tagName.toLowerCase() ?? '?',
          surfaceTabIndex: String(surface?.tabIndex ?? '?'),
          surfaceAria: surface?.getAttribute('aria-label') ?? '(none)',
          surfaceTitle: surface?.getAttribute('title') ?? '(none)',
          panelTitle: (panel?.querySelector('.ui-panel__title, .ui-eyebrow')?.textContent ?? '?').trim(),
          box: box === undefined ? '?' : `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.left)},${Math.round(box.top)}`,
        };
      });
      log(`   ${label}`);
      for (const [key, value] of Object.entries(state)) log(`      ${key.padEnd(18)} ${JSON.stringify(value)}`);
    };

    log('===== ACT 8 / the minimap, as a new player meets it =====');
    await describeMinimap('on arrival, nothing pressed');

    // A press in the middle of the surface, the way a player who ignored the
    // sentence would.
    const surface = page.locator('.hud-minimap__surface');
    const box = await surface.boundingBox();
    log(`   pressing the centre of the surface at ${JSON.stringify(box)}`);
    await surface.click({ position: { x: Math.round((box?.width ?? 100) / 3), y: Math.round((box?.height ?? 100) / 3) } });
    await page.waitForTimeout(1500);
    await describeMinimap('after one press on it');

    // And whether the panel is even open on arrival, since a folded panel is a
    // sentence nobody reads either way.
    log(`   minimap panel collapsed attribute: ${JSON.stringify(await page.locator('.hud-minimap').getAttribute('data-collapsed'))}`);
    log(`   whole minimap panel text: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);
  });

});
