/**
 * The shared harness every `*.playtest.ts` in this directory drives the real
 * application with: a worker tee, the screen-to-tile calibration, the mouse
 * gestures, and `buildAndPopulate`.
 *
 * **Extracted rather than written.** Every function below came out of
 * `playtest-economy.playtest.ts` unchanged, because a second playtest needed
 * them and the alternative was a second copy of four hundred lines. The
 * comments are that file's and are kept verbatim -- several of them record
 * findings (why the tick is read from `simulation/clock-state` and not from
 * `simulation/status-counts`, why calibration bisects rather than assuming a
 * transform) that are worth more than the code they sit above.
 *
 * **It is not named `*.playtest.ts` on purpose.**
 * `tests/browser/playwright.playtest.config.ts` collects on that suffix, and a
 * module of helpers with no `test()` in it would be collected as an empty
 * suite.
 */
import { expect, type Page } from '@playwright/test';

/**
 * A *playtest*, not a regression suite, and **deliberately not a CI gate**.
 *
 * **Which is why this file is `.playtest.ts` and not `.spec.ts`.** It was
 * written as `playtest-economy.spec.ts`, and that name contradicted this
 * sentence: `tests/browser/playwright.config.ts` collects on
 * `testMatch: /.*\.spec\.ts$/`, so the suite would have picked it up and run
 * ~700 lines of mouse-driven play in every CI run of a job that already takes
 * six minutes. A file declaring it is not a gate while being named into one is
 * the same defect PR #578 landed a partition contract against, one directory
 * along.
 *
 * **Nothing collects it now, and that is the deliberate consequence.** To run
 * it, point a config's `testMatch` at `.playtest.ts`; none does today. It is
 * kept because a reproduction that only exists in a merged branch is a
 * reproduction that the branch cleanup deletes.
 *
 * It answers issue #601 -- what "a neglected twelve-prisoner prison earns
 * about 150/day" was actually measuring -- by playing: build a prison with
 * the mouse, admit prisoners, run past a day boundary, and read the roster
 * count, the resident count and the amount actually credited, separately.
 *
 * Its output is the deliverable. The findings live in
 * `docs/research/2026-08-29-what-a-day-actually-pays.md`.
 */

export const APP_URL = '/index.html';
export const TILE = 64;

export interface TeeWindow {
  lockstateSentToWorker?: unknown[];
  lockstateFromWorker?: unknown[];
  lockstateBuildIntent?: BuildIntentRecord;
}

/**
 * What the *page* last saw asked of the Build panel, recorded at event time.
 *
 * This is the harness's answer to issue #1017's third requirement, and the
 * reason it lives in the page rather than in a `WeakMap<Page, string>` beside
 * `armBuildable` is that **not every caller arms through `armBuildable`**.
 * Counted rather than estimated: twenty `*.playtest.ts` files in this
 * directory address `.hud-build__list [data-buildable="..."]` themselves, and
 * **seven carry a private copy of the lines #1017 is about** -- read the arm
 * control's `innerText`, branch on `startsWith('place')` -- across thirteen
 * sites. `playtest-2026-09-04-the-misplay`'s `armRooms` is the sharpest of
 * them: it does this to the *Rooms* panel and its docblock says why, in these
 * words, *"`armBuildable` in the shared harness reads the label for the same
 * reason; this is that rule one panel over"*. A `WeakMap` keyed on what
 * `armBuildable` was asked for would see none of the seven.
 *
 * A capture-phase listener on `window` sees all of them: `armBuildable`'s
 * click, a playtest's own click, and the `click` a keyboard `Enter` or a touch
 * tap on the row synthesises. So `press` and `drag` below check every
 * placement that goes through them against what was actually asked for,
 * whoever asked -- which covers **five of those seven** without a line of
 * theirs changing. `playtest-2026-09-01-money` and
 * `playtest-2026-09-04-touch-only` drive the world with their own pointer code
 * and are not reached; they belong to whoever is in those files next, and are
 * named here so that agent does not have to re-derive the list.
 *
 * **It records the click, not the panel's reaction to it**, and that is the
 * whole point. `selectedId` inside `build-panel.ts` and the `definitionId` on
 * the command are the same value read twice, so comparing those two proves
 * nothing; comparing the *event* against the command is what catches a click
 * whose handler never ran.
 */
