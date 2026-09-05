import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  armBuildable,
  buildAndPopulate,
  buy,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  tab,
  TILE,
} from './playtest-harness';

/**
 * **The second evening.** A player builds a prison one evening and comes back
 * the next. They have forgotten what they built, what they were doing, and
 * what was going wrong. Does anything on the screen bring them back up to
 * speed — or do they have to reconstruct it?
 *
 * This is **not** the reload test.
 * `docs/research/2026-09-04-does-a-prison-come-back.md` already established
 * that the prison comes back *mechanically* intact, tick for tick. The
 * question here is what a *person* gets, which is a different thing: the state
 * is restored and the player's memory is not.
 *
 * ## The experiment
 *
 * Act 1 is the whole thing and runs in one page, because IndexedDB is
 * per-browser-context and Playwright gives every `test()` a fresh one — so
 * "evening one" and "evening two" cannot be two tests. The hard break is a
 * real `page.reload()`, which is what closing the tab and coming back does.
 *
 * - **Evening one** builds a real prison and deliberately leaves it in an
 *   interesting state: money spent, an order in flight, construction queued,
 *   more prisoners than beds, a refusal on the band, a guard hired at the last
 *   moment. Everything a player would want to remember is written down.
 * - **Evening two** reloads, loads the prison, and tries to answer the same
 *   questions **using only the screen**, counting every interaction each
 *   answer costs. `interactions` is a real counter around every click.
 *
 * ## The two channels, never mixed
 *
 * - **HUD** — `innerText` out of the real DOM, or a real attribute on a real
 *   control. What a player sees. Prefixed `HUD`.
 * - **STATE** — a `simulation/request-projection` round trip to the worker, or
 *   a figure off `simulation/status-counts`. Prefixed `STATE`.
 *
 * ## Not a gate
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so
 * only `tests/browser/playwright.playtest.config.ts` collects this file and
 * nothing in CI drives it. The output is the deliverable; the findings live in
 * `docs/research/2026-09-05-the-second-evening.md`.
 *
 * Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5332 node --experimental-transform-types \
 *   --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-05-the-second-evening.playtest.ts -g "act 1"
 * ```
 */

const SHOTS = 'test-results/the-second-evening';

/* ------------------------------------------------------------------ */
/* The projection probe — lifted in intent from                        */
/* playtest-2026-09-04-many-prisons.playtest.ts.                       */
/* ------------------------------------------------------------------ */

/**
 * Captures the worker instance and installs an in-page projection puller.
 *
 * **Must be installed after `installTee`**, which replaces `Worker` with a tee
 * subclass; this one subclasses whatever `Worker` is by then, so the other
 * order loses the instance handle. The handle is re-captured on every
 * `new Worker(...)` because `WorkerPerSessionHost` builds a fresh worker for
 * every create and every load.
 */
async function installProjectionProbe(page: Page): Promise<void> {
  await page.addInitScript((protocolVersion: number) => {
    const Base = Worker;
    class ProbeWorker extends Base {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __lsWorker?: Worker }).__lsWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;

    (window as unknown as { __lsProjection?: unknown }).__lsProjection = (projectionId: string): Promise<unknown> => {
      const worker = (window as unknown as { __lsWorker?: Worker }).__lsWorker;
      if (worker === undefined) return Promise.reject(new Error('no worker captured'));
      const messageId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          reject(new Error(`no reply for ${projectionId}`));
        }, 15_000);
        const onMessage = (event: MessageEvent): void => {
          const data = event.data as { replyTo?: string; kind?: string; payload?: { tick?: number; view?: { data?: unknown } } };
          if (data?.replyTo !== messageId) return;
          worker.removeEventListener('message', onMessage);
          clearTimeout(timer);
          if (data.kind !== 'simulation/projection') {
            reject(new Error(`${projectionId} answered ${String(data.kind)}`));
            return;
          }
          resolve({ tick: data.payload?.tick ?? -1, data: data.payload?.view?.data ?? null });
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ protocolVersion, messageId, kind: 'simulation/request-projection', payload: { projectionId } });
      });
    };
  }, SIMULATION_PROTOCOL_VERSION);
}

