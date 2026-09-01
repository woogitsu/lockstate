import { expect, type Page, test } from '@playwright/test';
import {
  TILE,
  calibrate,
  centreOf,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **Playing the money: the treasury, the overdraft, the rungs, the Buy panel
 * and the delivery flow, on `main` after ruling 19 landed (#747, `52b5bb1c`).**
 *
 * An *instrument*, not a gate. `tests/browser/playwright.config.ts` collects
 * `*.spec.ts`; this file is `*.playtest.ts` and only
 * `tests/browser/playwright.playtest.config.ts` collects it, so nothing in CI
 * runs it. Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-01-money.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * **Why this pass exists.** #747 gave ADR 0017 decision 8's rungs their own
 * thresholds inside the standing overdraft -- deliveries below −1,250,
 * construction below −2,000, wages at the floor of −2,500. Nothing about that
 * change was ever driven in a browser, and `src/ui/affordability.ts:145-152`
 * names, in the source, one player-visible figure it did not re-base:
 * `hud.status.funds-remaining` still renders `balance − overdraftFloor`. These
 * acts measure what a player is actually shown and actually allowed to do at
 * each rung.
 *
 * The findings live in `docs/research/2026-09-01-what-the-funds-chip-promises.md`.
 * Every act narrates to stdout rather than asserting, except where an assertion
 * is the cheapest way to stop a run that has already lost its meaning.
 *
 * **Prices, so every number below is checkable by hand.**
 * `src/content/procurement-catalog.ts:100-101` -- a brick is 40, a wood plank
 * is 65. `src/simulation/construction/definition.ts:89` -- one brick wall
 * segment consumes 2 bricks, so 80 when the store is empty.
 * `src/simulation/economy/treasury.ts` -- the grant is 25,000 and the
 * overdraft floor is one tenth of it, −2,500.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/** The FUNDS chip, read whole: value, tone, badge text, badge tone. */
async function readFundsChip(page: Page): Promise<{
  readonly chipValue: string | null;
  readonly chipTone: string | null;
  readonly badgeText: string | null;
  readonly badgeTone: string | null;
}> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.hud-strip__metrics [data-metric="funds"]');
    if (chip === null) return { chipValue: null, chipTone: null, badgeText: null, badgeTone: null };
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    return {
      chipValue: chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? chip.textContent,
      chipTone: chip.dataset['tone'] ?? null,
      badgeText: badge?.textContent ?? null,
      badgeTone: badge?.dataset['tone'] ?? null,
    };
  });
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

/** Every sentence currently in the alerts log, in order. */
async function alertLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')].map((row) =>
      (row.textContent ?? '').trim(),
    ),
  );
}

/**
 * The whole Buy control as a player sees it: the submit button's label, whether
 * it is disabled, and whether anything else in the buy row mentions money.
 */
async function readBuyControl(page: Page): Promise<{
  readonly submitLabel: string;
  readonly submitDisabled: boolean | null;
  readonly rowText: string;
}> {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.hud-build__buy');
    const submit = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
    return {
      submitLabel: (submit?.textContent ?? 'ABSENT').trim(),
      submitDisabled: submit === null ? null : submit.disabled,
      rowText: row === null ? 'ABSENT' : (row.innerText ?? '').replace(/\n+/g, ' | ').trim(),
    };
  });
}

async function buyQuantity(page: Page, buildableId: string, quantity: number): Promise<void> {
  await tab(page, 'build').click();
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(400);
}

/**
 * Presses Buy once and answers what the *host* did with it: the commands it put
 * on the wire, and the sentence it painted. A `[]` here is the host refusing on
 * this thread; a `["PurchaseMaterials"]` is the press reaching the worker.
 */
async function probeBuy(
  page: Page,
  buildableId: string,
  quantity: number,
): Promise<{ readonly sent: readonly string[]; readonly band: string }> {
  const before = (await sentCommands(page)).length;
  await buyQuantity(page, buildableId, quantity);
  await page.waitForTimeout(600);
  return {
    sent: (await sentCommands(page)).slice(before).map((c) => String(c['type'])),
    band: await refusalBand(page),
  };
}

