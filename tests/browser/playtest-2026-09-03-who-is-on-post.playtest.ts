import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  buildAndPopulate,
  buy,
  currentTick,
  installTee,
  openApp,
  panelText,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **Who is on post, what the prison was charged for them, and what it is told
 * when nobody is.**
 *
 * ## Why this file exists
 *
 * Three surfaces meet on the Security tab and none of them had ever been
 * played end to end:
 *
 * 1. **The hire charge.** `hud.security.hire` renders `Hire {role} · {total}`
 *    and `hud.security.hire-hint` reads *"Costs {total} now and {wage} a day
 *    in wages."* Both figures come off `HudStaffRoleViewModel`
 *    (`src/main.ts:824`), which reads the simulation's own
 *    `staffHireCostMinorUnits` / `staffDailyWageMinorUnits`. Whether the
 *    treasury then moves by that figure, and whether the FUNDS chip agrees
 *    with `counts.treasuryMinorUnits`, is a measurement rather than a
 *    deduction.
 * 2. **Dismissal.** [ADR 0070](../../docs/adr/0070-dismissing-a-staff-member.md)
 *    Status says the severance/refund *amount* is **explicitly not decided**,
 *    and decision 3 takes the neutral option: *"a dismissal moves no money."*
 *    `hud.security.roster-hint` is the only sentence a player reads about it
 *    -- *"A dismissed staff member leaves the prison for good, and their wage
 *    stops."* So the question this file answers is narrow and checkable: does
 *    the treasury move on a Dismiss press, and does the wage actually stop?
 * 3. **The unstaffed-sector sentence**, which landed this morning as `dfa33664`
 *    (PR #857) and had never been through the UI. The owner's wording is
 *    `hud.security.coverage-unguarded-consequence`, *"No guard is posted here,
 *    so nobody in this sector is kept safe."*, and
 *    `describeStaffCoverage` (`src/ui/hud/staff-panel.ts:305`) attaches it to
 *    the `unguarded` rung **only** -- `required > 0 && assigned <= 0`.
 *    `paintCoverage` empties the node as well as hiding it, on the stated
 *    grounds that *"'no guard is posted here' is exactly the sentence that must
 *    not be readable in a prison that has guards posted."* This plays all three
 *    rungs and reads the node's `hidden` flag and its `textContent` separately,
 *    because emptied-and-hidden is the claim.
 *
 * And a fourth, which the owner is owed a measurement of rather than an
 * opinion: **what a player actually sees when a hire is refused.**
 * `paintHire` marks the button `aria-disabled` and deliberately does not
 * change what it says -- *"This is the mechanical half only. What the button
 * says is untouched ... Naming what stops a press and what would lift it is
 * new player-facing copy, which `AGENTS.md`'s fourth exclusion reserves to the
 * owner"* -- so the only sentence in the game for that state is the refusal
 * band's `hud.refusal.hire-staff-past-floor`. This file spends a prison down
 * to the rung, presses Hire, and records the band, the button's attributes and
 * its label verbatim.
 *
 * **It authors no player-visible sentence and changes no production code.**
 * Where a surface is found to need copy, the reading is reported and the
 * sentence is left owed to the owner.
 *
 * ## The traps this file was written around, all of them already paid for
 *
 * - **`calibrate` returns the real world origin, `(-304, -574)` on this
 *   build**, so tile (12,12) is off-screen. Nothing here touches the world
 *   canvas at all: every act is panel presses and chip reads, so no
 *   calibration is needed and none is done.
 * - **A browser press lands 36-55 ticks late** (`DEFAULT_LEAD_TICKS = 20`,
 *   `src/ui/simulation-commands.ts:77`, plus elapsed wall time projected in
 *   `projectFromClock`, `:188`). So nothing here reads a value, presses, and
 *   expects the read to hold: every press is followed by a *poll* for the
 *   state to arrive, and the poll's duration is itself reported.
 * - **Pausing does not freeze outstanding debits.** Pause *then* read, never
 *   read then pause. Both money acts below pause first and take their
 *   baseline afterwards.
 * - **The FUNDS chip IS addressable** as `[data-metric="funds"] .ui-stat__value`
 *   -- set at `src/ui/hud/status-strip.ts:145` via
 *   `chip.element.dataset['metric']`, which is why `grep -rn 'data-metric'
 *   src/` finds nothing. It is used here directly, and a label lookup is kept
 *   beside it as a cross-check.
 * - **The coverage block is only refreshed while the Security tab is
 *   active**: `refreshStaffCoverage` (`src/main.ts:1581`) returns early unless
 *   `activeTab === 'security'`, and it rides the clock heartbeat
 *   (`src/main.ts:1893`). So every coverage reading here is taken with that
 *   tab open, and the poll allows for the heartbeat.
 *
 * ## It is not a gate
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so
 * nothing in CI collects `.playtest.ts`. Run it with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5251 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playtest.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-who-is-on-post.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or ten atlases fail to decode and
 * the run goes green with no actors on screen.
 */

const note = (line: string): void => {
  console.log(line);
};

/** The FUNDS chip, by the attribute the strip really sets. */
async function funds(page: Page): Promise<number> {
  const text = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-metric="funds"] .ui-stat__value');
    return node === null ? '' : node.innerText;
  });
  const digits = text.replace(/[^\d-]/g, '');
  return digits === '' ? Number.NaN : Number.parseInt(digits, 10);
}