export interface BuildIntentRecord {
  /**
   * The `data-buildable` of the last catalogue row clicked, or `undefined`
   * before any was and once removal was toggled.
   *
   * Present-and-`undefined` rather than absent (`exactOptionalPropertyTypes`
   * is on): the record is one object mutated in the page, so the key exists
   * from the first frame and only its value moves.
   */
  buildableId: string | undefined;
  /** Whether `.hud-build__remove` was the last of the two to be pressed. */
  removing: boolean;
  /** `Date.now()` at that click, so a caller can tell "never clicked" from "clicked long ago". */
  at: number;
}

export interface SubmittedCommand {
  readonly kind?: string;
  readonly payload?: { readonly command?: { readonly data?: Record<string, unknown> } };
}

export async function installTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    class TeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const kind = (event.data as { kind?: string })?.kind ?? '';
          // Only the small messages, so the array cannot grow without bound.
          if (kind === 'simulation/delta' || kind === 'simulation/snapshot' || kind === 'simulation/projection') return;
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
    (window as unknown as { Worker: typeof Worker }).Worker = TeeWorker as unknown as typeof Worker;
    (window as unknown as TeeWindow).lockstateSentToWorker = sent;
    (window as unknown as TeeWindow).lockstateFromWorker = received;

    /*
     * The Build panel intent recorder (#1017). See `BuildIntentRecord`.
     *
     * On `window` and in the **capture** phase, which is the earliest point in
     * the propagation path: it therefore observes a click even when something
     * further down stops the event before the panel's own handler runs, and
     * that is exactly the state this recorder exists to make visible.
     *
     * Removal clears `buildableId` rather than setting a flag the checks
     * consult, because `.hud-build__remove` *toggles*: a second press turns
     * removal off again and the panel goes back to placing the row that is
     * still selected, which this listener cannot see. Clearing is the
     * conservative direction -- the checks below skip rather than accuse when
     * they do not know what was asked.
     */
    const intent: { buildableId: string | undefined; removing: boolean; at: number } = {
      buildableId: undefined,
      removing: false,
      at: 0,
    };
    window.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const row = target.closest('.hud-build__list [data-buildable]');
        if (row !== null) {
          intent.buildableId = row.getAttribute('data-buildable') ?? undefined;
          intent.removing = false;
          intent.at = Date.now();
          return;
        }
        if (target.closest('.hud-build__remove') !== null) {
          intent.buildableId = undefined;
          intent.removing = true;
          intent.at = Date.now();
        }
      },
      true,
    );
    (window as unknown as TeeWindow).lockstateBuildIntent = intent;
  });
}

/** What the page last saw asked of the Build panel. `undefined` before `installTee` has run. */
export async function buildIntent(page: Page): Promise<BuildIntentRecord | undefined> {
  return page.evaluate(() => {
    const record = (window as unknown as TeeWindow).lockstateBuildIntent;
    return record === undefined ? undefined : { ...record };
  });
}

export async function sentCommands(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateSentToWorker ?? [])
      .map((message) => message as SubmittedCommand)
      .filter((message) => message.kind === 'simulation/submit-command')
      .map((message) => message.payload?.command?.data ?? {}),
  );
}

export interface CountsSample {
  readonly tick: number;
  readonly prisoners: number;
  readonly prisonersInIntake: number;
  readonly prisonersHighRisk: number;
  readonly rooms: number;
  readonly roomCapacity: number;
  readonly accommodationCapacity: number;
  readonly roomOccupants: number;
  readonly treasuryMinorUnits: number;
  readonly stateIncomeAccruedTodayMinorUnits: number;
  readonly dailyWageBillMinorUnits: number;
  readonly unpaidWagesMinorUnits: number;
  readonly staff: number;
}

/** Every `simulation/status-counts` the worker has published so far. */
export async function countsSeries(page: Page): Promise<readonly CountsSample[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/status-counts')
      .map((message) => {
        const payload = (message as { payload: { tick: number; counts: Record<string, number> } }).payload;
        return {
          tick: payload.tick,
          prisoners: payload.counts['prisoners'] ?? -1,
          prisonersInIntake: payload.counts['prisonersInIntake'] ?? -1,
          prisonersHighRisk: payload.counts['prisonersHighRisk'] ?? -1,
          rooms: payload.counts['rooms'] ?? -1,
          roomCapacity: payload.counts['roomCapacity'] ?? -1,
          accommodationCapacity: payload.counts['accommodationCapacity'] ?? -1,
          roomOccupants: payload.counts['roomOccupants'] ?? -1,
          treasuryMinorUnits: payload.counts['treasuryMinorUnits'] ?? -1,
          stateIncomeAccruedTodayMinorUnits: payload.counts['stateIncomeAccruedTodayMinorUnits'] ?? -1,
          dailyWageBillMinorUnits: payload.counts['dailyWageBillMinorUnits'] ?? -1,
          unpaidWagesMinorUnits: payload.counts['unpaidWagesMinorUnits'] ?? -1,
          staff: payload.counts['staff'] ?? -1,
        };
      }),
  );
}

