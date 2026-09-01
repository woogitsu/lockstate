import { test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  runUntilTick,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **The sweep issue [#629](https://github.com/matmaxalez/lockstate/issues/629)
 * commissions**, played rather than read.
 *
 * The owner's standing directive, in their own words, is that *"the game is to
 * be easy and friendly to play, not hidden mechanics like this one, where you
 * have to order building material"* -- so **a mechanic the player must
 * discover in order to proceed is a defect**, and the test is not whether the
 * information exists somewhere. #627 settled that: *"Awaiting Materials"* was
 * present the whole time, inside a fold that starts shut, and reached nobody.
 *
 * The test this file applies at every observation point is:
 *
 * > would a player who has never read the code get through this without being
 * > told?
 *
 * ## The instrumentation rule, inherited
 *
 * #569's retraction is the standing proof that reading the code finds the
 * wrong wall, and it names the rule: *"A survey that enumerates known regions
 * cannot find a message in a region it did not know about. **Print the
 * container, not the parts.**"* So every observation here dumps
 * `document.querySelector('.hud')` whole through `hudDump`, and per-panel
 * readouts are printed **in addition** rather than instead. `innerText`
 * reflects layout, so a sentence inside a shut fold is correctly absent from
 * the dump and "is this reachable without unfolding anything?" is a substring
 * test.
 *
 * `hudDump` here carries two regions `playtest-naive-route.playtest.ts`'s does
 * not, because the questions below are about them: `.hud__event` (the band
 * `hud.ts:1003-1013` builds for `simulation/event`, which is where an unpaid
 * payday would land) and the transport group's pressed states (the only
 * on-screen difference between a paused clock and a clock running at 1x --
 * `status-strip.ts:240-244` sets `aria-pressed`, and `data-clock-mode` beside
 * it is read by no CSS rule and no module in `src/`).
 *
 * ## The three acts, ordered by how early a new player meets them
 *
 * 1. **The clock.** A new session starts paused (`FixedStepClock`,
 *    `{ mode: 'paused' }`, `state-machine.ts:216`). Play the whole first
 *    prison without ever touching the transport, which is what a player who
 *    was never told the clock is stopped does, and print what the game says.
 * 2. **The wage.** A guard is charged again at every in-game day boundary
 *    (`PayrollSystem`, `payroll.ts`), and the hire control's hint says *"Taken
 *    from the treasury on hire."* Hire one, cross two day boundaries, and see
 *    whether anything on screen ever names a recurring charge -- then hire
 *    enough to make the prison insolvent and see whether *that* is legible.
 * 3. **Intake.** [#538](https://github.com/matmaxalez/lockstate/issues/538)
 *    reports that a full prison keeps accepting prisoners it cannot house with
 *    nothing said. Build one bed, admit four, and confirm or refute it.
 *
 * ## What it is not
 *
 * Not a gate. Nothing in CI collects `.playtest.ts`
 * (`tests/browser/playwright.playtest.config.ts` says so at length). Its
 * console output is the deliverable; the findings live in
 * `docs/research/2026-08-30-what-the-game-never-says.md`.
 */

/** The rectangle every act that builds draws, in tiles. */
const AREA = { x0: 12, y0: 12, x1: 17, y1: 17 } as const;

interface HudDump {
  /**
   * `.hud`'s live `innerText`. Reflects layout, so a sentence inside a shut
   * fold is correctly absent -- which is what makes "reachable without
   * unfolding anything?" a substring test.
   */
  readonly text: string;
  /**
   * The same walk with every `.ui-sr-only` span dropped.
   *
   * **This exists because the first run of this file produced a wrong reading
   * and it is kept rather than corrected away.** `/paus/i` came back `true`
   * against `text` at every observation point in Act 1, which reads as "the
   * game says it is paused" -- and it is an artifact: `createIconButton` puts
   * its label in a `screenReaderText` span (`src/ui/primitives/icon-button.ts:31`,
   * `src/ui/primitives/dom.ts:60-62`), so `Pause`, `Play at normal speed`,
   * `Fast forward` and `Speed 1×` are all in `innerText` and none of them is
   * on screen. What a sighted player reads of the clock is `×1` and three
   * icons. Same failure as #625 §6, one size along: a survey answers about the
   * probe until the probe is checked.
   *
   * **The last claim expired on 2026-08-30 and is marked rather than
   * overwritten, because the reading it records is the finding.** What a
   * sighted player reads of a *stopped* clock is now `PAUSED` and three icons,
   * and the day, the day progress and the speed are all dimmed to
   * `--text-muted` while it is stopped -- the owner's ruling on #639, taken
   * after this file measured that `×1` printed identically either way. So
   * `/paus/i` coming back true against `visibleText` is no longer an
   * instrumentation artefact at every observation point: while the clock is
   * stopped it is the game saying so, and the two are told apart by which of
   * `text` and `visibleText` carries it. A run of this act that reports
   * `readable by a sighted player: false` for `/paus/i` is now a **defect**
   * rather than the expected reading.
   */
  readonly visibleText: string;
  readonly refusal: { hidden: boolean | string; box: { w: number; h: number; x: number; y: number }; text: string };
  readonly event: {
    present: boolean;
    hidden: boolean | string;
    severity: string | null;
    box: { w: number; h: number; x: number; y: number };
    text: string;
  };
  readonly queue: {
    present: boolean;
    hidden: boolean | string;
    collapsed: string | null;
    headerText: string;
    bodyHidden: boolean | string;
  };
  readonly transport: readonly { label: string; pressed: string | null; disabled: boolean }[];
  readonly clockMode: string | null;
  readonly speedText: string;
}

async function hudDump(page: import('@playwright/test').Page): Promise<HudDump> {
  return page.evaluate(() => {
    const box = (node: Element | null | undefined) => {
      const rect = node?.getBoundingClientRect();
      return {
        w: Math.round(rect?.width ?? 0),
        h: Math.round(rect?.height ?? 0),
        x: Math.round(rect?.x ?? 0),
        y: Math.round(rect?.y ?? 0),
      };
    };
    const hud = document.querySelector<HTMLElement>('.hud');
    const refusalNode = document.querySelector<HTMLElement>('.hud__refusal');
    const eventNode = document.querySelector<HTMLElement>('.hud__event');
    const queueNode = document.querySelector<HTMLElement>('.hud-build__queue');
    const queueHeader = queueNode?.querySelector<HTMLElement>('.ui-section__header');
    const queueBody = queueNode?.querySelector<HTMLElement>('.ui-section__body');
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    // The HUD with every `.ui-sr-only` span removed -- see `visibleText` on
    // `HudDump` for why a word survey run against `innerText` alone is an
    // instrumentation artifact rather than a finding.
    // Walked on the **live** DOM rather than on a clone, because both halves of
    // the question need layout: a clone has none, so a shut fold's contents
    // would come back as readable text.
    let visibleText = 'NO .hud';
    if (hud !== null) {
      const parts: string[] = [];
      const walker = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null) continue;
        if (parent.closest('.ui-sr-only') !== null) continue;
        if (parent.getClientRects().length === 0) continue;
        const value = (node.textContent ?? '').trim();
        if (value !== '') parts.push(value);
      }
      visibleText = parts.join('\n');
    }
    return {
      text: (hud?.innerText ?? 'NO .hud').replace(/\n{2,}/g, '\n').trim(),
      visibleText,
      refusal: {
        hidden: refusalNode?.hidden ?? true,
        box: box(refusalNode),
        text: (refusalNode?.innerText ?? '').trim(),
      },
      event: {
        present: eventNode !== null,
        hidden: eventNode?.hidden ?? true,
        severity: eventNode?.getAttribute('data-severity') ?? null,
        box: box(eventNode),
        text: (eventNode?.innerText ?? '').trim(),
      },
      queue: {
        present: queueNode !== null,
        hidden: queueNode?.hidden ?? true,
        collapsed: queueNode?.getAttribute('data-collapsed') ?? null,
        headerText: (queueHeader?.innerText ?? '').replace(/\n+/g, ' ').trim(),
        bodyHidden: queueBody?.hidden ?? true,
      },
      transport: [...document.querySelectorAll<HTMLButtonElement>('.hud-strip__transport button')].map((button) => ({
        label: (button.getAttribute('aria-label') ?? button.title ?? '').trim(),
        pressed: button.getAttribute('aria-pressed'),
        disabled: button.disabled,
      })),
      clockMode: strip?.getAttribute('data-clock-mode') ?? null,
      speedText: (document.querySelector<HTMLElement>('.hud-clock__speed')?.textContent ?? '').trim(),
    };
  });
}