/** The same figure found the way a player finds it, by the label beside it. */
async function fundsByLabel(page: Page): Promise<number> {
  const text = await page.evaluate(() => {
    for (const chip of Array.from(document.querySelectorAll('.ui-stat'))) {
      const label = chip.querySelector('.ui-stat__label');
      if (label instanceof HTMLElement && label.innerText.trim().toUpperCase() === 'FUNDS') {
        const value = chip.querySelector('.ui-stat__value');
        if (value instanceof HTMLElement) return value.innerText;
      }
    }
    return '';
  });
  const digits = text.replace(/[^\d-]/g, '');
  return digits === '' ? Number.NaN : Number.parseInt(digits, 10);
}

interface Chip {
  readonly value: string;
  readonly badge: string;
  readonly tone: string;
}

async function chip(page: Page, metric: string): Promise<Chip> {
  return page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`[data-metric="${id}"]`);
    if (node === null) return { value: 'ABSENT', badge: 'ABSENT', tone: 'ABSENT' };
    const value = node.querySelector<HTMLElement>('.ui-stat__value');
    const badge = node.querySelector<HTMLElement>('.ui-badge');
    return {
      value: value === null ? '' : value.innerText.trim(),
      badge: badge === null ? '' : badge.innerText.trim(),
      tone: badge === null ? '' : (badge.getAttribute('data-tone') ?? ''),
    };
  }, metric);
}

/**
 * The raw last `simulation/status-counts` payload, whole.
 *
 * The harness's `countsSeries` projects a fixed subset and drops the coverage
 * census, which is exactly what act 3 needs. The tick comes from the envelope
 * beside `counts` and never from inside it -- the worker skips a publication
 * whose payload equals the previous one, so an unchanging prison publishes
 * once and the tick inside a stale sample would be a lie.
 */
async function rawCounts(page: Page): Promise<Record<string, number | string | undefined> | undefined> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number; counts?: Record<string, number> } };
      if (message.kind === 'simulation/status-counts') {
        return { tick: message.payload?.tick, ...(message.payload?.counts ?? {}) };
      }
    }
    return undefined;
  });
}

interface CoverageReading {
  /** `data-tone` on the block: which of three rungs the panel decided, without matching prose. */
  readonly tone: string;
  readonly blockHidden: boolean;
  readonly summary: string;
  readonly badge: string;
  readonly hint: string;
  /** The third line: hidden flag and text read separately, because "emptied as well as hidden" is the claim. */
  readonly consequenceHidden: boolean;
  readonly consequenceText: string;
  /** Whether the sentence is in the block's rendered `innerText` at all -- what a player and a text-matching probe see. */
  readonly sentenceVisible: boolean;
}

const SENTENCE = 'No guard is posted here, so nobody in this sector is kept safe.';

async function coverage(page: Page): Promise<CoverageReading> {
  return page.evaluate((sentence) => {
    const block = document.querySelector<HTMLElement>('.hud-staff__coverage');
    if (block === null) {
      return {
        tone: 'ABSENT',
        blockHidden: true,
        summary: 'ABSENT',
        badge: 'ABSENT',
        hint: 'ABSENT',
        consequenceHidden: true,
        consequenceText: 'ABSENT',
        sentenceVisible: false,
      };
    }
    const consequence = block.querySelector<HTMLElement>('.hud-staff__coverage-consequence');
    // The hint is the note that is *not* the consequence line.
    const notes = Array.from(block.querySelectorAll<HTMLElement>('.hud-staff__note')).filter(
      (node) => !node.classList.contains('hud-staff__coverage-consequence'),
    );
    return {
      tone: block.dataset['tone'] ?? '',
      blockHidden: block.hidden === true || block.getClientRects().length === 0,
      summary: block.querySelector<HTMLElement>('.hud-staff__coverage-summary')?.innerText.trim() ?? '',
      badge: block.querySelector<HTMLElement>('.ui-badge')?.innerText.trim() ?? '',
      hint: notes.map((node) => node.innerText.trim()).join(' | '),
      consequenceHidden:
        consequence === null ? true : consequence.hidden === true || consequence.getClientRects().length === 0,
      consequenceText: consequence === null ? 'ABSENT' : (consequence.textContent ?? ''),
      sentenceVisible: (block.innerText ?? '').includes(sentence),
    };
  }, SENTENCE);
}

