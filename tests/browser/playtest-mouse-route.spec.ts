import { expect, test, type Page } from '@playwright/test';

/**
 * A *playtest*, not a regression suite.
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