/**
 * **Where the game says what the prison owns, if anywhere.** The whole assembled
 * HUD's text is swept for the two priced material names and for a quantity the
 * caller names, so "nothing on screen reports the store" is a measurement of the
 * screen rather than a reading of `src/ui/`.
 */
async function searchHudText(page: Page, needles: readonly string[]): Promise<Record<string, boolean>> {
  return page.evaluate((terms) => {
    const hud = document.querySelector<HTMLElement>('.hud');
    const text = (hud?.innerText ?? '').toLowerCase();
    const found: Record<string, boolean> = {};
    for (const term of terms) found[term] = text.includes(term.toLowerCase());
    return found;
  }, needles);
}

/* ------------------------------------------------------------------ */

test('act 1: the FUNDS badge against the shop, walked down the deliveries rung', async ({ page }) => {
  const act = 'act1';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  /*
   * The prison is empty throughout: no prisoners, so the state pays nothing at
   * a day boundary; no staff, so payroll takes nothing. Until this act places a
   * build order, every move of the balance is a purchase this act made.
   *
   * **Planks only on the way down, and that is load-bearing.** The Buy control
   * buys the *material* the selected buildable consumes, so `bed-wooden`
   * buys planks at 65 and `wall-brick` buys bricks at 40. Descending on planks
   * leaves the brick store at zero, which is what makes the wall orders in the
   * second half of this act have to buy their own bricks.
   */
  const read = async (what: string): Promise<void> => {
    await page.waitForTimeout(1200);
    const counts = await latestCounts(page);
    const chip = await readFundsChip(page);
    log(
      act,
      `${what}: treasury=${String(counts?.treasuryMinorUnits)} | chip ${JSON.stringify(chip.chipValue)}` +
        ` tone=${String(chip.chipTone)} | badge ${JSON.stringify(chip.badgeText)} tone=${String(chip.badgeTone)}`,
    );
  };

  await read('on arrival');
  log(act, `does the HUD name a material or a stock on arrival? ${JSON.stringify(await searchHudText(page, ['plank', 'brick', 'in store', 'stock']))}`)

  // 403 planks at 65 = 26,195. 25,000 − 26,195 = −1,195, which is 55 above the
  // deliveries rung of −1,250 and 1,305 above the overdraft floor of −2,500.
  await buyQuantity(page, 'bed-wooden', 403);
  await read('after 403 planks (26,195)');
  log(
    act,
    `after buying 403 planks, does the HUD say so anywhere? ${JSON.stringify(await searchHudText(page, ['plank', '403', 'in store', 'stock']))}`,
  );

  /*
   * THE MEASUREMENT. At −1,195 the badge states a remainder. Below it, the
   * cheapest two things the shop sells are pressed, one at a time, and what the
   * host does with each is recorded. A `[]` is a refusal decided on this thread
   * before anything was sent.
   */
  log(act, `the Buy control reads ${JSON.stringify(await readBuyControl(page))}`);
  const onePlank = await probeBuy(page, 'bed-wooden', 1);
  log(act, `one more plank (65): sent=${JSON.stringify(onePlank.sent)} band=${JSON.stringify(onePlank.band)}`);
  await read('after pressing Buy on one plank');

  const oneBrick = await probeBuy(page, 'wall-brick', 1);
  log(act, `one brick (40): sent=${JSON.stringify(oneBrick.sent)} band=${JSON.stringify(oneBrick.band)}`);
  await read('after pressing Buy on one brick');
  log(act, `the alerts log holds ${JSON.stringify(await alertLines(page))}`);

  // A second brick, from wherever the first left the balance.
  const secondBrick = await probeBuy(page, 'wall-brick', 1);
  log(act, `a second brick (40): sent=${JSON.stringify(secondBrick.sent)} band=${JSON.stringify(secondBrick.band)}`);
  await read('after the second brick press');

  // And the hire half, which shares the deliveries rung.
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  log(act, `the hire control reads ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  const beforeHire = (await sentCommands(page)).length;
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(900);
  log(
    act,
    `one hire (80): sent=${JSON.stringify((await sentCommands(page)).slice(beforeHire).map((c) => String(c['type'])))}` +
      ` band=${JSON.stringify(await refusalBand(page))}`,
  );
  await read('after the hire press');
  log(act, `the whole strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
});

/* ------------------------------------------------------------------ */

test('act 2: the shop is shut but the build queue still spends — the construction rung, drawn with the mouse', async ({
  page,
}) => {
  const act = 'act2';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  await buyQuantity(page, 'bed-wooden', 403);
  await page.waitForTimeout(1500);
  log(act, `after 403 planks: treasury=${String((await latestCounts(page))?.treasuryMinorUnits)}`);

  const refusedBuy = await probeBuy(page, 'wall-brick', 1);
  log(act, `Buy one brick (40) here: sent=${JSON.stringify(refusedBuy.sent)} band=${JSON.stringify(refusedBuy.band)}`);

  /*
   * Now the same money, spent the other way. A brick wall segment needs two
   * bricks and the store holds none, so each segment drawn makes
   * `JustInTimeMaterialsService` buy 80 of brick on the `'construction'` rung,
   * whose floor is −2,000 rather than −1,250.
   *
   * Segments are drawn one tile at a time, well away from the start room, and
   * the balance is read after each so the exact segment at which construction
   * stops is a measurement and not a subtraction.
   */
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();
  log(act, `the wall tool is armed; the control reads ${JSON.stringify((await page.locator('.hud-build__arm').innerText()).trim())}`);

  /*
   * **Segments are pressed on tile *edges*, not tile centres**, because
   * `wall-brick` places no object: it writes an edge (`session-commands.ts`).
   * The west edge of tile (column,row) is at `originX + column*TILE`, vertically
   * centred. Columns 12..19 of rows 12..14 are the same neighbourhood
   * `buildAndPopulate` builds its 6x6 cell in, and every point below was
   * checked to lie inside the 1280x800 viewport before it was pressed.
   *
   * Each press is followed by a read of the balance and of the FUNDS chip, so
   * the segment at which construction stops is a measurement rather than a
   * subtraction.
   */
  const edges: { column: number; row: number }[] = [];
  for (const row of [12, 13, 14]) for (let column = 12; column <= 19; column += 1) edges.push({ column, row });

  let drawn = 0;
  for (const edge of edges) {
    if (drawn >= 14) break;
    const x = origin.originX + edge.column * TILE;
    const y = origin.originY + edge.row * TILE + TILE / 2;
    if (x < 8 || x > 1272 || y < 8 || y > 792) {
      log(act, `edge (${edge.column},${edge.row}) is off screen at (${x}, ${y}); skipped`);
      continue;
    }
    const before = (await sentCommands(page)).length;
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(1500);
    const produced = (await sentCommands(page)).slice(before).map((c) => String(c['type']));
    if (produced.length === 0) {
      log(act, `edge (${edge.column},${edge.row}) at (${x}, ${y}) produced NO command; skipped`);
      continue;
    }
    drawn += 1;
    const counts = await latestCounts(page);
    const chip = await readFundsChip(page);
    log(
      act,
      `wall ${drawn} on the west edge of (${edge.column},${edge.row}): sent=${JSON.stringify(produced)}` +
        ` treasury=${String(counts?.treasuryMinorUnits)} | badge ${JSON.stringify(chip.badgeText)} tone=${String(chip.badgeTone)}` +
        ` | queue ${JSON.stringify((await panelText(page, '.hud-build__queue')).replace(/\n/g, ' | '))}` +
        ` | shortfall ${JSON.stringify(await panelText(page, '.hud-build__queue-shortfall'))}`,
    );
  }

  log(act, `the alerts log holds ${JSON.stringify(await alertLines(page))}`);
  log(act, `the shortfall note reads ${JSON.stringify(await panelText(page, '.hud-build__queue-shortfall'))}`);
  log(act, `final treasury=${String((await latestCounts(page))?.treasuryMinorUnits)}`);
  log(act, `final FUNDS chip: ${JSON.stringify(await readFundsChip(page))}`);
});

/* ------------------------------------------------------------------ */

test('act 3: a delivery bought, waited for, and one cancelled — what the player is told about the money', async ({
  page,
}) => {
  const act = 'act3';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  const snapshot = async (what: string): Promise<void> => {
    const counts = await latestCounts(page);
    log(
      act,
      `${what}: treasury=${String(counts?.treasuryMinorUnits)} | pending=${JSON.stringify(
        (await panelText(page, '.hud-build__deliveries')).replace(/\n/g, ' | '),
      )}`,
    );
  };

  await snapshot('on arrival');

  // Three separate orders, so there are three rows to cancel.
  await buyQuantity(page, 'wall-brick', 10);
  await buyQuantity(page, 'wall-brick', 10);
  await buyQuantity(page, 'bed-wooden', 3);
  await page.waitForTimeout(1200);
  await snapshot('after three orders (400 + 400 + 195 = 995)');
  log(act, `the deliveries fold: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  const cancelButtons = page.locator('.hud-build__delivery-row:not([hidden]) button');
  const cancelCount = await cancelButtons.count();
  log(act, `cancel controls offered: ${cancelCount}`);
  if (cancelCount > 0) {
    const beforeCancel = (await latestCounts(page))?.treasuryMinorUnits;
    await cancelButtons.first().click();
    await page.waitForTimeout(1500);
    const afterCancel = (await latestCounts(page))?.treasuryMinorUnits;
    log(act, `first cancel: treasury ${String(beforeCancel)} -> ${String(afterCancel)}`);
    log(act, `the band under the control reads ${JSON.stringify(await refusalBand(page))}`);
    log(act, `the alerts log holds ${JSON.stringify(await alertLines(page))}`);
    log(act, `the deliveries fold now: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
  }

  // Let the rest land, and see what the arrival says.
  await page.waitForTimeout(8000);
  await snapshot('after the remaining deliveries had time to land');
  log(
    act,
    `does anything on screen now report what arrived? ${JSON.stringify(await searchHudText(page, ['plank', 'brick', 'arrived', 'in store', 'stock']))}`,
  );
  log(act, `the alerts log holds ${JSON.stringify(await alertLines(page))}`);
});

/* ------------------------------------------------------------------ */

test('act 4: the Buy control at every balance — does anything on it say what a purchase will be refused', async ({
  page,
}) => {
  const act = 'act4';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  /*
   * A player asking "can I afford this?" reads the Buy control, not the source.
   * This act reads that control at four balances -- solvent, just negative,
   * just above the deliveries rung, and past it -- and records everything on it
   * that mentions money, so a claim that the control never warns is a
   * measurement of the control rather than a reading of the code.
   */
  const readAll = async (what: string): Promise<void> => {
    await page.waitForTimeout(1200);
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('1');
    await page.waitForTimeout(200);
    const counts = await latestCounts(page);
    log(
      act,
      `${what}: treasury=${String(counts?.treasuryMinorUnits)} | FUNDS ${JSON.stringify(await readFundsChip(page))}` +
        ` | Buy ${JSON.stringify(await readBuyControl(page))}`,
    );
  };

  await readAll('25,000, solvent');
  await buyQuantity(page, 'bed-wooden', 385); // 25,025 -> -25
  await readAll('-25, one step under water');
  await buyQuantity(page, 'wall-brick', 29); // 1,160 -> -1,185
  await readAll('-1,185, 65 above the deliveries rung');
  await buyQuantity(page, 'wall-brick', 1); // -1,225
  await readAll('-1,225, 25 above the deliveries rung — nothing in the shop fits');

  // And the same question asked of a big quantity at full health, which is the
  // other way a player meets the limit: a number typed into the field.
  await page.locator('.hud-build__buy .ui-number__input').fill('10000');
  await page.waitForTimeout(300);
  log(act, `with 10,000 typed into the quantity field: ${JSON.stringify(await readBuyControl(page))}`);
  const bigPress = await probeBuy(page, 'wall-brick', 10_000);
  log(act, `pressing it: sent=${JSON.stringify(bigPress.sent)} band=${JSON.stringify(bigPress.band)}`);

  log(act, `the tile a wall costs, for the record: ${TILE} px per tile`);
});

/* ------------------------------------------------------------------ */

test('act 5: payroll walks a prison past every rung the player was refused at, and the danger tone that no press can reach', async ({
  page,
}) => {
  const act = 'act5';
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  /*
   * Acts 1 and 2 between them establish the deepest balance a *press* can
   * reach: the Buy control stops at the deliveries rung of −1,250 and the wall
   * tool stops at the construction rung of −2,000, so the FUNDS chip's `danger`
   * tone -- which `overdraftTone` reserves for `remaining <= 0`, i.e. exactly
   * the floor of −2,500 (`src/ui/hud/projection.ts:446-450`) -- is not
   * reachable by anything the player chooses to spend on.
   *
   * `'wages'` is the one spend class whose rung *is* the floor
   * (`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`, `treasury.ts:377-382`), so payroll
   * is the only route to it. This act takes that route with the mouse: twelve
   * guards hired while solvent, the balance spent down to just above the
   * deliveries rung, and then the clock run across day boundaries with no
   * prisoners in the prison, so nothing pays anything in.
   */
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  log(act, `the hire control reads ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  for (let i = 0; i < 12; i += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(500);
  }
  log(act, `after twelve hire presses: treasury=${String((await latestCounts(page))?.treasuryMinorUnits)} staff=${String((await latestCounts(page))?.staff)}`);

  await buyQuantity(page, 'bed-wooden', 388);
  await page.waitForTimeout(1500);
  const beforeDays = await latestCounts(page);
  log(act, `after 388 planks: treasury=${String(beforeDays?.treasuryMinorUnits)} | FUNDS ${JSON.stringify(await readFundsChip(page))}`);

  const refused = await probeBuy(page, 'wall-brick', 1);
  log(act, `Buy one brick (40) before the first day boundary: sent=${JSON.stringify(refused.sent)} band=${JSON.stringify(refused.band)}`);

  // Two Fast forward presses take the clock from paused to x4.
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  log(act, `the clock reads ${JSON.stringify((await panelText(page, '.hud-strip__transport')).replace(/\n/g, ' | '))}`);

  let previous = (await latestCounts(page))?.treasuryMinorUnits;
  let sawDanger = false;
  const started = Date.now();
  while (Date.now() - started < 240_000) {
    await page.waitForTimeout(1000);
    const counts = await latestCounts(page);
    const balance = counts?.treasuryMinorUnits;
    if (balance === previous) continue;
    const chip = await readFundsChip(page);
    log(
      act,
      `t+${Math.round((Date.now() - started) / 1000)}s tick=${String(counts?.tick)} day=${await page.locator('.hud-clock__day').innerText()}` +
        `: treasury ${String(previous)} -> ${String(balance)} | chip tone=${String(chip.chipTone)}` +
        ` badge ${JSON.stringify(chip.badgeText)} tone=${String(chip.badgeTone)}`,
    );
    previous = balance;
    if (chip.badgeTone === 'danger') {
      sawDanger = true;
      break;
    }
  }
  log(act, `the FUNDS badge reached the danger tone: ${String(sawDanger)}`);
  log(act, `the alerts log holds ${JSON.stringify(await alertLines(page))}`);
  log(act, `the whole strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(act, `the Security panel says ${JSON.stringify((await panelText(page, '.hud-staff')).replace(/\n/g, ' | '))}`);
});