interface HireControl {
  readonly label: string;
  readonly disabled: string | null;
  readonly ariaDisabled: string | null;
  readonly note: string;
}

async function hireControl(page: Page): Promise<HireControl> {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.hud-staff__hire');
    const note = document.querySelector<HTMLElement>('.hud-staff__hire-note');
    return {
      label: button === null ? 'ABSENT' : button.innerText.replace(/\s+/g, ' ').trim(),
      disabled: button === null ? null : button.getAttribute('disabled'),
      ariaDisabled: button === null ? null : button.getAttribute('aria-disabled'),
      note: note === null ? 'ABSENT' : note.hidden ? 'HIDDEN' : note.innerText.trim(),
    };
  });
}

async function refusalBand(page: Page): Promise<{ hidden: boolean; text: string; source: string | null }> {
  return page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('.hud__refusal');
    if (band === null) return { hidden: true, text: 'ABSENT', source: null };
    return {
      hidden: band.hidden === true || band.getClientRects().length === 0,
      text: (band.innerText ?? '').replace(/\s+/g, ' ').trim(),
      source: band.getAttribute('data-source'),
    };
  });
}

/** Every roster row the payroll fold is showing, by the id it names. */
async function rosterRows(page: Page): Promise<readonly { staff: string; text: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-staff__roster .hud-staff__held-row[data-staff]'))
      .filter((node) => !node.hidden)
      .map((node) => ({
        staff: node.getAttribute('data-staff') ?? '',
        text: (node.innerText ?? '').replace(/\s+/g, ' ').trim(),
      })),
  );
}

async function openRosterFold(page: Page): Promise<void> {
  const section = page.locator('.hud-staff__roster');
  if ((await section.count()) === 0) return;
  if (await section.isHidden()) return;
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await section.locator('> .ui-section__header').click();
  }
}

/**
 * Presses Pause, then waits long enough for anything already in flight to
 * land, then answers the tick it settled on.
 *
 * Pause *then* read: a debit written ahead of the press keeps arriving after
 * the button changes, and a baseline taken before the pause is a projection of
 * a state the clock has not reached.
 */
async function pauseAndSettle(page: Page): Promise<number> {
  await page.locator('.hud-strip__transport button').first().click();
  await page.waitForTimeout(2500);
  return currentTick(page);
}

/** Polls `read` until `done`, answering how long it took and the last reading. */
async function pollUntil<T>(
  page: Page,
  read: () => Promise<T>,
  done: (value: T) => boolean,
  budgetMs: number,
): Promise<{ ms: number; polls: number; value: T; satisfied: boolean }> {
  const startedAt = Date.now();
  let polls = 0;
  let value = await read();
  polls += 1;
  while (!done(value) && Date.now() - startedAt < budgetMs) {
    await page.waitForTimeout(100);
    value = await read();
    polls += 1;
  }
  return { ms: Date.now() - startedAt, polls, value, satisfied: done(value) };
}

