import { expect, test, type Page } from '@playwright/test';

/**
 * A *playtest*, not a regression suite. **This file is deliberately not
 * merged, and must not become a CI gate.**
 *
 * It carries 11 `expect` calls against 118 `console.log` calls: it reproduces
 * issue #569 for whoever fixes it, and it would pass whether or not #569 is
 * ever fixed. Running it costs a browser suite several minutes and buys no
 * guard. The findings live in `docs/research/2026-08-29-mouse-playtest.md` on
 * `agent/playtest-research-note`; the guard for the fix belongs beside the fix.
 *
 * If you are fixing #569: `-g "what each one does"` is the shortest path to
 * the defect, and `-g "the mouse-only route"` is the whole naive walk.
 *
 * The owner's complaint is that a prison could not be built by playing:
 * "znajdz bugi i bledy grajac, bo ja nie moglem postawic wiezienia itp grajac
 * sam". This file walks the route a new player walks -- **mouse only, no
 * keyboard shortcuts** -- through the real assembled page (`index.html` +
 * `src/main.ts`), and narrates what the game tells the player at each step.
 *
 * It deliberately asserts very little. Its output is the deliverable: the
 * `console.log` transcript is read by a human looking for the points at which
 * the game does not say what it wants.
 */

const APP_URL = '/index.html';
const TILE = 64;

interface CommandTeeWindow {
  lockstateSentToWorker?: unknown[];
  lockstateFromWorker?: unknown[];
}

interface SubmittedCommand {
  readonly kind?: string;
  readonly payload?: { readonly command?: { readonly data?: Record<string, unknown> } };
}

async function installCommandTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    class CommandTeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        // A *second* listener, so nothing is taken away from the application's
        // own handler: the page still gets every reply it would have got.
        super.addEventListener('message', (event: MessageEvent) => {
          received.push(event.data);
        });
      }

      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = CommandTeeWorker as unknown as typeof Worker;
    (window as unknown as CommandTeeWindow).lockstateSentToWorker = sent;
    (window as unknown as CommandTeeWindow).lockstateFromWorker = received;
  });
}

async function sentCommands(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(() =>
    ((window as unknown as CommandTeeWindow).lockstateSentToWorker ?? [])
      .map((message) => message as SubmittedCommand)
      .filter((message) => message.kind === 'simulation/submit-command')
      .map((message) => message.payload?.command?.data ?? {}),
  );
}

/** Everything the worker said back, minus the bulky snapshot/delta traffic. */
async function workerReplies(page: Page): Promise<readonly unknown[]> {
  return page.evaluate(() =>
    ((window as unknown as CommandTeeWindow).lockstateFromWorker ?? []).filter((message) => {
      const kind = (message as { kind?: string }).kind ?? '';
      return kind !== 'simulation/delta' && kind !== 'simulation/snapshot' && kind !== 'simulation/projection';
    }),
  );
}

async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

async function panelText(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    if (node === null) return `${sel}: ABSENT`;
    if (node.hidden || node.getClientRects().length === 0) return `${sel}: not laid out`;
    return (node.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  }, selector);
}

async function isWorld(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ({ px, py }) => document.elementFromPoint(px, py)?.tagName.toLowerCase() === 'canvas',
    { px: x, py: y },
  );
}

/** One press, and the commands it produced. */
async function press(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(120);
  return (await sentCommands(page)).slice(before);
}

/**
 * Measures the screen->tile transform against the real page.
 *
 * Remove mode is the probe because a `RemoveObject` on bare ground changes
 * nothing, so the measurement cannot disturb what it is measuring. Bisection
 * finds the exact screen pixel at which the reported tile increments, which
 * pins the origin rather than bounding it.
 */
