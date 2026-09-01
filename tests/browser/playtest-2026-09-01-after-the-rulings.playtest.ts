import { expect, type Page, test } from '@playwright/test';
import { probeClipping } from './clipping';
import {
  TILE,
  buildAndPopulate,
  calibrate,
  countsSeries,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  runUntilTick,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **Playing `main` after the six changes of 2026-09-01, none of which had
 * browser evidence.**
 *
 * An *instrument*, not a gate. `tests/browser/playwright.config.ts` collects
 * `*.spec.ts`; this file is `*.playtest.ts` and only
 * `tests/browser/playwright.playtest.config.ts` collects it, so nothing in CI
 * runs it. Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5301 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-01-after-the-rulings.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * The findings live in
 * `docs/research/2026-09-01-playing-after-the-rulings.md`. Every act narrates
 * to stdout rather than asserting, except where an assertion is the cheapest
 * way to stop a run that has already lost its meaning.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/**
 * The FUNDS chip, read whole: value, tone, badge text, badge tone, geometry.
 *
 * **The badge is queried inside the chip, and the first version of this
 * function queried the metrics row instead.** `.hud-strip__metrics` holds nine
 * chips and COVERAGE's badge comes first, so every reading of the FUNDS badge
 * in the first run of act 2 said `Covered` / `success` -- including at the
 * floor, where the strip's own `innerText` plainly read `-2,500 | FUNDS | 0
 * left`. The two disagreeing is what caught it.
 */
async function readFundsChip(page: Page): Promise<{
  readonly chipValue: string | null;
  readonly chipTone: string | null;
  readonly badgeText: string | null;
  readonly badgeTone: string | null;
  /** Whether the whole chip lies inside the metrics row's *visible* box. */
  readonly chipFullyOnScreen: boolean | null;
  readonly rowScrollWidth: number;
  readonly rowClientWidth: number;
}> {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    const chip = document.querySelector<HTMLElement>('.hud-strip__metrics [data-metric="funds"]');
    if (chip === null || row === null) {
      return {
        chipValue: null,
        chipTone: null,
        badgeText: null,
        badgeTone: null,
        chipFullyOnScreen: null,
        rowScrollWidth: -1,
        rowClientWidth: -1,
      };
    }
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    const c = chip.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    return {
      chipValue: chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? chip.textContent,
      chipTone: chip.dataset['tone'] ?? null,
      badgeText: badge?.textContent ?? null,
      badgeTone: badge?.dataset['tone'] ?? null,
      chipFullyOnScreen: c.width > 0 && c.left >= r.left - 0.5 && c.right <= r.right + 0.5,
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
    };
  });
}

/** Every sentence currently in the alerts log, in order, newest first. */
async function alertLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')].map((row) =>
      (row.textContent ?? '').trim(),
    ),
  );
}

/** The refusal band `reportError` writes under the control that was pressed. */
async function refusalBand(page: Page): Promise<string> {
  return page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('.hud__refusal');
    if (band === null) return 'ABSENT';
    if (band.hidden || band.getClientRects().length === 0) return 'not laid out';
    return (band.textContent ?? '').trim();
  });
}

async function openQueueFold(page: Page): Promise<boolean> {
  const wasCollapsed = (await page.locator('.hud-build__queue').getAttribute('data-collapsed')) === 'true';
  if (wasCollapsed) {
    await page.locator('.hud-build__queue > .ui-section__header').click();
    await page.waitForTimeout(300);
  }
  return wasCollapsed;
}

/** The Queued fold's laid-out rows: what a player is offered to cancel, in order. */
async function queueRows(page: Page): Promise<readonly { label: string; state: string; order: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        label: (row.querySelector<HTMLElement>('.hud-build__queue-label')?.textContent ?? '').trim(),
        state: row.dataset['state'] ?? '',
        order: row.dataset['order'] ?? '',
      })),
  );
}

async function buyQuantity(page: Page, buildableId: string, quantity: number): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(400);
}

async function armWall(page: Page): Promise<void> {
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (label.startsWith('place') || label.startsWith('draw')) await page.locator('.hud-build__arm').click();
}

const pause = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(200);
};
const play = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(200);
};

/* ------------------------------------------------------------------ */

