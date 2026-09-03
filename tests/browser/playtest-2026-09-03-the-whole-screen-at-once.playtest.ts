import { type Page, expect, test } from '@playwright/test';
import {
  buildAndPopulate,
  buy,
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
  readonly groupSelector: string;
  readonly groupWords: string;
  readonly named: boolean;
  readonly namedBy: string;
  readonly tab: string;
}

/**
 * Every visible run of digits inside the HUD, with whatever names it.
 *
 * ## What counts as "named"
 *
 * A number is *named* when a word of three or more letters appears either in
 * the number's own leaf text or inside the smallest enclosing **grouping** --
 * a chip, a row, a list item, a labelled field. That is the unit a player's
 * eye actually takes in at once; a word four ancestors up in a panel header
 * does not tell them what the third number in the fifth row is.
 *
 * The grouping is found by walking up to the first ancestor that either
 * carries a class ending in `__row`/`__item`/`__field`, or is one of the
 * primitive wrappers (`ui-stat`, `ui-field`, `ui-number`, `ui-badge`,
 * `ui-bar`), or is an `li`/`tr`/`label`. Failing all of those, the walk stops
 * at the panel and the number is reported as named by the panel, which is the
 * generous reading -- so the unnamed count is a floor, not a ceiling.
 */
async function probeNumbers(page: Page, tabId: string): Promise<readonly NumberSighting[]> {
  return page.evaluate((currentTab) => {
    const GROUP = /(__row|__item|__field|__entry|__line|__stat|^ui-stat$|^ui-field$|^ui-number$|^ui-badge$|^ui-bar$|^ui-meter$)/;
    const describe = (el: Element): string => {
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c !== '').slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${cls === '' ? '' : `.${cls}`}`;
    };
    const isPanel = (el: Element): boolean =>
      el.classList.contains('hud') ||
      el.classList.contains('save-panel') ||
      (el.getAttribute('class') ?? '').split(/\s+/).some((c) => /^(hud|ui)-[a-z]+$/.test(c) && c !== 'ui-badge');

    const out: NumberSighting[] = [];
    const roots = document.querySelectorAll('.hud, .save-panel');
    for (const root of roots) {
      for (const node of root.querySelectorAll('*')) {
        const el = node as HTMLElement;
        if (el.children.length > 0) continue;
        if (el.hidden || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.opacity === '0') continue;
        if (el.closest('svg') !== null) continue;
        const leafText = (el.textContent ?? '').trim();
        if (!/\d/.test(leafText)) continue;
        // Screen-reader-only text is not on screen; it is measured separately.
        if (style.clip === 'rect(0px, 0px, 0px, 0px)' || (el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1)) continue;

        const tokens = leafText.match(/-?[\d][\d,._:%×/]*/g) ?? [leafText];

        // The smallest grouping around it.
        let group: Element = el;
        for (let n: Element | null = el; n !== null; n = n.parentElement) {
          group = n;
          const classes = (n.getAttribute('class') ?? '').split(/\s+/);
          if (classes.some((c) => GROUP.test(c))) break;
          if (/^(li|tr|label|button)$/.test(n.tagName.toLowerCase())) break;
          if (isPanel(n)) break;
        }
        const groupText = (group as HTMLElement).innerText ?? group.textContent ?? '';
        const words = groupText.replace(/\s+/g, ' ').trim();
        const hasWord = /[A-Za-z]{3}/.test(words);
        const aria =
          el.getAttribute('aria-label') ??
          el.parentElement?.getAttribute('aria-label') ??
          (group as HTMLElement).getAttribute('aria-label') ??
          '';
        const title = el.getAttribute('title') ?? (group as HTMLElement).getAttribute('title') ?? '';
        const namedBy = hasWord
          ? `words in ${describe(group)}: ${JSON.stringify(words.slice(0, 60))}`
          : aria !== ''
            ? `aria-label only: ${JSON.stringify(aria)}`
            : title !== ''
              ? `title only: ${JSON.stringify(title)}`
              : 'NOTHING';
        for (const token of tokens) {
          out.push({
            token,
            leafText: leafText.slice(0, 40),
            leafSelector: describe(el),
            groupSelector: describe(group),
            groupWords: words.slice(0, 70),
            named: hasWord,
            namedBy,
            tab: currentTab,
          });
        }
      }
    }
    return out;
  }, tabId);
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
        const sightings = await probeNumbers(page, id);
        log(`-- tab ${id}: ${sightings.length} number tokens on screen`);
        for (const s of sightings) {
          if (s.named) named += 1;
          else unnamed += 1;
          log(
            `   ${s.named ? 'NAMED  ' : 'UNNAMED'} ${JSON.stringify(s.token).padEnd(12)} leaf=${s.leafSelector.padEnd(30)} group=${s.groupSelector.padEnd(28)} ${s.namedBy}`,
          );
        }
        await page.screenshot({ path: `test-results/whole-screen/${stage}-${id}.png`, fullPage: false });
      }
      log(`ACT 1 / ${stage} TOTAL: ${named} named, ${unnamed} UNNAMED number tokens across the five tabs`);
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
    for (const chip of freshStrip) log(`   FRESH ${chip.metric.padEnd(13)} ${JSON.stringify(chip.visible)} tone=${chip.tone} badge=${chip.badge} title=${JSON.stringify(chip.title)}`);
    const freshScreen = await readWholeScreen(page);

    await tab(page, 'overview').click();
    await buildAndPopulate(page, { beds: 8, admits: 6, guards: 3, label: 'act2' });
    await fastForwardToMax(page);
    await page.waitForTimeout(40_000);

    log('===== ACT 2 / a prison that is running well: 6 prisoners, 8 beds, 3 guards =====');
    const wellStrip = await readStrip(page);
    for (const chip of wellStrip) log(`   WELL  ${chip.metric.padEnd(13)} ${JSON.stringify(chip.visible)} tone=${chip.tone} badge=${chip.badge} title=${JSON.stringify(chip.title)}`);
    const wellScreen = await readWholeScreen(page);
    log(`   counts: ${JSON.stringify(await latestCounts(page))}`);

    log('-- chips that read IDENTICALLY on an unmeasured prison and a healthy one:');
    for (const fresh of freshStrip) {
      const well = wellStrip.find((c) => c.metric === fresh.metric);
      if (well === undefined) continue;
      if (fresh.visible === well.visible && fresh.tone === well.tone) {
        log(`   SAME ${fresh.metric.padEnd(13)} ${JSON.stringify(fresh.visible)} tone=${fresh.tone}`);
      } else {
        log(`   moved ${fresh.metric.padEnd(12)} ${JSON.stringify(fresh.visible)} -> ${JSON.stringify(well.visible)} tone ${fresh.tone} -> ${well.tone}`);
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
    await tab(page, 'regime').click();
    await page.waitForTimeout(400);
    const beforeSpend = await readCurrentView(page);
    log(`   funds chip before: ${await fundsOnScreen(page)}`);
    await buy(page, 'wall-brick', 400);
    await page.waitForTimeout(4000);
    await tab(page, 'regime').click();
    await page.waitForTimeout(600);
    const afterSpend = await readCurrentView(page);
    const d2 = diffLines(beforeSpend, afterSpend);
    log(`   funds chip after: ${await fundsOnScreen(page)}`);
    log(`   lines that ARRIVED: ${d2.arrived.length}`);
    for (const line of d2.arrived) log(`   ARRIVED | ${line}`);
    for (const line of d2.gone) log(`   GONE    | ${line}`);
    log(`   strip now: ${JSON.stringify(await readStrip(page))}`);
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
});