export async function latestCounts(page: Page): Promise<CountsSample | undefined> {
  const series = await countsSeries(page);
  return series[series.length - 1];
}

/**
 * The tick, read from `simulation/clock-state`.
 *
 * **Not from `simulation/status-counts`**, and that is a finding rather than a
 * detail: the worker skips a counts publication whose payload equals the last
 * one (`statusCountsEqual`, `src/simulation/worker/status-counts.ts`), and the
 * `tick` lives in the envelope beside `counts` rather than in it -- so an empty
 * prison publishes counts once and then never again, however long it runs. The
 * first version of this harness polled that tick and concluded the simulation
 * was frozen at 0 while construction was visibly progressing.
 */
export async function currentTick(page: Page): Promise<number> {
  return page.evaluate(() => {
    const messages = (window as unknown as TeeWindow).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number } };
      if (message.kind === 'simulation/clock-state') return message.payload?.tick ?? -1;
    }
    return -1;
  });
}

export async function currentClock(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const messages = (window as unknown as TeeWindow).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { clock?: unknown } };
      if (message.kind === 'simulation/clock-state') return message.payload?.clock ?? null;
    }
    return null;
  });
}

/**
 * The tab bar, by `data-tab` rather than by accessible name.
 *
 * `getByRole('button', { name: 'Build' })` matched two elements once the wall
 * tool was armed -- the tab and the Build panel's own arm control, whose label
 * changes -- and a strict-mode violation killed a ten-minute run. A tab is
 * addressed by its id here for the same reason a test addresses a room row by
 * `data-room`.
 */
export function tab(page: Page, id: 'overview' | 'build' | 'rooms' | 'security' | 'regime') {
  return page.locator(`.hud__tabs [data-tab="${id}"]`);
}

export async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

export async function panelText(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    if (node === null) return `${sel}: ABSENT`;
    if (node.hidden || node.getClientRects().length === 0) return `${sel}: not laid out`;
    return (node.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  }, selector);
}

/**
 * Every command in `commands` that puts a *named* buildable into the world.
 *
 * Both producers carry the id and neither is optional at this point:
 * `PlaceObject` at `src/main.ts:2647` and `PlaceBuildOrder` at
 * `src/main.ts:2597` are both handed `intent.definitionId`.
 */
export function placements(
  commands: readonly Record<string, unknown>[],
): readonly { readonly type: string; readonly definitionId: string }[] {
  return commands
    .filter((command) => command['type'] === 'PlaceObject' || command['type'] === 'PlaceBuildOrder')
    .map((command) => ({
      type: String(command['type']),
      definitionId: command['definitionId'] === undefined ? '<absent>' : String(command['definitionId']),
    }));
}

/**
 * Throws when a gesture placed something other than the buildable the page was
 * last asked for. **This is the durable half of issue #1017** and it is the
 * harness's job rather than each playtest's: every mouse gesture in this
 * directory goes through `press` or `drag`, so every playtest inherits it
 * without a line changing at its call site.
 *
 * ### What it compares, and why those two
 *
 * The left-hand side is `BuildIntentRecord.buildableId` -- the `data-buildable`
 * of the catalogue row the *browser* last dispatched a click at, recorded in
 * the capture phase before any application handler could run. The right-hand
 * side is the `definitionId` the world tool actually put on the command. A
 * click whose handler never ran leaves those two disagreeing, which is exactly
 * the state #1017 describes and exactly the state nothing could observe
 * before.
 *
 * ### The three things it deliberately does not do
 *
 * - **It does not complain about a gesture that produced no placement.** A
 *   press is also how `calibrate` bisects (`RemoveWall`, since ADR 0106; it
 *   was `RemoveObject` before the world press learned to resolve an edge),
 *   how a room is drawn (`DesignateRoom`) and how a playtest checks that a
 *   press on the HUD reaches nothing at all. Silence there is a legitimate
 *   result; a *wrong* object never is.
 * - **It does not complain when it does not know what was asked** -- before any
 *   catalogue row has been clicked, or after `.hud-build__remove` was pressed.
 *   See `BuildIntentRecord`.
 * - **It does not check the tile.** Where a command landed is the playtest's
 *   question; *what* it placed is the harness's, because the harness is what
 *   armed it.
 */
