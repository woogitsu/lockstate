import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
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
  sentCommands,
  tab,
  TILE,
  waitForQueueEmpty,
  type CountsSample,
} from './playtest-harness';

/**
 * **Is there always a way back?** The owner ruled on 2026-09-04 that
 * *"Zawsze musi istnieć droga powrotu"* — there must always be a way back —
 * and `docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md` (Proposed,
 * not self-approved) defines that as a reachability guarantee on the income
 * line. This file asks the question the ADR does not: **when a player wants to
 * take back the thing they just did, can they?**
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file. It
 * asserts almost nothing; its output is the deliverable. Run one act at a
 * time — `--grep` is a regex, which is why no act title carries parentheses:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=43201 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-is-there-a-way-back.playtest.ts \
 *   --grep "act 1"
 * ```
 *
 * In a worktree, `git lfs checkout` first or every atlas fails to decode and
 * the run passes anyway with no actors drawn. In a container with no LFS
 * content provisioned the `Atlas image … did not load` warnings are the
 * expected baseline.
 *
 * ## What each act is for
 *
 * - **act 1** — the only key the game binds to "take that back", `KeyZ`,
 *   pressed on a wall run that has *finished*. The previous cancellation
 *   record closes with *"`completed` was not measured — it has no queue row,
 *   and reaching `cancelOrder` for it means `Undo`, a different press"*
 *   (`docs/research/2026-09-03-what-cancel-actually-gives-back.md` §5). This
 *   is that press.
 * - **act 2** — what `KeyZ` reaches when the last thing the player did was
 *   *not* a build. Undo is bound to construction transactions and to nothing
 *   else; a hire is the cheapest panel action to prove it against.
 * - **act 3** — whether `Escape` returns the player to a neutral state or
 *   leaves a tool armed and the next press meaning something they did not
 *   ask for.
 * - **act 4** — the refuting sample for the money half: buy materials, and
 *   look for any control anywhere on the page that turns them back into
 *   money. ADR 0096 §4 claims there is none. This is the sweep that would
 *   have found one.
 * - **act 5** — the within-run control for act 1, and the reason no `src/`
 *   mutation is needed to establish its cause. Both presses reach the same
 *   method, `ConstructionSystem.cancelOrder`; the only thing that differs is
 *   the order's state when it is pressed. Arm A cancels a queued order from
 *   its own row with the clock paused; arm B undoes a finished one. If the
 *   money comes back in A and not in B, the state is the cause, measured
 *   rather than argued.
 * - **act 6** — whether the `Remove` control can take a finished wall down.
 *   `src/simulation/presentation/construction-projection.ts:85` says it can —
 *   *"taking a finished wall down is the Remove gesture's job (ADR 0028 phase
 *   3)"* — and that sentence is the reason a standing wall gets no queue row.
 *   If it is false, `KeyZ` is the only route and a finished wall is permanent
 *   on any device without a keyboard.
 *
 * Findings: `docs/research/2026-09-04-is-there-a-way-back.md`.
 */

const note = (line: string): void => {
  console.log(line);
};

/**
 * The 2x3 cell used by acts 1 and 2, at tiles (12,12)–(13,14).
 *
 * `room.cell`'s authored minimum is 2x3 (`src/content/room-catalog.ts`), whose
 * perimeter is ten tile edges — the smallest enclosure this game will accept
 * as a room, and therefore the cheapest thing whose *loss* is visible on the
 * Rooms panel's own enclosure verdict. Four drags, one per side, so each side
 * is one undo transaction and a single `KeyZ` takes back exactly one run.
 */
const CELL = { west: 12, east: 13, north: 12, south: 14 } as const;

/** Everything about a press's aftermath that a player could see, plus the worker's own figures. */
interface Screen {
  readonly tick: number;
  readonly day: string;
  readonly funds: string;
  readonly metrics: Record<string, string>;
  readonly event: string;
  readonly eventSeverity: string;
  readonly refusal: string;
  readonly alerts: string;
  readonly counts: CountsSample | undefined;
}

async function readScreen(page: Page): Promise<Screen> {
  const dom = await page.evaluate(() => {
    const flat = (node: Element | null): string =>
      node === null ? 'ABSENT' : ((node as HTMLElement).innerText ?? '').replace(/\s*\n\s*/g, ' · ').trim();
    const metrics: Record<string, string> = {};
    for (const chip of Array.from(document.querySelectorAll('[data-metric]'))) {
      metrics[chip.getAttribute('data-metric') ?? '?'] = flat(chip);
    }
    const band = document.querySelector('.hud__event');
    return {
      day: flat(document.querySelector('.hud-clock__day')),
      metrics,
      event: flat(band),
      eventSeverity: band?.getAttribute('data-severity') ?? 'NONE',
      refusal: flat(document.querySelector('.hud__refusal')),
      alerts: flat(document.querySelector('.hud-alerts__list')),
    };
  });
  return {
    tick: await currentTick(page),
    counts: await latestCounts(page),
    funds: dom.metrics['funds'] ?? 'ABSENT',
    ...dom,
  };
}