async function calibrate(page: Page): Promise<{ originX: number; originY: number }> {
  await page.locator('.hud-build__remove').click();
  const probeX = 700;
  const probeY = 300;
  const at = async (x: number, y: number): Promise<{ x: number; y: number }> => {
    const commands = await press(page, x, y);
    const removal = commands.find((c) => c['type'] === 'RemoveObject');
    if (removal === undefined) throw new Error(`no RemoveObject from a press at ${x},${y}: ${JSON.stringify(commands)}`);
    return { x: removal['x'] as number, y: removal['y'] as number };
  };

  const base = await at(probeX, probeY);
  // Boundary between `base.x` and `base.x + 1` lies in (probeX, probeX + 64].
  let lo = probeX;
  let hi = probeX + TILE;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(mid, probeY);
    if (tile.x === base.x) lo = mid;
    else hi = mid;
  }
  const originX = hi - (base.x + 1) * TILE;

  lo = probeY;
  hi = probeY + TILE;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(probeX, mid);
    if (tile.y === base.y) lo = mid;
    else hi = mid;
  }
  const originY = hi - (base.y + 1) * TILE;

  await page.locator('.hud-build__remove').click();
  return { originX, originY };
}

const centreOf = (origin: { originX: number; originY: number }, tx: number, ty: number) => ({
  x: origin.originX + tx * TILE + TILE / 2,
  y: origin.originY + ty * TILE + TILE / 2,
});