/**
 * The Staff panel's "On the payroll" section (issue #533), which is built
 * `collapsed: true` (`src/ui/hud/staff-panel.ts:713-716`) and, unlike the Build
 * panel's queue, is passed **no `trailing` badge** -- so the folded header
 * carries no count. Its fold state is an attribute, so no amount of reading
 * `innerText` recovers it: the same reason `playtest-naive-route.playtest.ts`
 * probes the queue's.
 */
async function staffRosterFold(page: import('@playwright/test').Page): Promise<unknown> {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('.hud-staff__roster');
    const header = section?.querySelector<HTMLElement>('.ui-section__header') ?? null;
    const body = section?.querySelector<HTMLElement>('.ui-section__body') ?? null;
    return {
      present: section !== null,
      hidden: section?.hidden ?? true,
      collapsed: section?.getAttribute('data-collapsed') ?? null,
      headerText: (header?.innerText ?? '').replace(/\n+/g, ' ').trim(),
      headerAriaExpanded: header?.getAttribute('aria-expanded') ?? null,
      bodyHidden: body?.hidden ?? true,
      bodyText: (body?.textContent ?? '').replace(/\s*\n\s*/g, ' | ').trim(),
      rowCount: section?.querySelectorAll('[data-staff]').length ?? -1,
    };
  });
}

