import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp, panelText, tab } from './playtest-harness';

/**
 * **Does the errand happen when a player watches it?**
 *
 * ADR 0093 (`docs/adr/0093-a-carry-is-an-action.md`, accepted 2026-09-03)
 * landed the mechanic the same morning this file was written: `JobSystem` was
 * deleted, `action.carry` was appended to `DEFAULT_ACTIONS`, and
 * `src/simulation/operations/carry-executor.ts` and `delivery-route.ts` are
 * new. Nothing had ever seen the errand happen through the user interface.
 * This file is the instrument that does.
 *
 * ## What it builds, and why it builds it that way
 *
 * `DeliveryBayCarryRoute` gates the route on each room holding the capability
 * its own authored requirement names (`delivery-route.ts`,
 * `DELIVERY_BAY_CAPABILITY`/`STORAGE_ROOM_CAPABILITY`): a `room.delivery-bay`
 * with `'delivery-access'` standing in it, and a `room.storage-room` with
 * `'item-storage'`. So the prison needs
 * `object.loading-dock-door` (buildable `loading-dock-door-wooden`, 3 planks)
 * inside the bay and two `object.storage-rack` (`storage-rack-wooden`, 1 plank
 * each) inside the storeroom -- *furnished*, not merely zoned.
 *
 * Three rooms in one row, sharing their vertical walls, with two doors so a
 * carrier can walk between them -- and placed so that the tile an admitted
 * prisoner arrives on, (16,16), is **inside** the storeroom:
 *
 * ```
 *          x=8        x=12   x=14      x=17
 *   y=14   +----------+------+---------+
 *          |   BAY    | CELL |  STORE  |
 *   y=16   |        [door] [door]  *   |   <- the doors, and * = (16,16)
 *          |   4x4    | 2x4  |   3x4   |
 *   y=17   |          |      |         |
 *   y=18   +----------+------+---------+
 * ```
 *
 * `room.delivery-bay` needs 4x4 and `room.storage-room` 3x3
 * (`src/content/room-catalog.ts:170-179`), and both need `enclosed`;
 * `roomPerimeterEnclosure` is satisfied by a shared edge and by a door
 * (`src/simulation/rooms/enclosure.ts`, *"A sealed room can have a door in
 * it"*). Every door is `door-wooden`, `grade.general`, `minSecurityClearance:
 * 0`, initial state `closed` -- and `closed` is not `locked`, so a prisoner
 * crosses it (`src/simulation/navigation/door.ts`).
 *
 * The cell sits **between** the two logistics rooms deliberately, so the two
 * legs of a carry go in opposite directions and each is separately visible.
 *
 * **Why the block wraps the arrival tile is a finding, not a preference.** The
 * first run of this file put the block at y=10..13 and left (16,16) outside a
 * fully sealed perimeter whose only two doors were internal. The prison built
 * fine, both rooms zoned and furnished, the delivery landed in the bay and the
 * board raised the carry -- and the prisoner stood on (16,16) for 12,000
 * ticks, never once moving, because nothing they wanted was reachable. The
 * errand was selected and the job failed `unreachable`. That measurement is
 * kept in the report; the layout below is what makes the *mechanic*
 * observable.
 *
 * **The build order avoids the bootstrap trap ADR 0093 recorded.** The cell is
 * zoned, furnished and populated *before* the bay and the storeroom are
 * furnished, so every delivery up to that point lands directly in the
 * construction container and the bricks that build the prison are never
 * waiting on a carrier who does not exist yet.
 *
 * ## Why the numeric route and not the mouse
 *
 * Every order here is placed through the Build panel's typed route --
 * `.hud-build__coordinates`: two number fields, an edge chooser and a Place
 * button (`src/ui/hud/build-panel.ts`, "the numeric route (secondary)"). That
 * is a shipped player route, and it is used **instead of** dragging on the
 * canvas because a wall drag that passes under a HUD island is silently
 * truncated (issue #878). A drag-built prison is a prison you have to verify
 * before you can measure anything else in it; a typed order is one command per
 * press, and this file counts them.
 *
 * ## What it reads, and from where
 *
 * Every simulation figure comes out of one `simulation/request-snapshot`
 * (`src/simulation/worker/state-machine.ts`), which mutates nothing:
 * `simulation.operations.jobs` (the carry job's `state`, `leg`,
 * `assignedWorkerId`), `simulation.operations.containers` (the bay's
 * `container:<instanceId>` and `construction-materials`),
 * `simulation.prisoners.components` (`actionIndex`, `actionPhase`, `tileX`,
 * `tileY`, `needs.hunger`) and `simulation.prisoners.roomInstanceDefinitions`.
 * The **player-visible** side is read separately, off the DOM: the Regime
 * tab's roster row activity cell, which is the only place in the shipped HUD
 * that names what a prisoner is doing.
 *
 * ## It is not a gate
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so
 * nothing in CI collects a `.playtest.ts`. It asserts only the things that
 * must hold for the measurement to mean anything (the prison got built, a
 * prisoner exists); every finding is a logged reading.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5281 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-the-errand-walks.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or the run proceeds with no actor
 * sprites (`docs/AGENT_WORKFLOW.md` records a playtest that ran green with
 * none).
 */