test('act 1: six walls drawn in a deliberate order, and what the Build panel offers to cancel (#731, ADR 0082)', async ({
  page,
}) => {
  const act = 'act1';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Materials first, so no order is held back waiting for a brick: what is
  // under test is the schedule, not the funding.
  await buyQuantity(page, 'wall-brick', 60);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(6000);
  log(act, `after the delivery ran: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  await pause(page);
  log(act, `clock paused at tick ${await currentTick(page)}`);

  /*
   * Six single-segment walls, on north edges of six scattered tiles, drawn in
   * an order that is deliberately **not** the order any spatial sort would
   * produce: not left-to-right, not top-to-bottom, not by distance from the
   * crew. If the schedule were still a uuid sort the rows below would be a
   * permutation of these; if ADR 0082 holds they are these, in this order.
   */
  const drawOrder: readonly { x: number; y: number }[] = [
    { x: 18, y: 13 },
    { x: 11, y: 16 },
    { x: 15, y: 14 },
    { x: 19, y: 15 },
    { x: 12, y: 13 },
    { x: 16, y: 16 },
  ];

  await armWall(page);
  const placed: { tile: string; commands: string[] }[] = [];
  for (const tile of drawOrder) {
    const before = (await sentCommands(page)).length;
    const at = { x: origin.originX + tile.x * TILE + TILE / 2, y: origin.originY + tile.y * TILE };
    /*
     * **A press that lands on a HUD panel produces no order and says nothing.**
     * The first run of this act aimed at six tiles chosen on the grid without
     * checking where they fall on a 1280x800 screen: four were off-viewport or
     * under a panel, and one landed on the Build panel's own *Buy* control and
     * bought sixty more bricks. Nothing failed; the act simply measured two
     * orders instead of six. So each press is checked here.
     */
    await press(page, at.x, at.y);
    const produced = (await sentCommands(page)).slice(before);
    const orders = produced.filter((c) => c['type'] === 'PlaceBuildOrder');
    expect(
      orders.length,
      `the press for tile ${tile.x},${tile.y} at screen ${at.x},${at.y} placed no build order: ${JSON.stringify(produced)}`,
    ).toBe(1);
    placed.push({
      tile: `${tile.x},${tile.y}`,
      commands: produced.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`),
    });
  }
  log(act, `drawn in this order: ${JSON.stringify(placed)}`);

  await tab(page, 'build').click();
  const wasCollapsed = await openQueueFold(page);
  log(act, `the Queued fold was collapsed on arrival? ${String(wasCollapsed)}`);
  log(act, `queue count reads ${JSON.stringify((await panelText(page, '.hud-build__queue-count')).trim())}`);
  const rows = await queueRows(page);
  log(act, `the fold offers ${rows.length} row(s): ${JSON.stringify(rows)}`);
  log(act, `and behind them: ${JSON.stringify((await panelText(page, '.hud-build__queue-more')).trim())}`);
  log(act, `panel data-queued = ${await page.locator('.hud-build').getAttribute('data-queued')}`);

  /*
   * Now let the crew work, and record which order leaves the queue first. The
   * head row is the order the crew is on (`data-state`), so sampling the head
   * over time is the execution order as the panel itself reports it.
   */
  await play(page);
  const seen: string[] = [];
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const now = await queueRows(page);
    if (now.length === 0) break;
    for (const row of now) {
      if (row.state === 'in-progress' && !seen.includes(row.label)) {
        seen.push(row.label);
        log(act, `t+${Date.now() - started}ms tick ${await currentTick(page)}: the crew is on ${JSON.stringify(row.label)}`);
      }
    }
    await page.waitForTimeout(500);
  }
  log(act, `execution order the panel showed: ${JSON.stringify(seen)}`);
  log(act, `queue at the end: ${JSON.stringify((await panelText(page, '.hud-build__queue')).replace(/\n+/g, ' | '))}`);
});

/* ------------------------------------------------------------------ */