async function assertPlacedWhatWasAsked(
  page: Page,
  commands: readonly Record<string, unknown>[],
  gesture: string,
): Promise<void> {
  const placed = placements(commands);
  if (placed.length === 0) return;
  const intent = await buildIntent(page);
  const asked = intent?.buildableId;
  if (asked === undefined) return;
  const wrong = placed.filter((placement) => placement.definitionId !== asked);
  if (wrong.length === 0) return;
  throw new Error(
    `${gesture} placed ${JSON.stringify(wrong.map((placement) => `${placement.type} ${placement.definitionId}`))}` +
      ` but the Build panel was last asked for ${JSON.stringify(asked)}.` +
      ' The catalogue click did not reach the panel before the tool was armed (issue #1017).',
  );
}

export async function press(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(100);
  const produced = (await sentCommands(page)).slice(before);
  await assertPlacedWhatWasAsked(page, produced, `a press at ${x},${y}`);
  return produced;
}

/**
 * Returns what it produced, where it used to return nothing.
 *
 * The commands were already being sampled around every interesting call site
 * -- `buildAndPopulate`'s wall runs read `sentCommands` before and after this
 * function to log what each run emitted -- so handing them back removes a
 * duplicated pair of round trips rather than adding one. It is also what lets
 * the placement check above cover a dragged wall run and not only a press.
 */
export async function drag(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 8 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(150);
  const produced = (await sentCommands(page)).slice(before);
  await assertPlacedWhatWasAsked(page, produced, `a drag from ${a.x},${a.y} to ${b.x},${b.y}`);
  return produced;
}

/**
 * Measures the screen->tile transform against the real page, by bisection.
 *
 * `probe` is where the bisection starts, and it must be a point on **canvas a
 * pointer can actually reach**, together with the 64x64 pixels right and below
 * it -- the bisection walks one tile in each direction from there. The default
 * `(700, 300)` is canvas at 1440x900 and at 1920x1080, and it is *not* canvas
 * at every viewport: the HUD's right-hand rail opts back into pointer events
 * (`hud.css`, "Every interactive island opts back in") and reaches x=700 on a
 * narrower page, at which point every press below lands on a panel, no
 * `RemoveWall` is produced and this throws. A caller measuring more than one
 * viewport therefore finds a free square first and passes it in -- see
 * `tests/browser/world-scene-drag-under-the-hud.spec.ts`, which is where the
 * parameter came from (issue #878).
 *
 * `precisionPx` is how tightly the bisection is driven, and it is a **cost**
 * dial rather than a quality one: each halving is one more real press, and one
 * press is a mouse move, a press, a release, a settle and two reads of the
 * worker tee. `1` -- the default, and what every playtest here has always had
 * -- costs six presses per axis. A caller that only needs to land *inside* a
 * tile rather than on its exact centre can stop far earlier: at `16` the origin
 * is known to a quarter of a tile, so a computed tile centre still falls inside
 * the tile it names with 16px to spare, and it costs two presses per axis. The
 * gate named above uses that, because it repeats this calibration once per
 * viewport and the presses were the largest single cost in it.
 */