test.describe('playtest: build a prison with the mouse only', () => {
  test('the mouse-only route, narrated', async ({ page }) => {
    test.setTimeout(300_000);
    const consoleLines: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'debug') return;
      const text = message.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${message.type()}] ${text}`);
    });
    page.on('pageerror', (error) => {
      consoleLines.push(`[pageerror] ${error.message}`);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await installCommandTee(page);
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await page.getByRole('button', { name: 'Build' }).click();
    const origin = await calibrate(page);
    console.log(`=== CALIBRATION: tile (0,0) top-left is screen (${origin.originX}, ${origin.originY}) at 1440x900 ===`);
    const check = centreOf(origin, 16, 16);
    console.log(`tile (16,16) centre should be screen ${JSON.stringify(check)}; is it world? ${await isWorld(page, check.x, check.y)}`);

    // ------------------------------------------------------------------
    // STEP 1 -- zone a cell, the way a new player would: Rooms tab, pick
    // "Cell", arm, drag a rectangle, confirm.
    // ------------------------------------------------------------------
    await page.getByRole('button', { name: 'Rooms' }).click();
    console.log('=== ROOMS PANEL, on arrival ===');
    console.log(await panelText(page, '.hud-rooms'));

    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    console.log('=== ROOMS PANEL, after picking Cell ===');
    console.log(await panelText(page, '.hud-rooms'));

    await page.locator('.hud-rooms__arm').click();
    console.log('=== ROOMS PANEL, after arming ===');
    console.log(await panelText(page, '.hud-rooms'));

    const from = centreOf(origin, 12, 12);
    const to = centreOf(origin, 15, 15);
    console.log(`dragging the room from tile (12,12) @ ${JSON.stringify(from)} to (15,15) @ ${JSON.stringify(to)}`);
    expect(await isWorld(page, from.x, from.y), 'room drag start is not the world').toBe(true);
    expect(await isWorld(page, to.x, to.y), 'room drag end is not the world').toBe(true);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);

    console.log('=== ROOMS PANEL, after the drag (before confirm) ===');
    console.log(await panelText(page, '.hud-rooms'));

    const confirm = page.locator('.hud-rooms__confirm');
    console.log(`confirm visible: ${await confirm.isVisible()}  enabled: ${await confirm.isEnabled().catch(() => 'n/a')}`);
    await confirm.click();
    await page.waitForTimeout(400);

    console.log('=== ROOMS PANEL, after confirm (as the player sees it) ===');
    console.log(await panelText(page, '.hud-rooms'));
    console.log('=== ALERTS after the refused designation ===');
    console.log(`.hud-minimap    -> ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);
    console.log(`.hud-alerts__list -> ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    console.log(
      `alerts geometry: ${JSON.stringify(
        await page.evaluate(() => {
          const list = document.querySelector<HTMLElement>('.hud-alerts__list');
          if (list === null) return 'absent';
          const rect = list.getBoundingClientRect();
          const rows = [...list.querySelectorAll<HTMLElement>('[data-alert]')].map((row) => ({
            alert: row.dataset['alert'],
            text: row.innerText,
            onScreen: row.getBoundingClientRect().width > 0 && row.getBoundingClientRect().height > 0,
          }));
          const centre = {
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
          };
          return {
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            topmostAtCentre: document.elementFromPoint(centre.x, centre.y)?.className ?? null,
            rows,
          };
        }),
      )}`,
    );
    console.log(`rooms panel data-collapsed = ${await page.locator('.hud-rooms').getAttribute('data-collapsed')}`);
    // Re-open it by hand, the way a player who lost the panel would.
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.waitForTimeout(200);
    console.log('=== ROOMS PANEL, re-expanded after confirm ===');
    console.log(await panelText(page, '.hud-rooms'));
    console.log('=== STATUS STRIP after confirm ===');
    console.log((await panelText(page, '.hud-strip')).split('\n').slice(3).join(' | '));

    // ------------------------------------------------------------------
    // STEP 2 -- the room wants a bed and a toilet. Place them, with the mouse.
    // ------------------------------------------------------------------
    await page.getByRole('button', { name: 'Build' }).click();
    for (const [buildable, tx, ty] of [
      ['bed-wooden', 12, 12],
      ['toilet-brick', 14, 12],
    ] as const) {
      await page.locator(`.hud-build__list [data-buildable="${buildable}"]`).click();
      const armLabel = await page.locator('.hud-build__arm').innerText();
      if (armLabel.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
      const point = centreOf(origin, tx, ty);
      console.log(`--- placing ${buildable} on tile (${tx},${ty}) @ ${JSON.stringify(point)}; arm said "${armLabel.trim()}"`);
      console.log(`  commands: ${JSON.stringify(await press(page, point.x, point.y))}`);
      console.log(`  WHERE readout: ${JSON.stringify(await panelText(page, '.hud-build__coordinates'))}`);
    }
    await page.waitForTimeout(600);
    console.log('=== BUILD PANEL after placing bed + toilet ===');
    console.log(await panelText(page, '.hud-build'));
    console.log('=== ROOMS PANEL after placing bed + toilet ===');
    await page.getByRole('button', { name: 'Rooms' }).click();
    console.log(await panelText(page, '.hud-rooms'));

    // ------------------------------------------------------------------
    // STEP 3 -- walls. The room is "open on at least one side"; enclose it.
    // ------------------------------------------------------------------
    await page.getByRole('button', { name: 'Build' }).click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const wallArm = await page.locator('.hud-build__arm').innerText();
    if (wallArm.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
    console.log(`=== wall armed ("${wallArm.trim()}"); WHERE says: ${JSON.stringify(await panelText(page, '.hud-build__coordinates'))}`);

    // North edge of the room: y = top of tile row 12, x across columns 12..15.
    const northY = origin.originY + 12 * TILE;
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 16 * TILE;
    const southY = origin.originY + 16 * TILE;
    const runs: readonly { name: string; a: { x: number; y: number }; b: { x: number; y: number } }[] = [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ];
    for (const run of runs) {
      const before = (await sentCommands(page)).length;
      await page.mouse.move(run.a.x, run.a.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move((run.a.x + run.b.x) / 2, (run.a.y + run.b.y) / 2, { steps: 8 });
      await page.mouse.move(run.b.x, run.b.y, { steps: 8 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(200);
      const produced = (await sentCommands(page)).slice(before);
      console.log(`--- wall run ${run.name}: ${JSON.stringify(run.a)} -> ${JSON.stringify(run.b)}`);
      console.log(`    ${produced.length} command(s): ${JSON.stringify(produced)}`);
    }
    await page.waitForTimeout(800);
    console.log('=== BUILD PANEL after four wall runs ===');
    console.log(await panelText(page, '.hud-build'));

    // ------------------------------------------------------------------
    // STEP 4 -- a door. Never exercised by any previous playtest.
    // ------------------------------------------------------------------
    await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
    const doorArm = await page.locator('.hud-build__arm').innerText();
    if (doorArm.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
    console.log(`=== door armed ("${doorArm.trim()}") ===`);
    console.log(`WHERE: ${JSON.stringify(await panelText(page, '.hud-build__coordinates'))}`);
    const doorPoint = { x: westX + TILE / 2, y: southY };
    console.log(`--- door press at ${JSON.stringify(doorPoint)} (south edge of tile 12,15)`);
    console.log(`    commands: ${JSON.stringify(await press(page, doorPoint.x, doorPoint.y))}`);
    await page.waitForTimeout(800);
    console.log('=== BUILD PANEL after the door ===');
    console.log(await panelText(page, '.hud-build'));

    console.log('=== ROOMS PANEL at the end ===');
    await page.getByRole('button', { name: 'Rooms' }).click();
    console.log(await panelText(page, '.hud-rooms'));
    console.log('=== STATUS STRIP at the end ===');
    console.log((await panelText(page, '.hud-strip')).split('\n').slice(3).join(' | '));
    console.log('=== BUILD QUEUE ROWS ===');
    await page.getByRole('button', { name: 'Build' }).click();
    console.log(await panelText(page, '.hud-build__queue'));
    console.log('=== WHAT THE WORKER SAID BACK (no deltas/snapshots) ===');
    for (const reply of await workerReplies(page)) console.log(JSON.stringify(reply));
    console.log('=== console ===');
    console.log(consoleLines.join('\n') || '(nothing)');
  });
});

/**
 * The *informed* route: what a player has to know that the game never says.
 *
 * Test one above establishes that zoning first dead-ends. This one plays the
 * order the simulation actually requires -- buy bricks, run the clock, build
 * the four walls, and only then zone the enclosed rectangle -- and asks
 * whether the game is finishable that way at all.
 *
 * Departure from mouse-only, stated rather than hidden: the purchase quantity
 * is typed rather than stepped, because the stepper would be a hundred
 * presses and the quantity field is not what is under test. Every world
 * gesture -- every wall run, the room drag, every object placement -- is a
 * real mouse gesture.
 */
test.describe('playtest: the informed route', () => {
  test('walls first, then zone', async ({ page }) => {
    test.setTimeout(300_000);
    const consoleLines: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'debug') return;
      const text = message.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${message.type()}] ${text}`);
    });
    page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installCommandTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // Open the folded Alerts box, so a refusal is at least visible to *this*
    // run. A player has no reason to do this.
    await page.locator('.hud-minimap .ui-section__header').click();
    console.log(`alerts opened: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);

    await page.getByRole('button', { name: 'Build' }).click();
    const origin = await calibrate(page);
    console.log(`calibration: tile(0,0) top-left = (${origin.originX}, ${origin.originY})`);
    console.log(`alerts now: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);

    // ---- buy bricks --------------------------------------------------
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.locator('.hud-build__buy-toggle').click();
    console.log(`buy row: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
    await page.locator('.hud-build__buy .ui-number__input').fill('60');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(300);
    console.log(`after buy -- funds: ${await page.locator('.hud-strip').innerText().then((t) => t.replace(/\n/g, ' | '))}`);
    console.log(`deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // ---- run the clock so the delivery can land ----------------------
    await page.getByRole('button', { name: 'Fast forward' }).click();
    await page.waitForTimeout(4000);
    console.log(`day/progress: ${await page.locator('.hud-clock__day').innerText()} / ${await page.locator('.hud-clock__day-progress').innerText()}`);
    console.log(`deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // ---- four wall runs, with the mouse ------------------------------
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const arm = await page.locator('.hud-build__arm').innerText();
    if (arm.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
    const northY = origin.originY + 12 * TILE;
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 16 * TILE;
    const southY = origin.originY + 16 * TILE;
    for (const run of [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      await page.mouse.move(run.a.x, run.a.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move((run.a.x + run.b.x) / 2, (run.a.y + run.b.y) / 2, { steps: 8 });
      await page.mouse.move(run.b.x, run.b.y, { steps: 8 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(150);
    }
    console.log(`queue right after the runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    for (const wait of [3000, 5000, 10000, 15000]) {
      await page.waitForTimeout(wait);
      console.log(
        `t+${wait}: queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))} | day ${await page.locator('.hud-clock__day').innerText()} ${await page.locator('.hud-clock__day-progress').innerText()}`,
      );
    }
    console.log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);

    // ---- now zone the enclosed rectangle -----------------------------
    await page.getByRole('button', { name: 'Rooms' }).click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    const from = centreOf(origin, 12, 12);
    const to = centreOf(origin, 15, 15);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);
    console.log('=== rooms panel with the designation pending ===');
    console.log(await panelText(page, '.hud-rooms'));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(600);
    console.log(`ROOMS count now: ${await page.locator('.hud-strip').innerText().then((t) => t.replace(/\n/g, ' | '))}`);
    console.log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    console.log('=== rooms panel after confirm ===');
    console.log(await panelText(page, '.hud-rooms'));

    console.log('=== last worker refusals ===');
    for (const reply of (await workerReplies(page)).slice(-6)) console.log(JSON.stringify(reply).slice(0, 700));
    console.log('=== console ===');
    console.log(consoleLines.join('\n') || '(nothing)');
  });
});