/**
 * The kernel tick off a projection reply rather than off
 * `simulation/clock-state`.
 *
 * The worker publishes `clock-state` at most every 250 ms and only when the
 * tick has moved, so on a stopped clock the tee's last message survives a page
 * reload and reports the *pre-reload* tick as if it were the restored one.
 * `docs/research/2026-09-04-does-a-prison-come-back.md` records that as an
 * instrument bug that produced a false reading; this file never reads the tick
 * any other way across the break.
 */
async function kernelTick(page: Page): Promise<number> {
  try {
    return (
      await page.evaluate(
        async () =>
          (await (window as unknown as { __lsProjection: (p: string) => Promise<unknown> }).__lsProjection(
            'hud/prisoner-population',
          )) as { tick: number },
      )
    ).tick;
  } catch {
    return -1;
  }
}

/* ------------------------------------------------------------------ */
/* Interaction counting — the unit this question is answered in        */
/* ------------------------------------------------------------------ */

/**
 * Every click a returning player would have to make, counted and named.
 *
 * The question "how long until the player is oriented" has no honest answer in
 * seconds — a playtest's wall clock is the machine's, not a person's, and
 * `docs/AGENT_WORKFLOW.md` forbids resting a claim on it. Interactions are the
 * unit: one press of one control that a player would have to decide to make.
 * Reading what is already on screen costs nothing and is not counted.
 */
class Interactions {
  private readonly log: string[] = [];

  public constructor(private readonly label: string) {}

  public async click(page: Page, selector: string, why: string): Promise<void> {
    this.log.push(why);
    console.log(`[${this.label}] INTERACTION ${this.log.length}: ${why}  (${selector})`);
    await page.locator(selector).first().click();
    await page.waitForTimeout(400);
  }

  public get count(): number {
    return this.log.length;
  }

  public report(): void {
    console.log(`[${this.label}] INTERACTIONS TOTAL = ${this.log.length}`);
    this.log.forEach((why, index) => console.log(`[${this.label}]   ${index + 1}. ${why}`));
  }
}

/* ------------------------------------------------------------------ */
/* HUD readings                                                        */
/* ------------------------------------------------------------------ */

/** A one-line reading of a panel, newlines flattened so two readings compare by eye. */
async function line(page: Page, selector: string): Promise<string> {
  return (await panelText(page, selector)).replace(/\n+/g, ' | ');
}

/** The save panel's three fields plus the row labels, exactly as rendered. */
async function savePanel(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const read = (selector: string): string =>
      (document.querySelector<HTMLElement>(selector)?.innerText ?? 'ABSENT').replace(/\n+/g, ' | ').trim();
    return {
      status: read('.save-panel__status'),
      detail: read('.save-panel__detail'),
      list: read('.save-panel__list'),
      rows: [...document.querySelectorAll<HTMLElement>('.save-panel__item')].map((item) => ({
        label: (item.querySelector<HTMLElement>('.save-panel__item-label')?.textContent ?? '').trim(),
        active: item.getAttribute('data-active'),
        title: item.getAttribute('title'),
        accessibleText: (item.innerText ?? '').replace(/\n+/g, ' ').trim(),
      })),
    };
  });
}

/**
 * Everything a player can see without touching a tab, read in one go.
 *
 * This is the *arrival state* reading: the strip, the clock, the alerts
 * column, the refusal band, the event band, the minimap frame, which tab is
 * active and which panel that puts on screen.
 */
async function arrivalScreen(page: Page): Promise<Record<string, string>> {
  return {
    activeTab: (await page.locator('.hud').getAttribute('data-active-tab')) ?? 'ABSENT',
    clockDay: await line(page, '.hud-clock__day'),
    strip: await line(page, '.hud-strip'),
    alerts: await line(page, '.hud-alerts__list'),
    refusal: await line(page, '.hud__refusal'),
    event: await line(page, '.hud__event'),
    unavailable: await line(page, '.hud__unavailable'),
    minimap: await line(page, '.hud-minimap'),
    sidePanel: await line(page, '.hud__side'),
    aside: await line(page, '.hud__aside'),
  };
}