export async function calibrate(
  page: Page,
  probe: { readonly x: number; readonly y: number } = { x: 700, y: 300 },
  precisionPx = 1,
): Promise<{ originX: number; originY: number }> {
  await page.locator('.hud-build__remove').click();
  const probeX = probe.x;
  const probeY = probe.y;
  const at = async (x: number, y: number): Promise<{ x: number; y: number }> => {
    const commands = await press(page, x, y);
    const removal = commands.find((c) => c['type'] === 'RemoveWall');
    if (removal === undefined) throw new Error(`no RemoveWall from a press at ${x},${y}: ${JSON.stringify(commands)}`);
    return { x: removal['x'] as number, y: removal['y'] as number };
  };

  const base = await at(probeX, probeY);
  let lo = probeX;
  let hi = probeX + TILE;
  while (hi - lo > precisionPx) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(mid, probeY);
    if (tile.x === base.x) lo = mid;
    else hi = mid;
  }
  const originX = hi - (base.x + 1) * TILE;

  lo = probeY;
  hi = probeY + TILE;
  while (hi - lo > precisionPx) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(probeX, mid);
    if (tile.y === base.y) lo = mid;
    else hi = mid;
  }
  const originY = hi - (base.y + 1) * TILE;

  /*
   * And the tool goes back off, so the caller starts from nothing armed.
   *
   * **That is only true from #689.** Until then `armed = removing || armed`
   * kept the tool armed through this press, so calibrating left the *wall* tool
   * holding the pointer with `wall-brick` selected -- the panel's arrival
   * selection -- and the next bare `press` in a walk would have laid a wall
   * nobody asked for. Nothing caught it because every caller here reaches the
   * world through `armBuildable`.
   *
   * **The sentence that stood here until #1017 finished that thought with
   * "which reads the arm label before it clicks; the label was honest, so the
   * guard did the right thing for the wrong reason", and its premise was
   * false.** It is quoted rather than deleted because it is the load-bearing
   * half: an assumption about `armBuildable` that had been written down as a
   * premise of *this* paragraph's reasoning, and was relied on nowhere else in
   * this file only because nowhere else in this file wrote its reasoning down.
   * `armBuildable` read that label with no wait at all, so under load it was
   * the *previous* buildable's label -- the guard was reading a stale string
   * and agreeing with it. What made the old conclusion survive anyway is
   * narrower than the sentence claimed: the label is *eventually* honest, and
   * a helper reading it before the panel had redrawn was reading a string that
   * had not become honest yet.
   *
   * `armBuildable` no longer reads the label at all, so the paragraph's
   * conclusion now rests on something checkable: it waits for the panel's own
   * `data-selected` marker on the row it clicked and refuses to return until
   * `.hud-build__arm` reports `data-armed="true"`. It still needs to do
   * nothing here, and now for the right reason.
   */
  await page.locator('.hud-build__remove').click();
  return { originX, originY };
}

export const centreOf = (o: { originX: number; originY: number }, tx: number, ty: number) => ({
  x: o.originX + tx * TILE + TILE / 2,
  y: o.originY + ty * TILE + TILE / 2,
});

/**
 * How long `armBuildable` will wait for the Build panel to redraw under the
 * buildable it was asked for. Ten seconds is `playwright.config.ts`'s own
 * `expect.timeout`; a panel that has not answered a click in ten seconds is a
 * finding, not a slow machine.
 */
export const ARM_TIMEOUT_MS = 10_000;

/**
 * Selects a buildable in the Build catalogue and leaves the world tool armed
 * with it -- **or throws.** Issue #1017.
 *
 * ### What was wrong with the three lines this replaces
 *
 * They clicked the catalogue row and then read `.hud-build__arm`'s `innerText`
 * immediately, with nothing between the two. Playwright's `click()` resolves
 * when the input event has been dispatched, not when the application has
 * finished reacting to it, so under load the label read back was still the
 * *previous* buildable's -- and both of its branches then did the wrong thing
 * quietly. Reading "Stop placing" from the previous arming, it skipped the arm
 * click and left the old tool holding the pointer; reading "Place on map"
 * before the selection had moved, it armed the old selection. Either way the
 * next press put an object in the world that the playtest had not asked for,
 * **and nothing failed.** One act measured four of eighteen presses placing
 * the wrong object; another placed a bed where it had asked for a toilet.
 *
 * ### What it waits on instead, and why a stale DOM cannot satisfy it
 *
 * The panel's own record of which row is chosen:
 * `.hud-build__list [data-buildable="<id>"][data-selected="true"]`, set by
 * `paintCatalogue` in `src/ui/hud/build-panel.ts` in the same handler that
 * moves `selectedId`. The catalogue is a single-select `radiogroup`, so before
 * the click that attribute is `"true"` on a *different* row and `"false"` on
 * this one -- the pre-click DOM cannot satisfy the wait, which is the property
 * the label never had. `toHaveCount(1)` on the whole group is the other half:
 * it forbids the intermediate state in which two rows both claim to be
 * selected.
 *
 * **The one case where the wait is vacuous is stated rather than hidden:**
 * arming the buildable that was *already* selected. The condition then holds
 * before the click as well as after it. That case places the object the caller
 * asked for either way, so it costs nothing here -- and `press` and `drag`
 * check the command that comes out regardless of what this function believed.
 *
 * ### And it is loud
 *
 * Three assertions, each of which ends the run rather than returning: the row
 * became the selected one, it is the only selected one, and `.hud-build__arm`
 * reports `data-armed="true"` when this returns. `data-armed` rather than the
 * label because it is the machine carrier `paintArmed` maintains beside
 * `aria-pressed`, it is not a translated string, and `"Stop placing"` /
 * `"Place on map"` is a distinction two locales are free to erase. A helper
 * that arms the wrong object and throws is enormously better than one that
 * arms the wrong object and returns.
 */