test.describe('who is on post', () => {
  test('hiring, firing, and the sentence an empty post is supposed to say', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'manage').click();
    await page.waitForTimeout(1200);

    // ---- ACT 1: a fresh prison, with nobody in it -------------------------
    note('=== ACT 1: a fresh prison, Security tab, nobody admitted ===');
    note(`funds chip by [data-metric]: ${String(await funds(page))}; by label: ${String(await fundsByLabel(page))}`);
    note(`counts: ${JSON.stringify(await rawCounts(page))}`);
    note(`coverage block: ${JSON.stringify(await coverage(page))}`);
    note(`COVERAGE chip: ${JSON.stringify(await chip(page, 'coverage'))}`);
    note(`STAFF chip: ${JSON.stringify(await chip(page, 'staff'))}`);
    note(`hire control: ${JSON.stringify(await hireControl(page))}`);
    note(`whole staff panel:\n${await panelText(page, '.hud-staff')}`);

    const emptyPrison = await coverage(page);
    note(
      emptyPrison.sentenceVisible
        ? 'FINDING: the unguarded sentence is on screen in a prison with NOBODY in it.'
        : 'An empty prison does not say the unguarded sentence. Expected: `required` is 0, so the rung is `covered`.',
    );

    // ---- ACT 2: what a hire charges --------------------------------------
    note('=== ACT 2: hire one guard, paused, and compare the charge to the advertised figure ===');
    const pausedAt = await pauseAndSettle(page);
    note(`paused at tick ${String(pausedAt)}`);
    const beforeCounts = await rawCounts(page);
    const beforeFunds = await funds(page);
    const advertised = await hireControl(page);
    note(`before: FUNDS chip ${String(beforeFunds)}; counts.treasuryMinorUnits ${String(beforeCounts?.['treasuryMinorUnits'])}`);
    note(`the button says ${JSON.stringify(advertised.label)}; the note under it says ${JSON.stringify(advertised.note)}`);
    const advertisedCharge = Number.parseInt((/·\s*([\d, ]+)/.exec(advertised.label)?.[1] ?? '').replace(/[^\d]/g, ''), 10);
    note(`parsed advertised charge: ${String(advertisedCharge)}`);
    note(
      beforeFunds === beforeCounts?.['treasuryMinorUnits']
        ? 'The FUNDS chip and counts.treasuryMinorUnits agree before the press.'
        : `MISMATCH before the press: chip ${String(beforeFunds)} vs counts ${String(beforeCounts?.['treasuryMinorUnits'])}.`,
    );

    const commandsBeforeHire = (await sentCommands(page)).length;
    await page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]').first().click();
    await page.locator('.hud-staff__hire').click();
    const hired = await pollUntil(
      page,
      async () => await rawCounts(page),
      (counts) => Number(counts?.['staff'] ?? 0) === 1,
      20_000,
    );
    note(`the press sent: ${JSON.stringify((await sentCommands(page)).slice(commandsBeforeHire))}`);
    note(`staff reached 1 after ${String(hired.ms)}ms / ${String(hired.polls)} polls (satisfied: ${String(hired.satisfied)})`);
    await page.waitForTimeout(1500);
    const afterHire = await rawCounts(page);
    const afterHireFunds = await funds(page);
    note(`after the hire: FUNDS chip ${String(afterHireFunds)}; counts ${JSON.stringify(afterHire)}`);
    const chargedByCounts = Number(beforeCounts?.['treasuryMinorUnits'] ?? 0) - Number(afterHire?.['treasuryMinorUnits'] ?? 0);
    note(
      `CHARGED: counts moved by ${String(chargedByCounts)}; chip moved by ${String(beforeFunds - afterHireFunds)};`
        + ` the button advertised ${String(advertisedCharge)}`,
    );
    note(
      chargedByCounts === advertisedCharge
        ? 'THE HIRE CHARGED WHAT THE BUTTON SAID.'
        : 'MISMATCH: the button advertised one figure and the treasury moved by another.',
    );
    note(`daily wage bill now: ${String(afterHire?.['dailyWageBillMinorUnits'])}`);
    note(`coverage after the hire: ${JSON.stringify(await coverage(page))}`);
    note(`staff panel after the hire:\n${await panelText(page, '.hud-staff')}`);

    // ---- ACT 3: prisoners, and the sentence -------------------------------
    note('=== ACT 3: admit prisoners so the prison asks for a guard, then take the guard away ===');
    // Unpause: the sector requirement is occupancy-scaled and the census is a
    // ten-tick walk, so a paused prison never recomputes either.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await tab(page, 'overview').click();
    for (let index = 0; index < 3; index += 1) {
      await page.locator('.hud-intake__admit').click();
      await page.waitForTimeout(250);
    }
    /*
     * **This is where the first run of this file found something, and it is
     * kept exactly as it was rather than repaired into a working step.**
     * `IntakeSystem` refuses an admission into a prison with no accommodation,
     * so a prison that has not been built cannot be populated -- the band and
     * the console line below are the reading. The rung this act was written to
     * reach is reached instead by the third test, which builds a cell first.
     */
    note(`refusal band after three Admit presses: ${JSON.stringify(await refusalBand(page))}`);
    await tab(page, 'manage').click();
    const withPrisoners = await pollUntil(
      page,
      async () => await rawCounts(page),
      (counts) => Number(counts?.['prisoners'] ?? 0) >= 3,
      20_000,
    );
    note(`prisoners after ${String(withPrisoners.ms)}ms: ${JSON.stringify(withPrisoners.value)}`);
    note(
      withPrisoners.satisfied
        ? 'three prisoners are in.'
        : 'FINDING: nobody was admitted. A prison with no cell cannot hold anybody, so this route'
          + ' cannot reach the unguarded rung at all -- see the third test.',
    );

    // With one guard hired and prisoners in the sector, this is the `covered`
    // or `understaffed` rung -- either way the sentence must not be readable.
    const guardedPoll = await pollUntil(
      page,
      async () => await coverage(page),
      (reading) => reading.summary !== '' && reading.summary !== '0 of 0',
      20_000,
    );
    note(`coverage with 3 prisoners and 1 guard after ${String(guardedPoll.ms)}ms: ${JSON.stringify(guardedPoll.value)}`);
    note(`COVERAGE chip: ${JSON.stringify(await chip(page, 'coverage'))}`);
    note(`counts census: ${JSON.stringify(await rawCounts(page))}`);
    note(
      guardedPoll.value.sentenceVisible
        ? 'FINDING: the unguarded sentence is readable while a guard IS posted.'
        : 'With a guard posted the sentence is not readable, which is what `paintCoverage` claims.',
    );

    // ---- ACT 4: dismissal -------------------------------------------------
    note('=== ACT 4: fire the only guard. ADR 0070 decision 3 says no money moves. ===');
    const firePausedAt = await pauseAndSettle(page);
    note(`paused at tick ${String(firePausedAt)}`);
    await openRosterFold(page);
    await page.waitForTimeout(400);
    const rows = await rosterRows(page);
    note(`payroll fold rows: ${JSON.stringify(rows)}`);
    note(`the fold's own hint: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    if (rows.length === 0) {
      note('NO ROSTER ROW to dismiss, and that is this run’s finding rather than a step to work around.');
      expect(true).toBe(true);
      return;
    }
    const beforeFire = await rawCounts(page);
    const beforeFireFunds = await funds(page);
    note(`before the Dismiss press: FUNDS chip ${String(beforeFireFunds)}; counts ${JSON.stringify(beforeFire)}`);
    const commandsBeforeFire = (await sentCommands(page)).length;
    await page
      .locator(`.hud-staff__roster .hud-staff__held-row[data-staff="${rows[0]!.staff}"]`)
      .getByRole('button', { name: 'Dismiss' })
      .click();
    const fired = await pollUntil(
      page,
      async () => await rawCounts(page),
      (counts) => Number(counts?.['staff'] ?? -1) === 0,
      30_000,
    );
    note(`the press sent: ${JSON.stringify((await sentCommands(page)).slice(commandsBeforeFire))}`);
    note(`staff reached 0 after ${String(fired.ms)}ms / ${String(fired.polls)} polls (satisfied: ${String(fired.satisfied)})`);
    await page.waitForTimeout(2000);
    const afterFire = await rawCounts(page);
    const afterFireFunds = await funds(page);
    const severance = Number(afterFire?.['treasuryMinorUnits'] ?? 0) - Number(beforeFire?.['treasuryMinorUnits'] ?? 0);
    note(`after the Dismiss press: FUNDS chip ${String(afterFireFunds)}; counts ${JSON.stringify(afterFire)}`);
    note(
      `MONEY MOVED BY A DISMISSAL: ${String(severance)} (counts), ${String(afterFireFunds - beforeFireFunds)} (chip).`
        + ' ADR 0070 decision 3: "Neither refund nor severance."',
    );
    note(
      `daily wage bill: ${String(beforeFire?.['dailyWageBillMinorUnits'])} -> ${String(afterFire?.['dailyWageBillMinorUnits'])}`
        + ' -- `hud.security.roster-hint` promises "their wage stops".',
    );
    note(`payroll fold after the dismissal: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    note(`roster rows after: ${JSON.stringify(await rosterRows(page))}`);

    // Now the prison holds prisoners and employs nobody: the `unguarded` rung.
    await page.locator('.hud-strip__transport button').nth(1).click();
    const unguardedPoll = await pollUntil(
      page,
      async () => await coverage(page),
      (reading) => reading.tone === 'danger',
      20_000,
    );
    note(`coverage after firing the only guard, after ${String(unguardedPoll.ms)}ms: ${JSON.stringify(unguardedPoll.value)}`);
    note(`COVERAGE chip: ${JSON.stringify(await chip(page, 'coverage'))}`);
    note(`counts census: ${JSON.stringify(await rawCounts(page))}`);
    note(`the whole staff panel a player now reads:\n${await panelText(page, '.hud-staff')}`);
    note(
      unguardedPoll.value.consequenceText.trim() === SENTENCE
        ? 'THE SENTENCE IS EXACTLY THE OWNER’S WORDING, byte for byte.'
        : `SENTENCE MISMATCH: rendered ${JSON.stringify(unguardedPoll.value.consequenceText)} against the ruling ${JSON.stringify(SENTENCE)}.`,
    );
    note(
      unguardedPoll.value.sentenceVisible
        ? 'And it is laid out, not merely in the DOM.'
        : 'FINDING: the sentence is NOT in the block’s rendered text on the rung it belongs to.',
    );

    // ---- ACT 5: hire again, and watch the sentence go ---------------------
    note('=== ACT 5: hire a replacement and watch the sentence leave ===');
    await page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]').first().click();
    await page.locator('.hud-staff__hire').click();
    const cleared = await pollUntil(
      page,
      async () => await coverage(page),
      (reading) => !reading.sentenceVisible && reading.tone !== 'danger',
      20_000,
    );
    note(`the sentence left after ${String(cleared.ms)}ms / ${String(cleared.polls)} polls: ${JSON.stringify(cleared.value)}`);
    note(`counts now: ${JSON.stringify(await rawCounts(page))}`);
    note(
      cleared.satisfied
        ? 'ONE PRESS CLEARS IT, which is what the block promises two blocks above the button.'
        : 'FINDING: the sentence outlived a successful hire.',
    );

    expect(true).toBe(true);
  });

  test('what a player sees when a hire is refused', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // Pause first, then read: the starting balance is a projection until the
    // clock has caught up with it.
    note('=== spending a prison down to the hiring rung ===');
    const pausedAt = await pauseAndSettle(page);
    note(`paused at tick ${String(pausedAt)}`);
    await tab(page, 'build').click();
    note(`opening balance: chip ${String(await funds(page))}, counts ${JSON.stringify(await rawCounts(page))}`);

    /*
     * 654 bricks at 40 = 26,160, against an opening 25,000 and a *starter*
     * rung of -1,185 (`rungFloorMinorUnits('deliveries', -2,500, true)`; the
     * prison is fresh and unfurnished because `roomCapacity` is 0). That
     * leaves -1,160 with 25 of spendable room, and a guard costs 80 -- so the
     * next Hire press is the first thing the rung refuses, with no other
     * refusal in front of it.
     */
    await buy(page, 'wall-brick', 654);
    const drained = await pollUntil(
      page,
      async () => await rawCounts(page),
      (counts) => Number(counts?.['treasuryMinorUnits'] ?? 1) < 0,
      60_000,
    );
    note(`after buying 654 bricks, after ${String(drained.ms)}ms: ${JSON.stringify(drained.value)}`);
    note(`FUNDS chip: ${String(await funds(page))}; whole strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    note(`the FUNDS chip's badge: ${JSON.stringify(await chip(page, 'funds'))}`);

    await tab(page, 'manage').click();
    await page.waitForTimeout(1200);
    await page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]').first().click();
    await page.waitForTimeout(400);

    const beforePress = await hireControl(page);
    note('--- what the Hire control looks like when the prison cannot afford a hire ---');
    note(`label: ${JSON.stringify(beforePress.label)}`);
    note(`disabled attribute: ${JSON.stringify(beforePress.disabled)}`);
    note(`aria-disabled attribute: ${JSON.stringify(beforePress.ariaDisabled)}`);
    note(`the note under it: ${JSON.stringify(beforePress.note)}`);
    note(`coverage block: ${JSON.stringify(await coverage(page))}`);
    note(`refusal band before the press: ${JSON.stringify(await refusalBand(page))}`);
    note(`whole staff panel:\n${await panelText(page, '.hud-staff')}`);
    note(
      beforePress.ariaDisabled === 'true' && beforePress.disabled === null
        ? 'The control is aria-disabled and still pressable, which is what #772’s narrowing intends.'
        : `FINDING: disabled=${JSON.stringify(beforePress.disabled)} aria-disabled=${JSON.stringify(beforePress.ariaDisabled)}.`,
    );

    const commandsBefore = (await sentCommands(page)).length;
    const fundsBefore = await funds(page);
    await page.locator('.hud-staff__hire').click({ force: true });
    const band = await pollUntil(page, async () => await refusalBand(page), (reading) => !reading.hidden, 15_000);
    note(`commands the refused press sent: ${JSON.stringify((await sentCommands(page)).slice(commandsBefore))}`);
    note(`refusal band after ${String(band.ms)}ms: ${JSON.stringify(band.value)}`);
    await page.waitForTimeout(1500);
    note(`FUNDS after the refused press: ${String(await funds(page))} (was ${String(fundsBefore)})`);
    note(`counts after: ${JSON.stringify(await rawCounts(page))}`);
    note(`hire control after: ${JSON.stringify(await hireControl(page))}`);
    note(
      band.satisfied
        ? `WHAT THE PLAYER IS TOLD: ${JSON.stringify(band.value.text)} (data-source ${JSON.stringify(band.value.source)}).`
        : 'FINDING: a refused hire produced NO band at all. The player pressed Hire and the game said nothing.',
    );

    expect(true).toBe(true);
  });
});