/** The five tab panels, one line each. Reading them costs four tab presses. */
async function everyTab(page: Page, label: string, interactions?: Interactions): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    if (interactions === undefined) await tab(page, id).click();
    else await interactions.click(page, `.hud__tabs [data-tab="${id}"]`, `open the ${id} tab`);
    await page.waitForTimeout(350);
    out[id] = await line(page, '.hud__rail');
  }
  console.log(`[${label}] HUD every tab :: ${JSON.stringify(out, null, 1)}`);
  return out;
}

/**
 * An md5 of the world under the HUD.
 *
 * Cropped away from the rail and the strip so a difference is attributable to
 * the world rather than to a live number repainting. Two identical hashes mean
 * the camera is looking at the same thing.
 */
async function worldHash(page: Page, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const shot = await page.screenshot({ clip: { x: 0, y: 120, width: 900, height: 560 }, animations: 'disabled' });
  writeFileSync(`${SHOTS}/${name}.png`, shot);
  return createHash('md5').update(shot).digest('hex').slice(0, 12);
}

test.beforeEach(async ({ page }) => {
  await installTee(page);
  await installProjectionProbe(page);
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[act')) console.log(text);
  });
});

/* ================================================================== */
/* ACT 1 — the two evenings                                            */
/* ================================================================== */

