import { expect, test, type Page } from '@playwright/test';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  buildAndPopulate,
  buy,
  currentClock,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

/**
 * **More than one prison: the list, the slots, switching, naming, deleting,
 * and what a "session" is.**
 *
 * `docs/research/2026-09-04-does-a-prison-come-back.md` played the reload of a
 * *single* prison and stopped there. This instrument starts where it stopped:
 * it makes several prisons in one browser, switches between them, comes back
 * to them, looks for a way to name one, runs past the README's five-slot
 * figure, and deletes one — and it reads, at every step, what the screen says
 * to a player who now owns more than one save.
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
 * `docs/research/2026-09-04-many-prisons.md`.
 *
 * Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5315 node --experimental-transform-types \
 *   --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-many-prisons.playtest.ts -g "act 1"
 * ```
 */

/* ------------------------------------------------------------------ */
/* The projection probe, lifted verbatim in intent from                */
/* playtest-does-a-prison-come-back.playtest.ts.                       */
/* ------------------------------------------------------------------ */

/**
 * Captures the worker instance and installs an in-page projection puller.
 *
 * **Must be installed after `installTee`**, which replaces `Worker` with a tee
 * subclass; this one subclasses whatever `Worker` is by then, so the other
 * order loses the instance handle.
 *
 * The handle is re-captured on every `new Worker(...)`, which matters here
 * more than it did for a single-prison playtest: `WorkerPerSessionHost` builds
 * a fresh worker for every create and every load (`src/main.ts:3165`), so a
 * probe that cached the first one would answer questions about a terminated
 * session.
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
 * The kernel tick, off a projection reply rather than off
 * `simulation/clock-state`.
 *
 * **Use this and not `currentTick` wherever the clock may be stopped**, and in
 * this file that is nearly everywhere: creating or loading a prison leaves the
 * clock paused, so the tee's last `clock-state` message is from the *previous*
 * prison and would be read as this one's. A page with no session answers
 * `protocol/error`, reported as `-1`, which is itself a reading.
 */
async function kernelTick(page: Page): Promise<number> {
  try {
    return (await page.evaluate(
      async () => (await (window as unknown as { __lsProjection: (p: string) => Promise<unknown> }).__lsProjection('hud/prisoner-population')) as { tick: number },
    )).tick;
  } catch {
    return -1;
  }
}

/* ------------------------------------------------------------------ */
/* HUD readings                                                        */
/* ------------------------------------------------------------------ */

/** Every transport button, by index: 0 pause, 1 play, 2 fast-forward. */
const transport = (page: Page, index: 0 | 1 | 2) => page.locator('.hud-strip__transport button').nth(index);

/** A one-line reading of a panel, newlines flattened so two readings compare by eye. */
async function line(page: Page, selector: string): Promise<string> {
  return (await panelText(page, selector)).replace(/\n+/g, ' | ');
}

/** The save panel's four fields, exactly as rendered. */
async function savePanel(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const read = (selector: string): string => (document.querySelector<HTMLElement>(selector)?.innerText ?? 'ABSENT').replace(/\n+/g, ' | ').trim();
    return {
      status: read('.save-panel__status'),
      detail: read('.save-panel__detail'),
      list: read('.save-panel__list'),
    };
  });
}

/**
 * Every prison row, as a player's screen reader and a player's eye would take
 * it: the label text, whether the row is the active one, the accessible names
 * of its controls, and the computed weight and colour that are the *only*
 * things distinguishing the active row (`src/styles.css:148`).
 */
interface RowReading {
  readonly index: number;
  readonly label: string;
  readonly activeAttribute: string | null;
  readonly fontWeight: string;
  readonly colour: string;
  readonly controls: readonly string[];
  readonly inputs: number;
  readonly editable: number;
}

async function rows(page: Page): Promise<readonly RowReading[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.save-panel__item')].map((item, index) => {
      const label = item.querySelector<HTMLElement>('.save-panel__item-label');
      const style = label === null ? null : getComputedStyle(label);
      return {
        index,
        label: (label?.textContent ?? '').trim(),
        activeAttribute: item.getAttribute('data-active'),
        fontWeight: style?.fontWeight ?? '',
        colour: style?.color ?? '',
        controls: [...item.querySelectorAll('button')].map((button) => (button.textContent ?? '').trim()),
        // A rename affordance would have to be one of these. Counted rather
        // than asserted absent, so the reading survives one being added.
        inputs: item.querySelectorAll('input, textarea, select').length,
        editable: item.querySelectorAll('[contenteditable]').length,
      };
    }),
  );
}