// ---- the prison, as tile coordinates -------------------------------------
/*
 * **The block is placed around (16,16), which is where an admitted prisoner
 * arrives** -- `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, the one definition
 * that is also the tile a hired staff member first stands on. The first run of
 * this file put the block at y=10..13 and left (16,16) *outside* it: the prison
 * was sealed, the two doors it had were both internal, and the prisoner stood
 * on (16,16) for **12,000 ticks** unable to reach their own cell, let alone the
 * bay. The errand was selected and the job failed `unreachable`. So the
 * storeroom now contains the arrival tile, and every room is reachable from it
 * through an internal door -- no external door is needed at all.
 */
const ROOM_TOP = 14;
const ROOM_BOTTOM = 17; // inclusive
const BAY_LEFT = 8; // 8..11, 4x4, the minimum a `room.delivery-bay` may be
const CELL_LEFT = 12; // 12..13, 2x4
const STORE_LEFT = 14; // 14..16, 3x4 -- and (16,16) is inside it
const RIGHT_WALL = 17; // the west edge of this column is the store's east boundary
const DOOR_ROW = 16; // the row (16,16) sits on, so both doors are on the arrival's own line

const CONSTRUCTION_CONTAINER = 'construction-materials';
const BRICK = 'item.brick';
const PLANK = 'item.wood-plank';

interface ProbeWindow {
  lockstateSentToWorker?: unknown[];
  lockstateFromWorker?: unknown[];
  lockstateAsk?: (kind: string, payload: unknown) => Promise<unknown>;
}

/** The tee `playtest-harness.installTee` installs, plus a direct question channel to the worker. */
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    const waiters = new Map<string, (message: unknown) => void>();
    let instance: Worker | undefined;

    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        instance = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as { kind?: string; replyTo?: string };
          const replyTo = data.replyTo;
          if (replyTo !== undefined) {
            const waiter = waiters.get(replyTo);
            if (waiter !== undefined) {
              waiters.delete(replyTo);
              waiter(event.data);
              return;
            }
          }
          const kind = data.kind ?? '';
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

    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    const probe = window as unknown as ProbeWindow;
    probe.lockstateSentToWorker = sent;
    probe.lockstateFromWorker = received;
    probe.lockstateAsk = (kind: string, payload: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        if (instance === undefined) {
          reject(new Error('no simulation worker has been constructed yet'));
          return;
        }
        const messageId = crypto.randomUUID();
        const timer = setTimeout(() => {
          waiters.delete(messageId);
          reject(new Error(`the worker did not answer "${kind}" within 20s`));
        }, 20_000);
        waiters.set(messageId, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        instance.postMessage({ protocolVersion: 1, messageId, kind, payload });
      });
  });
}

async function currentTick(page: Page): Promise<number> {
  return page.evaluate(() => {
    const messages = (window as unknown as ProbeWindow).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number } };
      if (message.kind === 'simulation/clock-state') return message.payload?.tick ?? -1;
    }
    return -1;
  });
}

interface JobReading {
  readonly id: string;
  readonly state: string;
  readonly leg: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly sourceContainerId: string;
  readonly sourceTile: { x: number; y: number };
  readonly destinationContainerId: string;
  readonly destinationTile: { x: number; y: number };
  readonly assignedWorkerId?: number;
  readonly failReason?: string;
  readonly createdAtTick: number;
}

interface PrisonerReading {
  readonly slot: number;
  readonly actionIndex: number;
  readonly actionPhase: number;
  readonly phaseStartedAtTick: number;
  readonly tile: { x: number; y: number };
  readonly hunger: number;
  readonly intakeStage: number;
}

