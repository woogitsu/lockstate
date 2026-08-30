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
 * **The brief for this run named 2,105 for "a working prison" and that figure
 * appears nowhere in the costing document** — `grep -n '2,105\|2105'` over it
 * returns nothing. 1,995 is used instead, with its source above, and the
 * discrepancy is reported rather than reconciled by guessing.
 */
const MINIMUM_VIABLE_PRISON = 890;
const PROVISIONED_PRISON = 1_995;

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

  public async treasury(): Promise<number> {
    const counts = await latestCounts(this.page);
    return counts?.treasuryMinorUnits ?? -1;
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
    await armBuildable(page, 'wall-brick');

    await session.press('trace a 6x6 perimeter with the wall tool', 'undo-geometry', async () => {
      const commands = await traceRectangle(page, origin, 12, 12, 17, 17);
      return `${commands} PlaceBuildOrder command(s) | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`;
    }, 40);

    for (let index = 0; index < 4; index += 1) {
      await session.press(`Undo (KeyZ) #${index + 1} of the 6x6`, 'undo-geometry', async () => {
        await page.locator('#game-root canvas').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('KeyZ');
        return `queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`;
      });
    }
    session.log(`stock after undoing the 6x6: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    await tab(page, 'build').click();
    await armBuildable(page, 'wall-brick');
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
    await armBuildable(page, 'bed-wooden');
    await session.press('place a bed inside the cell', 'build', async () => {
      const point = centreOf(origin, 12, 12);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });
    await armBuildable(page, 'toilet-brick');
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

    await tab(page, 'build').click();
    await armBuildable(page, 'wall-brick');

    // 1. Geometry that encloses nothing, and is then left alone. Two further
    //    gestures follow before any Undo, so it is out of the stack's reach.
    await session.press('drag one wall run across open ground (encloses nothing)', 'abandoned-geometry', async () => {
      const before = (await sentCommands(page)).length;
      await drag(page, centreOf(origin, 4, 4), centreOf(origin, 15, 4));
      const produced = (await sentCommands(page)).length - before;
      return `${produced} PlaceBuildOrder command(s)`;
    }, 40);

    await session.press('drag a second run at right angles to it (still encloses nothing)', 'abandoned-geometry', async () => {
      const before = (await sentCommands(page)).length;
      await drag(page, centreOf(origin, 4, 4), centreOf(origin, 4, 10));
      const produced = (await sentCommands(page)).length - before;
      return `${produced} PlaceBuildOrder command(s)`;
    }, 40);

    // 2. A bed placed on open ground, before any room exists, then taken away
    //    with the Build panel's own Remove control.
    await armBuildable(page, 'bed-wooden');
    await session.press('place a bed on open ground, before any room exists', 'removed-object', async () => {
      const point = centreOf(origin, 8, 8);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s) | band ${await refusal(page)}`;
    });
    await waitForQueueEmpty(page);
    await session.press('remove that bed with the Remove control', 'removed-object', async () => {
      await page.locator('.hud-build__remove').click();
      const point = centreOf(origin, 8, 8);
      const commands = await press(page, point.x, point.y);
      await page.locator('.hud-build__remove').click();
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
    await armBuildable(page, 'wall-brick');
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
    await armBuildable(page, 'bed-wooden');
    await session.press('place a bed inside the cell', 'build', async () => {
      const point = centreOf(origin, 12, 12);
      const commands = await press(page, point.x, point.y);
      return `${commands.length} command(s)`;
    });
    await armBuildable(page, 'toilet-brick');
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
    await armBuildable(page, 'wall-brick');

    let segments = 0;
    let lowest = await session.treasury();
    // Rows first, then columns, so every drag lands on edges no earlier drag
    // claimed. Bounded at 40 gestures: the point is where the balance goes, and
    // a run that buys nothing has already answered the question.
    const gestures: { readonly from: [number, number]; readonly to: [number, number] }[] = [];
    for (let row = 1; row <= 13; row += 1) gestures.push({ from: [2, row], to: [19, row] });
    for (let column = 2; column <= 19; column += 1) gestures.push({ from: [column, 1], to: [column, 13] });

    for (const [index, gesture] of gestures.entries()) {
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
      if (now === action.treasuryBefore && index > 2) {
        session.log(`*** a drag bought nothing: balance still ${now} after ${segments} segments`);
        break;
      }
    }

    session.log(`segments drawn ${segments} | lowest balance seen ${lowest}`);
    session.log(`the game's whole HUD at the end: ${(await panelText(page, '.hud')).replace(/\n/g, ' / ')}`);
    await session.report();
  });
});