/**
 * Save, reload, load -- after a prison built with the mouse.
 *
 * Issue #559 already records that a restored V4 save keeps an unbounded yard
 * because V4 stores no room bounds. This asks what *else* a mouse-built
 * prison loses across a real navigation.
 */
test.describe('playtest: save and reload a mouse-built prison', () => {
  test('what survives a real navigation', async ({ page }) => {
    test.setTimeout(300_000);
    const consoleLines: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'debug') return;
      const text = message.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${message.type()}] ${text}`);
    });
    page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installCommandTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.locator('.hud-minimap .ui-section__header').click();

    await page.getByRole('button', { name: 'Build' }).click();
    const origin = await calibrate(page);

    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('60');
    await page.locator('.hud-build__buy-submit').click();
    await page.getByRole('button', { name: 'Fast forward' }).click();
    await page.waitForTimeout(4000);

    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const arm = await page.locator('.hud-build__arm').innerText();
    if (arm.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
    const northY = origin.originY + 12 * TILE;
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 16 * TILE;
    const southY = origin.originY + 16 * TILE;
    for (const run of [
      { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      await page.mouse.move(run.a.x, run.a.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move((run.a.x + run.b.x) / 2, (run.a.y + run.b.y) / 2, { steps: 8 });
      await page.mouse.move(run.b.x, run.b.y, { steps: 8 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(25_000);

    await page.getByRole('button', { name: 'Rooms' }).click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    const from = centreOf(origin, 12, 12);
    const to = centreOf(origin, 15, 15);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);

    // Objects, inside the room this time.
    await page.getByRole('button', { name: 'Build' }).click();
    for (const [buildable, tx, ty] of [
      ['bed-wooden', 13, 13],
      ['toilet-brick', 15, 13],
    ] as const) {
      await page.locator(`.hud-build__list [data-buildable="${buildable}"]`).click();
      const label = await page.locator('.hud-build__arm').innerText();
      if (label.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
      const point = centreOf(origin, tx, ty);
      console.log(`place ${buildable} @ tile(${tx},${ty}): ${JSON.stringify(await press(page, point.x, point.y))}`);
    }
    await page.waitForTimeout(20_000);

    const before = {
      strip: (await panelText(page, '.hud-strip')).replace(/\n/g, ' | '),
      rooms: await panelText(page, '.hud-rooms'),
      alerts: await panelText(page, '.hud-alerts__list'),
      queue: await panelText(page, '.hud-build__queue'),
    };
    console.log('=== BEFORE SAVE ===');
    console.log(before.strip);
    console.log(`alerts: ${JSON.stringify(before.alerts)}`);
    console.log(`queue: ${JSON.stringify(before.queue)}`);

    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved', { timeout: 15_000 });
    console.log(`save status: ${await page.locator('.save-panel__status').innerText()}`);
    console.log(`save row: ${await page.locator('.save-panel__item-label').first().innerText()}`);

    // A real navigation.
    await page.reload();
    await openApp(page);
    console.log('=== AFTER RELOAD, before Load ===');
    console.log(`save row: ${await page.locator('.save-panel__item-label').first().innerText()}`);
    console.log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    await page.getByRole('button', { name: 'Load' }).first().click();
    await page.waitForTimeout(3000);
    console.log('=== AFTER LOAD ===');
    console.log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    await page.getByRole('button', { name: 'Rooms' }).click();
    console.log(`rooms: ${await panelText(page, '.hud-rooms')}`);
    await page.getByRole('button', { name: 'Build' }).click();
    console.log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    console.log(`clock: day ${await page.locator('.hud-clock__day').innerText()} ${await page.locator('.hud-clock__day-progress').innerText()}`);
    console.log('=== console ===');
    console.log(consoleLines.join('\n') || '(nothing)');
  });
});

/**
 * What the build queue says while an order cannot start.
 *
 * A bed needs a plank; the walls needed bricks. A player who bought bricks and
 * then ordered a bed has an order that can never start, and the panel's
 * folded readout is "N waiting". This opens the queue and reads the row.
 */
test.describe('playtest: an order that cannot start', () => {
  test('what the queue row says', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installCommandTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).click();
    const origin = await calibrate(page);

    // One wall order, with no bricks bought at all.
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const arm = await page.locator('.hud-build__arm').innerText();
    if (arm.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').click();
    await press(page, origin.originX + 12 * TILE + TILE / 2, origin.originY + 12 * TILE);
    await page.getByRole('button', { name: 'Fast forward' }).click();
    await page.waitForTimeout(6000);

    console.log(`queue folded: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    await page.locator('.hud-build__queue > .ui-section__header').click();
    await page.waitForTimeout(300);
    console.log(`queue opened: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(
      `rows: ${JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row:not([hidden])')].map((row) => row.innerText),
        ),
      )}`,
    );
    console.log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    console.log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  });
});

/**
 * Touch. Never exercised on the assembled page by any previous playtest.
 */
test.describe('playtest: touch and pinch on the real page', () => {
  test.use({ hasTouch: true });

  test('a prison built by tapping', async ({ page }) => {
    test.setTimeout(240_000);
    const consoleLines: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'debug') return;
      const text = message.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${message.type()}] ${text}`);
    });
    page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installCommandTee(page);
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).tap();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).tap();

    // A tap on the world, with the wall tool armed.
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').tap();
    const arm = await page.locator('.hud-build__arm').innerText();
    if (arm.trim().toLowerCase().startsWith('place')) await page.locator('.hud-build__arm').tap();

    const before = (await sentCommands(page)).length;
    await page.touchscreen.tap(700, 300);
    await page.waitForTimeout(400);
    console.log(`tap on world produced: ${JSON.stringify((await sentCommands(page)).slice(before))}`);

    // Pinch to zoom, then tap the same screen point again. If the camera
    // zoomed, the second tap must resolve to a different tile.
    const client = await page.context().newCDPSession(page);
    type TouchEventType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';
    const dispatch = async (
      type: TouchEventType,
      fingers: readonly { id: number; x: number; y: number }[],
    ): Promise<void> => {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: fingers.map((f) => ({ x: f.x, y: f.y, id: f.id })),
      });
    };
    const mid = { x: 720, y: 450 };
    await dispatch('touchStart', [
      { id: 0, x: mid.x - 60, y: mid.y },
      { id: 1, x: mid.x + 60, y: mid.y },
    ]);
    for (let step = 1; step <= 6; step += 1) {
      const gap = 120 + (240 * step) / 6;
      await dispatch('touchMove', [
        { id: 0, x: mid.x - gap / 2, y: mid.y },
        { id: 1, x: mid.x + gap / 2, y: mid.y },
      ]);
    }
    await dispatch('touchEnd', []);
    await page.waitForTimeout(400);

    const afterPinch = (await sentCommands(page)).length;
    await page.touchscreen.tap(700, 300);
    await page.waitForTimeout(400);
    console.log(`tap after a pinch-out produced: ${JSON.stringify((await sentCommands(page)).slice(afterPinch))}`);
    console.log(`pinch itself produced ${afterPinch - before - 1} extra command(s)`);

    // One-finger drag on the world: does it pan, or lay a run?
    const beforeDrag = (await sentCommands(page)).length;
    await dispatch('touchStart', [{ id: 0, x: 600, y: 300 }]);
    for (let step = 1; step <= 6; step += 1) await dispatch('touchMove', [{ id: 0, x: 600 + step * 20, y: 300 }]);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(400);
    console.log(`one-finger drag produced: ${JSON.stringify((await sentCommands(page)).slice(beforeDrag))}`);

    console.log(`build panel: ${JSON.stringify(await panelText(page, '.hud-build__coordinates'))}`);
    console.log('=== console ===');
    console.log(consoleLines.join('\n') || '(nothing)');
  });
});