test('act 1 — evening one, the night, evening two', async ({ page }) => {
  await openApp(page);

  /* ---------------- EVENING ONE ---------------- */

  // A real prison: 3 beds, 6 admissions, 2 guards. Three prisoners more than
  // beds is the "problem brewing" the brief asks for, and it is a problem a
  // player creates by accident rather than one this instrument invents.
  const origin = await buildAndPopulate(page, { beds: 3, admits: 6, guards: 2, label: 'act1' });

  // --- money spent on an order that is still in flight ---------------
  await tab(page, 'build').click();
  await buy(page, 'wall-brick', 40);
  console.log(`[act1] HUD deliveries right after the order :: ${await line(page, '.hud-build__deliveries')}`);

  // --- construction queued and deliberately NOT finished -------------
  // A second block's north and west walls, drawn and left mid-build. This is
  // the "half-drawn block" a returning player has to find again.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 4 * TILE;
  const eastX = origin.originX + 10 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  await drag(page, { x: westX + TILE / 2, y: northY }, { x: eastX - TILE / 2, y: northY });
  await drag(page, { x: westX, y: northY + TILE / 2 }, { x: westX, y: southY - TILE / 2 });
  console.log(`[act1] HUD build queue after the second block's two runs :: ${await line(page, '.hud-build__queue')}`);

  // --- a guard hired at the last moment ------------------------------
  await tab(page, 'security').click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(800);
  console.log(`[act1] HUD staff panel after the last-moment hire :: ${await line(page, '.hud-staff')}`);

  // --- a refusal, which is the last thing the player did --------------
  // Admitting into a prison with no room left is refused with a real sentence.
  await tab(page, 'overview').click();
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(600);
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(900);

  const beforeCounts = await latestCounts(page);
  const beforeTick = await kernelTick(page);
  const beforeClock = await currentClock(page);
  console.log(`[act1] STATE evening one :: tick=${beforeTick} clock=${JSON.stringify(beforeClock)} counts=${JSON.stringify(beforeCounts)}`);

  const beforeArrival = await arrivalScreen(page);
  console.log(`[act1] HUD evening one, the screen as left :: ${JSON.stringify(beforeArrival, null, 1)}`);
  const beforeTabs = await everyTab(page, 'act1-evening-one');
  const beforeWorld = await worldHash(page, 'evening-one-world');
  console.log(`[act1] HUD evening one world md5 = ${beforeWorld}`);
  console.log(`[act1] HUD evening one save panel :: ${JSON.stringify(await savePanel(page))}`);

  // The four questions a returning player has, answered here from the record
  // so evening two can be scored against them.
  console.log('[act1] === WHAT A PLAYER WOULD WANT TO REMEMBER ===');
  console.log(`[act1] Q1 what was I doing?      :: drawing a second block's north and west walls, then I hired a third guard`);
  console.log(`[act1] Q2 what did I just order? :: 40 bricks, and ${await line(page, '.hud-build__queue')}`);
  console.log(`[act1] Q3 what is going wrong?   :: 6+ prisoners against ${beforeCounts?.accommodationCapacity} beds; Admit refused twice`);
  console.log(`[act1] Q4 what should I do next? :: finish the second block, buy beds for the prisoners with none`);

  // --- save, the way a player leaving for the night does --------------
  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(1200);
  console.log(`[act1] HUD after Save now :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act1] STATE tick at save = ${await kernelTick(page)}`);

  /* ---------------- THE NIGHT ---------------- */

  await page.reload();
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.waitForTimeout(1500);

  /* ---------------- EVENING TWO ---------------- */

  const interactions = new Interactions('act1-evening-two');

  // 1. THE LOAD SCREEN ITSELF. Zero interactions spent; this is what is on
  //    screen when the page finishes loading.
  console.log(`[act1] HUD evening two, the load screen :: ${JSON.stringify(await savePanel(page), null, 1)}`);
  console.log(`[act1] HUD evening two, before Load :: ${JSON.stringify(await arrivalScreen(page), null, 1)}`);
  console.log(`[act1] STATE evening two, before Load, tick = ${await kernelTick(page)}`);
  console.log(`[act1] HUD evening two world before Load md5 = ${await worldHash(page, 'evening-two-before-load')}`);

  // 2. THE FIRST SCREEN AFTER LOADING. One interaction: press Load.
  await interactions.click(page, '.save-panel__item button:has-text("Load")', 'press Load on the only prison row');
  await page.waitForTimeout(1500);

  const afterArrival = await arrivalScreen(page);
  console.log(`[act1] HUD evening two, the arrival screen :: ${JSON.stringify(afterArrival, null, 1)}`);
  const afterTick = await kernelTick(page);
  const afterCounts = await latestCounts(page);
  console.log(`[act1] STATE evening two after Load :: tick=${afterTick} clock=${JSON.stringify(await currentClock(page))} counts=${JSON.stringify(afterCounts)}`);
  console.log(`[act1] STATE tick delta across the night = ${afterTick - beforeTick}`);
  const afterWorld = await worldHash(page, 'evening-two-after-load');
  console.log(`[act1] HUD evening two world md5 = ${afterWorld} (evening one was ${beforeWorld}; same = the camera is where it was)`);
  console.log(`[act1] HUD save panel after Load :: ${JSON.stringify(await savePanel(page))}`);

  // 3. THE ARRIVAL SCREEN, LINE BY LINE AGAINST WHAT WAS LEFT.
  for (const key of Object.keys(beforeArrival)) {
    const before = beforeArrival[key] ?? '';
    const after = afterArrival[key] ?? '';
    console.log(`[act1] ARRIVAL ${before === after ? 'SAME' : 'DIFF'} ${key}\n    left    :: ${before}\n    arrived :: ${after}`);
  }

  // 4. NOW THE PLAYER EXPLORES. Every press counted.
  const afterTabs = await everyTab(page, 'act1-evening-two', interactions);
  for (const key of Object.keys(beforeTabs)) {
    const before = beforeTabs[key] ?? '';
    const after = afterTabs[key] ?? '';
    console.log(`[act1] TAB ${before === after ? 'SAME' : 'DIFF'} ${key}\n    left    :: ${before}\n    arrived :: ${after}`);
  }

  interactions.report();

  // 5. Where is the camera, really? Calibration is a real measurement of the
  //    screen-to-tile transform, so it says where tile (0,0) sits. It is done
  //    LAST because it presses the world and would otherwise put refusals of
  //    its own on the band the reading above depends on.
  const afterOrigin = await calibrate(page);
  console.log(`[act1] CAMERA evening one origin = (${origin.originX}, ${origin.originY}); evening two origin = (${afterOrigin.originX}, ${afterOrigin.originY})`);

  expect(afterTick).toBeGreaterThan(0);
});

/* ================================================================== */
/* ACT 2 — the load screen as the whole identity of a save             */
/* ================================================================== */