test('act 2: spending a prison into the red, one purchase at a time, and reading the FUNDS chip (#723, rulings 18 and 21)', async ({
  page,
}) => {
  const act = 'act2';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  /*
   * The clock runs at x1 throughout, and the prison is empty: no prisoners, so
   * the state pays nothing at the day boundary; no staff, so payroll takes
   * nothing; no build orders, so the just-in-time route buys nothing. Every
   * move of the balance below is a purchase this act made. The clock has to
   * run at all because a purchase is settled on a tick.
   */
  const read = async (what: string): Promise<void> => {
    await page.waitForTimeout(1200);
    const counts = await latestCounts(page);
    const chip = await readFundsChip(page);
    log(
      act,
      `${what}: treasury=${counts?.treasuryMinorUnits} | chip ${JSON.stringify(chip.chipValue)} tone=${String(chip.chipTone)}` +
        ` | badge ${JSON.stringify(chip.badgeText)} tone=${String(chip.badgeTone)}` +
        ` | chip fully on screen=${String(chip.chipFullyOnScreen)} (row ${chip.rowScrollWidth} wide in a ${chip.rowClientWidth} box)`,
    );
  };

  await read('on arrival, 25,000 and solvent');
  await buyQuantity(page, 'wall-brick', 300);
  await read('after 300 bricks (12,000)');
  await buyQuantity(page, 'wall-brick', 300);
  await read('after 300 more bricks, 1,000 left');
  await buyQuantity(page, 'wall-brick', 81);
  await read('after 81 bricks (3,240) — the first purchase that goes past zero');
  // Planks are bought by selecting the buildable that consumes them: the Buy
  // control's intent is `{ itemId: material.itemId, quantity }`, so four here
  // is four planks at 65, not four beds.
  await buyQuantity(page, 'bed-wooden', 4);
  await read('after 4 planks (260) — exactly at the floor');

  /*
   * Past the floor. One brick, 40, against a facility with nothing left in it.
   * `src/main.ts` refuses this on *this* thread before anything is sent, so
   * the sentence lands on the control that was pressed rather than in the log.
   */
  const sentBefore = (await sentCommands(page)).length;
  await buyQuantity(page, 'wall-brick', 1);
  const sentAfter = (await sentCommands(page)).slice(sentBefore).map((c) => String(c['type']));
  log(act, `one brick past the floor: commands the host sent = ${JSON.stringify(sentAfter)}`);
  log(act, `the band under the control reads ${JSON.stringify(await refusalBand(page))}`);
  log(act, `the alerts log now holds ${JSON.stringify(await alertLines(page))}`);
  await read('after the refused purchase');

  // And the hire half of the same ruling, on the Security tab.
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  log(act, `the hire control reads ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  const beforeHire = (await sentCommands(page)).length;
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(800);
  log(
    act,
    `one hire past the floor: commands the host sent = ${JSON.stringify((await sentCommands(page)).slice(beforeHire).map((c) => String(c['type'])))}`,
  );
  log(act, `the band under the control reads ${JSON.stringify(await refusalBand(page))}`);
  log(act, `the alerts log now holds ${JSON.stringify(await alertLines(page))}`);
  await read('after the refused hire');

  // What the whole strip looks like at the floor, at this width.
  log(act, `the strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  const stripProbe = await page.evaluate(probeClipping, '.hud-strip__metrics [data-metric="funds"], .hud-strip__metrics');
  log(act, `clipping around the FUNDS chip: ${JSON.stringify(stripProbe)}`);
});

/* ------------------------------------------------------------------ */

test('act 3: the worker refusing a hire and a purchase, in the host\'s words (#729, ruling 23)', async ({ page }) => {
  const act = 'act3';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  /*
   * **Why this act exists separately from act 2.** `src/main.ts` pre-checks
   * every press on Buy and on Hire against the last published balance and
   * throws before anything is sent, so a player who presses once always gets
   * the *host's* sentence. Ruling 23 is about the other half -- the same
   * refusal decided inside the worker -- and there are exactly two ways to
   * reach it, both played here:
   *
   * 1. **The stale pre-check.** The balance the host tests against is at most
   *    one status publication old. Two presses inside that window are both
   *    waved through, and the worker refuses the second.
   * 2. **The just-in-time route.** A build order prices its own materials
   *    inside the worker; nothing on this thread knows the charge, so nothing
   *    can pre-check it. `reportMaterialsFunding` raises a refusal with no
   *    press on Buy at all. **It raised `purchase.insufficient-funds` when this
   *    was written and raises `construction.materials-unfunded` since the
   *    owner's ruling of 2026-09-01**, which gave ADR 0017 decision 8's second
   *    rung a sentence of its own -- this route spends at the `'construction'`
   *    rung and was reporting rung 1's words. Ruling 23's equality is a claim
   *    about the *purchase* pair and is untouched by that: this route is not
   *    one of the two the host can also decide.
   *
   * The balance is set up with **planks only**, so the material store holds no
   * brick and a wall really does have to be bought.
   */
  await buyQuantity(page, 'bed-wooden', 421);
  await page.waitForTimeout(1500);
  const afterPlanks = await latestCounts(page);
  log(act, `after 421 planks (27,365): treasury=${afterPlanks?.treasuryMinorUnits}`);
  log(act, `FUNDS chip: ${JSON.stringify(await readFundsChip(page))}`);

  // (1) Two presses of Hire inside one publication window. 80 each against 135
  // of facility left: the first fits, the second does not, and the host has
  // been told about neither by the time both are sent.
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  log(act, `the hire control reads ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  const alertsBeforeHire = await alertLines(page);
  const sentBeforeHire = (await sentCommands(page)).length;
  await page.locator('.hud-staff__hire').click({ force: true, noWaitAfter: true });
  await page.locator('.hud-staff__hire').click({ force: true, noWaitAfter: true });
  await page.waitForTimeout(2500);
  log(
    act,
    `two rapid Hire presses sent ${JSON.stringify((await sentCommands(page)).slice(sentBeforeHire).map((c) => String(c['type'])))}`,
  );
  log(act, `the band under the control reads ${JSON.stringify(await refusalBand(page))}`);
  log(act, `alerts before: ${JSON.stringify(alertsBeforeHire)}`);
  log(act, `alerts after:  ${JSON.stringify(await alertLines(page))}`);
  const afterHires = await latestCounts(page);
  log(act, `staff=${afterHires?.staff} treasury=${afterHires?.treasuryMinorUnits}`);
  log(act, `FUNDS chip: ${JSON.stringify(await readFundsChip(page))}`);

  // (2) A wall, with no brick in the store and no facility left to buy one.
  await tab(page, 'build').click();
  await armWall(page);
  const alertsBeforeWall = await alertLines(page);
  for (const tile of [
    { x: 14, y: 14 },
    { x: 15, y: 14 },
    { x: 16, y: 14 },
    { x: 17, y: 14 },
  ]) {
    await press(page, origin.originX + tile.x * TILE + TILE / 2, origin.originY + tile.y * TILE);
  }
  await page.waitForTimeout(8000);
  log(act, `alerts before four unaffordable walls: ${JSON.stringify(alertsBeforeWall)}`);
  log(act, `alerts after:  ${JSON.stringify(await alertLines(page))}`);
  log(act, `the band under the control reads ${JSON.stringify(await refusalBand(page))}`);
  log(act, `queue: ${JSON.stringify((await panelText(page, '.hud-build__queue')).replace(/\n+/g, ' | '))}`);
  log(act, `shortfall note: ${JSON.stringify((await panelText(page, '.hud-build__queue-shortfall')).trim())}`);
  log(act, `FUNDS chip at the end: ${JSON.stringify(await readFundsChip(page))}`);
  log(act, `treasury at the end: ${(await latestCounts(page))?.treasuryMinorUnits}`);
});

/* ------------------------------------------------------------------ */

/** Every row of the Security panel's roster fold, in the order it lists them. */
async function rosterRows(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-staff__roster .hud-staff__held-row')]
      .filter((row) => !row.hidden)
      .map((row) => (row.querySelector<HTMLElement>('.hud-staff__held-label')?.textContent ?? '').trim()),
  );
}

/**
 * Opens the roster fold if there is one.
 *
 * **The count check is not defensive padding.** The first run of act 4 called
 * `getAttribute` on `.hud-staff__roster` before anybody had been hired; the
 * section does not exist on an empty prison, `use.actionTimeout` is 0, and the
 * act hung for the whole ten minutes without printing a line.
 */
async function openRosterFold(page: Page): Promise<boolean> {
  await tab(page, 'security').click();
  const section = page.locator('.hud-staff__roster');
  if ((await section.count()) === 0) return false;
  const collapsed = await section.getAttribute('data-collapsed', { timeout: 5000 });
  if (collapsed === 'true') {
    await page.locator('.hud-staff__roster > .ui-section__header').click({ timeout: 5000 });
    await page.waitForTimeout(300);
  }
  return true;
}

test('act 4: a guard saved mid-walk, reloaded, and what the roster row says until it arrives (#732, ruling 24)', async ({
  page,
}) => {
  const act = 'act4';
  test.setTimeout(1_500_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  /*
   * **A built prison with prisoners in it, and two earlier runs of this act
   * establish why nothing cheaper works.**
   *
   * Run 1 hired three guards into an empty prison and watched all three sit on
   * `Unassigned` for sixty seconds: `DeploymentSystem.requiredGuardCountFor`
   * scales the schedule by the sector's occupant count and
   * `resolveSectorOccupants` counts the whole prison for the derived sector, so
   * a prison with nobody in it asks for no guards.
   *
   * Run 2 tried to admit three prisoners without building anything, and the
   * Intake panel refused all three -- *"This prison has no room to hold a
   * prisoner, so nobody can be admitted into it."* So the cell has to be built
   * before a guard can ever be seen walking anywhere.
   */
  const origin = await buildAndPopulate(page, { beds: 3, admits: 3, guards: 0, label: act });
  log(act, `built and populated; tick ${await currentTick(page)}; origin ${JSON.stringify(origin)}`);

  // Back to x1 so a walk lasts longer than one poll, then hire with the clock
  // stopped so the deployment starts from a known standstill.
  await play(page);
  await pause(page);
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1200);
  log(act, `roster fold present after hiring? ${String(await openRosterFold(page))}`);
  log(act, `hired, clock stopped: ${JSON.stringify(await rosterRows(page))}`);
  log(act, `coverage: ${JSON.stringify((await panelText(page, '.hud-staff__coverage')).replace(/\n+/g, ' | '))}`);

  // Run, and watch for the moment a guard is walking to its post.
  await play(page);
  let travellingAt = -1;
  let sawTravelling: readonly string[] = [];
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const rows = await rosterRows(page);
    if (rows.some((row) => /Travelling/i.test(row))) {
      travellingAt = await currentTick(page);
      sawTravelling = rows;
      break;
    }
    await page.waitForTimeout(80);
  }
  log(act, `first tick at which a row said Travelling: ${travellingAt}; rows = ${JSON.stringify(sawTravelling)}`);

  // Freeze the walk, then save it.
  await pause(page);
  const frozen = await rosterRows(page);
  log(act, `paused at tick ${await currentTick(page)}; rows = ${JSON.stringify(frozen)}`);
  if (!frozen.some((row) => /Travelling/i.test(row))) {
    log(act, `THE WALK FINISHED BEFORE THE PAUSE LANDED -- the save below is not of a travelling guard`);
  }
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });
  log(act, `saved: ${JSON.stringify(await panelText(page, '.save-panel__status'))}`);
  log(act, `rows at the moment of the save: ${JSON.stringify(await rosterRows(page))}`);

  // A real navigation, then Load.
  await installTee(page);
  await openApp(page);
  await page.locator('.save-panel__item').first().click();
  await page.waitForTimeout(6000);
  log(act, `roster fold present after load? ${String(await openRosterFold(page))}`);
  const restored = await rosterRows(page);
  log(act, `AFTER LOAD, tick ${await currentTick(page)}: rows = ${JSON.stringify(restored)}`);
  log(act, `coverage summary: ${JSON.stringify((await panelText(page, '.hud-staff__coverage')).replace(/\n+/g, ' | '))}`);
  log(act, `strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // And now keep playing: does the guard actually arrive?
  await play(page);
  const settleStarted = Date.now();
  let settled: readonly string[] = restored;
  const seen: string[] = [];
  while (Date.now() - settleStarted < 180_000) {
    settled = await rosterRows(page);
    const joined = settled.join(' ~ ');
    if (!seen.includes(joined)) {
      seen.push(joined);
      log(act, `t+${Date.now() - settleStarted}ms tick ${await currentTick(page)}: ${JSON.stringify(settled)}`);
    }
    if (!settled.some((row) => /Returning/i.test(row))) break;
    await page.waitForTimeout(300);
  }
  log(act, `rows once nothing says Returning: ${JSON.stringify(settled)} at tick ${await currentTick(page)}`);
  log(act, `coverage after: ${JSON.stringify((await panelText(page, '.hud-staff__coverage')).replace(/\n+/g, ' | '))}`);
});

/* ------------------------------------------------------------------ */

const HUD_SURFACES = [
  '.hud-strip',
  '.hud-strip__metrics',
  '.hud__corner',
  '.hud-alerts__list',
  '.hud-alerts__list .ui-row',
  '.hud-alerts__list .ui-row__label',
  '.hud__aside',
  '.hud-overview',
  '.hud-build',
  '.hud-rooms',
  '.hud-staff',
  '.hud-regime',
  '.hud__refusal',
  '.save-panel',
  '.ui-row__label',
  '.ui-value',
  '.ui-eyebrow',
] as const;

/** Everything in the HUD that is putting content outside its own box, right now. */
async function clippingSweep(page: Page): Promise<readonly { selector: string; kind: string; hiddenX: number; hiddenY: number; box: string; text: string }[]> {
  const out: { selector: string; kind: string; hiddenX: number; hiddenY: number; box: string; text: string }[] = [];
  for (const surface of HUD_SURFACES) {
    const probe = await page.evaluate(probeClipping, surface);
    for (const item of probe.clipped) {
      if (out.some((seen) => seen.selector === item.selector && seen.text === item.text)) continue;
      out.push({
        selector: item.selector,
        kind: item.kind,
        hiddenX: item.hiddenX,
        hiddenY: item.hiddenY,
        box: `${item.scrollWidth}x${item.scrollHeight} in ${item.clientWidth}x${item.clientHeight}`,
        text: item.text,
      });
    }
  }
  return out;
}

test('act 5: the longest sentence the alerts log can hold, read at 1280x720 and 900x600 (#726, #720)', async ({
  page,
}) => {
  const act = 'act5';
  test.setTimeout(900_000);
  await installTee(page);

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 600 },
  ]) {
    const at = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    /*
     * `zone.not-enclosed` is the longest sentence in the refusal namespace at
     * 113 characters -- *"The room was not zoned — this room type must be
     * enclosed, and the area you drew is open on at least one side."* -- and it
     * is two mouse gestures away: arm the cell tool over open ground and
     * confirm. The alerts channel carries at most one refusal row, so this is
     * also the whole log.
     */
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, { x: 300, y: 200 }, { x: 620, y: 400 });
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);

    const lines = await alertLines(page);
    log(act, `${at}: the alerts log holds ${JSON.stringify(lines)}`);
    log(act, `${at}: the band reads ${JSON.stringify(await refusalBand(page))}`);

    const geometry = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-alerts__list');
      const row = document.querySelector<HTMLElement>('.hud-alerts__list .ui-row');
      const label = document.querySelector<HTMLElement>('.hud-alerts__list .ui-row__label');
      const box = (el: HTMLElement | null): string =>
        el === null
          ? 'ABSENT'
          : `client ${el.clientWidth}x${el.clientHeight}, scroll ${el.scrollWidth}x${el.scrollHeight}, overflow ${getComputedStyle(el).overflowX}/${getComputedStyle(el).overflowY}, white-space ${getComputedStyle(el).whiteSpace}`;
      const lineHeight = label === null ? 0 : Number.parseFloat(getComputedStyle(label).lineHeight);
      return {
        list: box(list),
        row: box(row),
        label: box(label),
        // How many lines the sentence actually occupies, which is the whole of
        // what #726 changed: one line means it is still being cut.
        labelLines: label === null || Number.isNaN(lineHeight) ? -1 : Math.round(label.scrollHeight / lineHeight),
        labelText: label?.textContent ?? null,
      };
    });
    log(act, `${at}: alert geometry ${JSON.stringify(geometry)}`);
    log(act, `${at}: clipping over the whole HUD -> ${JSON.stringify(await clippingSweep(page), null, 0)}`);

    // The same sweep with every tab open in turn, since each swaps the aside.
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(250);
      const found = await clippingSweep(page);
      log(act, `${at}: tab ${id} -> ${found.length} clipped element(s) ${JSON.stringify(found)}`);
    }
  }
});

