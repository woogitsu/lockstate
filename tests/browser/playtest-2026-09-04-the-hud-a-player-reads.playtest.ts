/**
 * A player is running a prison. At any given moment they have a question --
 * "am I losing money?", "why is nobody in that cell?", "what is that alert
 * about?", "what should I do next?" -- and they look at the HUD to answer it.
 *
 * **Which of their questions does it answer, which does it answer badly, and
 * what should it be instead?**
 *
 * This instrument is the measuring half. It takes the whole HUD apart at fixed
 * moments and accounts for it: every laid-out element, its area, its text, its
 * type size and colour, and -- across a long sampled run -- how often it
 * changes. A block that never changes is spending pixels.
 *
 * NOT A CI GATE. `tests/browser/playwright.config.ts` matches `*.spec.ts` and
 * never collects this. Run it with
 * `LOCKSTATE_BROWSER_TEST_PORT=5322 node node_modules/@playwright/test/cli.js test
 *  --config tests/browser/playwright.playtest.config.ts
 *  tests/browser/playtest-2026-09-04-the-hud-a-player-reads.playtest.ts -g "act 1"`.
 *
 * The record is `docs/research/2026-09-04-the-hud-a-player-reads.md`.
 */
import { test } from '@playwright/test';
import {
  buildAndPopulate,
  currentClock,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  tab,
  centreOf,
  type TeeWindow,
} from './playtest-harness';
import type { Page } from '@playwright/test';

const TABS = ['overview', 'build', 'rooms', 'security', 'regime'] as const;
type TabId = (typeof TABS)[number];

interface CensusNode {
  readonly key: string;
  readonly tag: string;
  readonly cls: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly area: number;
  readonly fontPx: number;
  readonly weight: string;
  readonly colour: string;
  readonly ownText: string;
}

/**
 * Every laid-out element inside a root, with geometry, type and its OWN text
 * (direct text-node children only, so a container does not claim its
 * descendants' words).
 *
 * `key` is a structural path -- tag plus class list plus sibling index -- so
 * the same box can be matched across two samples even when its text changed.
 */
async function census(page: Page, rootSelector: string): Promise<readonly CensusNode[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel);
    if (root === null) return [];
    const out: CensusNode[] = [];
    const walk = (node: HTMLElement, path: string): void => {
      const rects = node.getClientRects();
      const laidOut = rects.length > 0 && !node.hidden;
      const r = node.getBoundingClientRect();
      if (laidOut && r.width > 0 && r.height > 0) {
        const style = getComputedStyle(node);
        let own = '';
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE) own += child.textContent ?? '';
        }
        out.push({
          key: path,
          tag: node.tagName.toLowerCase(),
          cls: node.className === '' ? '' : String(node.className),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          area: Math.round(r.width * r.height),
          fontPx: Number.parseFloat(style.fontSize),
          weight: style.fontWeight,
          colour: style.color,
          ownText: own.replace(/\s+/g, ' ').trim(),
        });
      }
      let index = 0;
      for (const child of Array.from(node.children)) {
        const element = child as HTMLElement;
        const cls = element.className === '' ? '' : `.${String(element.className).split(/\s+/).join('.')}`;
        walk(element, `${path}>${element.tagName.toLowerCase()}${cls}[${index}]`);
        index += 1;
      }
    };
    const rootCls = root.className === '' ? '' : `.${String(root.className).split(/\s+/).join('.')}`;
    walk(root, `${root.tagName.toLowerCase()}${rootCls}`);
    return out;
  }, rootSelector);
}

/** The visible text of every top-level HUD region, keyed by a stable name. */
const REGIONS: Readonly<Record<string, string>> = {
  strip: '.hud-strip',
  clock: '.hud-clock',
  tabs: '.hud__tabs',
  refusal: '.hud__refusal',
  events: '.hud__event',
  alerts: '.hud-alerts',
  minimap: '.hud-minimap',
  intake: '.hud-intake',
  build: '.hud-build',
  rooms: '.hud-rooms',
  staff: '.hud-staff',
  regime: '.hud-regime',
  save: '.save-panel',
};