interface RoomReading {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: { x: number; y: number };
  readonly width?: number;
  readonly height?: number;
}

interface WorkerReading {
  readonly tick: number;
  readonly treasuryMinorUnits: number;
  readonly jobs: readonly JobReading[];
  readonly prisoners: readonly PrisonerReading[];
  readonly rooms: readonly RoomReading[];
  /** `[containerId, [[itemId, quantity, reserved], ...]]`, every container. */
  readonly containers: readonly [string, readonly [string, number, number][]][];
  readonly pending: readonly { orderId: string; itemId: string; quantity: number; arrivesAtTick: number }[];
  readonly orderStates: Readonly<Record<string, number>>;
}

async function readWorker(page: Page): Promise<WorkerReading> {
  return page.evaluate(async () => {
    const probe = window as unknown as ProbeWindow;
    if (probe.lockstateAsk === undefined) throw new Error('the probe was not installed');
    const reply = (await probe.lockstateAsk('simulation/request-snapshot', { reason: 'consistency-check' })) as {
      kind?: string;
      payload?: { tick?: number; snapshot?: { data?: Record<string, unknown> } };
    };
    if (reply.kind !== 'simulation/snapshot') throw new Error(`asked for a snapshot and the worker answered "${String(reply.kind)}"`);
    const bundle = (reply.payload?.snapshot?.data ?? {}) as {
      construction?: { orders?: { state: string }[] };
      simulation?: {
        economy?: {
          treasury?: { balanceMinorUnits?: number };
          procurement?: { pending?: { orderId: string; itemId: string; quantity: number; arrivesAtTick: number }[] };
        };
        operations?: {
          jobs?: JobReadingRaw[];
          containers?: [string, [string, number, number][]][];
        };
        prisoners?: {
          components?: {
            activeLength?: number;
            actionIndex?: number[];
            actionPhase?: number[];
            phaseStartedAtTick?: number[];
            tileX?: number[];
            tileY?: number[];
            intakeStage?: number[];
            needs?: { hunger?: number[] };
          };
          roomInstanceDefinitions?: RoomReading[];
        };
      };
    };
    type JobReadingRaw = {
      id: string;
      state: string;
      leg: string;
      itemId: string;
      quantity: number;
      sourceContainerId: string;
      sourceTile: { x: number; y: number };
      destinationContainerId: string;
      destinationTile: { x: number; y: number };
      assignedWorkerId?: number;
      failReason?: string;
      createdAtTick: number;
    };

    const components = bundle.simulation?.prisoners?.components ?? {};
    const active = components.activeLength ?? 0;
    const prisoners = [];
    for (let slot = 0; slot < active; slot += 1) {
      prisoners.push({
        slot,
        actionIndex: components.actionIndex?.[slot] ?? -99,
        actionPhase: components.actionPhase?.[slot] ?? -99,
        phaseStartedAtTick: components.phaseStartedAtTick?.[slot] ?? -99,
        tile: { x: components.tileX?.[slot] ?? -99, y: components.tileY?.[slot] ?? -99 },
        hunger: components.needs?.hunger?.[slot] ?? -99,
        intakeStage: components.intakeStage?.[slot] ?? -99,
      });
    }

    const orderStates: Record<string, number> = {};
    for (const order of bundle.construction?.orders ?? []) orderStates[order.state] = (orderStates[order.state] ?? 0) + 1;

    return {
      tick: reply.payload?.tick ?? -1,
      treasuryMinorUnits: bundle.simulation?.economy?.treasury?.balanceMinorUnits ?? Number.NaN,
      jobs: (bundle.simulation?.operations?.jobs ?? []).map((job) => ({ ...job })),
      prisoners,
      rooms: (bundle.simulation?.prisoners?.roomInstanceDefinitions ?? []).map((room) => ({ ...room })),
      containers: bundle.simulation?.operations?.containers ?? [],
      pending: bundle.simulation?.economy?.procurement?.pending ?? [],
      orderStates,
    } as WorkerReading;
  });
}

function stock(reading: WorkerReading, containerId: string, itemId: string): { quantity: number; reserved: number } {
  const container = reading.containers.find((entry) => entry[0] === containerId);
  const line = (container?.[1] ?? []).find((entry) => entry[0] === itemId);
  return { quantity: line?.[1] ?? 0, reserved: line?.[2] ?? 0 };
}

// ---- the Build panel's typed route --------------------------------------