/**
 * Is the `AtlasLibrary` "Failed to fetch" seen at `page.reload()` the new
 * page's loader failing, or the old page's in-flight request being aborted?
 *
 * The distinction matters: the first would mean a reloaded game has no actor
 * art, the second is a browser tearing down a navigation and costs nothing.
 * A page marker settles it -- the console handler is re-installed only after
 * the reload has returned, so anything it records belongs to the new page.
 */
test.describe('playtest: the renderer warning at reload', () => {
  test('which page emits it', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const oldPageLines: string[] = [];
      const onConsole = (message: { type(): string; text(): string }): void => {
        if (message.type() === 'warning' || message.type() === 'error') oldPageLines.push(message.text());
      };
      page.on('console', onConsole as never);
      await page.reload();
      await page.waitForSelector('#game-root canvas');
      await page.waitForTimeout(4000);
      page.off('console', onConsole as never);
      console.log(
        `attempt ${attempt}: warnings seen across the navigation = ${JSON.stringify(
          oldPageLines.filter((line) => line.includes('World renderer') || line.includes('atlas')),
        )}`,
      );
      // Does the *current* page hold the art?
      console.log(
        `attempt ${attempt}: registry fetch from the loaded page -> ${JSON.stringify(
          await page.evaluate(async () => {
            try {
              const response = await fetch('/assets/actors/asset-registry.json');
              return { ok: response.ok, status: response.status };
            } catch (error) {
              return { error: error instanceof Error ? error.message : String(error) };
            }
          }),
        )}`,
      );
      console.log(
        `attempt ${attempt}: textures Phaser holds -> ${JSON.stringify(
          await page.evaluate(() => {
            const game = (globalThis as { Phaser?: { Game?: unknown } }).Phaser;
            return game === undefined ? 'no Phaser global' : 'Phaser global present';
          }),
        )}`,
      );
    }
  });
});