export async function armBuildable(page: Page, id: string, timeoutMs = ARM_TIMEOUT_MS): Promise<void> {
  const row = page.locator(`.hud-build__list [data-buildable="${id}"]`);
  await row.click();

  await expect(row, `the Build panel never redrew with ${JSON.stringify(id)} selected`).toHaveAttribute(
    'data-selected',
    'true',
    { timeout: timeoutMs },
  );
  await expect(
    page.locator('.hud-build__list [data-buildable][data-selected="true"]'),
    `more than one catalogue row claimed to be selected while arming ${JSON.stringify(id)}`,
  ).toHaveCount(1, { timeout: timeoutMs });

  // Arming *to place* is what `data-armed` means; a tool armed to remove reads
  // `false` here, which is the state `calibrate` leaves behind and the state
  // this has to click out of. See `paintArmed`.
  const arm = page.locator('.hud-build__arm');
  if ((await arm.getAttribute('data-armed')) !== 'true') await arm.click();
  await expect(arm, `the arm control never reported itself armed for ${JSON.stringify(id)}`).toHaveAttribute(
    'data-armed',
    'true',
    { timeout: timeoutMs },
  );

  // Read a second time, after the arming: a redraw that arrived late enough to
  // land between the two waits would move the selection out from under the
  // tool that was just armed, and this is the only place that can see it.
  await expect(row, `arming ${JSON.stringify(id)} left a different catalogue row selected`).toHaveAttribute(
    'data-selected',
    'true',
    { timeout: timeoutMs },
  );
}

/**
 * Buys `quantity` of the material the given buildable is made of.
 *
 * **It has the same race `armBuildable` had, and #1017's fifth question is what
 * found it.** The buy row is repainted from the selection (`paintBuy` follows
 * `paintCatalogue` in the row's own activation handler), so reading whether it
 * is hidden, and then filling a quantity into it, immediately after the
 * catalogue click reads and fills the *previous* buildable's row. The cost is
 * quieter than the arming one and it is real: sixty bricks bought as sixty of
 * whatever was selected before, at that material's price, and the wall run
 * that follows then waits on a delivery that was never ordered.
 *
 * So it waits on the same marker for the same reason, before it reads
 * anything. Everything after that is unchanged.
 *
 * **It does not throw when no purchase is submitted, and that is deliberate.**
 * A refused purchase -- the treasury cannot cover it -- is a legitimate
 * outcome that several playtests here provoke on purpose, and the commands are
 * returned so a caller that cares can say so itself. What was silent was
 * *which* material, not whether one was bought.
 */
export async function buy(page: Page, buildableId: string, quantity: number): Promise<readonly Record<string, unknown>[]> {
  const row = page.locator(`.hud-build__list [data-buildable="${buildableId}"]`);
  await row.click();
  await expect(row, `the Build panel never redrew with ${JSON.stringify(buildableId)} selected before buying`).toHaveAttribute(
    'data-selected',
    'true',
    { timeout: ARM_TIMEOUT_MS },
  );

  const before = (await sentCommands(page)).length;
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(200);
  return (await sentCommands(page)).slice(before);
}

/**
 * Polls the Build panel's queue readout until it says nothing is left, and
 * answers the page-clock time at which it said so.
 */
