/**
 * **The waste multiplier.** What an unaided first prison actually costs,
 * against what a perfect one costs.
 *
 * ## Why this file exists
 *
 * `docs/research/2026-08-30-what-the-whole-economy-costs.md` costed the whole
 * economy and concluded *"the economy is not short of money"*. Its §9 names
 * its own weakest claim and asks for exactly this run:
 *
 * > the economy is not short of money **for a player who does not waste any**,
 * > and I do not know the waste multiplier. […] What would change my mind: a
 * > browser playtest of an unaided first prison that records the treasury at
 * > every press, giving a measured ratio between what was spent and what the
 * > finished prison needed.
 *
 * Every prison in that record was built by a script that bought exactly the
 * right materials and never demolished anything. This file plays badly on
 * purpose, in the ways the three published playtests caught real sessions
 * going wrong, and prices each way separately.
 *
 * ## It runs on the just-in-time branch deliberately
 *
 * `agent/627-just-in-time-materials` (PR #640) is the flow a first-timer
 * actually meets: a build order buys its own materials at the press. Measuring
 * the pre-#627 flow would price a gesture the player will never make. The
 * consequence for *waste* is the whole finding and it is stated here rather
 * than discovered twice: under just-in-time the money leaves at the press, and
 * `JustInTimeMaterialsService` *"never credits the treasury […] there is no
 * refund path here, in either direction"*
 * (`src/simulation/economy/just-in-time-materials.ts`). So an undone build
 * gives back **material**, never money, and the question a multiplier answers
 * becomes: how much of the opening balance does a bad session convert into
 * bricks the finished prison has no use for.
 *
 * ## The four shapes of waste, kept apart
 *
 * Lumping them would hide that they are not the same kind of loss.
 *
 * 1. **Undone geometry** — walls drawn, then `Undo`. `cancelOrder` releases
 *    `materialsAllocated` back to the container
 *    (`src/simulation/construction/system.ts:565`), and a just-in-time
 *    delivery already in flight is left alone to land as stock. *Illiquid, not
 *    destroyed.*
 * 2. **Abandoned geometry** — walls that enclose nothing and are left
 *    standing. `Undo` pops one transaction, so a run drawn two gestures ago is
 *    out of reach. *Destroyed.*
 * 3. **A removed object** — `RemoveObject` on a standing bed deletes it from
 *    `PlacedObjectRegistry` and never touches the order, so its allocation is
 *    never released (`src/simulation/objects/object-placement-service.ts:448`;
 *    ADR 0076 measures the same asymmetry). *Destroyed.*
 * 4. **An early hire** — the charge is one day's wage and `PayrollSystem`
 *    re-bills it at every in-game day boundary for ever. *Recurring.*
 *
 * ## Method: the ledger is reconstructed from the counts stream, not timed
 *
 * `docs/AGENT_WORKFLOW.md` §2 forbids leaning on wall-clock time under
 * contention, so nothing load-bearing here is a millisecond. Every action is
 * stamped with the **tick** it was pressed at; at the end the whole
 * `simulation/status-counts` series is walked and every treasury movement is
 * attributed to the most recent action at or before its tick.
 *
 * The *sum* is exact even where the attribution is coarse: the worker publishes
 * counts at most every `STATUS_COUNTS_PUBLISH_INTERVAL_MS` (500 ms,
 * `src/simulation/worker/state-machine.ts:106`), so two debits inside one
 * window arrive as one observed decrease — which sums to the same total.
 *
 * ## Not a gate
 *
 * Nothing in CI collects `.playtest.ts`. Its console output is the
 * deliverable; the findings live in
 * `docs/research/2026-08-30-the-waste-multiplier.md`.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  TILE,
  armBuildable,
  calibrate,
  centreOf,
  currentTick,
  countsSeries,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  runUntilTick,
  sentCommands,
  tab,
  waitForQueueEmpty,
  type CountsSample,
} from './playtest-harness';

/**
 * The denominators, quoted from the record this file answers.
 *
 * `MINIMUM_VIABLE_PRISON` is that document's §3 canonical answer — *"one
 * `room.cell` at its authored 2×3 minimum, nine `wall-brick`, one
 * `door-wooden`, one `bed-wooden`, one `toilet-brick`"*. `PROVISIONED_PRISON`
 * is its §4 bottom row, *"cell + guard + yard + shower"*, the cheapest prison
 * measured that pays the full 300 per place-day.
 *
 * **2,105 is a third denominator and it is not in the costing document at
 * all** — `grep -n '2,105\|2105'` over that file returns nothing. It comes
 * from PR #655's playtest, quoted on
 * [#641](https://github.com/matmaxalez/lockstate/issues/641#issuecomment-5468683929):
 * *"a 24-segment perimeter for 1,920, `Designate` on the first press, a bed for
 * 65, a toilet for 40, two admissions, one guard for 80 — a working prison
 * costs 2,105 of 25,000"*. `1,920 + 65 + 40 + 80 = 2,105`, so it prices a
 * **6×6** cell rather than the 2×3 minimum, and it is the right denominator for
 * a session that drew a 6×6.
 */