/**
 * The arrival screen, in full: everything a new player can read before they
 * have pressed anything, and everything they can press.
 */
test.describe('playtest: arrival', () => {
  test('what a new player is told', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);

    const survey = async (label: string): Promise<void> => {
      console.log(`=== ${label} ===`);
      console.log(
        await page.evaluate(() => {
          const hud = document.querySelector<HTMLElement>('.hud');
          const text = hud === null ? '(no hud)' : (hud.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
          const pressable = [...document.querySelectorAll<HTMLElement>('button')]
            .filter((b) => b.getClientRects().length > 0)
            .map((b) => (b.innerText || b.getAttribute('aria-label') || b.className).replace(/\n/g, ' ').trim());
          return `${text}\n--- pressable controls (${pressable.length}) ---\n${pressable.join(' / ')}`;
        }),
      );
    };

    await survey('ARRIVAL, before any click (activeTab = overview)');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await survey('AFTER "New prison", still on the Overview tab');

    console.log(
      `alerts header, folded: ${JSON.stringify(
        await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>('.hud-minimap .ui-section__header');
          if (header === null) return 'absent';
          const section = header.closest('.ui-section') as HTMLElement | null;
          return {
            headerText: header.innerText,
            ariaExpanded: header.getAttribute('aria-expanded'),
            sectionCollapsed: section?.dataset['collapsed'],
            childElementCount: header.childElementCount,
            childClasses: [...header.children].map((c) => c.className),
          };
        }),
      )}`,
    );
  });
});