/* ------------------------------------------------------------------ */

const DAY_TICKS = 2_400;

test('act 6: the first half hour — twelve prisoners, four guards, three in-game days, a reload, and everything the panels say', async ({
  page,
}) => {
  const act = 'act6';
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 4, admits: 12, guards: 4, label: act });
  const built = await latestCounts(page);
  log(act, `after the build: ${JSON.stringify(built)}`);

  const panels = async (when: string): Promise<void> => {
    for (const [id, selector] of [
      ['overview', '.hud-overview'],
      ['build', '.hud-build'],
      ['rooms', '.hud-rooms'],
      ['security', '.hud-staff'],
      ['regime', '.hud-regime'],
    ] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(250);
      log(act, `${when} · ${id}: ${(await panelText(page, selector)).replace(/\n+/g, ' | ')}`);
    }
    log(act, `${when} · strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    log(act, `${when} · alerts: ${JSON.stringify(await alertLines(page))}`);
    log(act, `${when} · funds chip: ${JSON.stringify(await readFundsChip(page))}`);
    log(act, `${when} · clipping: ${JSON.stringify(await clippingSweep(page))}`);
  };

  await panels('day 1');

  /*
   * **Every distinct roster state this session ever shows.**
   *
   * Act 4 tried to catch a guard mid-walk by polling the roster every 80ms for
   * ninety seconds and never saw one: `DeploymentSystem.continueDeploymentTravel`
   * ends a deployment with `setTile(guardId, postTile)` -- one jump, not a walk
   * -- so `'travelling'` lasts a single navigation round trip, and the roster is
   * pulled on the counts cadence. This samples the whole session instead of one
   * window, so what the log below reports is not "I did not look" but "over N
   * samples across three in-game days, here is every word a row ever said".
   */
  const rosterStatesSeen = new Map<string, { first: number; samples: number }>();
  let rosterSamples = 0;
  const sampleRoster = async (): Promise<readonly string[]> => {
    const rows = await rosterRows(page);
    rosterSamples += 1;
    for (const row of rows) {
      const word = row.replace(/^.*·\s*/, '');
      const seen = rosterStatesSeen.get(word);
      if (seen === undefined) rosterStatesSeen.set(word, { first: rosterSamples, samples: 1 });
      else rosterStatesSeen.set(word, { first: seen.first, samples: seen.samples + 1 });
    }
    return rows;
  };

  // Three in-game day boundaries at x4, sampling the whole counts series.
  await tab(page, 'security').click();
  await openRosterFold(page);
  const startTick = await currentTick(page);
  for (let day = 1; day <= 3; day += 1) {
    const target = (Math.floor(startTick / DAY_TICKS) + day) * DAY_TICKS + 60;
    log(act, `running to tick ${target} (boundary ${day})`);
    const dayStarted = Date.now();
    for (;;) {
      const tick = await currentTick(page);
      if (tick >= target) break;
      if (Date.now() - dayStarted > 600_000) throw new Error(`stuck at tick ${tick}, wanted ${target}`);
      await sampleRoster();
      await page.waitForTimeout(100);
    }
    const series = await countsSeries(page);
    const boundary = target - 60;
    const before = [...series].filter((s) => s.tick < boundary).pop();
    const after = series.find((s) => s.tick >= boundary);
    log(act, `BOUNDARY ${day} at tick ${boundary}`);
    log(act, `  last before: ${JSON.stringify(before)}`);
    log(act, `  first after: ${JSON.stringify(after)}`);
    if (before !== undefined && after !== undefined) {
      log(
        act,
        `  treasury delta ${after.treasuryMinorUnits - before.treasuryMinorUnits}` +
          ` | accrued just before ${before.stateIncomeAccruedTodayMinorUnits}` +
          ` | wage bill ${after.dailyWageBillMinorUnits} | unpaid ${after.unpaidWagesMinorUnits}`,
      );
    }
    log(act, `  alerts: ${JSON.stringify(await alertLines(page))}`);
    log(act, `  roster: ${JSON.stringify(await rosterRows(page))}`);
  }

  log(
    act,
    `over ${rosterSamples} roster samples across three in-game days, every word a row said: ` +
      JSON.stringify(Object.fromEntries(rosterStatesSeen)),
  );

  await panels('day 4');

  /*
   * Save while somebody is *not* standing on their post, if this session ever
   * offers such a moment. That is the state ruling 24 is about, and act 4
   * could not manufacture it.
   */
  await tab(page, 'security').click();
  await openRosterFold(page);
  const hunt = Date.now();
  let caught: readonly string[] = [];
  while (Date.now() - hunt < 120_000) {
    const rows = await sampleRoster();
    if (rows.some((row) => /Travelling|On Search|Returning/i.test(row))) {
      caught = rows;
      break;
    }
    await page.waitForTimeout(100);
  }
  log(
    act,
    caught.length === 0
      ? `NOBODY was ever off their post in 120s of hunting; the save below is of a settled prison`
      : `caught a guard off post: ${JSON.stringify(caught)}`,
  );

  // Save, reload, load, and read the same surfaces back.
  const beforeSave = await latestCounts(page);
  await pause(page);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });
  log(act, `saved at tick ${await currentTick(page)}: ${JSON.stringify(beforeSave)}`);

  await installTee(page);
  await openApp(page);
  await page.locator('.save-panel__item').first().click();
  await page.waitForTimeout(8000);
  const afterLoad = await latestCounts(page);
  log(act, `after load: ${JSON.stringify(afterLoad)}`);
  await tab(page, 'security').click();
  await openRosterFold(page);
  log(act, `roster immediately after load: ${JSON.stringify(await rosterRows(page))}`);
  if (beforeSave !== undefined && afterLoad !== undefined) {
    const drift: string[] = [];
    for (const key of Object.keys(beforeSave) as (keyof typeof beforeSave)[]) {
      if (key === 'tick') continue;
      if (beforeSave[key] !== afterLoad[key]) drift.push(`${String(key)}: ${beforeSave[key]} -> ${afterLoad[key]}`);
    }
    log(act, `what the reload changed: ${drift.length === 0 ? 'nothing' : JSON.stringify(drift)}`);
  }
  await panels('after the reload');

  // And keep playing past one more boundary, which is where a restored prison
  // has previously been found to differ from one that was never saved.
  await play(page);
  const resumeTick = await currentTick(page);
  await runUntilTick(page, (Math.floor(resumeTick / DAY_TICKS) + 1) * DAY_TICKS + 60, 600_000);
  log(act, `after one more boundary: ${JSON.stringify(await latestCounts(page))}`);
  await panels('after one more day');
});

/* ------------------------------------------------------------------ */

test('act 5b: how wide the alert sentence actually gets, and how many lines that costs', async ({ page }) => {
  const act = 'act5b';
  test.setTimeout(600_000);
  await installTee(page);

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 800 },
    { width: 1280, height: 720 },
    { width: 900, height: 600 },
  ]) {
    const at = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, { x: 300, y: 200 }, { x: 620, y: 400 });
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);

    /*
     * `Range.getClientRects()` over the sentence's own text node counts the
     * **line boxes the browser actually laid out**, which no `scrollHeight`
     * arithmetic can: `line-height` computes to `normal` here, so dividing by
     * it returns `NaN` (act 5 printed `labelLines: -1` for exactly that).
     */
    const measured = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.hud-alerts__list .ui-row');
      const label = document.querySelector<HTMLElement>('.hud-alerts__list .ui-row__label');
      if (row === null || label === null) return null;
      const text = label.firstChild;
      let lines = -1;
      let widest = -1;
      if (text !== null) {
        const range = document.createRange();
        range.selectNodeContents(label);
        const rects = [...range.getClientRects()];
        lines = rects.length;
        widest = rects.reduce((max, rect) => Math.max(max, rect.width), 0);
      }
      const style = getComputedStyle(label);
      const children = [...row.children].map((child) => {
        const box = child.getBoundingClientRect();
        return `${child.className}: ${Math.round(box.width)}x${Math.round(box.height)}`;
      });
      return {
        rowWidth: Math.round(row.getBoundingClientRect().width),
        rowHeight: Math.round(row.getBoundingClientRect().height),
        labelWidth: Math.round(label.getBoundingClientRect().width),
        labelHeight: Math.round(label.getBoundingClientRect().height),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        lines,
        widestLinePx: Math.round(widest),
        children,
        characters: (label.textContent ?? '').length,
        listClientHeight: document.querySelector<HTMLElement>('.hud-alerts__list')?.clientHeight ?? -1,
        listScrollHeight: document.querySelector<HTMLElement>('.hud-alerts__list')?.scrollHeight ?? -1,
      };
    });
    log(act, `${at}: ${JSON.stringify(measured)}`);
  }
});