export async function waitForQueueEmpty(page: Page, timeoutMs = 240_000): Promise<number> {
  const started = Date.now();
  await tab(page, 'build').click();
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    /*
     * **`(?<![0-9])` is load-bearing, and its absence was a measured defect.**
     * The readout is `hud.build.queue-count`, `'{count} waiting · {started}
     * being built'`, so a queue of ten renders `10 waiting · 0 being built` --
     * and the unanchored `/0 waiting . 0 being built/` this line carried until
     * 2026-08-30 matches that as a substring of `1`+`0 waiting · 0 being
     * built`. So did 20, 30, 40 and every other multiple of ten.
     *
     * What that cost, measured on `agent/640-playtest-just-in-time`: a
     * 24-segment perimeter reported "the queue is empty" at 10 still waiting,
     * the designation that followed was refused `zone.not-enclosed` because
     * the wall genuinely was not up, and the retry loop then hung on a control
     * that never became actionable. The reading it produced -- "zoning is
     * refused after the queue empties" -- was an artifact of this regex.
     *
     * Every caller inherits it: `buildAndPopulate` waits on this twice, and
     * its own perimeter passes through exactly `10 waiting` on the way down.
     */
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
      return Date.now() - started;
    }
    if (Date.now() - started > timeoutMs) throw new Error(`the build queue never emptied: ${text}`);
    await page.waitForTimeout(1000);
  }
}

/** Runs the clock forward until the worker reports a tick at or past `target`. */
export async function runUntilTick(page: Page, target: number, timeoutMs = 180_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) return;
    if (Date.now() - started > timeoutMs) throw new Error(`stuck at tick ${tick}, wanted ${target}`);
    await page.waitForTimeout(1000);
  }
}

export async function fastForwardToMax(page: Page): Promise<void> {
  // 1 -> 2 -> 4. Two presses from a paused/1x clock.
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
}

export interface PrisonOptions {
  readonly beds: number;
  readonly admits: number;
  readonly guards: number;
  readonly label: string;
}

/**
 * Builds an enclosed 6x6 cell at tiles (12,12)-(17,17) with `beds` beds and
 * one toilet, with the mouse, then admits `admits` prisoners.
 */
