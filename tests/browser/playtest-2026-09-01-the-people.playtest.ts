import { expect, type Page, test } from '@playwright/test';
import {
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy/treasury';
import { installBandRecorder, readBandRecording } from './alert-dwell';
import {
  armBuildable,
  buildAndPopulate,
  buy,
  calibrate,
  centreOf,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Playing the people surface: residents, staff, contraband, incidents, and
 * what the game tells the player at each point.**
 *
 * `tests/browser/playwright.config.ts` collects `*.spec.ts` only, so nothing
 * in CI runs this file. It is driven by hand through
 * `tests/browser/playwright.playtest.config.ts`, one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5321 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-01-the-people.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * Findings live in `docs/research/2026-09-01-playing-the-people-surface.md`.
 *
 * Acts log rather than hard-assert, on the `playtest-2026-09-01-rooms` file's
 * own reasoning: a playtest that fails on its first finding stops before the
 * act that would have found the next one. Every assertion that *is* made
 * reads the DOM (`innerText`, `getAttribute`, `offsetParent`), never the
 * simulation state directly — `docs/AGENT_WORKFLOW.md`'s "read the screen, not
 * the store".
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/* ==================================================================== */
/* Act 1 — risk tiers on the roster, and what a player can learn about   */
/* them without opening this file                                       */
/* ==================================================================== */

interface RosterRowReading {
  readonly name: string;
  readonly activity: string;
  readonly badgeText: string;
  readonly badgeTitle: string | null;
  readonly rowTitle: string | null;
  readonly riskTier: string | undefined;
  readonly classificationGroup: string | undefined;
}

async function readRoster(page: Page): Promise<readonly RosterRowReading[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        name: (row.querySelector<HTMLElement>('.hud-regime__roster-name')?.textContent ?? '').trim(),
        activity: (row.querySelector<HTMLElement>('.hud-regime__roster-activity')?.textContent ?? '').trim(),
        badgeText: (row.querySelector<HTMLElement>('.ui-badge__text')?.textContent ?? '').trim(),
        badgeTitle: row.querySelector<HTMLElement>('.ui-badge')?.getAttribute('title') ?? null,
        rowTitle: row.getAttribute('title'),
        riskTier: row.dataset['riskTier'],
        classificationGroup: row.dataset['classificationGroup'],
      })),
  );
}

interface RegimeBlockReading {
  readonly group: string | undefined;
  readonly name: string;
  readonly allows: string;
}

async function readRegimeBlocks(page: Page): Promise<readonly RegimeBlockReading[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-regime__block-row')].map((row) => ({
      group: row.dataset['group'],
      name: (row.querySelector<HTMLElement>('.hud-regime__block-name')?.textContent ?? '').trim(),
      allows: (row.querySelector<HTMLElement>('.hud-regime__block-allows')?.textContent ?? '').trim(),
    })),
  );
}

/** One chip's full reading: value, description(title), and whether hovering it says anything at all. */
async function readChip(page: Page, metric: string): Promise<{ value: string; title: string | null; srText: string } | undefined> {
  return page.evaluate((id) => {
    const chip = document.querySelector<HTMLElement>(`[data-metric="${id}"]`);
    if (chip === null) return undefined;
    return {
      value: (chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? '').trim(),
      title: chip.getAttribute('title'),
      srText: (chip.querySelector<HTMLElement>('.ui-sr-only')?.textContent ?? '').trim(),
    };
  }, metric);
}