async function selectBuildable(page: Page, id: string): Promise<void> {
  const row = page.locator(`.hud-build__list [data-buildable="${id}"]`);
  await expect(row).toHaveCount(1);
  await row.click();
}

async function openCoordinates(page: Page): Promise<void> {
  const section = page.locator('.hud-build__coordinates');
  const body = section.locator('> .ui-section__body');
  if (await body.isHidden()) await section.locator('> .ui-section__header').click();
  await expect(body).toBeVisible();
}

/**
 * One typed order, and the commands it produced.
 *
 * `edge` is passed only for a wall or a door; `edgeChooserShown`
 * (`src/ui/hud/build-panel.ts`) hides the chooser for anything that places an
 * object, and a hidden chooser reports the default (#531).
 */
async function place(page: Page, buildableId: string, x: number, y: number, edge?: 'north' | 'west'): Promise<number> {
  await selectBuildable(page, buildableId);
  const before = await sentCommandCount(page);
  const coords = page.locator('.hud-build__coords .ui-number__input');
  await coords.nth(0).fill(String(x));
  await coords.nth(1).fill(String(y));
  if (edge !== undefined) await page.locator(`.hud-build__coordinates [data-choice="${edge}"]`).click();
  await page.locator('.hud-build__coordinates .ui-action').last().click();
  return (await sentCommandCount(page)) - before;
}

async function sentCommandCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      ((window as unknown as ProbeWindow).lockstateSentToWorker ?? []).filter(
        (message) => (message as { kind?: string }).kind === 'simulation/submit-command',
      ).length,
  );
}

async function buy(page: Page, buildableId: string, quantity: number): Promise<void> {
  await selectBuildable(page, buildableId);
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(200);
}

async function fastForwardToMax(page: Page): Promise<void> {
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
}

async function pause(page: Page): Promise<void> {
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(200);
}

/** Waits until every build order has left the queue, reporting the states it saw. */
async function waitForQueueEmpty(page: Page, label: string, timeoutMs = 200_000): Promise<void> {
  const started = Date.now();
  // The Build tab first, and it is load-bearing: `panelText` answers "not laid
  // out" for a hidden node, and the emptiness test below reads that as an empty
  // queue. Read from another tab it would return immediately, every time.
  await tab(page, 'build').click();
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
      console.log(`[${label}] queue empty at tick ${await currentTick(page)} after ${Date.now() - started}ms`);
      return;
    }
    if (Date.now() - started > timeoutMs) {
      const reading = await readWorker(page);
      throw new Error(
        `[${label}] the queue never emptied in ${timeoutMs}ms: ${text.replace(/\n/g, ' | ')}` +
          ` | orders ${JSON.stringify(reading.orderStates)}` +
          ` | bricks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, BRICK))}` +
          ` | planks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, PLANK))}`,
      );
    }
    await page.waitForTimeout(1000);
  }
}

async function runUntilTick(page: Page, target: number, timeoutMs = 200_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) return;
    if (Date.now() - started > timeoutMs) throw new Error(`stuck at tick ${tick}, wanted ${target}`);
    await page.waitForTimeout(500);
  }
}

/**
 * The activity cell of every roster row, as a player reads it, off the Regime
 * tab -- `.hud-regime__roster-activity`, painted from
 * `formatPrisonerActivity` (`src/ui/hud/regime-panel.ts`), which is the only
 * place in the shipped HUD that names what a prisoner is doing.
 */
async function rosterActivities(page: Page): Promise<readonly string[]> {
  await tab(page, 'regime').click();
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
      // The rows are pooled: the panel lays out `PRISONER_ROSTER_ROW_LIMIT` of
      // them and hides the ones no prisoner fills. Reading them all reports
      // three empty strings beside every real row, which is an artefact of the
      // pool and not something a player sees.
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => {
        const activity = row.querySelector<HTMLElement>('.hud-regime__roster-activity');
        const name = row.querySelector<HTMLElement>('.hud-regime__roster-name');
        return `${(name?.textContent ?? '?').trim()}: ${(activity?.textContent ?? 'NO ACTIVITY CELL').trim()}`;
      }),
  );
}

const ACTION_PHASES = ['idle', 'travelling', 'performing'];
const INTAKE_STAGES = ['arrived', 'searched', 'classified', 'assigned', 'completed'];