async function regionTexts(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, selector] of Object.entries(REGIONS)) out[name] = await panelText(page, selector);
  return out;
}

/** What a whole tab looks like: every region text, plus its own census totals. */
async function snapshotTab(page: Page, id: TabId, label: string): Promise<readonly CensusNode[]> {
  await tab(page, id).click();
  await page.waitForTimeout(400);
  const nodes = await census(page, '.hud');
  console.log(`[${label}] TAB ${id}: ${nodes.length} laid-out elements`);
  const texts = await regionTexts(page);
  for (const [name, text] of Object.entries(texts)) {
    if (text.includes('ABSENT') || text.includes('not laid out')) continue;
    console.log(`[${label}] TAB ${id} REGION ${name} >>>\n${text}\n<<<`);
  }
  return nodes;
}

function dumpCensus(label: string, id: string, nodes: readonly CensusNode[]): void {
  console.log(`[${label}] CENSUS-JSON ${id} ${JSON.stringify(nodes)}`);
}

test.describe('the HUD a player reads', () => {
  test('act 1 — the empty prison: what is on screen before anything happens', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);

    console.log(`[act1] viewport ${JSON.stringify(page.viewportSize())}`);
    console.log(`[act1] tick ${await currentTick(page)} clock ${JSON.stringify(await currentClock(page))}`);
    console.log(`[act1] counts ${JSON.stringify(await latestCounts(page))}`);

    for (const id of TABS) {
      const nodes = await snapshotTab(page, id, 'act1');
      dumpCensus('act1', `empty-${id}`, nodes);
    }

    /*
     * The always-present furniture: what a player sees no matter which tab
     * they are on. Measured as area, because "how much of the screen" is the
     * question and a panel that is 30% of it had better change.
     */
    const alwaysOn = await census(page, '.hud');
    dumpCensus('act1', 'empty-alwayson', alwaysOn);
  });

  test('act 2 — a working prison: the same screen with a prison behind it', async ({ page }) => {
    test.setTimeout(900_000);
    await installTee(page);
    await openApp(page);

    const origin = await buildAndPopulate(page, { beds: 4, admits: 8, guards: 1, label: 'act2' });
    console.log(`[act2] origin ${JSON.stringify(origin)}`);
    await fastForwardToMax(page);

    // Let a day boundary pass so the economy has actually done something.
    console.log(`[act2] tick before the wait ${await currentTick(page)}`);
    await page.waitForTimeout(60_000);
    console.log(`[act2] tick after 60s ${await currentTick(page)} clock ${JSON.stringify(await currentClock(page))}`);
    console.log(`[act2] counts ${JSON.stringify(await latestCounts(page))}`);

    for (const id of TABS) {
      const nodes = await snapshotTab(page, id, 'act2');
      dumpCensus('act2', `running-${id}`, nodes);
    }
  });

  /**
   * The change-rate measurement, and the core of "what is taking up room
   * without earning it".
   *
   * One page, one prison, and then a long poll: every region's text, sampled
   * once a second, with the worker tick beside it. What comes out is, per
   * region, how many DISTINCT strings it took across the run -- 1 means the
   * block never changed while the prison ran.
   */
  test('act 3 — what changes, and what does not, over an in-game day', async ({ page }) => {
    test.setTimeout(900_000);
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 4, admits: 8, guards: 2, label: 'act3' });
    await fastForwardToMax(page);
    await tab(page, 'overview').click();
    await page.waitForTimeout(500);

    const samples: { tick: number; texts: Record<string, string> }[] = [];
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      const tick = await currentTick(page);
      samples.push({ tick, texts: await regionTexts(page) });
      await page.waitForTimeout(2000);
    }
    console.log(`[act3] ${samples.length} samples, tick ${samples[0]?.tick} -> ${samples[samples.length - 1]?.tick}`);

    const names = Object.keys(REGIONS);
    for (const name of names) {
      const values = samples.map((s) => s.texts[name] ?? '');
      const distinct = new Set(values);
      const laidOut = values.filter((v) => !v.includes('ABSENT') && !v.includes('not laid out')).length;
      console.log(
        `[act3] REGION ${name}: ${distinct.size} distinct value(s) across ${samples.length} samples` +
          ` (${laidOut} of them laid out)`,
      );
      if (distinct.size > 1 && distinct.size <= 6) {
        for (const value of distinct) console.log(`[act3]   variant of ${name} >>>\n${value}\n<<<`);
      }
    }
    console.log(`[act3] SAMPLES-JSON ${JSON.stringify(samples)}`);
  });

  /**
   * The moments a player actually has a question, and how many interactions it
   * takes to answer each one from the screen.
   *
   * Each probe states the question, the tab the player is plausibly on when it
   * arrives, and then counts the presses needed to reach an answer.
   */
  test('act 4 — five questions a player has, answered from the screen', async ({ page }) => {
    test.setTimeout(900_000);
    await installTee(page);
    await openApp(page);

    // A deliberately under-built prison: more prisoners than beds, one guard,
    // and money going out. Every question below then has a real answer.
    const origin = await buildAndPopulate(page, { beds: 2, admits: 8, guards: 3, label: 'act4' });
    await fastForwardToMax(page);

    const ask = async (question: string, from: TabId): Promise<void> => {
      await tab(page, from).click();
      await page.waitForTimeout(400);
      console.log(`[act4] Q: ${question} — player is on the ${from} tab.`);
      const texts = await regionTexts(page);
      for (const [name, text] of Object.entries(texts)) {
        if (text.includes('ABSENT') || text.includes('not laid out')) continue;
        console.log(`[act4]   ON SCREEN ${name} >>>\n${text}\n<<<`);
      }
    };

    // Q1 — "am I losing money?" from the tab a session opens on.
    await ask('am I losing money?', 'overview');
    console.log(`[act4] counts at Q1 ${JSON.stringify(await latestCounts(page))}`);

    // Q2 — "why is nobody in that cell?" The player is looking at the world.
    await ask('why is nobody in that cell?', 'overview');

    // Q3 — "what is that alert about?" from wherever they were.
    await ask('what is that alert about?', 'build');

    // Q4 — "what should I do next?"
    await ask('what should I do next?', 'overview');

    // Q5 — money over a day boundary, from a tab that is not Overview.
    await tab(page, 'regime').click();
    const before = await latestCounts(page);
    console.log(`[act4] before the wait: ${JSON.stringify(before)}`);
    console.log(`[act4] strip from the regime tab: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    await page.waitForTimeout(90_000);
    const after = await latestCounts(page);
    console.log(`[act4] after 90s: ${JSON.stringify(after)}`);
    console.log(`[act4] strip now: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    console.log(`[act4] alerts now: ${await panelText(page, '.hud-alerts')}`);
    console.log(`[act4] events now: ${await panelText(page, '.hud__event')}`);
    console.log(`[act4] refusal now: ${await panelText(page, '.hud__refusal')}`);

    // And the world press that a player would use to ask about the cell.
    await tab(page, 'overview').click();
    const point = centreOf(origin, 14, 13);
    const covered = await page.evaluate(
      (p) => {
        const element = document.elementFromPoint(p.x, p.y);
        return element === null ? 'nothing' : `${element.tagName.toLowerCase()}.${String(element.className)}`;
      },
      { x: point.x, y: point.y },
    );
    console.log(`[act4] elementFromPoint at the cell interior: ${covered}`);
    const produced = await press(page, point.x, point.y);
    console.log(`[act4] pressing inside the cell produced ${produced.length} command(s): ${JSON.stringify(produced)}`);
    await page.waitForTimeout(600);
    console.log(`[act4] after the press, overview regions:`);
    for (const [name, text] of Object.entries(await regionTexts(page))) {
      if (text.includes('ABSENT') || text.includes('not laid out')) continue;
      console.log(`[act4]   ${name} >>>\n${text}\n<<<`);
    }
  });

  /**
   * Real estate against readership: what fraction of the HUD's pixels each
   * region owns, and how much of each region's content is BELOW ITS OWN FOLD.
   */
  test('act 5 — pixels, and what is hidden inside them', async ({ page }) => {
    test.setTimeout(900_000);
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1200);

    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      const measured = await page.evaluate((regions) => {
        const out: Record<string, unknown> = {};
        for (const [name, selector] of Object.entries(regions)) {
          const node = document.querySelector<HTMLElement>(selector);
          if (node === null || node.getClientRects().length === 0) continue;
          const r = node.getBoundingClientRect();
          // Every scrollable descendant, and how much it hides.
          const hidden: unknown[] = [];
          const consider = (element: HTMLElement): void => {
            if (element.scrollHeight > element.clientHeight + 1) {
              hidden.push({
                cls: String(element.className),
                clientH: element.clientHeight,
                scrollH: element.scrollHeight,
                hiddenPx: element.scrollHeight - element.clientHeight,
                gutterPx: element.offsetWidth - element.clientWidth,
                children: element.children.length,
              });
            }
            for (const child of Array.from(element.children)) consider(child as HTMLElement);
          };
          consider(node);
          out[name] = {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            area: Math.round(r.width * r.height),
            hidden,
          };
        }
        return out;
      }, REGIONS);
      console.log(`[act5] TAB ${id} GEOMETRY ${JSON.stringify(measured)}`);
    }

    const viewport = page.viewportSize();
    console.log(`[act5] viewport area ${(viewport?.width ?? 0) * (viewport?.height ?? 0)}`);

    // And at 1280x800, the width #719 says a strip overflows at.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(600);
    for (const id of TABS) {
      await tab(page, id).click();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => {
        const out: unknown[] = [];
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('.hud *'))) {
          if (element.getClientRects().length === 0) continue;
          const r = element.getBoundingClientRect();
          if (r.right > window.innerWidth + 0.5 || r.left < -0.5) {
            out.push({ cls: String(element.className), left: Math.round(r.left), right: Math.round(r.right) });
          }
        }
        return out;
      });
      console.log(`[act5] TAB ${id} AT-1280 OVERFLOWING ${JSON.stringify(overflow)}`);
    }
  });

  /**
   * Is the census in `docs/research/2026-09-04-what-the-game-shows-nobody.md`
   * still true at v0.0.469? Cheap, and the brief asks before it is repeated.
   *
   * Not a browser measurement -- run from the page only because this file is
   * where the evidence lives. It reads the two orphan claims off the running
   * app's own worker traffic instead: whether the fields cross the boundary.
   */
  test('act 6 — do the orphan fields still cross the boundary unread', async ({ page }) => {
    test.setTimeout(300_000);
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);
    await fastForwardToMax(page);
    await page.waitForTimeout(8000);

    const seen = await page.evaluate(() => {
      const messages = (window as unknown as TeeWindow).lockstateFromWorker ?? [];
      const counts = messages.filter((m) => (m as { kind?: string }).kind === 'simulation/status-counts');
      const last = counts[counts.length - 1] as { payload?: { counts?: Record<string, unknown> } } | undefined;
      return {
        countsMessages: counts.length,
        fields: last?.payload?.counts === undefined ? [] : Object.keys(last.payload.counts).sort(),
        conditions: last?.payload?.counts?.['conditions'],
        staffUnassigned: last?.payload?.counts?.['staffUnassigned'],
        prisonersInIntake: last?.payload?.counts?.['prisonersInIntake'],
        roomOccupants: last?.payload?.counts?.['roomOccupants'],
        unpaidWages: last?.payload?.counts?.['unpaidWagesMinorUnits'],
      };
    });
    console.log(`[act6] status-counts on the wire: ${JSON.stringify(seen)}`);
  });
});