test('act 2 — can a player pick the right prison, and tell what state it is in', async ({ page }) => {
  await openApp(page);

  // Three prisons made deliberately different, each saved by hand, each left
  // at a different day, a different treasury and a different population.
  const shapes: string[] = [];
  for (const [index, spec] of [
    { bricks: 0, label: 'bare' },
    { bricks: 30, label: 'some bricks' },
    { bricks: 90, label: 'a lot of bricks' },
  ].entries()) {
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.waitForTimeout(600);
    if (spec.bricks > 0) {
      await tab(page, 'build').click();
      await buy(page, 'wall-brick', spec.bricks);
    }
    // Different amounts of play, so the prisons differ in the clock too.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(2000 + index * 3000);
    await page.locator('.hud-strip__transport button').nth(0).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Save now' }).click();
    await page.waitForTimeout(900);
    const counts = await latestCounts(page);
    const shape = JSON.stringify({
      label: spec.label,
      tick: await kernelTick(page),
      day: await panelText(page, '.hud-clock__day'),
      funds: counts?.treasuryMinorUnits,
    });
    shapes.push(shape);
    console.log(`[act2] STATE prison ${index + 1} :: ${shape}`);
  }

  console.log(`[act2] HUD the list a returning player sees :: ${JSON.stringify(await savePanel(page), null, 1)}`);

  const distinct = await page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll<HTMLElement>('.save-panel__item')].map((item) =>
          (item.innerText ?? '').replace(/\s+/g, ' ').trim(),
        ),
      ).size,
  );
  const rowCount = await page.locator('.save-panel__item').count();
  console.log(`[act2] HUD distinct row texts = ${distinct} of ${rowCount}`);

  // Anything at all on a row that is about the prison's *state*? Counted
  // rather than asserted absent, so the reading survives one being added.
  const rowAffordances = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.save-panel__item')].map((item) => ({
      text: (item.innerText ?? '').replace(/\s+/g, ' ').trim(),
      title: item.getAttribute('title'),
      ariaLabel: item.getAttribute('aria-label'),
      ariaCurrent: item.getAttribute('aria-current'),
      srOnly: [...item.querySelectorAll('.ui-sr-only')].map((n) => (n.textContent ?? '').trim()),
      inputs: item.querySelectorAll('input, textarea, select, [contenteditable]').length,
    })),
  );
  console.log(`[act2] HUD what a row carries :: ${JSON.stringify(rowAffordances, null, 1)}`);

  const page_text = await page.evaluate(() => (document.body.innerText ?? '').replace(/\n+/g, ' | '));
  for (const word of ['rename', 'name', 'day', 'last played', 'prisoners']) {
    console.log(`[act2] HUD does the word "${word}" appear anywhere on the page? ${page_text.toLowerCase().includes(word) ? 'yes' : 'no'}`);
  }
  console.log(`[act2] STATE the three prisons were genuinely different :: ${JSON.stringify(shapes)}`);
});

/* ================================================================== */
/* ACT 3 — a prison with everything going wrong against an empty one   */
/* ================================================================== */

test('act 3 — how much of the screen is about this prison', async ({ page }) => {
  await openApp(page);

  const built = await buildAndPopulate(page, { beds: 2, admits: 7, guards: 2, label: 'act3' });
  void built;

  // Push it into trouble: run it, so needs decay and the population sits
  // without beds for real in-game time.
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  const target = (await currentTick(page)) + 4800;
  for (let i = 0; i < 120; i += 1) {
    if ((await currentTick(page)) >= target) break;
    await page.waitForTimeout(1000);
  }
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(600);

  console.log(`[act3] STATE trouble :: tick=${await kernelTick(page)} counts=${JSON.stringify(await latestCounts(page))}`);
  const troubled = await arrivalScreen(page);
  const troubledTabs = await everyTab(page, 'act3-troubled');
  console.log(`[act3] HUD the troubled prison, arrival surfaces :: ${JSON.stringify(troubled, null, 1)}`);

  // Now an empty prison in the same browser, same viewport, same tab.
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(1200);
  const empty = await arrivalScreen(page);
  const emptyTabs = await everyTab(page, 'act3-empty');
  console.log(`[act3] HUD the empty prison, arrival surfaces :: ${JSON.stringify(empty, null, 1)}`);

  // The diff, per surface, in lines rather than in characters: a player reads
  // lines.
  const diff = (a: string, b: string): string => {
    const left = a.split(' | ').filter((s) => s.trim() !== '');
    const right = b.split(' | ').filter((s) => s.trim() !== '');
    const same = left.filter((l) => right.includes(l)).length;
    return `${same} of ${left.length} lines on the troubled prison are word-for-word on the empty one`;
  };
  for (const key of Object.keys(troubled)) {
    console.log(`[act3] SAMENESS ${key} :: ${diff(troubled[key] ?? '', empty[key] ?? '')}`);
  }
  for (const key of Object.keys(troubledTabs)) {
    console.log(`[act3] SAMENESS tab:${key} :: ${diff(troubledTabs[key] ?? '', emptyTabs[key] ?? '')}`);
  }

  // And the whole page at once, which is what an eye takes in.
  const wholeTroubled = Object.values(troubledTabs).join(' | ');
  const wholeEmpty = Object.values(emptyTabs).join(' | ');
  console.log(`[act3] SAMENESS whole HUD :: ${diff(wholeTroubled, wholeEmpty)}`);
});