export async function buildAndPopulate(page: Page, options: PrisonOptions): Promise<{ originX: number; originY: number }> {
  const log = (line: string) => console.log(`[${options.label}] ${line}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Materials. 24 wall segments = 48 bricks, +1 for the toilet.
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', options.beds + 2);
  log(`after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  log(`clock after two Fast forward presses: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);
  log(`deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // Four wall runs around tiles 12..17.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    // `drag` samples the command stream itself since #1017 -- it has to, to
    // check that a run laid the buildable it was armed with -- so this reads
    // what it hands back instead of taking the same two samples again.
    const produced = await drag(page, run.a, run.b);
    log(`wall run ${run.name}: ${produced.length} command(s) -> ${JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  }
  log(`queue right after the wall runs (tick ${await currentTick(page)}): ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Wait for the Build panel to say every wall is up, the way a player does.
  const queueEmptyAt = await waitForQueueEmpty(page);
  log(`Build panel says the queue is empty at page t=${queueEmptyAt}ms, tick ${await currentTick(page)}`);

  // Zone it -- retrying, because the Rooms panel's enclosure verdict is read
  // off a world view a *snapshot* replaces and a completed wall does not mark
  // dirty (2026-08-29-playtest-ordering-and-the-second-room.md §7). How many
  // attempts this takes is itself the measurement.
  const zoneStarted = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'rooms').click();
    // The same class of read #1017 is about, one panel along: `data-collapsed`
    // is only meaningful once the tab switch has actually swapped the panels,
    // and a stale `"false"` here skips the toggle and leaves every locator
    // below aimed at a folded panel.
    await expect(page.locator('.hud-rooms')).toBeVisible({ timeout: ARM_TIMEOUT_MS });
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    /*
     * The same shape as `armBuildable`, one panel along, and for the same
     * reason (#1017, question 5). `rooms-panel.ts` carries `data-selected` on
     * the row and `data-armed` on `.hud-rooms__arm`, so both halves are
     * checkable rather than inferred.
     *
     * **And the arm press is conditional now, where it was unconditional.**
     * `.hud-rooms__arm` is a toggle: pressing it on an already-armed tool
     * *disarms* it, after which the drag below produces nothing and the
     * confirm reads `Designate 0 x 0` -- which looks exactly like a rectangle
     * the world refused, and was read as one on 2026-09-04
     * (`docs/research/2026-09-04-the-misplay.md` section 3b, withdrawn there).
     * What kept it working here is `standDownAfterConfirm`, which stands the
     * tool down on every confirm, so each pass round this loop happened to
     * start disarmed. That is a fact about the panel, not about this loop, and
     * the retry count is this function's headline measurement -- so it reads
     * the state instead of relying on it.
     */
    const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
    await roomRow.click();
    await expect(roomRow, 'the Rooms panel never redrew with room.cell selected').toHaveAttribute(
      'data-selected',
      'true',
      { timeout: ARM_TIMEOUT_MS },
    );
    const roomArm = page.locator('.hud-rooms__arm');
    if ((await roomArm.getAttribute('data-armed')) !== 'true') await roomArm.click();
    await expect(roomArm, 'the Rooms panel arm control never reported itself armed').toHaveAttribute(
      'data-armed',
      'true',
      { timeout: ARM_TIMEOUT_MS },
    );
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    log(
      `designate attempt ${attempts} at t+${Date.now() - zoneStarted}ms: rooms=${counts?.rooms}` +
        ` | panel said ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))}` +
        ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 12) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(5000);
  }
  const zoned = await latestCounts(page);
  log(`zoned after ${attempts} attempt(s), ${Date.now() - zoneStarted}ms after the queue emptied: rooms=${zoned?.rooms} accommodationCapacity=${zoned?.accommodationCapacity}`);

  // Beds and a toilet, inside.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  let placed = 0;
  for (const row of [12, 14]) {
    for (let column = 12; column <= 17 && placed < options.beds; column += 1) {
      const point = centreOf(origin, column, row);
      const commands = await press(page, point.x, point.y);
      if (commands.length === 0) log(`bed at (${column},${row}) produced NO command`);
      placed += 1;
    }
  }
  await armBuildable(page, 'toilet-brick');
  await press(page, centreOf(origin, 12, 16).x, centreOf(origin, 12, 16).y);
  log(`${placed} bed order(s) + 1 toilet placed`);

  await waitForQueueEmpty(page);
  await page.waitForTimeout(2000);
  const built = await latestCounts(page);
  log(`at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);
  log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await tab(page, 'rooms').click();
  log(`rooms panel: ${await panelText(page, '.hud-rooms')}`);

  // Admit, from the Overview tab's Intake panel.
  await tab(page, 'overview').click();
  const admitMs: number[] = [];
  for (let index = 0; index < options.admits; index += 1) {
    const pressStarted = Date.now();
    await page.locator('.hud-intake__admit').click();
    admitMs.push(Date.now() - pressStarted);
    await page.waitForTimeout(150);
  }
  // How long each press *took*, which is how long Playwright had to wait for
  // the control to be actionable. A player pressing Admit twelve times pays
  // this twelve times.
  log(`admit press durations (ms): ${JSON.stringify(admitMs)}`);
  log(`admit control disabled attribute now: ${await page.locator('.hud-intake__admit').getAttribute('disabled')}`);
  await page.waitForTimeout(2000);
  log(`intake panel after ${options.admits} admissions: ${await panelText(page, '.hud-intake')}`);
  log(`no-place warning data: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
  log(`status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  if (options.guards > 0) {
    await tab(page, 'security').click();
    // `staff-role.guard`, not `staff.guard`: the catalogue ids are
    // `staff-role.*` (`src/content/staff-role-catalog.ts:148`). The row is
    // clicked only if it is there -- the panel already selects Guard on
    // arrival, so a missing row must not stop the hire.
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    else log(`no [data-staff-role] rows: ${JSON.stringify(await panelText(page, '.hud-staff__list'))}`);
    log(`hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    for (let index = 0; index < options.guards; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1500);
    const hired = await latestCounts(page);
    log(`after hiring ${options.guards}: staff=${hired?.staff} dailyWageBill=${hired?.dailyWageBillMinorUnits} funds=${hired?.treasuryMinorUnits}`);
    log(`staff panel: ${await panelText(page, '.hud-staff')}`);
  }

  return origin;
}

export function reportBoundary(label: string, series: readonly CountsSample[], boundaryTick: number): void {
  const before = [...series].filter((s) => s.tick < boundaryTick).pop();
  const after = series.find((s) => s.tick >= boundaryTick);
  console.log(`[${label}] === DAY BOUNDARY at tick ${boundaryTick} ===`);
  console.log(`[${label}] last sample before: ${JSON.stringify(before)}`);
  console.log(`[${label}] first sample at/after: ${JSON.stringify(after)}`);
  if (before !== undefined && after !== undefined) {
    console.log(
      `[${label}] treasury delta across the boundary = ${after.treasuryMinorUnits - before.treasuryMinorUnits}` +
        ` | accrual just before = ${before.stateIncomeAccruedTodayMinorUnits}` +
        ` | roster = ${after.prisoners} | residents = ${after.roomOccupants}`,
    );
  }
}