function logScreen(label: string, tag: string, screen: Screen): void {
  note(
    `[${label}] ${tag} tick=${screen.tick} day=${screen.day} funds=${JSON.stringify(screen.funds)}` +
      ` treasury=${screen.counts?.treasuryMinorUnits} rooms=${screen.counts?.rooms}` +
      ` capacity=${screen.counts?.accommodationCapacity} staff=${screen.counts?.staff}`,
  );
  note(`[${label}] ${tag}   band[${screen.eventSeverity}]: ${JSON.stringify(screen.event)}`);
  note(`[${label}] ${tag}   refusal: ${JSON.stringify(screen.refusal)}`);
  note(`[${label}] ${tag}   alerts: ${JSON.stringify(screen.alerts)}`);
  note(`[${label}] ${tag}   counts: ${JSON.stringify(screen.counts)}`);
}

/**
 * Proves a point is on the canvas and not under a HUD island, before anything
 * concludes that a press there did nothing.
 *
 * A press on a HUD-covered point submits no command, raises no refusal and
 * paints no band — it reads exactly like the game ignoring the player, and it
 * has produced withdrawn findings in this repository before. `elementFromPoint`
 * is the cheap proof, and it is taken for every point an act presses.
 */
async function whatIsAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ({ px, py }) => {
      const node = document.elementFromPoint(px, py);
      if (node === null) return 'NOTHING';
      const classes = node.className === '' ? '' : `.${String(node.className).split(/\s+/).join('.')}`;
      return `${node.tagName.toLowerCase()}${node.id === '' ? '' : `#${node.id}`}${classes}`;
    },
    { px: x, py: y },
  );
}

/** The four one-drag wall runs that enclose `CELL`, in the order they are laid. */
function ringRuns(origin: { originX: number; originY: number }): readonly {
  readonly name: string;
  readonly a: { x: number; y: number };
  readonly b: { x: number; y: number };
}[] {
  const westX = origin.originX + CELL.west * TILE;
  const eastX = origin.originX + (CELL.east + 1) * TILE;
  const northY = origin.originY + CELL.north * TILE;
  const southY = origin.originY + (CELL.south + 1) * TILE;
  return [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ];
}

/**
 * Reads the Rooms panel's enclosure verdict for a rectangle, the way a player
 * does: arm the designation tool, drag the rectangle, and read the lines that
 * mention enclosure before pressing anything.
 *
 * The drag is taken twice, because a tile centre is a mid-line and the first
 * drag of a pair has been observed to be swallowed.
 *
 * **A pending rectangle is discarded first, and that is a measured
 * requirement rather than tidiness.** While `pending` is set the panel swaps
 * its arm row for `Designate 2 x 3` / `Discard`, so `.hud-rooms__arm` is not
 * laid out — and Playwright's default action timeout in this config is
 * unlimited, so a click on it waits for ever and the whole act stalls with no
 * error. It cost one run of act 1 its last two readings. Every click here
 * therefore carries an explicit timeout as well, so a hang becomes a message.
 */