/** Every word whose absence is a finding in one of the three acts. */
const WORD_SURVEY = ['paus', 'play', 'stopped', 'wage', 'per day', 'daily', 'payroll', 'owed', 'bed', 'material'];

function report(log: (line: string) => void, moment: string, dump: HudDump): void {
  log(`===== ${moment} =====`);
  log(`--- WHOLE .hud innerText:\n${dump.text}`);
  log(`--- WHOLE .hud VISIBLE text (every .ui-sr-only span dropped):\n${dump.visibleText}`);
  log(`--- .hud__refusal: ${JSON.stringify(dump.refusal)}`);
  log(`--- .hud__event: ${JSON.stringify(dump.event)}`);
  log(`--- .hud-build__queue: ${JSON.stringify(dump.queue)}`);
  log(`--- transport: ${JSON.stringify(dump.transport)} | data-clock-mode=${dump.clockMode} | speed readout=${JSON.stringify(dump.speedText)}`);
  for (const word of WORD_SURVEY) {
    const pattern = new RegExp(word, 'i');
    log(`--- /${word}/i — laid out: ${pattern.test(dump.text)} | readable by a sighted player: ${pattern.test(dump.visibleText)}`);
  }
}

/** The Alerts fold, addressed the way #625 §6 had to correct itself into. */
async function alertsFold(page: import('@playwright/test').Page): Promise<unknown> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-alerts__list');
    const section = list?.closest<HTMLElement>('.ui-section') ?? null;
    const header = section?.querySelector<HTMLElement>('.ui-section__header') ?? null;
    return {
      listPresent: list !== null,
      sectionCollapsed: section?.getAttribute('data-collapsed') ?? null,
      headerText: (header?.innerText ?? '').replace(/\n+/g, ' ').trim(),
      headerAriaExpanded: header?.getAttribute('aria-expanded') ?? null,
      listChildCount: list?.childElementCount ?? -1,
      listText: (list?.textContent ?? '').trim(),
    };
  });
}