const MINIMUM_VIABLE_PRISON = 890;
const PROVISIONED_PRISON = 1_995;
const PLAYED_WORKING_PRISON = 2_105;

/** The floor the costing found the whole session turns on: the price of a plank. */
const PLANK_PRICE = 65;

/** One in-game day, `src/simulation/regime/regime.ts`. */
const TICKS_PER_DAY = 2_400;

interface Action {
  readonly label: string;
  readonly shape: 'build' | 'undo-geometry' | 'abandoned-geometry' | 'removed-object' | 'hire' | 'free';
  readonly tick: number;
  readonly treasuryBefore: number;
  readonly note?: string;
}

/**
 * One session's log. Every entry carries the tick it was pressed at, which is
 * what the ledger is reconstructed against.
 */
class Session {
  public readonly actions: Action[] = [];
  private openingBalance = -1;

  public constructor(
    private readonly page: Page,
    public readonly label: string,
  ) {}

  public log(line: string): void {
    console.log(`[${this.label}] ${line}`);
  }

  public async opening(): Promise<number> {
    this.openingBalance = await this.treasury();
    this.log(`opening balance ${this.openingBalance}`);
    return this.openingBalance;
  }

  public get opened(): number {
    return this.openingBalance;
  }

  /**
   * The balance, from the **last** `simulation/status-counts` in the tee.
   *
   * **Not `latestCounts` from the harness**, and that is a measured cost
   * rather than a preference: `countsSeries` maps *every* message the tee has
   * kept, and the tee keeps every `simulation/clock-state` the worker has ever
   * published. Polling it after each press made a ten-minute run out of a
   * two-minute one, because the array it serialises across the bridge grows
   * for the whole session. This scans backwards and stops at the first hit, so
   * its cost does not depend on how long the session has run.
   */
  public async treasury(): Promise<number> {
    return this.page.evaluate(() => {
      const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index] as { kind?: string; payload?: { counts?: Record<string, number> } };
        if (message.kind === 'simulation/status-counts') return message.payload?.counts?.['treasuryMinorUnits'] ?? -1;
      }
      return -1;
    });
  }

  /**
   * Runs `act`, then waits — in ticks, never in milliseconds — until either the
   * treasury has moved or `settleTicks` have passed, and records what it cost.
   *
   * The tick bound is what makes the record survive a busy machine: a slow
   * page produces the same tick counts, just later.
   */
  public async press(
    label: string,
    shape: Action['shape'],
    act: () => Promise<string | void>,
    settleTicks = 24,
  ): Promise<Action> {
    const treasuryBefore = await this.treasury();
    const tick = await currentTick(this.page);
    const note = (await act()) ?? undefined;

    const deadline = tick + settleTicks;
    for (;;) {
      const now = await this.treasury();
      if (now !== treasuryBefore) break;
      const nowTick = await currentTick(this.page);
      if (nowTick >= deadline) break;
      await this.page.waitForTimeout(250);
    }

    const treasuryAfter = await this.treasury();
    const action: Action = { label, shape, tick, treasuryBefore, ...(note === undefined ? {} : { note }) };
    this.actions.push(action);
    this.log(
      `press "${label}" [${shape}] at tick ${tick}: ${treasuryBefore} -> ${treasuryAfter}` +
        ` (${treasuryAfter - treasuryBefore})${note === undefined ? '' : ` | ${note}`}`,
    );
    return action;
  }

  /**
   * Walks the whole counts stream and attributes every treasury movement to the
   * most recent action at or before its tick.
   */
  public async ledger(): Promise<{
    readonly series: readonly CountsSample[];
    readonly perAction: ReadonlyMap<string, number>;
    readonly grossDebits: number;
    readonly grossCredits: number;
    readonly minimumBalance: number;
    readonly minimumBalanceAtTick: number;
  }> {
    const series = await countsSeries(this.page);
    const perAction = new Map<string, number>();
    let grossDebits = 0;
    let grossCredits = 0;
    let minimumBalance = Number.POSITIVE_INFINITY;
    let minimumBalanceAtTick = -1;

    const attribute = (tick: number): string => {
      let chosen = '(before any press)';
      for (const action of this.actions) {
        if (action.tick <= tick) chosen = `${action.shape}: ${action.label}`;
        else break;
      }
      return chosen;
    };

    let previous: CountsSample | undefined;
    for (const sample of series) {
      if (sample.treasuryMinorUnits >= 0 && sample.treasuryMinorUnits < minimumBalance) {
        minimumBalance = sample.treasuryMinorUnits;
        minimumBalanceAtTick = sample.tick;
      }
      if (previous !== undefined) {
        const delta = sample.treasuryMinorUnits - previous.treasuryMinorUnits;
        if (delta < 0) grossDebits += -delta;
        if (delta > 0) grossCredits += delta;
        if (delta !== 0) {
          const key = attribute(sample.tick);
          perAction.set(key, (perAction.get(key) ?? 0) + delta);
        }
      }
      previous = sample;
    }

    return { series, perAction, grossDebits, grossCredits, minimumBalance, minimumBalanceAtTick };
  }

  public async report(): Promise<void> {
    const ledger = await this.ledger();
    const closing = await this.treasury();
    this.log('=== LEDGER ===');
    for (const [key, delta] of [...ledger.perAction.entries()]) {
      this.log(`  ${key}: ${delta > 0 ? '+' : ''}${delta}`);
    }
    this.log(
      `gross debits ${ledger.grossDebits} | gross credits ${ledger.grossCredits}` +
        ` | opening ${this.openingBalance} | closing ${closing}` +
        ` | net spend ${this.openingBalance - closing}`,
    );
    this.log(
      `minimum balance seen ${ledger.minimumBalance} at tick ${ledger.minimumBalanceAtTick}` +
        ` | plank price ${PLANK_PRICE} | below the plank floor: ${ledger.minimumBalance < PLANK_PRICE}`,
    );
    this.log(
      `MULTIPLIER against the 890 minimum viable prison: ${(ledger.grossDebits / MINIMUM_VIABLE_PRISON).toFixed(2)}x` +
        ` | against the 2,105 played working prison: ${(ledger.grossDebits / PLAYED_WORKING_PRISON).toFixed(2)}x` +
        ` | against the 1,995 provisioned prison: ${(ledger.grossDebits / PROVISIONED_PRISON).toFixed(2)}x`,
    );
    this.log(`final status strip: ${(await panelText(this.page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    this.log(`final build queue: ${JSON.stringify(await panelText(this.page, '.hud-build__queue'))}`);
    this.log(`final deliveries: ${JSON.stringify(await panelText(this.page, '.hud-build__deliveries'))}`);
    this.log(`final counts: ${JSON.stringify(await latestCounts(this.page))}`);
  }
}

/** The refusal band, whatever it currently says. */
async function refusal(page: Page): Promise<string> {
  return (await panelText(page, '.hud__refusal')).replace(/\n/g, ' / ');
}

/**
 * Turns the Build panel's *Remove* tool on or off, by reading its state rather
 * than toggling it.
 *
 * **This is a correction, and the measurement it broke is the reason it
 * exists.** `calibrate` (`playtest-harness.ts`) arms Remove, bisects with it,
 * and clicks it a second time to put it back. Run 2 of this file reached the
 * first wall drag with Remove still armed: the four gestures of profile A's
 * 6×6 produced **6 commands and cost 0**, because they were `RemoveObject`
 * commands and not `PlaceBuildOrder`s, and the refusal band said *"Nothing was
 * removed"* where run 1's had said the zoning refusal. The session then played
 * a *flawless* prison and reported a 1.02x multiplier — a number that looks
 * like a finding and is an artifact of a swallowed click.
 *
 * `data-removing` is what the panel itself writes
 * (`src/ui/hud/build-panel.ts:1072`), so asking it is exact where toggling is a
 * guess about how many clicks landed.
 */
async function setRemoveTool(page: Page, on: boolean): Promise<void> {
  const control = page.locator('.hud-build__remove');
  const removing = (await control.getAttribute('data-removing')) === 'true';
  if (removing !== on) await control.click();
  const settled = (await control.getAttribute('data-removing')) === 'true';
  if (settled !== on) throw new Error(`the Remove tool would not go ${on ? 'on' : 'off'}: data-removing=${String(settled)}`);
}

/** `armBuildable`, with the Remove tool provably off first. */
async function armTool(page: Page, buildableId: string): Promise<void> {
  await setRemoveTool(page, false);
  await armBuildable(page, buildableId);
}

/**
 * Four drags around a rectangle in tiles, the way a player traces a room —
 * one gesture per side, which is one *transaction* per side and therefore one
 * `Undo` per side.
 */
async function traceRectangle(
  page: Page,
  origin: { originX: number; originY: number },
  left: number,
  top: number,
  right: number,
  bottom: number,
): Promise<number> {
  const westX = origin.originX + left * TILE;
  const eastX = origin.originX + (right + 1) * TILE;
  const northY = origin.originY + top * TILE;
  const southY = origin.originY + (bottom + 1) * TILE;
  const before = (await sentCommands(page)).length;
  for (const run of [
    { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
  }
  return (await sentCommands(page)).length - before;
}

/**
 * Which tiles the mouse can actually reach, asked of the page rather than
 * assumed.
 *
 * **The first run of this file failed on exactly this.** A click aimed at the
 * canvas at (5, 5) was refused because `.hud-strip` *"intercepts pointer
 * events"*, and the calibrated origin came back at (-304, -574) -- so tile
 * (4, 4), which an earlier draft dragged from, is off the top-left of a
 * 1440x900 viewport entirely. Guessing a safe rectangle would have to be
 * re-guessed the moment the HUD or the starting camera moves.
 *
 * `document.elementFromPoint` answers it exactly: a tile is usable when its
 * centre hits the world canvas and not a panel. Both ends *and* the midpoint
 * of a drag are checked, because `drag` moves through the midpoint and a panel
 * sitting between two reachable tiles would swallow the gesture.
 */
async function tileIsReachable(page: Page, origin: { originX: number; originY: number }, tx: number, ty: number): Promise<boolean> {
  const point = centreOf(origin, tx, ty);
  return page.evaluate(
    ([x, y]) => {
      const element = document.elementFromPoint(x as number, y as number);
      return element !== null && element.closest('#game-root') !== null && element.tagName === 'CANVAS';
    },
    [point.x, point.y],
  );
}

/**
 * The largest tile rectangle the mouse can reach, found by walking out from a
 * tile known to be reachable.
 *
 * The seed is `(700, 300)` in screen pixels, which is where `calibrate`
 * bisects and therefore a point the harness has already proved is over the
 * canvas. Walking out along one row and one column is 64 probes rather than
 * the 1,024 a full sweep would cost, and the HUD is made of rectangles at the
 * edges, so the answer is the same.
 *
 * Clamped to `0..31`: that is the one chunk the starter prison owns, and
 * nothing outside it can be built on.
 */
async function reachableTileWindow(
  page: Page,
  origin: { originX: number; originY: number },
): Promise<{ readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }> {
  const seedX = Math.max(0, Math.min(31, Math.floor((700 - origin.originX) / TILE)));
  const seedY = Math.max(0, Math.min(31, Math.floor((300 - origin.originY) / TILE)));
  if (!(await tileIsReachable(page, origin, seedX, seedY))) {
    throw new Error(`the seed tile (${seedX},${seedY}) is not over the canvas; the HUD or the camera has moved`);
  }
  let left = seedX;
  let right = seedX;
  let top = seedY;
  let bottom = seedY;
  while (left > 0 && (await tileIsReachable(page, origin, left - 1, seedY))) left -= 1;
  while (right < 31 && (await tileIsReachable(page, origin, right + 1, seedY))) right += 1;
  while (top > 0 && (await tileIsReachable(page, origin, seedX, top - 1))) top -= 1;
  while (bottom < 31 && (await tileIsReachable(page, origin, seedX, bottom + 1))) bottom += 1;
  return { left, right, top, bottom };
}

/** Opens a session the way a player opens one: a new prison, then fast forward. */
async function startSession(page: Page, label: string): Promise<{ session: Session; origin: { originX: number; originY: number } }> {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await fastForwardToMax(page);
  const session = new Session(page, label);
  session.log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  await runUntilTick(page, 20);
  await session.opening();
  return { session, origin };
}

/** Zones `room.cell` over a rectangle, retrying the way `buildAndPopulate` does. */
async function designateCell(
  page: Page,
  session: Session,
  origin: { originX: number; originY: number },
  left: number,
  top: number,
  right: number,
  bottom: number,
  attemptsAllowed: number,
): Promise<number> {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, left, top), centreOf(origin, right, bottom));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    session.log(`designate attempt ${attempts}: rooms=${counts?.rooms} | band ${JSON.stringify(await refusal(page))}`);
    if ((counts?.rooms ?? 0) > 0) return attempts;
    if (attempts >= attemptsAllowed) return attempts;
    await page.waitForTimeout(4000);
  }
}

test.describe('playtest: the waste multiplier', () => {
  /**
   * **Profile 0 — the control: the same prison, played perfectly.**
   *
   * The denominator, measured in this harness rather than quoted from another
   * document. It builds exactly what profiles A and B end up with — a 2×3
   * `room.cell` in ten `wall-brick`, one `bed-wooden`, one `toilet-brick` — and
   * makes no mistake on the way, so its gross debits *are* what the finished
   * prison is worth.
   *
   * **It exists because run 2 produced it by accident and it turned out to be
   * the most useful number in the pass.** A swallowed click left the Remove
   * tool armed, profile A's 6×6 never happened, and the session reported
   * `gross debits 905` for the prison it did finish. 905 is `10 × 80 + 65 +
   * 40` exactly, and it sits 15 above the costing document's canonical 890 —
   * which is the whole of the door-for-a-wall substitution that record names,
   * `80 − 65`. A ratio between two prisons measured on the same tree in the
   * same harness is worth more than a ratio to a figure from elsewhere, so the
   * accident is now deliberate.
   */
  test('profile 0 (control): the same cell, played perfectly', async ({ page }) => {
    const { session, origin } = await startSession(page, '0/control');

    await tab(page, 'build').click();
    await armTool(page, 'wall-brick');
    await session.press('trace the 2x3 cell perimeter', 'build', async () => {
      const commands = await traceRectangle(page, origin, 12, 12, 13, 14);
      return `${commands} PlaceBuildOrder command(s)`;
    }, 40);

    await waitForQueueEmpty(page);
    await session.press('designate the 2x3 as room.cell', 'free', async () => {
      const attempts = await designateCell(page, session, origin, 12, 12, 13, 14, 8);
      return `attempts ${attempts}`;
    });

    await tab(page, 'build').click();
    await armTool(page, 'bed-wooden');
    await session.press('place a bed inside the cell', 'build', async () => {
      const point = centreOf(origin, 12, 12);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });
    await armTool(page, 'toilet-brick');
    await session.press('place a toilet inside the cell', 'build', async () => {
      const point = centreOf(origin, 13, 14);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });

    await waitForQueueEmpty(page);
    await tab(page, 'overview').click();
    await session.press('admit one prisoner', 'free', async () => {
      await page.locator('.hud-intake__admit').click();
      return `intake ${JSON.stringify((await panelText(page, '.hud-intake')).replace(/\n/g, ' / '))}`;
    });

    const boundary = Math.ceil(((await currentTick(page)) + 1) / TICKS_PER_DAY) * TICKS_PER_DAY;
    session.log(`running to the next day boundary, tick ${boundary}`);
    await runUntilTick(page, boundary + 60, 300_000);
    await session.report();
  });

  /**
   * **Profile A — the careful first-timer.** One mistake, noticed and undone.
   *
   * The mistake is the one the costing predicts a player makes first: *"a
   * player who drags a large rectangle […] is not being clever; they are doing
   * the obvious thing"*. They drag a 6×6, see what it cost, take it back with
   * `Undo`, and build the 2×3 the game's own Rooms panel names as the cell
   * minimum.
   *
   * What it isolates: **shape 1 alone.** Nothing here is destroyed; the
   * question is how much of the balance the mistake converts into bricks.
   */
  test('profile A: a big rectangle, undone, then the cell the panel asks for', async ({ page }) => {
    const { session, origin } = await startSession(page, 'A/careful');

    await session.press('zone before building anything (Rooms -> Cell -> Designate)', 'free', async () => {
      const attempts = await designateCell(page, session, origin, 12, 12, 17, 17, 1);
      return `attempts ${attempts}, band ${await refusal(page)}`;
    });

    await tab(page, 'build').click();
    await armTool(page, 'wall-brick');

    await session.press('trace a 6x6 perimeter with the wall tool', 'undo-geometry', async () => {
      const commands = await traceRectangle(page, origin, 12, 12, 17, 17);
      return `${commands} PlaceBuildOrder command(s) | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`;
    }, 40);

    for (let index = 0; index < 4; index += 1) {
      await session.press(`Undo (KeyZ) #${index + 1} of the 6x6`, 'undo-geometry', async () => {
        // **No click first.** `world-scene.ts:364` registers the listener on
        // `window`, so the key needs no canvas focus -- and a click aimed at
        // the canvas is intercepted by `.hud-strip`, which is what killed the
        // first run of this file. Blurring is enough, and it is what keeps the
        // binding out of the `text-entry` context.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press('KeyZ');
        return `queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`;
      });
    }
    session.log(`stock after undoing the 6x6: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    await tab(page, 'build').click();
    await armTool(page, 'wall-brick');
    await session.press('trace the 2x3 cell perimeter', 'build', async () => {
      const commands = await traceRectangle(page, origin, 12, 12, 13, 14);
      return `${commands} PlaceBuildOrder command(s) | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`;
    }, 40);

    await waitForQueueEmpty(page);
    await session.press('designate the 2x3 as room.cell', 'free', async () => {
      const attempts = await designateCell(page, session, origin, 12, 12, 13, 14, 8);
      return `attempts ${attempts}`;
    });

    await tab(page, 'build').click();
    await armTool(page, 'bed-wooden');
    await session.press('place a bed inside the cell', 'build', async () => {
      const point = centreOf(origin, 12, 12);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });
    await armTool(page, 'toilet-brick');
    await session.press('place a toilet inside the cell', 'build', async () => {
      const point = centreOf(origin, 13, 14);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });

    await waitForQueueEmpty(page);
    await tab(page, 'overview').click();
    await session.press('admit one prisoner', 'free', async () => {
      await page.locator('.hud-intake__admit').click();
      return `intake ${JSON.stringify((await panelText(page, '.hud-intake')).replace(/\n/g, ' / '))}`;
    });

    const boundary = Math.ceil(((await currentTick(page)) + 1) / TICKS_PER_DAY) * TICKS_PER_DAY;
    session.log(`running to the next day boundary, tick ${boundary}`);
    await runUntilTick(page, boundary + 60, 300_000);
    await session.report();
  });

  /**
   * **Profile B — the ordinary first-timer.** Every shape at once, in the order
   * the published playtests caught them happening.
   *
   * Each act is sourced rather than invented:
   * - the abandoned run is `2026-08-30-the-naive-route.md`'s *"sixty bricks for
   *   half a perimeter"* — geometry begun and left;
   * - the removed bed is ADR 0076's `RemoveObject`/`Undo` asymmetry, reached by
   *   the control the Build panel actually offers;
   * - the early guard is the costing's *"the hire charge is exactly one day's
   *   wage"* pressed before there is a prisoner for the guard to make safe.
   */
  test('profile B: an abandoned run, a removed bed, an early guard, then the cell', async ({ page }) => {
    const { session, origin } = await startSession(page, 'B/ordinary');
    const window_ = await reachableTileWindow(page, origin);
    session.log(`reachable tile window: ${JSON.stringify(window_)}`);

    const strayRow = window_.top + 1;
    const strayColumn = window_.left + 1;
    const strayRunEnd = Math.min(window_.right - 1, strayColumn + 10);
    const strayRunFoot = Math.min(window_.bottom - 1, strayRow + 6);
    const strayBed = { x: strayColumn + 3, y: strayRow + 3 };

    await tab(page, 'build').click();
    await armTool(page, 'wall-brick');

    // 1. Geometry that encloses nothing, and is then left alone. Two further
    //    gestures follow before any Undo, so it is out of the stack's reach.
    await session.press(`drag one wall run across open ground, row ${strayRow} (encloses nothing)`, 'abandoned-geometry', async () => {
      const before = (await sentCommands(page)).length;
      await drag(page, centreOf(origin, strayColumn, strayRow), centreOf(origin, strayRunEnd, strayRow));
      const produced = (await sentCommands(page)).length - before;
      return `${produced} PlaceBuildOrder command(s)`;
    }, 40);

    await session.press(`drag a second run at right angles, column ${strayColumn} (still encloses nothing)`, 'abandoned-geometry', async () => {
      const before = (await sentCommands(page)).length;
      await drag(page, centreOf(origin, strayColumn, strayRow), centreOf(origin, strayColumn, strayRunFoot));
      const produced = (await sentCommands(page)).length - before;
      return `${produced} PlaceBuildOrder command(s)`;
    }, 40);

    /*
     * 2. A bed placed on open ground, before any room exists.
     *
     * **Kept, and relabelled `free`, because run 1 measured it costing
     * nothing.** `ObjectPlacementService` refuses it -- *"The object was not
     * placed — it has to stand in a room you have zoned."* -- and a refused
     * placement mints no order, so `JustInTimeMaterialsService` is never asked
     * and no money leaves. The brief for this pass listed *"objects placed …
     * before the room existed"* as a shape of waste; it is not one, and the
     * refusal is what makes it not one. The pair stays in the script so the
     * empty category keeps its evidence rather than becoming a claim nobody
     * re-checks.
     */
    await armTool(page, 'bed-wooden');
    await session.press(`place a bed on open ground at (${strayBed.x},${strayBed.y}), before any room exists`, 'free', async () => {
      const point = centreOf(origin, strayBed.x, strayBed.y);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s) | band ${await refusal(page)}`;
    });
    await session.press('press Remove on the tile where that bed is not', 'free', async () => {
      await setRemoveTool(page, true);
      const point = centreOf(origin, strayBed.x, strayBed.y);
      const commands = await press(page, point.x, point.y);
      await setRemoveTool(page, false);
      return `${commands.length} command(s) | band ${await refusal(page)}`;
    });

    // 3. A guard, hired on day 1, with nobody to guard.
    await tab(page, 'security').click();
    await session.press('hire a guard on day 1, with no prisoners', 'hire', async () => {
      const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
      if ((await guardRow.count()) > 0) await guardRow.first().click();
      const label = (await page.locator('.hud-staff__hire').innerText()).trim();
      await page.locator('.hud-staff__hire').click();
      return `hire control read ${JSON.stringify(label)}`;
    });

    // 4. And only now, the prison.
    await tab(page, 'build').click();
    await armTool(page, 'wall-brick');
    await session.press('trace the 2x3 cell perimeter', 'build', async () => {
      const commands = await traceRectangle(page, origin, 12, 12, 13, 14);
      return `${commands} PlaceBuildOrder command(s)`;
    }, 40);

    await waitForQueueEmpty(page);
    await session.press('designate the 2x3 as room.cell', 'free', async () => {
      const attempts = await designateCell(page, session, origin, 12, 12, 13, 14, 8);
      return `attempts ${attempts}`;
    });

    await tab(page, 'build').click();
    await armTool(page, 'bed-wooden');
    await session.press('place a bed inside the cell', 'build', async () => {
      const point = centreOf(origin, 12, 12);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });

    /*
     * Second thoughts about where the bed goes -- the one route by which a
     * player destroys money rather than parking it.
     *
     * **This is where the removed-object shape had to move to.** Run 1 put it
     * on open ground and measured a refusal costing nothing; a standing object
     * needs a zoned room to stand in. `ObjectPlacementService.remove` deletes
     * the object from `PlacedObjectRegistry` and never touches the order
     * (`object-placement-service.ts:448,453`), so `materialsAllocated` is never
     * released and the plank is gone -- which the Build panel's own
     * `hud.build.remove-hint` states: *"One still being built is cancelled and
     * its materials come back; a finished one is not refunded."*
     *
     * So the wait matters: it is what makes this the finished case rather than
     * the cancelled one.
     */
    await waitForQueueEmpty(page);
    await session.press('remove the finished bed, having changed your mind about the tile', 'removed-object', async () => {
      await setRemoveTool(page, true);
      const point = centreOf(origin, 12, 12);
      const commands = await press(page, point.x, point.y);
      await setRemoveTool(page, false);
      return `${commands.length} command(s) | band ${await refusal(page)}`;
    });
    await armTool(page, 'bed-wooden');
    await session.press('place the bed again, one tile over', 'build', async () => {
      const point = centreOf(origin, 12, 13);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s) | band ${await refusal(page)}`;
    });

    await armTool(page, 'toilet-brick');
    await session.press('place a toilet inside the cell', 'build', async () => {
      const point = centreOf(origin, 13, 14);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });

    await waitForQueueEmpty(page);
    await tab(page, 'overview').click();
    await session.press('admit one prisoner', 'free', async () => {
      await page.locator('.hud-intake__admit').click();
      return `intake ${JSON.stringify((await panelText(page, '.hud-intake')).replace(/\n/g, ' / '))}`;
    });

    const boundary = Math.ceil(((await currentTick(page)) + 1) / TICKS_PER_DAY) * TICKS_PER_DAY;
    session.log(`running to the next day boundary, tick ${boundary}`);
    await runUntilTick(page, boundary + 60, 300_000);
    await session.report();
  });

  /**
   * **Profile C — the enthusiastic drag, which is the 65 question.**
   *
   * The costing's §6 says the single failure mode is *"cash below 65, no plank
   * in stock, nothing plank-built to reverse"*, reached by
   * `floor(25,000 / 80) = 312` wall segments, and that *"the starter prison
   * owns one 32×32 chunk whose bare perimeter is 128 segments, so 312 is two
   * or three rooms' worth of wall — an ordinary first build, not a reckless
   * one"*. That arithmetic was done against the price list. This presses the
   * mouse instead: keep drawing wall runs, read the balance after every drag,
   * and answer where it actually gets to, what the game says on the way, and
   * whether anything stops the player.
   *
   * No build ever has to finish for this measurement, because the money leaves
   * at the press.
   */
  test('profile C: keep dragging wall, and see how close the balance gets to 65', async ({ page }) => {
    const { session, origin } = await startSession(page, 'C/enthusiast');

    await tab(page, 'build').click();
    await armTool(page, 'wall-brick');

    const window_ = await reachableTileWindow(page, origin);
    session.log(`reachable tile window: ${JSON.stringify(window_)}`);

    let segments = 0;
    let lowest = await session.treasury();
    // Rows first, then columns, so every drag lands on tile edges no earlier
    // drag claimed. The window is what the mouse can reach without the camera
    // moving; a player who wants more wall pans, and that is a different
    // gesture from the one being priced here.
    const gestures: { readonly from: [number, number]; readonly to: [number, number] }[] = [];
    for (let row = window_.top; row <= window_.bottom; row += 1) gestures.push({ from: [window_.left, row], to: [window_.right, row] });
    for (let column = window_.left; column <= window_.right; column += 1) gestures.push({ from: [column, window_.top], to: [column, window_.bottom] });

    /*
     * **Every gesture's own ends are re-checked, and this is a correction to
     * run 1 rather than caution.**
     *
     * `reachableTileWindow` answers with a *rectangle*, found by walking one
     * row and one column out from the seed. The HUD is not a rectangle: run 1's
     * eighth drag started at tile (5, 17) -- screen x = 48, inside the left
     * rail -- and produced **0 `PlaceBuildOrder` commands** while the Build
     * panel's own WHERE readout still said `22, 17 · North`, because the
     * mousedown never reached the canvas. The run stopped there and reported
     * *"a drag bought nothing"*, which would have read as a game refusal and is
     * nothing of the kind.
     *
     * So a gesture whose ends are not both over the canvas is skipped, and a
     * drag that buys nothing is counted rather than treated as the end: only a
     * run of three consecutive silent drags ends the probe, and the balance
     * falling below the plank floor ends it immediately, which is the thing
     * being looked for.
     */
    let silentDrags = 0;
    for (const [index, gesture] of gestures.entries()) {
      const bothEndsReachable =
        (await tileIsReachable(page, origin, gesture.from[0], gesture.from[1])) &&
        (await tileIsReachable(page, origin, gesture.to[0], gesture.to[1]));
      if (!bothEndsReachable) {
        session.log(`skipping drag ${index + 1}: (${gesture.from.join(',')}) -> (${gesture.to.join(',')}) is not both over the canvas`);
        continue;
      }
      const action = await session.press(
        `wall drag ${index + 1}: (${gesture.from.join(',')}) -> (${gesture.to.join(',')})`,
        'abandoned-geometry',
        async () => {
          const before = (await sentCommands(page)).length;
          await drag(page, centreOf(origin, gesture.from[0], gesture.from[1]), centreOf(origin, gesture.to[0], gesture.to[1]));
          const produced = (await sentCommands(page)).length - before;
          segments += produced;
          return `${produced} PlaceBuildOrder command(s), ${segments} segments so far | band ${await refusal(page)}`;
        },
        40,
      );
      const now = await session.treasury();
      if (now < lowest) lowest = now;
      if (now < PLANK_PRICE) {
        session.log(`*** the balance is below the ${PLANK_PRICE} plank floor after ${segments} segments: ${now}`);
        break;
      }
      if (now === action.treasuryBefore) {
        silentDrags += 1;
        session.log(`*** drag ${index + 1} bought nothing: balance still ${now} after ${segments} segments (${silentDrags} in a row)`);
        if (silentDrags >= 3) {
          session.log(`*** three silent drags in a row; stopping at ${segments} segments and ${now}`);
          break;
        }
      } else {
        silentDrags = 0;
      }
    }

    session.log(`segments drawn ${segments} | lowest balance seen ${lowest}`);
    session.log(`the game's whole HUD at the end: ${(await panelText(page, '.hud')).replace(/\n/g, ' / ')}`);
    await session.report();
  });
});