/* ================================================================== */
/* ACT 4 — the Rooms tab, and a switch with no reload                  */
/* ================================================================== */

test('act 4 — does the Rooms tab list the rooms I own, and does a switch keep the world', async ({ page }) => {
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 2, admits: 2, guards: 1, label: 'act4' });
  void origin;

  await tab(page, 'rooms').click();
  await page.waitForTimeout(500);
  const roomRows = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map((r) => ({
      room: r.getAttribute('data-room'),
      text: (r.innerText ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
  console.log(`[act4] HUD Rooms panel rows = ${roomRows.length} :: ${JSON.stringify(roomRows)}`);
  console.log(`[act4] STATE rooms actually owned = ${(await latestCounts(page))?.rooms}`);
  console.log(`[act4] HUD the whole Rooms panel :: ${await line(page, '.hud-rooms')}`);

  // Anything anywhere naming the rooms this prison owns?
  const ownedMentions = await page.evaluate(() => {
    const text = (document.body.innerText ?? '').replace(/\n+/g, ' | ');
    return { hasOwnedList: /1 room|rooms you own|your rooms/i.test(text), sample: text.slice(0, 400) };
  });
  console.log(`[act4] HUD anything naming owned rooms :: ${JSON.stringify(ownedMentions)}`);

  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(900);
  const worldBefore = await worldHash(page, 'act4-world-before-switch');

  // A switch with no reload: New prison, then straight back into the saved one.
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(900);
  const worldOnNew = await worldHash(page, 'act4-world-on-new-prison');
  console.log(`[act4] HUD world md5 on the brand-new prison = ${worldOnNew}`);

  // The saved prison is whichever row is not the active one.
  const rowIndex = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.save-panel__item')].findIndex((i) => i.getAttribute('data-active') !== 'true'),
  );
  console.log(`[act4] HUD loading row index ${rowIndex} of ${await page.locator('.save-panel__item').count()}`);
  await page.locator('.save-panel__item').nth(Math.max(rowIndex, 0)).locator('button:has-text("Load")').click();
  await page.waitForTimeout(2000);

  const worldAfter = await worldHash(page, 'act4-world-after-switch-back');
  console.log(`[act4] HUD world md5 before the switch = ${worldBefore}, after switching back = ${worldAfter}`);
  console.log(`[act4] STATE after switching back :: tick=${await kernelTick(page)} counts=${JSON.stringify(await latestCounts(page))}`);
  console.log(`[act4] HUD arrival after switching back :: ${JSON.stringify(await arrivalScreen(page), null, 1)}`);

  // Is the canvas actually drawing anything, or is it a flat field? A single
  // colour over the whole crop is the "black screen" reading; more than one is
  // a drawn world. Read off the screenshot Playwright composites, because the
  // WebGL canvas has no `preserveDrawingBuffer`.
  const frame = await page.screenshot({ clip: { x: 0, y: 120, width: 900, height: 560 }, animations: 'disabled' });
  const distinctColours = await page.evaluate(async (dataUrl: string) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('unreadable frame'));
      image.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) return -1;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 37) {
      seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return seen.size;
  }, `data:image/png;base64,${frame.toString('base64')}`);
  console.log(`[act4] HUD distinct colours sampled in the world after the switch = ${distinctColours} (1 would be a flat field)`);
});