/**
 * **The rung PR #857's sentence was written for, reached by building a prison
 * rather than by injecting a view model.**
 *
 * `tests/browser/ui-shell.spec.ts` already gates the sentence at five
 * viewports -- and it gets there through
 * `window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 0,
 * shortage: 2 })`, a hand-written view model pushed straight at the panel. So
 * what is proven today is that the panel renders the sentence when it is
 * *told* `assigned: 0`. What nobody has measured is whether a real session
 * ever tells it that, how long the telling takes, and whether one press of
 * the button the block points at takes it away.
 *
 * The route is the whole difference: `SafetyCoverageSystem` (order 275,
 * `intervalTicks` 10) walks after `DeploymentSystem` (270),
 * `DeploymentSystem.getCoverageReport` is what `projectStaff` sums, the sum
 * crosses on a `hud/staff` **pull** that `refreshStaffCoverage`
 * (`src/main.ts:1581`) issues only while the Security tab is open and only on
 * the clock heartbeat -- and `resolveOccupancyScaledGuardCount` answers `0`
 * for a sector holding nobody, so the rung does not exist until somebody is
 * admitted. Five things in series, none of them exercised by a pushed view
 * model.
 */
test.describe('the unguarded rung, reached by playing', () => {
  test('a prison with prisoners and no guard says the sentence, and one hire takes it away', async ({ page }) => {
    await installTee(page);
    await openApp(page);

    // A cell, four beds, four prisoners and **no guards**: the first run of
    // this file measured that a prison with no accommodation refuses every
    // admission, so the population has to be housed before the requirement
    // this act is about can exist at all.
    await buildAndPopulate(page, { beds: 4, admits: 4, guards: 0, label: 'unguarded' });

    await tab(page, 'manage').click();
    note('=== a built, populated, unstaffed prison ===');
    note(`counts: ${JSON.stringify(await rawCounts(page))}`);

    const appeared = await pollUntil(
      page,
      async () => await coverage(page),
      (reading) => reading.tone === 'danger',
      120_000,
    );
    note(`the block reached the danger rung after ${String(appeared.ms)}ms / ${String(appeared.polls)} polls: ${JSON.stringify(appeared.value)}`);
    note(`COVERAGE chip: ${JSON.stringify(await chip(page, 'coverage'))}`);
    note(`census: ${JSON.stringify(await rawCounts(page))}`);
    note(`the whole staff panel a player reads:\n${await panelText(page, '.hud-staff')}`);

    if (!appeared.satisfied) {
      note('FINDING: a populated prison with nobody hired never reached the unguarded rung in 120s.');
      expect(true).toBe(true);
      return;
    }

    note(
      appeared.value.consequenceText.trim() === SENTENCE
        ? `THE SENTENCE IS THE OWNER'S WORDING, byte for byte: ${JSON.stringify(appeared.value.consequenceText)}`
        : `SENTENCE MISMATCH: rendered ${JSON.stringify(appeared.value.consequenceText)} against ${JSON.stringify(SENTENCE)}.`,
    );
    note(
      appeared.value.sentenceVisible
        ? 'And it is in the block’s rendered text, so it is laid out rather than merely present.'
        : 'FINDING: the sentence is in the DOM and NOT in the block’s rendered text.',
    );
    note(`the hint beside it: ${JSON.stringify(appeared.value.hint)}`);
    note(`the summary: ${JSON.stringify(appeared.value.summary)}; badge ${JSON.stringify(appeared.value.badge)}`);

    // ---- one press, and does it go? ---------------------------------------
    note('=== one hire, which is what the block tells the player to do ===');
    const fundsBefore = await funds(page);
    const tickBefore = await currentTick(page);
    await page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]').first().click();
    await page.locator('.hud-staff__hire').click();

    /*
     * Two separate things to time, and conflating them is how a reading here
     * would be wrong: the guard is hired at once (`staff` goes to 1) and is
     * *posted* only on `DeploymentSystem`'s next pass, so `assigned` -- and
     * therefore the rung -- moves later. The window between them is a prison
     * paying a guard and being told nobody is kept safe, which is honest, and
     * being told to *hire one more*, which is not what it needs.
     */
    const hired = await pollUntil(page, async () => await rawCounts(page), (counts) => Number(counts?.['staff'] ?? 0) >= 1, 30_000);
    note(`staff reached 1 after ${String(hired.ms)}ms`);
    const midway = await coverage(page);
    note(`the block immediately after the hire landed: ${JSON.stringify(midway)}`);

    const left = await pollUntil(
      page,
      async () => await coverage(page),
      (reading) => !reading.sentenceVisible,
      120_000,
    );
    note(`the sentence left after ${String(left.ms)}ms / ${String(left.polls)} polls: ${JSON.stringify(left.value)}`);
    note(`ticks across that window: ${String((await currentTick(page)) - tickBefore)}`);
    note(`FUNDS ${String(fundsBefore)} -> ${String(await funds(page))}`);
    note(`census: ${JSON.stringify(await rawCounts(page))}`);
    note(`COVERAGE chip: ${JSON.stringify(await chip(page, 'coverage'))}`);
    note(
      left.satisfied
        ? 'ONE PRESS CLEARED IT, which is what the block promises.'
        : 'FINDING: the sentence outlived a successful hire by more than 120s.',
    );

    // ---- and does it come back? -------------------------------------------
    note('=== dismiss the only guard again: does the sentence return? ===');
    await openRosterFold(page);
    await page.waitForTimeout(400);
    const rows = await rosterRows(page);
    note(`payroll rows: ${JSON.stringify(rows)}`);
    if (rows.length === 0) {
      note('FINDING: no roster row to dismiss, so the return trip cannot be played.');
      expect(true).toBe(true);
      return;
    }
    const beforeFire = await rawCounts(page);
    const beforeFireFunds = await funds(page);
    await page
      .locator(`.hud-staff__roster .hud-staff__held-row[data-staff="${rows[0]!.staff}"]`)
      .getByRole('button', { name: 'Dismiss' })
      .click();
    const returned = await pollUntil(
      page,
      async () => await coverage(page),
      (reading) => reading.sentenceVisible,
      120_000,
    );
    note(`the sentence returned after ${String(returned.ms)}ms / ${String(returned.polls)} polls: ${JSON.stringify(returned.value)}`);
    const afterFire = await rawCounts(page);
    note(`FUNDS ${String(beforeFireFunds)} -> ${String(await funds(page))}`);
    /*
     * **This figure is not a severance measurement, and saying so is the
     * point of the comment.** The clock has to keep running for the census
     * walk to re-rate the sector and for the sentence to come back at all --
     * `SafetyCoverageSystem` is `intervalTicks: 10` and a paused kernel never
     * steps it -- so this window also carries state income and a payroll
     * boundary at x4. The controlled reading is the paused one in the second
     * act of the first test, which measured exactly `0`. What this line is
     * for is the *wage bill*, which is a level and not a flow: it goes to 0
     * and stays there, which is what `hud.security.roster-hint` promises.
     */
    note(
      `treasury across the Dismiss press: ${String(Number(afterFire?.['treasuryMinorUnits'] ?? 0) - Number(beforeFire?.['treasuryMinorUnits'] ?? 0))}`
        + ' -- NOT a severance reading: the clock is running at x4 here because the census needs ticks.'
        + ' See act 2 of the first test for the paused measurement.',
    );
    note(`wage bill: ${String(beforeFire?.['dailyWageBillMinorUnits'])} -> ${String(afterFire?.['dailyWageBillMinorUnits'])}`);
    note(`census: ${JSON.stringify(afterFire)}`);
    note(`the whole staff panel:\n${await panelText(page, '.hud-staff')}`);
    note(
      returned.satisfied
        ? 'IT COMES BACK, so the sentence tracks the rung in both directions.'
        : 'FINDING: firing the last guard did not bring the sentence back within 120s.',
    );

    expect(true).toBe(true);
  });
});