test('act 1: what a risk-tier badge says, and what it never explains', async ({ page }) => {
  const act = 'act1';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 6, admits: 6, guards: 1, label: act });

  // Give ClassificationReviewSystem's intake-time draw (not the 24,000-tick
  // re-review) a few seconds of real ticks to resolve every arrival out of
  // `classified: false`.
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(6_000);
  await page.locator('.hud-strip__transport button').nth(0).click();
  log(act, `settled at tick ${await currentTick(page)}`);

  await tab(page, 'regime').click();
  await page.waitForTimeout(300);

  const roster = await readRoster(page);
  log(act, `roster rows on screen: ${JSON.stringify(roster)}`);

  const blocks = await readRegimeBlocks(page);
  log(act, `regime blocks on screen: ${JSON.stringify(blocks)}`);

  const highRisk = await readChip(page, 'high-risk');
  log(act, `high-risk chip: ${JSON.stringify(highRisk)}`);
  const prisonersChip = await readChip(page, 'prisoners');
  log(act, `prisoners chip (for comparison — it does carry a badge/description elsewhere): ${JSON.stringify(prisonersChip)}`);

  // The full panel text, so a reader can see exactly what a player scanning
  // the tab sees, in the order it appears.
  log(act, `whole Regime tab, as text: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);

  // Distinct badge words actually painted, versus distinct behavioural
  // groups actually named in the blocks above them.
  const distinctBadgeWords = [...new Set(roster.map((r) => r.badgeText))].sort();
  const distinctGroupNames = [...new Set(blocks.map((b) => b.name))].sort();
  log(act, `distinct risk-tier words on the roster: ${JSON.stringify(distinctBadgeWords)}`);
  log(act, `distinct classification-group names in the blocks above it: ${JSON.stringify(distinctGroupNames)}`);
  log(
    act,
    `every roster badge carries a title attribute: ${roster.every((r) => r.badgeTitle !== null && r.badgeTitle !== '')}` +
      ` (sampled titles: ${JSON.stringify(roster.map((r) => r.badgeTitle))})`,
  );
});

/* ==================================================================== */
/* Act 2 — coverage states, a held guard's claim, and a contraband find  */
/* ==================================================================== */

interface HeldRowReading {
  readonly label: string;
  readonly guard: string | undefined;
}

async function readHeldGuards(page: Page): Promise<readonly HeldRowReading[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-staff__held-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        label: (row.querySelector<HTMLElement>('.hud-staff__held-label')?.textContent ?? '').trim(),
        guard: row.dataset['guard'],
      })),
  );
}

async function readCoverage(page: Page): Promise<{ summary: string; badge: string; tone: string | null; hint: string } | undefined> {
  return page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('.hud-staff__coverage');
    if (block === null || block.hidden) return undefined;
    return {
      summary: (block.querySelector<HTMLElement>('.hud-staff__coverage-summary')?.textContent ?? '').trim(),
      badge: (block.querySelector<HTMLElement>('.ui-badge__text')?.textContent ?? '').trim(),
      tone: block.getAttribute('data-tone'),
      hint: (block.querySelector<HTMLElement>('.hud-staff__note')?.textContent ?? '').trim(),
    };
  });
}

async function alertLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')].map((row) => (row.textContent ?? '').trim()),
  );
}

test('act 2: coverage states, a held guard says why it is held, and a contraband find names itself', async ({ page }) => {
  const act = 'act2';
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);

  // A 6x6 cell, twelve beds, a toilet — the same footprint
  // `ui-contraband-name.spec.ts` proved a real search duty fires inside, sized
  // up here so the coverage requirement is worth reading (more than one
  // guard).
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 14);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(3_000);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * 64;
  const eastX = origin.originX + 18 * 64;
  const northY = origin.originY + 12 * 64;
  const southY = origin.originY + 18 * 64;
  for (const run of [
    { a: { x: westX + 32, y: northY }, b: { x: eastX - 32, y: northY } },
    { a: { x: westX + 32, y: southY }, b: { x: eastX - 32, y: southY } },
    { a: { x: westX, y: northY + 32 }, b: { x: westX, y: southY - 32 } },
    { a: { x: eastX, y: northY + 32 }, b: { x: eastX, y: southY - 32 } },
  ]) {
    await drag(page, run.a, run.b);
  }
  await waitForQueueEmpty(page);

  let zoned = false;
  for (let attempt = 0; attempt < 12 && !zoned; attempt += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    zoned = ((await latestCounts(page))?.rooms ?? 0) > 0;
    if (!zoned) await page.waitForTimeout(5_000);
  }
  log(act, `zoned: ${zoned}`);

  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  const bedTiles: ReadonlyArray<readonly [number, number]> = [
    [12, 12], [13, 12], [14, 12], [15, 12], [16, 12], [17, 12],
    [12, 14], [13, 14], [14, 14], [15, 14], [16, 14], [17, 14],
  ];
  for (const [column, row] of bedTiles) {
    const point = centreOf(origin, column, row);
    await press(page, point.x, point.y);
  }
  await waitForQueueEmpty(page);
  const built = await latestCounts(page);
  log(act, `after furnishing: rooms=${built?.rooms} accommodationCapacity=${built?.accommodationCapacity}`);

  // ---- coverage before any guard --------------------------------------
  await tab(page, 'security').click();
  log(act, `coverage with 0 guards hired: ${JSON.stringify(await readCoverage(page))}`);

  // ---- admit twelve, hire three (two posted, one spare to search) ------
  await tab(page, 'overview').click();
  for (let i = 0; i < 12; i += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1_500);
  log(act, `intake panel after 12 admissions: ${await panelText(page, '.hud-intake')}`);

  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  log(act, `coverage right after 12 admissions, 0 guards: ${JSON.stringify(await readCoverage(page))}`);

  for (let i = 0; i < 1; i += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }
  log(act, `coverage after hiring 1 guard: ${JSON.stringify(await readCoverage(page))}`);
  for (let i = 0; i < 2; i += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1_500);
  log(act, `coverage after hiring 3 guards total: ${JSON.stringify(await readCoverage(page))}`);
  log(act, `held guards right after hiring: ${JSON.stringify(await readHeldGuards(page))}`);

  // ---- run the clock and watch for a spare guard being held on search,  ---
  // ---- correlated with a contraband alert -------------------------------
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);

  const SIXTEEN_DAYS = 2_400 * 16;
  let sawSearchClaim = false;
  let sawContrabandAlert = false;
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    const held = await readHeldGuards(page);
    if (!sawSearchClaim && held.some((row) => /search/i.test(row.label))) {
      sawSearchClaim = true;
      log(act, `tick ${tick}: a guard is held for a reason that names itself: ${JSON.stringify(held)}`);
      log(act, `coverage while a guard is off searching: ${JSON.stringify(await readCoverage(page))}`);
    }
    const contrabandChip = await readChip(page, 'contraband');
    if (contrabandChip !== undefined && contrabandChip.value !== '0' && !sawContrabandAlert) {
      sawContrabandAlert = true;
      log(act, `tick ${tick}: contraband chip reads ${JSON.stringify(contrabandChip)}`);
      const lines = await alertLines(page);
      const found = lines.find((l) => /contraband found/i.test(l));
      log(act, `alerts log line: ${JSON.stringify(found)}`);
      log(act, `full alerts log at this point: ${JSON.stringify(lines)}`);
    }
    if (sawSearchClaim && sawContrabandAlert) break;
    if (tick >= SIXTEEN_DAYS) {
      log(act, `NO further signal by tick ${tick} (search claim seen: ${sawSearchClaim}, contraband alert seen: ${sawContrabandAlert})`);
      break;
    }
    if (Date.now() - started > 1_500_000) throw new Error(`stuck hunting for a search/contraband signal, at tick ${tick}`);
    await page.waitForTimeout(1_000);
  }

  log(act, `final coverage: ${JSON.stringify(await readCoverage(page))}`);
  log(act, `final held guards: ${JSON.stringify(await readHeldGuards(page))}`);
  log(act, `final counts: ${JSON.stringify(await latestCounts(page))}`);
});

/* ==================================================================== */
/* Act 3 — a fresh, unfurnished prison's hire refusal, played            */
/* ==================================================================== */

test('act 3: hiring while broke, on a fresh unfurnished prison, read off the real screen', async ({ page }) => {
  const act = 'act3';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  const opening = await latestCounts(page);
  log(act, `opening treasury: ${opening?.treasuryMinorUnits}`);
  log(
    act,
    `the two floors this act plays against: standard deliveries/hiring rung ` +
      `${INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS}, fresh-unfurnished starter rung ` +
      `${INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS} (treasury.ts)`,
  );

  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  const hireLabel = (await page.locator('.hud-staff__hire').innerText()).trim();
  log(act, `hire control before any spending: ${JSON.stringify(hireLabel)}`);
  const costMatch = /(\d[\d,]*)\s*$/.exec(hireLabel.replace(/[·-]/g, ' '));
  const guardCost = costMatch === undefined || costMatch === null ? undefined : Number(costMatch[1]!.replace(/,/g, ''));
  log(act, `parsed guard hire cost: ${guardCost}`);

  // Spend materials (never construction) down toward the starter floor,
  // buying planks one prison never places a bed with — capacity stays 0
  // throughout this act, so `isFreshUnfurnishedPrison` stays true.
  await tab(page, 'build').click();
  const target = INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS + 400;
  let counts = await latestCounts(page);
  while ((counts?.treasuryMinorUnits ?? 0) > target) {
    const remaining = (counts?.treasuryMinorUnits ?? 0) - target;
    const step = Math.max(1, Math.min(200, Math.floor(remaining / 65)));
    await buy(page, 'bed-wooden', step);
    counts = await latestCounts(page);
  }
  log(act, `after coarse spend-down: treasury=${counts?.treasuryMinorUnits} roomCapacity=${counts?.roomCapacity}`);
  log(act, `funds chip/badge on screen: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // Fine control: one plank (65) at a time, reading the screen after each,
  // until a purchase is refused — the real boundary, whatever it is.
  for (let i = 0; i < 10; i += 1) {
    const before = (await latestCounts(page))?.treasuryMinorUnits;
    await buy(page, 'bed-wooden', 1);
    const after = (await latestCounts(page))?.treasuryMinorUnits;
    const band = await panelText(page, '.hud__refusal');
    log(act, `plank press ${i}: ${before} -> ${after} | refusal band: ${JSON.stringify(band)}`);
    if (before === after) break;
  }

  const preHire = await latestCounts(page);
  log(act, `balance before the hire attempt: ${preHire?.treasuryMinorUnits} (roomCapacity=${preHire?.roomCapacity})`);
  log(act, `funds chip/badge before the hire attempt: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await tab(page, 'security').click();
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(500);
  const postHire = await latestCounts(page);
  const band = await panelText(page, '.hud__refusal');
  log(act, `hire result: treasury ${preHire?.treasuryMinorUnits} -> ${postHire?.treasuryMinorUnits}, staff=${postHire?.staff}`);
  log(act, `refusal band after the hire attempt: ${JSON.stringify(band)}`);
  log(act, `full alerts log: ${JSON.stringify(await alertLines(page))}`);
});

/* ==================================================================== */
/* Act 4 — an incident that resolves, and whether the player can follow  */
/* what happened (ADR 0084 decision 4, the dwell floor landed in #778)   */
/* ==================================================================== */

async function workerEvents(page: Page): Promise<readonly { tick: number; type: string }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const payload = (message as { payload: { tick: number; event: { type: string } } }).payload;
        return { tick: payload.tick, type: payload.event.type };
      }),
  );
}

test('act 4: an incident opens and resolves — can a player follow the story on screen?', async ({ page }) => {
  const act = 'act4';
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  // The recipe `docs/research/2026-09-01-what-act-six-never-reached.md` act 1
  // used and measured incidents from: one 6x6 cell, two beds, fourteen
  // prisoners, zero guards. Overcrowded and unguarded produces assaults and
  // riots as well as escapes (`trigger-system.ts`'s own comment: "an
  // overcrowded, unguarded starter prison opened 49 riots").
  await buildAndPopulate(page, { beds: 2, admits: 14, guards: 0, label: act });
  log(act, `after the build: ${JSON.stringify(await latestCounts(page))}`);

  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);

  // Arm the band recorder well ahead of where incidents have been measured to
  // open (13,250 ticks for a two-prisoner unguarded prison per
  // `staff-panel.ts`'s own comment), so no frame the terminal outcome holds is
  // missed.
  const ARM_AT_TICK = 8_000;
  const armStarted = Date.now();
  for (;;) {
    if ((await currentTick(page)) >= ARM_AT_TICK) break;
    if (Date.now() - armStarted > 600_000) throw new Error('stuck reaching the arming point');
    await page.waitForTimeout(500);
  }
  await installBandRecorder(page, '.hud__event');
  log(act, `recorder armed at tick ${await currentTick(page)}`);

  const CEILING_TICKS = 100_000;
  let firstOpened: { tick: number; type: string } | undefined;
  let sawResolutionEvent = false;
  const hunted = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    const events = await workerEvents(page);
    const opened = events.find((e) => /-opened$/.test(e.type));
    if (opened !== undefined && firstOpened === undefined) {
      firstOpened = opened;
      log(act, `first incident opened: ${JSON.stringify(opened)} (caught at page tick ${tick})`);
    }
    if (firstOpened !== undefined) {
      const resolved = events.find(
        (e) => e.tick >= firstOpened!.tick && (e.type === 'incidents.all-clear' || e.type === 'incidents.escape-succeeded'),
      );
      if (resolved !== undefined && !sawResolutionEvent) {
        sawResolutionEvent = true;
        log(act, `resolution event: ${JSON.stringify(resolved)}`);
        // Let a little more real play run so the recorder catches whatever
        // the band shows immediately after.
        await page.waitForTimeout(4_000);
        break;
      }
    }
    if (tick >= CEILING_TICKS) {
      log(act, `NO incident resolved by tick ${tick} (opened so far: ${JSON.stringify(events.filter((e) => /-opened$|all-clear|escape-succeeded/.test(e.type)))})`);
      break;
    }
    if (Date.now() - hunted > 1_500_000) throw new Error(`stuck hunting for an incident to resolve, at tick ${tick}`);
    await page.waitForTimeout(300);
  }

  const recording = await readBandRecording(page);
  log(
    act,
    `band recording: ${recording.frameCount} frames over ${Math.round(recording.stoppedAt - recording.startedAt)}ms, ` +
      `${recording.writes.length} writes, ${recording.spans.length} spans`,
  );
  log(act, `every span the band held, in order: ${JSON.stringify(recording.spans.map((s) => `${s.frames}f "${s.text}"`))}`);

  const allEvents = (await workerEvents(page)).filter((e) => e.tick >= ARM_AT_TICK - 100);
  log(act, `every worker event from tick ${ARM_AT_TICK - 100} on: ${JSON.stringify(allEvents)}`);

  const alerts = await alertLines(page);
  log(act, `alerts log at the end (fold may be shut, this reads the DOM either way): ${JSON.stringify(alerts)}`);
  log(act, `incidents chip: ${JSON.stringify(await readChip(page, 'incidents'))}`);
  log(act, `final counts: ${JSON.stringify(await latestCounts(page))}`);
});