/** Counts every dialog the page has, of any kind a player would have to answer. */
async function domDialogs(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], .modal, [aria-modal="true"]').length,
  );
}

/**
 * Arms a counter for native `confirm`/`alert`/`prompt`.
 *
 * Playwright auto-dismisses a native dialog when nothing is listening, so an
 * un-counted `confirm()` would look exactly like no confirmation at all. This
 * distinguishes them.
 */
function armNativeDialogs(page: Page): { count: () => number; messages: string[] } {
  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return { count: () => messages.length, messages };
}

/** The whole visible page as one string, for asking what a word appears in. */
async function wholePageText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.innerText ?? '').replace(/\n+/g, ' | '));
}

/** Presses New prison and waits for the panel to settle. */
async function newPrison(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(600);
  console.log(`[${label}] HUD after New prison :: ${JSON.stringify(await savePanel(page))}`);
}

/** A compact reading of the money/buildings/people/clock a switch has to bring back. */
async function shape(page: Page): Promise<string> {
  const counts = await latestCounts(page);
  return JSON.stringify({
    tick: await kernelTick(page),
    clock: await currentClock(page),
    day: await panelText(page, '.hud-clock__day'),
    funds: counts?.treasuryMinorUnits,
    rooms: counts?.rooms,
    prisoners: counts?.prisoners,
    staff: counts?.staff,
    activeTab: await page.locator('.hud').getAttribute('data-active-tab'),
  });
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

test('act 1 — a player who has one prison asks for a second', async ({ page }) => {
  const native = armNativeDialogs(page);
  await openApp(page);

  console.log(`[act1] HUD on a first-ever visit :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act1] HUD does the empty screen mention prisons, slots or an account? :: ${JSON.stringify(await wholePageText(page))}`);

  // --- prison A, played and deliberately left unsaved -----------------
  await newPrison(page, 'act1');
  await tab(page, 'build').click();
  await buy(page, 'wall-brick', 40);
  await transport(page, 1).click();
  await page.waitForTimeout(6000);
  await transport(page, 0).click();
  await page.waitForTimeout(500);

  const beforeSecond = await shape(page);
  console.log(`[act1] STATE prison A just before the player asks for a second :: ${beforeSecond}`);
  console.log(`[act1] HUD panel just before :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act1] HUD strip just before :: ${await line(page, '.hud-strip')}`);

  // --- the second prison ---------------------------------------------
  const dialogsBefore = await domDialogs(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(400);
  console.log(`[act1] HUD dialogs while the second prison is created = ${await domDialogs(page)} (was ${dialogsBefore}); native = ${native.count()} ${JSON.stringify(native.messages)}`);
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(800);

  console.log(`[act1] HUD after the second prison :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act1] HUD rows after the second prison :: ${JSON.stringify(await rows(page), null, 1)}`);
  console.log(`[act1] STATE prison B :: ${await shape(page)}`);

  // --- and back to the first -------------------------------------------
  const listRows = page.locator('.save-panel__item');
  const count = await listRows.count();
  console.log(`[act1] HUD rows on screen = ${count}`);
  // The bottom row is the older prison: `orderPrisonsForDisplay` sorts
  // `updatedAt` descending (`src/ui/save-panel.ts:473`).
  await listRows.nth(count - 1).getByRole('button', { name: 'Load' }).click();
  await page.waitForTimeout(2500);
  console.log(`[act1] HUD after loading the older row :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act1] STATE what came back when the player returned to prison A :: ${await shape(page)}`);
  console.log(`[act1] STATE what was on screen before they left A :: ${beforeSecond}`);
  // Which row the game now considers active. Both prisons' generation 1 is a
  // bare world at tick 0 with 25,000, so the numbers above cannot say *which*
  // prison came back — only that A's play is not in it. This can.
  console.log(`[act1] HUD which row is active after the load :: ${JSON.stringify(await rows(page))}`);
});

/* ================================================================== */

test('act 2 — the list of prisons, and whether a row identifies one', async ({ page }) => {
  await openApp(page);

  // Three prisons, each given a different amount of play, so that if a row
  // could carry anything distinguishing there would be something to carry.
  for (const [index, spend] of [10, 30, 55].entries()) {
    await newPrison(page, `act2-p${index + 1}`);
    await tab(page, 'build').click();
    await buy(page, 'wall-brick', spend);
    await transport(page, 1).click();
    await page.waitForTimeout(2000 + index * 3000);
    await transport(page, 0).click();
    await page.waitForTimeout(400);
    console.log(`[act2] STATE prison ${index + 1} after ${spend} bricks :: ${await shape(page)}`);
  }

  console.log(`[act2] HUD panel with three prisons :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act2] HUD every row, exactly :: ${JSON.stringify(await rows(page), null, 1)}`);
  console.log(`[act2] HUD distinct row labels = ${new Set((await rows(page)).map((r) => r.label)).size} of ${(await rows(page)).length}`);

  // Is there anywhere at all to name a prison?
  const affordances = await page.evaluate(() => {
    const panel = document.querySelector('.save-panel');
    return {
      inputsInPanel: panel?.querySelectorAll('input, textarea, [contenteditable]').length ?? -1,
      buttonsInPanel: [...(panel?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()),
      anythingSayingRename: (document.body.innerText ?? '').toLowerCase().includes('rename'),
      anythingSayingName: (document.body.innerText ?? '').toLowerCase().includes('name'),
    };
  });
  console.log(`[act2] HUD naming affordances anywhere on the page :: ${JSON.stringify(affordances)}`);

  // Does the row's generation count keep up with the saves behind it? The
  // autosave reports through `reportBackgroundSave`, which sets the status
  // line and does not refresh the list (`src/ui/save-panel.ts:613`).
  console.log(`[act2] HUD row of the active prison before more play :: ${JSON.stringify((await rows(page))[0])}`);
  await tab(page, 'build').click();
  await buy(page, 'wall-brick', 5);
  await transport(page, 1).click();
  await page.waitForTimeout(40_000);
  await transport(page, 0).click();
  console.log(`[act2] HUD status after 40s with a command in it :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act2] HUD rows after that autosave window, without touching the panel :: ${JSON.stringify(await rows(page))}`);
  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(1500);
  console.log(`[act2] HUD rows after pressing Save now, which does refresh the list :: ${JSON.stringify(await rows(page))}`);
});

/* ================================================================== */

test('act 3 — does the prison you come back to come back whole', async ({ page }) => {
  test.setTimeout(900_000);
  await openApp(page);

  // A real prison: money spent, walls up, a room zoned, prisoners admitted,
  // guards hired. `buildAndPopulate` presses New prison itself.
  await buildAndPopulate(page, { beds: 3, admits: 4, guards: 2, label: 'act3' });
  await tab(page, 'regime').click();
  await page.waitForTimeout(1000);
  await transport(page, 0).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Save now' }).click();
  await page.waitForTimeout(2000);

  const before = await shape(page);
  const beforeRegime = await line(page, '.hud-regime');
  const beforeStrip = await line(page, '.hud-strip');
  console.log(`[act3] STATE prison A, saved and left :: ${before}`);
  console.log(`[act3] HUD prison A strip :: ${beforeStrip}`);
  console.log(`[act3] HUD prison A regime panel :: ${beforeRegime}`);
  console.log(`[act3] HUD prison A save panel :: ${JSON.stringify(await savePanel(page))}`);

  // A second prison, then straight back to the first.
  await newPrison(page, 'act3');
  console.log(`[act3] STATE prison B :: ${await shape(page)}`);
  console.log(`[act3] HUD which tab is showing while B is active = ${await page.locator('.hud').getAttribute('data-active-tab')}`);

  const listRows = page.locator('.save-panel__item');
  await listRows.nth((await listRows.count()) - 1).getByRole('button', { name: 'Load' }).click();
  await page.waitForTimeout(4000);

  const after = await shape(page);
  console.log(`[act3] STATE prison A on the way back :: ${after}`);
  console.log(`[act3] HUD prison A strip on the way back :: ${await line(page, '.hud-strip')}`);
  console.log(`[act3] HUD which tab is showing after the switch back = ${await page.locator('.hud').getAttribute('data-active-tab')}`);
  await tab(page, 'regime').click();
  await page.waitForTimeout(1200);
  console.log(`[act3] HUD prison A regime panel on the way back :: ${await line(page, '.hud-regime')}`);
  console.log(`[act3] HUD prison A save panel on the way back :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act3] === before :: ${before}`);
  console.log(`[act3] === after  :: ${after}`);
});

/* ================================================================== */

test('act 4 — five free save slots, and the sixth', async ({ page }) => {
  test.setTimeout(600_000);
  await openApp(page);

  for (let index = 1; index <= 6; index += 1) {
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.waitForTimeout(900);
    const panel = await savePanel(page);
    console.log(`[act4] after pressing New prison ${index} time(s) :: rows=${(await rows(page)).length} status=${JSON.stringify(panel.status)}`);
    console.log(`[act4]   list = ${JSON.stringify(panel.list)}`);
  }

  const text = await wholePageText(page);
  console.log(`[act4] HUD does the word "slot" appear anywhere on screen? ${/slot/i.test(text)}`);
  console.log(`[act4] HUD does the word "limit" appear anywhere on screen? ${/limit/i.test(text)}`);
  console.log(`[act4] HUD does the word "five" or "5 " appear near a prison count? ${/\bfive\b/i.test(text)}`);
  console.log(`[act4] HUD whole page :: ${JSON.stringify(text)}`);
  console.log(`[act4] HUD final rows :: ${JSON.stringify(await rows(page))}`);
});

/* ================================================================== */

test('act 5 — deleting one of several prisons', async ({ page }) => {
  const native = armNativeDialogs(page);
  await openApp(page);

  for (let index = 1; index <= 3; index += 1) {
    await newPrison(page, `act5-p${index}`);
    await tab(page, 'build').click();
    await buy(page, 'wall-brick', 10 * index);
    await page.waitForTimeout(400);
  }
  console.log(`[act5] HUD three prisons :: ${JSON.stringify(await rows(page))}`);

  // Delete a prison the player is *not* in: the middle row.
  const listRows = page.locator('.save-panel__item');
  const middle = listRows.nth(1);
  console.log(`[act5] HUD the row about to be deleted reads :: ${JSON.stringify((await middle.innerText()).replace(/\n+/g, ' | '))}`);
  console.log(`[act5] HUD dialogs before Delete = ${await domDialogs(page)}; native = ${native.count()}`);
  await middle.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(300);
  console.log(`[act5] HUD dialogs during/after Delete = ${await domDialogs(page)}; native = ${native.count()} ${JSON.stringify(native.messages)}`);
  await page.waitForTimeout(1500);
  console.log(`[act5] HUD after Delete :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act5] HUD rows after Delete :: ${JSON.stringify(await rows(page))}`);
  console.log(`[act5] HUD is there any undo, restore or recycle control? ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.save-panel button')].map((b) => (b.textContent ?? '').trim())))}`);

  // And the reverse question: is the *active* prison's Delete any different
  // from the others'? (#582 RED-001 / LS-03 know the outcome; this reads the
  // row a player has to choose between.)
  console.log(`[act5] HUD the active row's controls vs the others' :: ${JSON.stringify(await rows(page))}`);
});

/* ================================================================== */

test('act 6 — where do a player\'s prisons actually live', async ({ browser }) => {
  const first = await browser.newContext();
  const pageOne = await first.newPage();
  await installTee(pageOne);
  await installProjectionProbe(pageOne);
  await openApp(pageOne);
  await pageOne.getByRole('button', { name: 'New prison' }).click();
  await expect(pageOne.locator('.hud-clock__day')).toHaveText('1');
  await pageOne.waitForTimeout(1200);
  console.log(`[act6] HUD context one, after making a prison :: ${JSON.stringify(await savePanel(pageOne))}`);
  console.log(`[act6] HUD every sentence the page says about where saves live :: ${JSON.stringify(
    (await wholePageText(pageOne)).split(' | ').filter((s) => /save|local|network|account|cloud|browser|device|sign/i.test(s)),
  )}`);

  // A second browser context is a second storage partition — the same machine,
  // the same URL, a different profile. What a player would call "the same
  // computer" and the game calls somebody else.
  const second = await browser.newContext();
  const pageTwo = await second.newPage();
  await installTee(pageTwo);
  await installProjectionProbe(pageTwo);
  await openApp(pageTwo);
  await pageTwo.waitForTimeout(800);
  console.log(`[act6] HUD context two, same URL, same machine :: ${JSON.stringify(await savePanel(pageTwo))}`);
  console.log(`[act6] HUD context two rows = ${(await rows(pageTwo)).length}`);

  // And the same partition in a second tab: two live sessions on one prison.
  const pageThree = await first.newPage();
  await installTee(pageThree);
  await installProjectionProbe(pageThree);
  await openApp(pageThree);
  await pageThree.waitForTimeout(800);
  console.log(`[act6] HUD a second tab of context one :: ${JSON.stringify(await savePanel(pageThree))}`);
  console.log(`[act6] HUD does either tab say the prison is open elsewhere? one=${JSON.stringify((await wholePageText(pageOne)).match(/another tab|elsewhere|already open/i))} three=${JSON.stringify((await wholePageText(pageThree)).match(/another tab|elsewhere|already open/i))}`);

  await first.close();
  await second.close();
});