test.describe('playtest: what the game requires and never says', () => {
  /**
   * ## ACT 1 -- the clock
   *
   * The earliest surface in the game: it is on screen before any tab is
   * pressed. A new session's clock is constructed paused
   * (`src/simulation/worker/state-machine.ts:216`,
   * `new FixedStepClock(50, { mode: 'paused' })`) and **nothing starts it but
   * the player**.
   *
   * The worker dispatches a submitted command against a paused clock
   * immediately -- the behaviour ADR 0051 proposed and `src/main.ts:2432-2435`
   * records as shipped -- so zoning, buying and ordering all *work* while the
   * clock is stopped: money leaves the treasury, rooms appear, an order joins
   * the queue. Only the passage of time does not happen. That is the exact
   * shape #629 is about: every press answers, and the prison never gets built.
   *
   * So this act plays the informed material route -- buy first, then build,
   * which is the route `buildAndPopulate` hard-codes and the one that is known
   * to work -- and changes exactly one thing: **it never touches the
   * transport.**
   */
  test('the clock — play the whole first prison without ever pressing Play', async ({ page }) => {
    test.setTimeout(900_000);
    const log = (line: string) => console.log(`[clock] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (error) => log(`PAGE ERROR: ${error.message}`));

    await installTee(page);
    await openApp(page);

    // Before "New prison" is pressed at all: the very first frame a player
    // sees. Printed because #629's test is about what reaches somebody who has
    // been told nothing, and this is the screen they are told nothing on.
    report(log, 'ACT 1a — the page as loaded, before New prison', await hudDump(page));

    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);
    report(log, 'ACT 1b — a new prison, nothing else pressed', await hudDump(page));
    log(`clock on arrival, from the worker: ${JSON.stringify(await currentClock(page))}`);
    log(`tick on arrival: ${await currentTick(page)}`);
    log(`counts on arrival: ${JSON.stringify(await latestCounts(page))}`);

    // The informed route, minus the clock. Buy the material first so that
    // nothing below can be about #627's shortage.
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    await buy(page, 'wall-brick', 60);
    await page.waitForTimeout(1000);
    log(`after buying 60 bricks, funds = ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)} at tick ${await currentTick(page)}`);
    log(`deliveries block: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    report(log, 'ACT 1c — 60 bricks bought, clock never touched', await hudDump(page));

    await armBuildable(page, 'wall-brick');
    const westX = origin.originX + AREA.x0 * TILE;
    const eastX = origin.originX + (AREA.x1 + 1) * TILE;
    const northY = origin.originY + AREA.y0 * TILE;
    const southY = origin.originY + (AREA.y1 + 1) * TILE;
    let placed = 0;
    for (const run of [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      placed += (await sentCommands(page)).slice(before).length;
    }
    log(`ACT 1d: ${placed} wall orders placed, clock still never touched`);

    // Watch, the way a player watches. Four observations over a minute of real
    // time -- long enough that "it has not happened yet" stops being a reading.
    for (let observation = 1; observation <= 4; observation += 1) {
      await page.waitForTimeout(15_000);
      const dump = await hudDump(page);
      report(log, `ACT 1e.${observation} — waiting, tick ${await currentTick(page)}`, dump);
      log(`counts: ${JSON.stringify(await latestCounts(page))}`);
      log(`queue verbatim: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      log(`deliveries verbatim: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    }

    log(`ALERTS fold while nothing is happening: ${JSON.stringify(await alertsFold(page))}`);

    // The player then tries the other tab, which is what #625 measured as
    // erasing the queue block.
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);
    log(`ACT 1f zoning with a paused clock and no walls: rooms=${(await latestCounts(page))?.rooms}`);
    report(log, 'ACT 1f — after trying to zone, clock still paused', await hudDump(page));

    // And now the one press that was missing. Everything that was queued
    // should happen at once, which is the measurement that makes the silence
    // above a *hidden requirement* rather than a broken build.
    const tickBeforePlay = await currentTick(page);
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(2000);
    report(log, 'ACT 1g — one press of Play', await hudDump(page));
    log(`tick before Play ${tickBeforePlay}, tick 2s after Play ${await currentTick(page)}`);
    log(`clock after Play: ${JSON.stringify(await currentClock(page))}`);

    await fastForwardToMax(page);
    for (let poll = 0; poll < 40; poll += 1) {
      await page.waitForTimeout(3000);
      const queueText = await panelText(page, '.hud-build__queue');
      if (/0 waiting . 0 being built/.test(queueText) || queueText.includes('not laid out') || queueText.includes('ABSENT')) break;
      if (poll % 4 === 0) log(`ACT 1h poll ${poll} at tick ${await currentTick(page)}: ${JSON.stringify(queueText.split('\n').slice(0, 2).join(' | '))}`);
    }
    log(`ACT 1h: the queue drained at tick ${await currentTick(page)}`);
    log(`counts once the clock has run: ${JSON.stringify(await latestCounts(page))}`);
    report(log, 'ACT 1h — the same prison, after the clock was allowed to run', await hudDump(page));
  });

  /**
   * ## ACT 2 -- the wage
   *
   * `staffHireCostMinorUnits` charges **one day** of the role's
   * `wageBand.minPerDay` as an engagement fee (ADR 0025 decision 2,
   * `src/simulation/economy/wages.ts`), and `PayrollSystem` then charges the
   * *same figure again at every in-game day boundary* for as long as the
   * employee is on the roster (`src/simulation/economy/payroll.ts`, order 130,
   * `schedule = { intervalTicks: DAY_LENGTH_TICKS, ... }`).
   *
   * The hire control reads `Hire {role} · {total}` with the hint *"Taken from
   * the treasury on hire. A new guard starts unassigned."*
   * (`src/content/default-locale-en.ts:632-633`). This act asks what a player
   * who reads that sentence and presses the button can find out, and when.
   *
   * No prison is built first, on purpose: hiring needs none, the Security tab
   * is one press from arrival, and a player who hires before building is
   * exactly the player the recurring charge is worst for.
   */
  test('the wage — hire a guard and cross two day boundaries', async ({ page }) => {
    test.setTimeout(900_000);
    const log = (line: string) => console.log(`[wage] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (error) => log(`PAGE ERROR: ${error.message}`));

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);

    await tab(page, 'security').click();
    await page.waitForTimeout(500);
    report(log, 'ACT 2a — the Security tab, before anything is hired', await hudDump(page));
    log(`.hud-staff verbatim: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    log(`hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    log(
      `the roles the panel offers: ${JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.hud-staff__list [data-staff-role]')].map((row) => ({
            id: row.getAttribute('data-staff-role'),
            text: (row.innerText ?? '').replace(/\n+/g, ' | ').trim(),
          })),
        ),
      )}`,
    );

    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(1500);
    report(log, 'ACT 2b — one guard hired', await hudDump(page));
    log(`counts after one hire: ${JSON.stringify(await latestCounts(page))}`);
    log(`.hud-staff verbatim after the hire: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    log(`ON THE PAYROLL fold after one hire: ${JSON.stringify(await staffRosterFold(page))}`);
    // Unfold it by hand -- the press a player has to know to make -- and read
    // what the block a player looking for "what does this cost me" would open
    // actually says.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.hud-staff__roster .ui-section__header')?.click();
    });
    await page.waitForTimeout(600);
    log(`ON THE PAYROLL unfolded by hand: ${JSON.stringify(await staffRosterFold(page))}`);
    report(log, 'ACT 2b.2 — one guard hired, the payroll block opened by hand', await hudDump(page));

    // Cross two in-game day boundaries. DAY_LENGTH_TICKS is 2,400
    // (`src/simulation/prisoners/regime.ts`), so the first payday is at 2,399.
    await fastForwardToMax(page);
    await runUntilTick(page, 2600, 300_000);
    await page.waitForTimeout(1500);
    report(log, `ACT 2c — the first payday has passed, tick ${await currentTick(page)}`, await hudDump(page));
    log(`counts after payday 1: ${JSON.stringify(await latestCounts(page))}`);

    await runUntilTick(page, 5000, 300_000);
    await page.waitForTimeout(1500);
    report(log, `ACT 2d — the second payday has passed, tick ${await currentTick(page)}`, await hudDump(page));
    log(`counts after payday 2: ${JSON.stringify(await latestCounts(page))}`);
    log(`ALERTS fold after two paydays: ${JSON.stringify(await alertsFold(page))}`);

    // Now the other half of the question: what an unpayable bill looks like.
    // A guard is 80/day (`staff-role-catalog.ts:150`, wageBand.minPerDay), so
    // sixty guards bill 4,800/day against a treasury of roughly 20,000.
    await tab(page, 'security').click();
    const beforeMass = await latestCounts(page);
    log(`ACT 2e hiring 59 more guards. funds before: ${beforeMass?.treasuryMinorUnits}`);
    for (let index = 0; index < 59; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(2000);
    const afterMass = await latestCounts(page);
    log(`ACT 2e after the mass hire: ${JSON.stringify(afterMass)}`);
    log(`ON THE PAYROLL fold with sixty hired: ${JSON.stringify(await staffRosterFold(page))}`);
    report(log, 'ACT 2e — sixty guards on the payroll, nothing built, no prisoners', await hudDump(page));

    // Run until the treasury is empty and the payroll cannot be met.
    let lastFunds = afterMass?.treasuryMinorUnits ?? -1;
    for (let day = 0; day < 12; day += 1) {
      const target = 2400 * (day + 3);
      try {
        await runUntilTick(page, target, 240_000);
      } catch (error) {
        log(`ACT 2f stopped advancing: ${String(error)}`);
        break;
      }
      await page.waitForTimeout(1200);
      const counts = await latestCounts(page);
      log(
        `ACT 2f day boundary near tick ${target}: funds=${counts?.treasuryMinorUnits}` +
          ` bill=${counts?.dailyWageBillMinorUnits} unpaid=${counts?.unpaidWagesMinorUnits} staff=${counts?.staff}`,
      );
      if ((counts?.unpaidWagesMinorUnits ?? 0) > 0) {
        report(log, `ACT 2g — the first payday the prison could not meet, tick ${await currentTick(page)}`, await hudDump(page));
        log(`ALERTS fold at the unpaid payday: ${JSON.stringify(await alertsFold(page))}`);
        log(`ON THE PAYROLL fold at the unpaid payday: ${JSON.stringify(await staffRosterFold(page))}`);
        break;
      }
      lastFunds = counts?.treasuryMinorUnits ?? lastFunds;
    }
    log(`ACT 2 closing counts: ${JSON.stringify(await latestCounts(page))} (funds last seen solvent at ${lastFunds})`);
  });

  /**
   * ## ACT 3 -- intake
   *
   * [#538](https://github.com/matmaxalez/lockstate/issues/538) reports that a
   * full prison keeps accepting prisoners it cannot house and that nothing
   * says so. Since it was filed, `hud.intake.no-place` --
   * *"{count} waiting with no bed to sleep in"* --
   * (`src/content/default-locale-en.ts:608`) exists on the Intake panel, so
   * the claim needs re-measuring rather than repeating.
   *
   * One 6x6 cell, **one** bed, one toilet, four admissions. Three arrivals
   * therefore have nowhere to sleep.
   */
  test('intake — one bed, four arrivals, and what the panel says', async ({ page }) => {
    test.setTimeout(900_000);
    const log = (line: string) => console.log(`[intake] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (error) => log(`PAGE ERROR: ${error.message}`));

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
    await buy(page, 'wall-brick', 60);
    await buy(page, 'bed-wooden', 1);
    await buy(page, 'toilet-brick', 1);
    await fastForwardToMax(page);
    await page.waitForTimeout(10_000);
    log(`materials in: funds=${(await latestCounts(page))?.treasuryMinorUnits} tick=${await currentTick(page)}`);

    await armBuildable(page, 'wall-brick');
    const westX = origin.originX + AREA.x0 * TILE;
    const eastX = origin.originX + (AREA.x1 + 1) * TILE;
    const northY = origin.originY + AREA.y0 * TILE;
    const southY = origin.originY + (AREA.y1 + 1) * TILE;
    for (const run of [
      { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      await drag(page, run.a, run.b);
    }
    for (let poll = 0; poll < 40; poll += 1) {
      await page.waitForTimeout(3000);
      const queueText = await panelText(page, '.hud-build__queue');
      if (/0 waiting . 0 being built/.test(queueText) || queueText.includes('not laid out') || queueText.includes('ABSENT')) break;
    }
    log(`walls up at tick ${await currentTick(page)}`);

    let zoned = false;
    for (let attempt = 1; attempt <= 12 && !zoned; attempt += 1) {
      await tab(page, 'rooms').click();
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(1000);
      zoned = ((await latestCounts(page))?.rooms ?? 0) > 0;
      if (!zoned) await page.waitForTimeout(4000);
    }
    log(`zoned=${zoned} at tick ${await currentTick(page)}`);

    // Exactly one bed, and a toilet.
    await tab(page, 'build').click();
    await armBuildable(page, 'bed-wooden');
    await page.mouse.click(centreOf(origin, 13, 13).x, centreOf(origin, 13, 13).y);
    await page.waitForTimeout(300);
    await armBuildable(page, 'toilet-brick');
    await page.mouse.click(centreOf(origin, 12, 16).x, centreOf(origin, 12, 16).y);
    await page.waitForTimeout(300);
    for (let poll = 0; poll < 30; poll += 1) {
      await page.waitForTimeout(3000);
      const queueText = await panelText(page, '.hud-build__queue');
      if (/0 waiting . 0 being built/.test(queueText) || queueText.includes('not laid out') || queueText.includes('ABSENT')) break;
    }
    const furnished = await latestCounts(page);
    log(`furnished: ${JSON.stringify(furnished)}`);

    await tab(page, 'overview').click();
    await page.waitForTimeout(800);
    report(log, 'ACT 3a — one cell, one bed, nobody admitted', await hudDump(page));
    log(`.hud-intake verbatim: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

    for (let index = 1; index <= 4; index += 1) {
      const disabledBefore = await page.locator('.hud-intake__admit').getAttribute('disabled');
      await page.locator('.hud-intake__admit').click();
      await page.waitForTimeout(2500);
      const counts = await latestCounts(page);
      log(
        `ACT 3b admission ${index}: disabled-before=${JSON.stringify(disabledBefore)}` +
          ` prisoners=${counts?.prisoners} inIntake=${counts?.prisonersInIntake}` +
          ` occupants=${counts?.roomOccupants} accommodationCapacity=${counts?.accommodationCapacity}`,
      );
      log(`   .hud-intake now: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
      log(`   no-place attribute: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
    }
    report(log, 'ACT 3c — four admitted into one bed', await hudDump(page));
    log(`ALERTS fold after four admissions: ${JSON.stringify(await alertsFold(page))}`);

    // Let a day pass so the pipeline settles and the state pays.
    const settleFrom = await currentTick(page);
    await runUntilTick(page, settleFrom + 2600, 300_000);
    await page.waitForTimeout(2000);
    report(log, `ACT 3d — a day later, tick ${await currentTick(page)}`, await hudDump(page));
    log(`counts a day later: ${JSON.stringify(await latestCounts(page))}`);
    log(`.hud-intake a day later: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
    await tab(page, 'rooms').click();
    await page.waitForTimeout(600);
    log(`.hud-rooms a day later: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    log(`ALERTS fold a day later: ${JSON.stringify(await alertsFold(page))}`);
  });
});