async function enclosureVerdict(page: Page, origin: { originX: number; originY: number }): Promise<string> {
  const CLICK = { timeout: 15_000 } as const;
  try {
    await tab(page, 'rooms').click(CLICK);
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click(CLICK);
    const discard = page.locator('.hud-rooms__cancel');
    if (await discard.isVisible()) await discard.click(CLICK);
    // `.hud-rooms` is a scroll container and the Discard above can leave the
    // room list scrolled out of it, at which point the row is in the DOM,
    // `aria-checked="true"` and not visible — measured, and it killed a run of
    // act 1 after every reading it was there to take had already been logged.
    // The row is already selected in that state, so the click is skipped
    // rather than forced.
    const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
    await roomRow.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    if (await roomRow.isVisible()) await roomRow.click(CLICK);
    const arm = page.locator('.hud-rooms__arm');
    if (await arm.isVisible()) await arm.click(CLICK);
    const a = centreOf(origin, CELL.west, CELL.north);
    const b = centreOf(origin, CELL.east, CELL.south);
    await drag(page, a, b);
    await drag(page, a, b);
    const text = await panelText(page, '.hud-rooms');
    return text
      .split('\n')
      .filter((line) => /OPEN|ENCLOS|not enclosed|room/i.test(line))
      .join(' · ');
  } catch (error) {
    // A diagnostic read must never end an act that has already produced its
    // readings: the verdict is one line of evidence, not the measurement.
    return `VERDICT UNREADABLE: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
}

/**
 * Presses one of the two history keys on the world and reports what the whole
 * screen said afterwards.
 *
 * The keys are `KeyZ` and `KeyY` (`src/input/bindings.ts:64-65`), listened for
 * on `window` by the world scene, so no canvas focus is needed — but a focused
 * `<input>` swallows them (`src/input/focus.ts`), so the act blurs first and
 * says what had focus.
 */
async function history(page: Page, label: string, key: 'z' | 'y'): Promise<Screen> {
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return active === null ? 'NONE' : `${active.tagName.toLowerCase()}.${String(active.className)}`;
  });
  const before = (await sentCommands(page)).length;
  await page.keyboard.press(key === 'z' ? 'z' : 'y');
  await page.waitForTimeout(1200);
  const produced = (await sentCommands(page)).slice(before);
  note(`[${label}] pressed ${key.toUpperCase()} with focus on ${focused}; commands produced: ${JSON.stringify(produced)}`);
  const screen = await readScreen(page);
  logScreen(label, `after ${key.toUpperCase()}`, screen);
  return screen;
}

/**
 * Every pooled queue row's geometry, its Cancel button's accessible name, and
 * what `elementFromPoint` finds at that button's centre.
 *
 * Geometry rather than `locator.click`, for the reason
 * `playtest-860-a-row-cancels-what-it-named.playtest.ts` reads its rows the
 * same way: a row can be in the DOM, `aria-disabled="false"` and carrying its
 * whole sentence while having no box at all, and a click on it then waits for
 * ever in a config that sets no action timeout.
 */
async function queueGeometry(page: Page): Promise<
  readonly {
    readonly index: number;
    readonly hidden: boolean;
    readonly rects: number;
    readonly rowBox: string;
    readonly buttonBox: string;
    readonly buttonLabel: string;
    readonly atCentre: string;
    readonly display: string;
    readonly visibility: string;
  }[]
> {
  return page.evaluate(() => {

      const out: {
        index: number;
        hidden: boolean;
        rects: number;
        rowBox: string;
        buttonBox: string;
        buttonLabel: string;
        atCentre: string;
        display: string;
        visibility: string;
      }[] = [];
      const nodes = Array.from(document.querySelectorAll('.hud-build__queue-row'));
      for (const [index, node] of nodes.entries()) {
        if (!(node instanceof HTMLElement)) continue;
        const button = node.querySelector('button');
        const rowBox = node.getBoundingClientRect();
        const buttonBox = button instanceof HTMLElement ? button.getBoundingClientRect() : undefined;
        const centre =
          buttonBox === undefined
            ? 'NO BUTTON'
            : (() => {
                const at = document.elementFromPoint(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
                return at === null ? 'NOTHING' : `${at.tagName.toLowerCase()}.${String(at.className)}`;
              })();
        const style = getComputedStyle(node);
        out.push({
          index,
          // `HTMLElement.hidden` is `boolean | 'until-found'` in this lib, so
          // the comparison is what keeps the field a boolean.
          hidden: node.hidden !== false,
          rects: node.getClientRects().length,
          rowBox: `${Math.round(rowBox.x)},${Math.round(rowBox.y)} ${Math.round(rowBox.width)}x${Math.round(rowBox.height)}`,
          buttonBox:
            buttonBox === undefined
              ? 'NO BUTTON'
              : `${Math.round(buttonBox.x)},${Math.round(buttonBox.y)} ${Math.round(buttonBox.width)}x${Math.round(buttonBox.height)}`,
          buttonLabel: button?.getAttribute('aria-label') ?? 'NO LABEL',
          atCentre: centre,
          display: style.display,
          visibility: style.visibility,
        });
      }
    return out;
  });
}

test.describe('is there a way back', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (message) => {
      const text = message.text();
      // The atlas warnings are the expected baseline in a container with no
      // LFS content; everything else from the page is worth seeing.
      if (/Atlas image|could not be decoded|Failed to process file/.test(text)) return;
      if (message.type() === 'error' || message.type() === 'warning') note(`[page:${message.type()}] ${text}`);
    });
    await installTee(page);
  });

  /**
   * **act 1 — the wall that was finished when the player changed their mind.**
   *
   * Build the smallest legal cell with four drags, zone it, then press `KeyZ`
   * once, which is the only gesture this game binds to "take that back". The
   * readings that matter are the treasury before and after, the Rooms panel's
   * own enclosure verdict before and after, and the sentence the band paints.
   */
  test('act 1 undo reaches a finished wall run', async ({ page }) => {
    const label = 'act1';
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    note(`[${label}] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    const runs = ringRuns(origin);
    for (const run of runs) {
      note(`[${label}] run ${run.name}: a=(${run.a.x},${run.a.y}) is ${await whatIsAt(page, run.a.x, run.a.y)}` +
        ` | b=(${run.b.x},${run.b.y}) is ${await whatIsAt(page, run.b.x, run.b.y)}`);
    }

    logScreen(label, 'fresh prison', await readScreen(page));

    // No pre-buy: every order's own just-in-time purchase then shows up in the
    // treasury on its own, which is what makes "what did the undo give back"
    // answerable in money rather than in bricks. There is no stock readout on
    // the page at all, so bricks are not a currency a player can audit.
    await fastForwardToMax(page);
    note(`[${label}] clock: ${JSON.stringify(await currentClock(page))}`);

    await armBuildable(page, 'wall-brick');
    for (const run of runs) {
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      const produced = (await sentCommands(page)).slice(before);
      note(
        `[${label}] drag ${run.name} produced ${produced.length} command(s): ` +
          JSON.stringify(produced.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`)),
      );
    }
    logScreen(label, 'right after four drags', await readScreen(page));
    note(`[${label}] queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    const emptiedAfterMs = await waitForQueueEmpty(page);
    note(`[${label}] the Build panel says the queue is empty after ${emptiedAfterMs}ms`);
    const built = await readScreen(page);
    logScreen(label, 'ring finished', built);

    note(`[${label}] enclosure verdict before zoning: ${JSON.stringify(await enclosureVerdict(page, origin))}`);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);
    const zoned = await readScreen(page);
    logScreen(label, 'zoned', zoned);
    note(`[${label}] rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

    // The press. Nothing has been built since the east run, and zoning is not
    // a construction transaction, so this must reach the east run.
    const afterFirstUndo = await history(page, label, 'z');
    note(`[${label}] enclosure verdict after one Z: ${JSON.stringify(await enclosureVerdict(page, origin))}`);
    note(`[${label}] rooms panel after one Z: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    note(
      `[${label}] MONEY: fresh->built ${built.counts?.treasuryMinorUnits}` +
        ` | built->zoned ${zoned.counts?.treasuryMinorUnits}` +
        ` | after Z ${afterFirstUndo.counts?.treasuryMinorUnits}`,
    );

    // And the way back from the way back.
    const afterRedo = await history(page, label, 'y');
    await page.waitForTimeout(2000);
    note(`[${label}] queue after Y: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    const redoneEmptyMs = await waitForQueueEmpty(page);
    note(`[${label}] queue empty again after ${redoneEmptyMs}ms`);
    const rebuilt = await readScreen(page);
    logScreen(label, 'after redo settled', rebuilt);
    note(`[${label}] enclosure verdict after Y: ${JSON.stringify(await enclosureVerdict(page, origin))}`);
    note(
      `[${label}] ROUND TRIP: built=${built.counts?.treasuryMinorUnits}` +
        ` afterZ=${afterFirstUndo.counts?.treasuryMinorUnits}` +
        ` afterY=${afterRedo.counts?.treasuryMinorUnits}` +
        ` settled=${rebuilt.counts?.treasuryMinorUnits}`,
    );

    // A third and fourth press, to find where the stack stops. Each reading is
    // reported; nothing here asserts what it should be.
    const third = await history(page, label, 'z');
    note(`[${label}] third press: band ${JSON.stringify(third.event)} refusal ${JSON.stringify(third.refusal)}`);
    const fourth = await history(page, label, 'z');
    note(`[${label}] fourth press: band ${JSON.stringify(fourth.event)} refusal ${JSON.stringify(fourth.refusal)}`);
    note(`[${label}] enclosure verdict after four presses: ${JSON.stringify(await enclosureVerdict(page, origin))}`);
    logScreen(label, 'end of act 1', await readScreen(page));
  });

  /**
   * **act 2 — the last thing the player did was not a build.**
   *
   * `edit.undo` is bound in the `world` and `construction` contexts and routes
   * to `ConstructionSystem.undo()`, which pops the newest *construction*
   * transaction. A hire is not one. So the question is not whether `KeyZ`
   * un-hires — it plainly cannot — but what it does instead, and whether the
   * screen tells the player which of their actions it took back.
   */
  test('act 2 what Z reaches after a hire', async ({ page }) => {
    const label = 'act2';
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    note(`[${label}] calibration: (${origin.originX}, ${origin.originY})`);
    await fastForwardToMax(page);

    // One wall run, finished, and then left alone. This is the "work" the act
    // is asking whether a later, unrelated press can destroy.
    const run = ringRuns(origin)[0];
    if (run === undefined) throw new Error('no runs');
    await armBuildable(page, 'wall-brick');
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    note(`[${label}] north run: ${JSON.stringify((await sentCommands(page)).slice(before))}`);
    await waitForQueueEmpty(page);
    const wallUp = await readScreen(page);
    logScreen(label, 'wall up', wallUp);

    // Now a panel action, which is what the player is about to regret.
    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    note(`[${label}] hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(2000);
    const hired = await readScreen(page);
    logScreen(label, 'one guard hired', hired);
    note(`[${label}] staff panel after the hire: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

    // The press a player makes when they want the hire back.
    const afterUndo = await history(page, label, 'z');
    note(
      `[${label}] STAFF across the press: ${hired.counts?.staff} -> ${afterUndo.counts?.staff}` +
        ` | wage bill ${hired.counts?.dailyWageBillMinorUnits} -> ${afterUndo.counts?.dailyWageBillMinorUnits}`,
    );
    note(`[${label}] staff panel after Z: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    await tab(page, 'build').click();
    note(`[${label}] build queue after Z: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // Is the wall still there? Re-armed and re-dragged over the same edges: a
    // duplicate claim is refused, a free edge is accepted, and the refusal band
    // is the player-visible difference between the two.
    await armBuildable(page, 'wall-brick');
    const beforeRedrag = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const redrag = (await sentCommands(page)).slice(beforeRedrag);
    await page.waitForTimeout(1500);
    const afterRedrag = await readScreen(page);
    note(`[${label}] re-drag over the same run produced: ${JSON.stringify(redrag)}`);
    logScreen(label, 'after re-drag', afterRedrag);
    note(`[${label}] queue after re-drag: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // And the actual way back from a hire, if there is one.
    await tab(page, 'security').click();
    const dismissables = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, [role="button"]'))
        .map((node) => ({
          text: ((node as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
          className: String(node.className),
          disabled: node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true',
          laidOut: node.getClientRects().length > 0,
        }))
        .filter((row) => /dismiss|release|fire|sack|let go/i.test(row.text) || /dismiss|release/i.test(row.className)),
    );
    note(`[${label}] controls that could undo a hire: ${JSON.stringify(dismissables)}`);
  });

  /**
   * **act 3 — does Escape put the player back in a neutral state.**
   *
   * `build.cancel` is `Escape`, and the world scene answers it with
   * `cancelAllGestures()`. A gesture is a drag in progress. Whether the *tool*
   * is still armed afterwards is what decides whether the next press on the
   * world means what the player thinks it means.
   */
  test('act 3 escape and the armed tool', async ({ page }) => {
    const label = 'act3';
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    note(`[${label}] calibration: (${origin.originX}, ${origin.originY})`);

    const readArm = async (): Promise<string> => {
      const armed = await page.locator('.hud-build__arm').getAttribute('data-armed');
      const text = (await page.locator('.hud-build__arm').innerText()).trim();
      const removeText = (await page.locator('.hud-build__remove').innerText()).trim();
      return `arm[data-armed=${String(armed)}]=${JSON.stringify(text)} remove=${JSON.stringify(removeText)}`;
    };

    await armBuildable(page, 'wall-brick');
    note(`[${label}] after arming: ${await readArm()}`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    note(`[${label}] after Escape: ${await readArm()}`);
    note(`[${label}] band after Escape: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
    note(`[${label}] refusal after Escape: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

    // The press that tells the truth: on a clear tile, well away from the ring
    // the other acts use, with the point proved clear first.
    const point = centreOf(origin, 20, 16);
    note(`[${label}] the test press at (${point.x},${point.y}) lands on ${await whatIsAt(page, point.x, point.y)}`);
    const beforeCount = (await sentCommands(page)).length;
    await drag(page, { x: point.x - TILE / 2, y: point.y - TILE / 2 }, { x: point.x + TILE / 2, y: point.y - TILE / 2 });
    const produced = (await sentCommands(page)).slice(beforeCount);
    note(`[${label}] a drag AFTER Escape produced: ${JSON.stringify(produced)}`);
    logScreen(label, 'after the post-Escape drag', await readScreen(page));

    // And the control that does disarm, for comparison: the arm button itself.
    await page.locator('.hud-build__arm').click();
    note(`[${label}] after pressing the arm button again: ${await readArm()}`);
    const beforeSecond = (await sentCommands(page)).length;
    await drag(page, { x: point.x - TILE / 2, y: point.y + TILE / 2 }, { x: point.x + TILE / 2, y: point.y + TILE / 2 });
    note(`[${label}] a drag after the arm toggle produced: ${JSON.stringify((await sentCommands(page)).slice(beforeSecond))}`);
  });

  /**
   * **act 5 — one method, two states, one press each.**
   *
   * Act 1 measured that undoing a *finished* wall run returns nothing, and the
   * obvious next question is whether that is about the state or about `Undo`
   * itself. The two arms below answer it without editing a line of `src/`:
   * `CancelBuildOrder` from a queue row and `Undo` from `KeyZ` both end at
   * `ConstructionSystem.cancelOrder`, so if one pays and the other does not,
   * the discriminator is `stateAtCancellation`.
   *
   * **Arm A runs with the clock paused on purpose.**
   * `docs/research/2026-09-03-what-cancel-actually-gives-back.md` §2 measured
   * presses landing 36-55 ticks late against a ten-tick transition, so a
   * running clock makes the state at the press unknowable. Paused, the row's
   * advertised figure and the state it was advertised for are the same
   * instant.
   */
  test('act 5 the same method paid for one state and not the other', async ({ page }) => {
    const label = 'act5';
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    note(`[${label}] calibration: (${origin.originX}, ${origin.originY})`);

    const runs = ringRuns(origin);
    const first = runs[0];
    const second = runs[1];
    if (first === undefined || second === undefined) throw new Error('no runs');

    // ---- arm A: cancel a queued order from its own row, clock paused ----
    const beforeA = await readScreen(page);
    logScreen(label, 'A before', beforeA);
    await armBuildable(page, 'wall-brick');
    await drag(page, first.a, first.b);
    await page.waitForTimeout(1200);
    const queuedA = await readScreen(page);
    logScreen(label, 'A queued', queuedA);
    note(`[${label}] A queue block: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    note(`[${label}] A queue section data-collapsed=${await page.locator('.hud-build__queue').getAttribute('data-collapsed')}`);
    note(
      `[${label}] A the queue header reads ${JSON.stringify(
        (await page.locator('.hud-build__queue > .ui-section__header').innerText()).replace(/\s+/g, ' ').trim(),
      )}` + ` aria-expanded=${await page.locator('.hud-build__queue > .ui-section__header').getAttribute('aria-expanded')}`,
    );
    /*
     * Read the rows the way `playtest-860-a-row-cancels-what-it-named.playtest.ts`
     * does — by geometry — and press by coordinate.
     *
     * **Not `locator.click()`, and that is a measured requirement.** The first
     * run of this act failed with `TimeoutError: locator.click` after 15s on
     * `.hud-build__queue-row:not([hidden]) button`, whose own call log reads
     * `locator resolved to <button … aria-disabled="false" aria-label="Cancel:
     * Brick wall · 12, 12 · North · 80 back">` followed by
     * `element is not visible`. So the control exists, is enabled, carries its
     * whole sentence, and has no box. The rects below are what says which of
     * the pooled rows has one, and `elementFromPoint` is what proves the press
     * landed on the button rather than on a panel over it.
     */
    const geometry = await queueGeometry(page);
    for (const row of geometry) note(`[${label}] A queue row ${row.index}: ${JSON.stringify(row)}`);
    const pressable = geometry.find((row) => !row.hidden && row.rects > 0 && row.buttonBox !== 'NO BUTTON');
    if (pressable === undefined) {
      note(`[${label}] A NO PRESSABLE QUEUE ROW at 1440x900 while the section is collapsed`);
    }
    // Open the disclosure and take the same measurement again, which is what
    // separates "the control does not exist" from "the control is folded away".
    await page.locator('.hud-build__queue > .ui-section__header').click({ timeout: 15_000 });
    await page.waitForTimeout(600);
    note(`[${label}] A after opening the fold: data-collapsed=${await page.locator('.hud-build__queue').getAttribute('data-collapsed')}`);
    const opened = await queueGeometry(page);
    for (const row of opened) note(`[${label}] A opened queue row ${row.index}: ${JSON.stringify(row)}`);
    const pressableNow = opened.find((row) => !row.hidden && row.rects > 0 && row.buttonBox !== 'NO BUTTON');
    if (pressableNow === undefined) {
      note(`[${label}] A STILL NO PRESSABLE QUEUE ROW with the fold open — arm A cannot be taken by pointer at all`);
    } else {
      const [origin2, size] = pressableNow.buttonBox.split(' ');
      const [bx, by] = (origin2 ?? '0,0').split(',').map(Number);
      const [bw, bh] = (size ?? '0x0').split('x').map(Number);
      const cx = Math.round((bx ?? 0) + (bw ?? 0) / 2);
      const cy = Math.round((by ?? 0) + (bh ?? 0) / 2);
      note(`[${label}] A pressing the Cancel of row ${pressableNow.index} at (${cx},${cy}); that point holds ${await whatIsAt(page, cx, cy)}`);
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
    }
    await page.waitForTimeout(1500);
    const cancelledA = await readScreen(page);
    logScreen(label, 'A after Cancel', cancelledA);
    note(
      `[${label}] ARM A: ${beforeA.counts?.treasuryMinorUnits} -> ${queuedA.counts?.treasuryMinorUnits}` +
        ` -> ${cancelledA.counts?.treasuryMinorUnits}`,
    );

    // ---- arm B: undo a finished order with KeyZ ----
    await fastForwardToMax(page);
    await armBuildable(page, 'wall-brick');
    const beforeB = await readScreen(page);
    await drag(page, second.a, second.b);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(1500);
    const builtB = await readScreen(page);
    logScreen(label, 'B finished', builtB);
    note(`[${label}] B queue block: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    const undoneB = await history(page, label, 'z');
    await page.waitForTimeout(2500);
    const settledB = await readScreen(page);
    logScreen(label, 'B settled after Z', settledB);
    note(
      `[${label}] ARM B: ${beforeB.counts?.treasuryMinorUnits} -> ${builtB.counts?.treasuryMinorUnits}` +
        ` -> ${undoneB.counts?.treasuryMinorUnits} -> ${settledB.counts?.treasuryMinorUnits}`,
    );
  });

  /**
   * **act 4 — money into materials, and the sweep that looked for the way
   * out.**
   *
   * ADR 0096 §4 states, read rather than measured, that *"there is no player
   * command that sells stock out of a container, at any ratio"*. This act is
   * the sample that could have refuted it: buy, cancel the delivery while it
   * is still on the road, then buy again and let it land, and sweep every
   * control and every word on the page for a way to turn the goods back into
   * money.
   */
  test('act 4 money into materials is a one-way door', async ({ page }) => {
    const label = 'act4';
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);
    await tab(page, 'build').click();

    const start = await readScreen(page);
    logScreen(label, 'fresh prison', start);

    // Arm A: cancel while the truck is on the road. `PROCUREMENT_DELIVERY_DELAY_TICKS`
    // is 100, so the clock stays paused here and the delivery cannot land.
    await buy(page, 'wall-brick', 10);
    const bought = await readScreen(page);
    logScreen(label, 'bought 10 bricks, clock paused', bought);
    note(`[${label}] deliveries block: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    const rows = page.locator('.hud-build__delivery-row');
    note(`[${label}] delivery rows on screen: ${await rows.count()}`);
    if ((await rows.count()) > 0) {
      const cancel = rows.first().locator('button');
      note(`[${label}] the delivery row's control reads ${JSON.stringify((await cancel.innerText()).trim())}`);
      await cancel.click();
      await page.waitForTimeout(1500);
      const cancelled = await readScreen(page);
      logScreen(label, 'delivery cancelled in flight', cancelled);
      note(
        `[${label}] IN-FLIGHT CANCEL: ${bought.counts?.treasuryMinorUnits} -> ${cancelled.counts?.treasuryMinorUnits}` +
          ` (start was ${start.counts?.treasuryMinorUnits})`,
      );
    }

    // Arm B: let it land, then look for the way out.
    await buy(page, 'wall-brick', 10);
    const boughtAgain = await readScreen(page);
    logScreen(label, 'bought 10 more', boughtAgain);
    await fastForwardToMax(page);
    await page.waitForTimeout(4000);
    await currentTick(page).then((tick) => note(`[${label}] tick after running: ${tick}`));
    note(`[${label}] deliveries block after the truck lands: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    note(`[${label}] delivery rows now: ${await page.locator('.hud-build__delivery-row').count()}`);
    const landed = await readScreen(page);
    logScreen(label, 'bricks in the container', landed);

    // The sweep. Every tab, every control, every text node.
    const words = /sell|sold|refund|return|reclaim|buy ?back|liquidate|scrap|salvage|resell|dispose/i;
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      const found = await page.evaluate(
        ({ pattern }) => {
          const re = new RegExp(pattern, 'i');
          const controls = Array.from(document.querySelectorAll('button, [role="button"], a, input, select'))
            .map((node) => ({
              tag: node.tagName.toLowerCase(),
              text: ((node as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
              aria: node.getAttribute('aria-label') ?? '',
              className: String(node.className),
              laidOut: node.getClientRects().length > 0,
            }))
            .filter((row) => re.test(row.text) || re.test(row.aria) || re.test(row.className));
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const texts: string[] = [];
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const value = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
            if (value !== '' && re.test(value)) texts.push(value);
          }
          return { controls, texts, controlCount: document.querySelectorAll('button, [role="button"]').length };
        },
        { pattern: words.source },
      );
      note(`[${label}] tab ${id}: ${found.controlCount} controls on screen; matches ${JSON.stringify(found)}`);
    }

    // And whether the page tells the player how many bricks they now own.
    const stockWords = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts: string[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const value = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
        if (value !== '' && /stock|brick|plank|material/i.test(value)) texts.push(value);
      }
      return texts;
    });
    note(`[${label}] every word on the page about stock or materials: ${JSON.stringify(stockWords)}`);
    note(
      `[${label}] MONEY: start=${start.counts?.treasuryMinorUnits}` +
        ` afterFirstBuy=${bought.counts?.treasuryMinorUnits}` +
        ` afterSecondBuy=${boughtAgain.counts?.treasuryMinorUnits}` +
        ` afterLanding=${landed.counts?.treasuryMinorUnits}`,
    );

    // The one control that does reach a *queued* order's money, for contrast.
    await tab(page, 'build').click();
    await armBuildable(page, 'wall-brick');
    const origin = await calibrate(page);
    const run = ringRuns(origin)[0];
    if (run !== undefined) {
      await armBuildable(page, 'wall-brick');
      await drag(page, run.a, run.b);
      await page.waitForTimeout(800);
      note(`[${label}] queue rows after one drag: ${await page.locator('.hud-build__queue-row[data-order]').count()}`);
      note(`[${label}] queue text: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      logScreen(label, 'one order queued', await readScreen(page));
    }
  });

  /**
   * **act 6 — can the `Remove` control take a finished wall down?**
   *
   * The projection that withholds a queue row from a standing wall justifies
   * itself on the Remove gesture:
   * *"A queue that listed standing walls would be a demolition list wearing a
   * queue's label, and taking a finished wall down is the Remove gesture's job
   * (ADR 0028 phase 3) rather than this one's"*
   * (`src/simulation/presentation/construction-projection.ts:85`). This act
   * arms that gesture and aims it at a wall.
   *
   * Both tiles the edge divides are pressed, twice each, because a tile edge
   * normalises to the lower-numbered tile and a press could reasonably be
   * aimed from either side.
   */
  test('act 6 what the Remove control does to a standing wall', async ({ page }) => {
    const label = 'act6';
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1500);
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    note(`[${label}] calibration: (${origin.originX}, ${origin.originY})`);
    await fastForwardToMax(page);

    const run = ringRuns(origin)[0];
    if (run === undefined) throw new Error('no runs');
    await armBuildable(page, 'wall-brick');
    await drag(page, run.a, run.b);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(1500);
    const built = await readScreen(page);
    logScreen(label, 'wall standing at 12,12 north and 13,12 north', built);

    // Arm the Remove control and aim it at the wall, from both sides.
    await page.locator('.hud-build__remove').click({ timeout: 15_000 });
    note(`[${label}] Remove control reads ${JSON.stringify((await page.locator('.hud-build__remove').innerText()).trim())}`);
    for (const target of [
      { name: 'the tile the edge belongs to, 12,12', tx: 12, ty: 12 },
      { name: 'its neighbour across the edge, 12,11', tx: 12, ty: 11 },
      { name: 'the second walled tile, 13,12', tx: 13, ty: 12 },
    ]) {
      const point = centreOf(origin, target.tx, target.ty);
      note(`[${label}] ${target.name}: (${point.x},${point.y}) holds ${await whatIsAt(page, point.x, point.y)}`);
      for (const attempt of [1, 2]) {
        const before = (await sentCommands(page)).length;
        await page.mouse.move(point.x, point.y);
        await page.mouse.down({ button: 'left' });
        await page.mouse.up({ button: 'left' });
        await page.waitForTimeout(900);
        const produced = (await sentCommands(page)).slice(before);
        const screen = await readScreen(page);
        note(
          `[${label}] ${target.name} press ${attempt}: ${JSON.stringify(produced.map((c) => String(c['type'])))}` +
            ` funds=${JSON.stringify(screen.funds)} band=${JSON.stringify(screen.event)}` +
            ` refusal=${JSON.stringify(screen.refusal)}`,
        );
      }
    }

    // Then the key, on the same wall, as the control arm of the act.
    await page.locator('.hud-build__remove').click({ timeout: 15_000 });
    const afterKey = await history(page, label, 'z');
    note(`[${label}] KeyZ on the same wall: funds ${JSON.stringify(afterKey.funds)} band ${JSON.stringify(afterKey.event)}`);
    await armBuildable(page, 'wall-brick');
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    note(`[${label}] re-drag after KeyZ produced ${((await sentCommands(page)).slice(before)).length} order(s)`);
    await page.waitForTimeout(1200);
    logScreen(label, 'end of act 6', await readScreen(page));
  });
});