/**
 * The four requirement lines the Rooms panel prints for a Cell, and what each
 * one actually does when the player presses Designate.
 *
 * They are rendered as one list in one block. This measures whether they
 * behave as one kind of thing.
 */
test.describe('playtest: the four requirement lines', () => {
  test('what each one does to the Designate button', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installCommandTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).click();
    const origin = await calibrate(page);

    await page.getByRole('button', { name: 'Rooms' }).click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    console.log(`the requirement block a player reads: ${JSON.stringify(await panelText(page, '.hud-rooms__status'))}`);

    const drag = async (x0: number, y0: number, x1: number, y1: number): Promise<void> => {
      const a = centreOf(origin, x0, y0);
      const b = centreOf(origin, x1, y1);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(300);
    };

    for (const shape of [
      { name: 'too small (1x1)', from: [20, 20], to: [20, 20] },
      { name: 'big enough, open (4x4)', from: [17, 17], to: [20, 20] },
    ] as const) {
      // The panel folds itself on every arm (`rooms-panel.ts`, "starts folded
      // on every arm"), so it has to be re-opened before anything in it can be
      // read or pressed.
      if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        await page.waitForTimeout(200);
      }
      const armLabel = await page.locator('.hud-rooms__arm').innerText();
      if (armLabel.trim().toLowerCase().startsWith('draw')) await page.locator('.hud-rooms__arm').click();
      await drag(shape.from[0], shape.from[1], shape.to[0], shape.to[1]);
      if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        await page.waitForTimeout(200);
      }
      const confirm = page.locator('.hud-rooms__confirm');
      const before = (await sentCommands(page)).length;
      const enabled = await confirm.isEnabled();
      console.log(`--- ${shape.name}`);
      console.log(`    note the player reads: ${JSON.stringify(await panelText(page, '.hud-rooms__note'))}`);
      console.log(`    status block: ${JSON.stringify(await panelText(page, '.hud-rooms__status'))}`);
      console.log(`    Designate enabled: ${enabled}`);
      if (enabled) {
        await confirm.click();
        await page.waitForTimeout(500);
        console.log(`    commands the press produced: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
        console.log(`    ROOMS count: ${(await page.locator('.hud-strip').innerText()).replace(/\n/g, ' | ')}`);
        console.log(`    alerts list laid out: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
        console.log(
          `    alert rows present in the DOM: ${JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')].map((row) => ({
                id: row.dataset['alert'],
                text: row.innerText.replace(/\n/g, ' '),
                boxWidth: Math.round(row.getBoundingClientRect().width),
                boxHeight: Math.round(row.getBoundingClientRect().height),
              })),
            ),
          )}`,
        );
      } else if (await page.locator('.hud-rooms__cancel').isVisible()) {
        await page.locator('.hud-rooms__cancel').click();
        await page.waitForTimeout(200);
      }
    }
  });
});