function describePrisoner(prisoner: PrisonerReading, actionIds: readonly string[]): string {
  const action = prisoner.actionIndex >= 0 ? (actionIds[prisoner.actionIndex] ?? `#${prisoner.actionIndex}`) : 'none';
  return (
    `slot ${prisoner.slot} tile (${prisoner.tile.x},${prisoner.tile.y})` +
    ` ${action}/${ACTION_PHASES[prisoner.actionPhase] ?? prisoner.actionPhase}` +
    ` since ${prisoner.phaseStartedAtTick} hunger ${prisoner.hunger}` +
    ` intake ${INTAKE_STAGES[prisoner.intakeStage] ?? prisoner.intakeStage}`
  );
}

function describeJob(job: JobReading): string {
  return (
    `${job.id} ${job.state}/${job.leg} ${job.quantity}x${job.itemId}` +
    ` ${job.sourceContainerId}(${job.sourceTile.x},${job.sourceTile.y})` +
    ` -> ${job.destinationContainerId}(${job.destinationTile.x},${job.destinationTile.y})` +
    ` worker ${job.assignedWorkerId ?? '-'}${job.failReason === undefined ? '' : ` failed:${job.failReason}`}`
  );
}

test.describe('the errand, watched through the interface', () => {
  test('a delivery lands in the bay and a prisoner carries it to the storeroom', async ({ page }) => {
    const log = (line: string) => console.log(`[errand] ${line}`);
    /*
     * `DEFAULT_ACTIONS` order, carried here as data because the browser bundle
     * does not expose the catalogue to the page. Read off
     * `src/simulation/prisoners/actions.ts` at the commit this file landed on,
     * and cross-checked at run time: every sample prints the roster's own
     * label beside the index this array decodes, so a drift shows up as
     * `action.carry` next to a roster cell that does not say "Errand".
     */
    const ACTION_IDS = [
      'action.sleep',
      'action.eat-meal',
      'action.eat-in-cell',
      'action.use-toilet',
      'action.shower',
      'action.yard-recreation',
      'action.common-room-recreation',
      'action.classroom-education',
      'action.free-association',
      'action.laundry-work',
      'action.kitchen-work',
      'action.carry',
    ];

    await installProbe(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    await openCoordinates(page);

    /**
     * One sample of everything, worker side and DOM side, as one line.
     *
     * The two halves are read a few hundred milliseconds apart -- the snapshot
     * request first, then the roster off the DOM -- so a disagreement of one
     * reconsideration cycle between them is the instrument and not a finding.
     * Where the roster is the claim under test the sample is taken with the
     * clock **paused**, and those lines say so.
     */
    const sample = async (): Promise<{ reading: WorkerReading; line: string }> => {
      const reading = await readWorker(page);
      const activities = await rosterActivities(page);
      return {
        reading,
        line:
          `tick ${reading.tick} day-tick ${reading.tick % 2400}` +
          ` | jobs [${reading.jobs.map(describeJob).join(' ;; ')}]` +
          ` | ${reading.prisoners.map((p) => describePrisoner(p, ACTION_IDS)).join(' ;; ')}` +
          ` | bay ${JSON.stringify(reading.containers.filter((c) => c[0].startsWith('container:')))}` +
          ` | construction bricks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, BRICK))}` +
          ` | ROSTER ${JSON.stringify(activities)}`,
      };
    };

    // ---- act 1: materials, while nothing can carry them -------------------
    // 32 wall segments at 2 bricks each plus a toilet: 65. 2 doors + 1 bed +
    // 2 racks + a 3-plank dock door: 8 planks. Bought with the clock paused,
    // so the purchase costs no ticks (ADR 0051: a due command is dispatched
    // when it is submitted, even paused).
    await buy(page, 'wall-brick', 80);
    await buy(page, 'bed-wooden', 12);
    log(`strip after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    await fastForwardToMax(page);
    await runUntilTick(page, 130);
    await pause(page);
    let reading = await readWorker(page);
    log(`tick ${reading.tick}: bricks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, BRICK))} planks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, PLANK))} pending ${reading.pending.length}`);
    log(`containers now: ${JSON.stringify(reading.containers.map((c) => c[0]))}`);

    // ---- act 2: the shell, one typed order at a time, clock paused --------
    let commands = 0;
    let orders = 0;
    for (let x = BAY_LEFT; x <= RIGHT_WALL - 1; x += 1) {
      commands += await place(page, 'wall-brick', x, ROOM_TOP, 'north');
      commands += await place(page, 'wall-brick', x, ROOM_BOTTOM + 1, 'north');
      orders += 2;
    }
    for (const columnX of [BAY_LEFT, CELL_LEFT, STORE_LEFT, RIGHT_WALL]) {
      for (let y = ROOM_TOP; y <= ROOM_BOTTOM; y += 1) {
        const isDoor = (columnX === CELL_LEFT || columnX === STORE_LEFT) && y === DOOR_ROW;
        commands += await place(page, isDoor ? 'door-wooden' : 'wall-brick', columnX, y, 'west');
        orders += 1;
      }
    }
    log(`shell: ${orders} typed orders produced ${commands} commands (one each is what the numeric route promises)`);
    expect(commands).toBe(orders);

    await fastForwardToMax(page);
    await waitForQueueEmpty(page, 'shell');
    reading = await readWorker(page);
    log(`after the shell at tick ${reading.tick}: orders ${JSON.stringify(reading.orderStates)} bricks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, BRICK))} planks ${JSON.stringify(stock(reading, CONSTRUCTION_CONTAINER, PLANK))}`);

    // ---- act 3: the cell FIRST, which is what dissolves the bootstrap -----
    /**
     * Designates a rectangle through the Rooms panel's **typed** route:
     * `.hud-rooms__coord-{x,y,width,height}`, then
     * `.hud-rooms__coordinates-submit` to adopt the rectangle as pending, then
     * `.hud-rooms__confirm` to designate it (`src/ui/hud/rooms-panel.ts`).
     *
     * Retried, because the panel's enclosure verdict is read off a world view a
     * *snapshot* replaces and a completed wall does not mark dirty
     * (`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` §7).
     * How many attempts it takes is itself a measurement, and the clock is left
     * running through it for the same reason -- a paused session publishes no
     * new snapshot for the panel to re-read.
     */
    const zone = async (roomId: string, x: number, y: number, width: number, height: number): Promise<boolean> => {
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        await tab(page, 'rooms').click();
        const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
        if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click();
        const form = page.locator('.hud-rooms__coordinates');
        const body = form.locator('> .ui-section__body');
        if (await body.isHidden()) await form.locator('> .ui-section__header').click();
        await page.locator('.hud-rooms__coord-x .ui-number__input').fill(String(x));
        await page.locator('.hud-rooms__coord-y .ui-number__input').fill(String(y));
        await page.locator('.hud-rooms__coord-width .ui-number__input').fill(String(width));
        await page.locator('.hud-rooms__coord-height .ui-number__input').fill(String(height));
        await page.locator('.hud-rooms__coordinates-submit').click();
        await page.waitForTimeout(200);
        const enclosure = await panelText(page, '.hud-rooms__enclosure-value');
        const area = await panelText(page, '.hud-rooms__area-value');
        await page.locator('.hud-rooms__confirm').click();
        await page.waitForTimeout(700);
        const after = await readWorker(page);
        const got = after.rooms.some((room) => room.roomCatalogId === roomId && room.anchorTile.x === x && room.anchorTile.y === y);
        log(
          `zone ${roomId} at (${x},${y}) ${width}x${height} attempt ${attempt}: ${got ? 'ACCEPTED' : 'not registered'}` +
            ` | panel enclosure=${JSON.stringify(enclosure)} area=${JSON.stringify(area)}` +
            ` | status ${JSON.stringify(await panelText(page, '.hud-rooms__status'))}` +
            ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
        );
        if (got) return true;
        await page.waitForTimeout(2500);
      }
      return false;
    };

    const cellZoned = await zone('room.cell', CELL_LEFT, ROOM_TOP, STORE_LEFT - CELL_LEFT, ROOM_BOTTOM - ROOM_TOP + 1);
    expect(cellZoned, 'the cell has to be a room before anything can be placed in it').toBe(true);

    await tab(page, 'build').click();
    await openCoordinates(page);
    await place(page, 'bed-wooden', CELL_LEFT, ROOM_TOP);
    await place(page, 'toilet-brick', CELL_LEFT + 1, ROOM_TOP);
    await waitForQueueEmpty(page, 'cell-furniture');
    await tab(page, 'rooms').click();
    log(`rooms panel with the cell furnished: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);

    // ---- act 4: one prisoner ----------------------------------------------
    await tab(page, 'overview').click();
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(1200);
    log(`intake panel: ${(await panelText(page, '.hud-intake')).replace(/\n/g, ' | ')}`);

    const admittedAt = await currentTick(page);
    for (let attempt = 0; attempt < 45; attempt += 1) {
      reading = await readWorker(page);
      const first = reading.prisoners[0];
      if (first !== undefined && first.intakeStage >= INTAKE_STAGES.indexOf('completed')) break;
      await page.waitForTimeout(700);
    }
    reading = await readWorker(page);
    log(`intake completed by tick ${reading.tick} (admitted around ${admittedAt}): ${reading.prisoners.map((p) => describePrisoner(p, ACTION_IDS)).join(' ;; ')}`);
    expect(reading.prisoners.length, 'a prisoner has to exist for anything to carry').toBeGreaterThan(0);

    // ---- act 5: the two logistics rooms, zoned and then furnished ---------
    const bayZoned = await zone('room.delivery-bay', BAY_LEFT, ROOM_TOP, CELL_LEFT - BAY_LEFT, ROOM_BOTTOM - ROOM_TOP + 1);
    const storeZoned = await zone('room.storage-room', STORE_LEFT, ROOM_TOP, RIGHT_WALL - STORE_LEFT, ROOM_BOTTOM - ROOM_TOP + 1);
    expect(bayZoned && storeZoned, 'both ends of the route have to be zoned').toBe(true);

    reading = await readWorker(page);
    log(`rooms: ${reading.rooms.map((room) => `${room.instanceId} @(${room.anchorTile.x},${room.anchorTile.y}) ${room.width}x${room.height}`).join(' ;; ')}`);

    await tab(page, 'build').click();
    await openCoordinates(page);
    // A delivery still lands directly at this point, because neither room holds
    // its capability yet -- so these three orders cannot be waiting on a
    // carrier, which is the bootstrap ADR 0093's landing change measured.
    await place(page, 'loading-dock-door-wooden', BAY_LEFT, ROOM_BOTTOM);
    await place(page, 'storage-rack-wooden', STORE_LEFT, ROOM_BOTTOM);
    await place(page, 'storage-rack-wooden', STORE_LEFT + 1, ROOM_BOTTOM);
    await waitForQueueEmpty(page, 'logistics-furniture');
    reading = await readWorker(page);
    log(`after furnishing both ends at tick ${reading.tick}: orders ${JSON.stringify(reading.orderStates)}`);
    await tab(page, 'rooms').click();
    log(`rooms panel with both ends furnished: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);

    // ---- act 6: buy something, and watch it land in the bay ---------------
    const beforeBuy = await readWorker(page);
    log(`ROUTE SHOULD NOW BE LIVE. tick ${beforeBuy.tick}, jobs ${beforeBuy.jobs.length}, containers ${JSON.stringify(beforeBuy.containers.map((c) => c[0]))}`);

    await tab(page, 'build').click();
    await buy(page, 'wall-brick', 10);
    log(`bought 10 bricks at tick ${await currentTick(page)}; a delivery is due 100 ticks later`);

    // ---- act 7: the watch window ------------------------------------------
    // The first `work` block of `GENERAL_POPULATION_REGIME` is 500-1000 of the
    // day and the second 1300-1800 (`src/simulation/prisoners/regime.ts`), so
    // a carry can only be *selected* inside one of those. A carry already in
    // flight is not cut at the boundary (ADR 0093 Consequences).
    let lastLine = '';
    let jobAppearedAt = -1;
    let carrySelectedAt = -1;
    let pickedUpAt = -1;
    let completedAt = -1;
    const carryTiles: string[] = [];
    const watchStarted = Date.now();
    while (Date.now() - watchStarted < 120_000) {
      const { reading: now, line } = await sample();
      const comparable = line.replace(/tick \d+ day-tick \d+/, '').replace(/since \d+/g, '');
      if (comparable !== lastLine) {
        log(line);
        lastLine = comparable;
      }
      const job = now.jobs[now.jobs.length - 1];
      const prisoner = now.prisoners[0];
      if (job !== undefined && jobAppearedAt < 0) {
        jobAppearedAt = now.tick;
        log(`>> a carry job is on the board at tick ${now.tick}: ${describeJob(job)}`);
      }
      if (prisoner !== undefined && ACTION_IDS[prisoner.actionIndex] === 'action.carry') {
        if (carrySelectedAt < 0) {
          carrySelectedAt = now.tick;
          log(`>> THE PRISONER TOOK THE ERRAND at tick ${now.tick}. ROSTER SAYS ${JSON.stringify(await rosterActivities(page))}`);
        }
        carryTiles.push(`t${now.tick} (${prisoner.tile.x},${prisoner.tile.y}) ${ACTION_PHASES[prisoner.actionPhase]} leg ${job?.leg ?? '-'} state ${job?.state ?? '-'}`);
      }
      if (job?.leg === 'dropoff' && pickedUpAt < 0) {
        pickedUpAt = now.tick;
        log(`>> PICKED UP at tick ${now.tick}; bay now ${JSON.stringify(now.containers.filter((c) => c[0].startsWith('container:')))}`);
      }
      if (job?.state === 'completed' && completedAt < 0) {
        completedAt = now.tick;
        log(`>> THE ERRAND COMPLETED at tick ${now.tick}. construction bricks ${JSON.stringify(stock(now, CONSTRUCTION_CONTAINER, BRICK))}`);
        break;
      }
      if (job?.state === 'failed' || job?.state === 'cancelled') {
        log(`>> THE ERRAND ${job.state.toUpperCase()} at tick ${now.tick}: ${describeJob(job)}`);
        break;
      }
      await page.waitForTimeout(200);
    }
    log(`TIMELINE: job on board ${jobAppearedAt}, errand selected ${carrySelectedAt}, picked up ${pickedUpAt}, completed ${completedAt}`);
    log(`WALK: ${carryTiles.join(' | ')}`);

    // What the player is shown, read with the clock stopped so the roster and
    // the worker cannot be a cycle apart.
    await pause(page);
    const paused = await sample();
    log(`PAUSED READING: ${paused.line}`);
    log(`REGIME PANEL: ${(await panelText(page, '.hud-regime')).replace(/\n/g, ' | ')}`);
    log(`REFUSAL BAND: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`ALERTS: ${(await panelText(page, '.hud-alerts')).replace(/\n/g, ' | ')}`);
    log(`OVERVIEW: ${(await panelText(page, '.hud-overview')).replace(/\n/g, ' | ')}`);

    // ---- act 8: save and reload mid-errand --------------------------------
    await tab(page, 'build').click();
    await buy(page, 'wall-brick', 10);
    await fastForwardToMax(page);
    let capture: WorkerReading | undefined;
    const captureStarted = Date.now();
    while (Date.now() - captureStarted < 120_000) {
      const now = await readWorker(page);
      const live = now.jobs.find((job) => job.state === 'travelling' || job.state === 'performing');
      if (live !== undefined) {
        capture = now;
        break;
      }
      await page.waitForTimeout(120);
    }
    if (capture === undefined) {
      log('SAVE/RELOAD: no second errand reached travelling or performing inside the window; this half is not measured');
    } else {
      // Pause *then* read: an outstanding debit is not frozen by pausing, so
      // the order is load-bearing (`docs/AGENT_WORKFLOW.md`).
      await pause(page);
      const atPause = await sample();
      log(`MID-ERRAND CAPTURE (paused): ${atPause.line}`);

      await page.getByRole('button', { name: 'Save now' }).click();
      await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 30_000 });
      log(`saved: ${await panelText(page, '.save-panel__status')}`);

      await installProbe(page);
      await openApp(page);
      await page.locator('.save-panel__item').first().click();
      await page.waitForTimeout(2500);
      const afterLoad = await sample();
      log(`AFTER LOAD: ${afterLoad.line}`);

      await fastForwardToMax(page);
      let resumeLine = '';
      let restoredCompletedAt = -1;
      const resumeStarted = Date.now();
      while (Date.now() - resumeStarted < 90_000) {
        const { reading: now, line } = await sample();
        const comparable = line.replace(/tick \d+ day-tick \d+/, '').replace(/since \d+/g, '');
        if (comparable !== resumeLine) {
          log(`RESUME ${line}`);
          resumeLine = comparable;
        }
        const job = now.jobs[now.jobs.length - 1];
        if (job?.state === 'completed' && restoredCompletedAt < 0) {
          restoredCompletedAt = now.tick;
          log(
            `>> THE RESTORED ERRAND COMPLETED at tick ${now.tick}.` +
              ` Captured at ${atPause.reading.tick}, so ${now.tick - atPause.reading.tick} ticks across the restore.`,
          );
          break;
        }
        if (job?.state === 'failed' || job?.state === 'cancelled') {
          log(`>> THE RESTORED ERRAND ${job.state.toUpperCase()} at tick ${now.tick}: ${describeJob(job)}`);
          break;
        }
        await page.waitForTimeout(200);
      }
      if (restoredCompletedAt < 0) log('the restored errand did not reach `completed` inside the resume window');
    }
  });
});
