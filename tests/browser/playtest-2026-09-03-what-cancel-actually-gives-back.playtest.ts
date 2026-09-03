import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { armBuildable, buy, calibrate, drag, openApp, panelText, sentCommands, tab } from './playtest-harness';

/**
 * **What `Cancel` actually gives back, per state, read off the worker.**
 *
 * ## What this file settled, written after it ran
 *
 * `tests/integration/construction-queue-row-pays-what-it-shows.test.ts` (#843,
 * `4652dbfc`) asserts that a row read at `assigned` pays the catalogue value of
 * the material it holds, and #853 measured a row at `assigned` whose `Cancel`
 * moved the FUNDS chip by nothing. **Both are right, and neither the state nor
 * the projection is what separates them: it is the tick the command executes
 * at.**
 *
 * That test's `dispatch` submits with `executeAtTick: runtime.kernel.tick` and
 * calls `step()` immediately -- zero lead, so the press runs at the tick the
 * row was priced at. A browser press runs at whatever
 * `SimulationCommandSender.projectExecuteTick` chose, and `projectFromClock`
 * adds an elapsed estimate **plus `DEFAULT_LEAD_TICKS`, which is 20**
 * (`src/ui/simulation-commands.ts:77,188-192`), whenever the clock is running.
 * Measured here: **36 to 55 ticks.** An `assigned` order becomes `in-progress`
 * on the next scheduled construction pass, ten ticks away
 * (`ConstructionSystem.schedule.intervalTicks: 10`), so the state the row was
 * priced at is three to five passes stale by the time the command runs.
 *
 * With the clock paused the lead is 0 -- recorded per press -- and every state
 * pays exactly what its row advertised. The figures and the caveats are in
 * `docs/research/2026-09-03-what-cancel-actually-gives-back.md`; this file is
 * the instrument, and it asserts nothing about them.
 *
 * ## Why this file exists rather than the one beside it
 *
 * `playtest-2026-09-03-what-the-row-promised.playtest.ts` asked the same
 * question with one instrument: the FUNDS chip. #853 was written from three
 * runs of it and reports *"the FUNDS chip does not move at all across eight
 * seconds"* for a cancel of an `assigned` order advertising `80 back`. A chip
 * is a **projection** -- `src/ui/hud/projection.ts:965` puts
 * `counts.treasuryMinorUnits` on it and the strip is repainted from
 * `simulation/status-counts`, which the worker skips when the payload equals
 * the last one (`src/simulation/worker/status-counts.ts`). So a chip that does
 * not move is consistent with a credit that landed and with one that did not,
 * and no number of chip samples separates the two.
 *
 * This file reads the **worker's own state** instead, for every figure it
 * reports:
 *
 * - **Treasury, container stock, pending deliveries and every order's state
 *   and allocation** come out of one `simulation/request-snapshot`
 *   (`src/simulation/worker/state-machine.ts:1251`), which calls
 *   `captureSessionSnapshot` and mutates nothing. One request answers all four
 *   at one tick: `simulation.economy.treasury.balanceMinorUnits`,
 *   `simulation.operations.containers` (the `construction-materials`
 *   container, `src/simulation/runtime/new-session.ts:75`),
 *   `simulation.economy.procurement.pending` and `construction.orders`.
 * - **The advertised figure** comes out of a `hud/build-queue`
 *   `simulation/request-projection`, whose
 *   `BuildQueueOrderViewModel.cancelRefundMinorUnits` is exactly
 *   `ConstructionSystem.previewCancelRefundMinorUnits(order.id)`
 *   (`src/simulation/presentation/construction-projection.ts:359`) -- the same
 *   read the row is painted from, taken at a tick this file knows.
 * - The DOM row's `{total} back` text and the FUNDS chip are read **as well**,
 *   beside the worker figures, so a disagreement between them is a
 *   measurement rather than a hypothesis.
 *
 * Neither request has a side effect and neither is a command:
 * `handleRequestSnapshot` and `handleRequestProjection` both only read.
 *
 * ## Why the clock is paused for the ledger
 *
 * [ADR 0051](../../docs/adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
 * decided that **a due command is dispatched when it is submitted, even while
 * the clock is paused** -- *"Pausing stops time; it does not stop the player"*
 * -- and that the worker publishes `simulation/status-counts` immediately when
 * that dispatch did something. So with the clock paused a `Cancel` press still
 * executes, at a tick that does not move, with no system running before or
 * after it. `after - before` is then the cancellation and nothing else: no
 * wage bill, no state income, no scheduled construction pass buying materials
 * for the orders that are left.
 *
 * That is the opposite of the trap #842 fell into (fixed by #855): polling a
 * projection and then pausing froze the clock the outstanding *debits* needed.
 * Nothing here is waiting on a debit -- the debit has already happened by the
 * time an order exists -- and the credit under measurement is synchronous
 * inside the command.
 *
 * A separate test runs the same press with the clock at 1x and samples both
 * instruments for eight seconds, because that is the run #853 describes and it
 * has to be reproduced rather than argued about.
 *
 * ## Which states there are, counted rather than taken on trust
 *
 * `isCancellable` (`src/simulation/construction/system.ts:48`) is
 * `state !== 'cancelled' && state !== 'failed'`, so **six** of the eight
 * `BuildOrderLifecycleState` members are cancellable.
 * `previewCancelRefundMinorUnits` (`:884`) reaches a pricing call for
 * **three** of them and hard-returns `0` for the other three:
 *
 * | state | what the method does |
 * | --- | --- |
 * | `planned` | `return 0` -- empty allocation and not one of the two surplus states |
 * | `approved` | `sink.previewSurplusRefundMinorUnits` per item id |
 * | `materials-pending` | the same |
 * | `assigned` | `sink.previewAllocatedRefundMinorUnits(order.materialsAllocated)` |
 * | `in-progress` | `return 0` (ruling 20) |
 * | `completed` | `return 0` (the owner's ruling of 2026-09-01) |
 *
 * `PENDING_BUILD_ORDER_STATES`
 * (`src/simulation/presentation/construction-projection.ts:87`) is the five
 * that get a queue row at all, so `completed` has **no row and therefore no
 * Cancel button in the Build panel** -- a completed order is reached through
 * `Undo`, which is a different press. This file therefore measures the five
 * row-bearing states and says which of them a player can actually get an
 * order into.
 *
 * ## It is not a gate
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so
 * nothing in CI collects a `.playtest.ts`. Nothing here asserts on a
 * mismatch: the reading is the deliverable, and the wording of the row is the
 * owner's surface (`AGENTS.md`, exclusion 4).
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5231 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-what-cancel-actually-gives-back.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or the run proceeds with no actor
 * sprites -- `docs/AGENT_WORKFLOW.md` records a playtest that ran green
 * without any.
 *
 * ## Traps inherited from the file beside this one, all three still live
 *
 * 1. `[data-metric="funds"] .ui-stat__value` **works**; `grep -rn 'data-metric'
 *    src/` finds nothing because `src/ui/hud/status-strip.ts:145` writes it as
 *    `chip.element.dataset['metric']`. This file uses that selector, and reads
 *    the chip's label as a cross-check.
 * 2. The first number on the status strip is the build's version, not money.
 * 3. `calibrate` returns the real world origin and on this build it is
 *    (-304, -574), so tile (12,12) is off the top of a 1440x900 window. Every
 *    drag here goes through the middle of the canvas and takes whichever tiles
 *    it lands on.
 */

const QUEUE_ROW = '.hud-build__queue-row';
const CONSTRUCTION_CONTAINER = 'construction-materials';
const BRICK = 'item.brick';

interface ProbeWindow {
  lockstateSentToWorker?: unknown[];
  lockstateFromWorker?: unknown[];
  lockstateAsk?: (kind: string, payload: unknown) => Promise<unknown>;
}

/**
 * The tee `playtest-harness.installTee` installs, plus a way to ask the worker
 * a question directly.
 *
 * `lockstateAsk(kind, payload)` posts a request envelope on the same port the
 * application uses and resolves with the reply the worker correlates to it by
 * `replyTo` (ADR 0003 decision 2). The application's own `ProjectionRequester`
 * also sees that reply and drops it, because it has no pending entry under
 * that id -- `src/ui/simulation-projections.ts` returns early for exactly
 * that case.
 *
 * The two big message kinds are still kept out of the recording array so it
 * cannot grow without bound, and `simulation/snapshot` is kept out of it too:
 * a snapshot of a populated prison is large and this file reads each one as it
 * arrives rather than from a log.
 */
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

interface OrderReading {
  readonly id: string;
  readonly state: string;
  readonly allocated: readonly { readonly itemId: string; readonly quantity: number }[];
}

interface DeliveryReading {
  readonly orderId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly paidMinorUnits: number;
  readonly arrivesAtTick: number;
}

/** Everything this file measures, all of it out of one worker snapshot. */
interface WorkerReading {
  readonly tick: number;
  readonly treasuryMinorUnits: number;
  /** `Container.quantityOf(BRICK)` in the construction container. */
  readonly brickQuantity: number;
  /** `Container.reservedOf(BRICK)`, carried separately because `availableOf` nets it off. */
  readonly brickReserved: number;
  readonly bricksInFlight: number;
  readonly deliveries: readonly DeliveryReading[];
  readonly orders: readonly OrderReading[];
}

async function readWorker(page: Page): Promise<WorkerReading> {
  const raw = await page.evaluate(
    async ([containerId, itemId]) => {
      const probe = window as unknown as ProbeWindow;
      if (probe.lockstateAsk === undefined) throw new Error('the probe was not installed');
      const reply = (await probe.lockstateAsk('simulation/request-snapshot', { reason: 'consistency-check' })) as {
        kind?: string;
        payload?: {
          tick?: number;
          snapshot?: {
            data?: {
              construction?: { orders?: { id: string; state: string; materialsAllocated: { itemId: string; quantity: number }[] }[] };
              simulation?: {
                economy?: {
                  treasury?: { balanceMinorUnits?: number };
                  procurement?: { pending?: { orderId: string; itemId: string; quantity: number; paidMinorUnits: number; arrivesAtTick: number }[] };
                };
                operations?: { containers?: [string, [string, number, number][]][] };
              };
            };
          };
        };
      };
      if (reply.kind !== 'simulation/snapshot') {
        throw new Error(`asked for a snapshot and the worker answered "${String(reply.kind)}"`);
      }
      const bundle = reply.payload?.snapshot?.data;
      const containers = bundle?.simulation?.operations?.containers ?? [];
      const container = containers.find((entry) => entry[0] === containerId);
      const line = (container?.[1] ?? []).find((entry) => entry[0] === itemId);
      const pending = bundle?.simulation?.economy?.procurement?.pending ?? [];
      return {
        tick: reply.payload?.tick ?? -1,
        treasuryMinorUnits: bundle?.simulation?.economy?.treasury?.balanceMinorUnits ?? Number.NaN,
        brickQuantity: line?.[1] ?? 0,
        brickReserved: line?.[2] ?? 0,
        bricksInFlight: pending.filter((delivery) => delivery.itemId === itemId).reduce((sum, delivery) => sum + delivery.quantity, 0),
        deliveries: pending.map((delivery) => ({
          orderId: delivery.orderId,
          itemId: delivery.itemId,
          quantity: delivery.quantity,
          paidMinorUnits: delivery.paidMinorUnits,
          arrivesAtTick: delivery.arrivesAtTick,
        })),
        orders: (bundle?.construction?.orders ?? []).map((order) => ({
          id: order.id,
          state: order.state,
          allocated: order.materialsAllocated.map((material) => ({ itemId: material.itemId, quantity: material.quantity })),
        })),
      };
    },
    [CONSTRUCTION_CONTAINER, BRICK] as const,
  );
  return raw;
}

interface AdvertisedRow {
  readonly orderId: string;
  readonly state: string;
  readonly cancelRefundMinorUnits: number;
}

/** The figure the row is painted from, asked of the worker directly. */
async function readAdvertised(page: Page): Promise<{ readonly tick: number; readonly rows: readonly AdvertisedRow[] }> {
  return page.evaluate(async () => {
    const probe = window as unknown as ProbeWindow;
    if (probe.lockstateAsk === undefined) throw new Error('the probe was not installed');
    const reply = (await probe.lockstateAsk('simulation/request-projection', {
      projectionId: 'hud/build-queue',
      offset: 0,
      limit: 50,
    })) as {
      kind?: string;
      payload?: {
        tick?: number;
        view?: { data?: { orders?: { rows?: { orderId: string; state: string; cancelRefundMinorUnits: number }[] } } };
      };
    };
    if (reply.kind !== 'simulation/projection') {
      throw new Error(`asked for hud/build-queue and the worker answered "${String(reply.kind)}"`);
    }
    return {
      tick: reply.payload?.tick ?? -1,
      rows: (reply.payload?.view?.data?.orders?.rows ?? []).map((row) => ({
        orderId: row.orderId,
        state: row.state,
        cancelRefundMinorUnits: row.cancelRefundMinorUnits,
      })),
    };
  });
}

/** What the DOM row says, parsed the way the file beside this one parses it. */
async function readDomRows(page: Page): Promise<readonly { readonly orderId: string; readonly back: number; readonly text: string }[]> {
  const raw = await page.evaluate((selector) => {
    const rows: { orderId: string; text: string }[] = [];
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.hidden || node.getClientRects().length === 0) continue;
      rows.push({ orderId: node.getAttribute('data-order') ?? '', text: (node.innerText ?? '').replace(/\s+/g, ' ').trim() });
    }
    return rows;
  }, QUEUE_ROW);
  return raw.map((row) => {
    const match = /([\d  \s,.]+)\s*back/.exec(row.text);
    const back = match === null ? Number.NaN : Number.parseInt(match[1]!.replace(/[^\d]/g, ''), 10);
    return { orderId: row.orderId, back, text: row.text };
  });
}

/**
 * The FUNDS chip, by `[data-metric="funds"]` and by its label, both -- see
 * trap 1 in the header. `NaN` for either that cannot be found.
 */
async function readChip(page: Page): Promise<{ readonly byMetric: number; readonly byLabel: number }> {
  return page.evaluate(() => {
    const parse = (text: string): number => {
      const digits = text.replace(/[^\d-]/g, '');
      return digits === '' ? Number.NaN : Number.parseInt(digits, 10);
    };
    const metricNode = document.querySelector('[data-metric="funds"] .ui-stat__value');
    const byMetric = metricNode instanceof HTMLElement ? parse(metricNode.innerText) : Number.NaN;
    let byLabel = Number.NaN;
    for (const chip of Array.from(document.querySelectorAll('.ui-stat'))) {
      const label = chip.querySelector('.ui-stat__label');
      if (label instanceof HTMLElement && label.innerText.trim().toUpperCase() === 'FUNDS') {
        const value = chip.querySelector('.ui-stat__value');
        if (value instanceof HTMLElement) byLabel = parse(value.innerText);
      }
    }
    return { byMetric, byLabel };
  });
}

/**
 * The `executeAtTick` and `sequence` the last submitted command carried.
 *
 * The whole envelope, not the `data` `sentCommands` extracts: `executeAtTick`
 * lives on `payload` beside `command`
 * (`src/simulation/protocol/types.ts:266`), and it is the number that decides
 * *when* a press takes effect. `SimulationCommandSender.projectFromClock`
 * adds `DEFAULT_LEAD_TICKS` -- 20, one second at the kernel's 20 Hz
 * (`src/ui/simulation-commands.ts:77`) -- to its estimate whenever the clock
 * is running, and returns the bare reported tick when it is paused.
 */
async function lastSubmitEnvelope(page: Page): Promise<{ readonly executeAtTick: number; readonly sequence: number } | undefined> {
  return page.evaluate(() => {
    const messages = (window as unknown as ProbeWindow).lockstateSentToWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { executeAtTick?: number; sequence?: number } };
      if (message.kind !== 'simulation/submit-command') continue;
      return { executeAtTick: message.payload?.executeAtTick ?? -1, sequence: message.payload?.sequence ?? -1 };
    }
    return undefined;
  });
}

const transport = (page: Page, which: 'pause' | 'play' | 'fast-forward') =>
  page.locator('.hud-strip__transport button').nth(which === 'pause' ? 0 : which === 'play' ? 1 : 2);

/**
 * Opens the Build panel's QUEUED fold, without which there is no row to read
 * and no button to press.
 *
 * **This is the trap that cost this file its first run.** The queue block is a
 * `createCollapsibleSection` with `collapsed: true`
 * (`src/ui/hud/build-panel.ts:1912`), so a fresh prison draws the header and
 * the count and no rows at all: `panelText('.hud-build__queue')` reads
 * `QUEUED / 2 waiting - 0 being built` and every `.hud-build__queue-row` has
 * no client rect. A `data-order` locator therefore never resolves and the
 * `Cancel` click waits until the test's own timeout, which reads exactly like
 * a broken button.
 *
 * The section root carries `data-collapsed` and its header is the toggle
 * (`src/ui/primitives/collapsible-section.ts:69,85`). Nothing is clicked when
 * the fold is already open, so this is safe to call repeatedly.
 */
async function openQueueFold(page: Page): Promise<void> {
  const section = page.locator('.hud-build__queue');
  if ((await section.count()) === 0) return;
  if ((await section.getAttribute('data-collapsed')) !== 'true') return;
  await section.locator('.ui-section__header').click();
  await page.waitForTimeout(150);
}

/** Opens a fresh prison with the Build tab showing and the probe attached. Leaves the clock paused, which is how a session starts (ADR 0051 finding 1). */
async function freshPrison(page: Page): Promise<{ readonly x: number; readonly y: number }> {
  await installProbe(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  // The origin is measured and logged rather than used to aim: trap 3.
  console.log(`origin ${JSON.stringify(origin)}, viewport ${JSON.stringify(viewport)}`);
  return { x: Math.round(viewport.width * 0.35), y: Math.round(viewport.height / 2) };
}

/** A horizontal wall drag of about `tiles` segments, through the middle of the canvas. */
async function dragWall(page: Page, from: { x: number; y: number }, tiles: number): Promise<void> {
  await armBuildable(page, 'wall-brick');
  await drag(page, from, { x: from.x + Math.max(1, tiles * 64 - 32), y: from.y });
}

/**
 * Presses `Cancel` on one row with the clock wherever the caller left it, and
 * reports the worker's state on both sides of the press.
 *
 * The advertised figure is read from the worker **and** from the DOM
 * immediately before the press, so the row a player would have been reading
 * and the figure the projection holds are both on the record.
 */
async function measureCancel(page: Page, orderId: string, label: string): Promise<void> {
  const note = (line: string): void => {
    console.log(line);
  };
  await openQueueFold(page);
  const before = await readWorker(page);
  const advertised = await readAdvertised(page);
  const dom = await readDomRows(page);
  const chipBefore = await readChip(page);
  const order = before.orders.find((candidate) => candidate.id === orderId);
  const row = advertised.rows.find((candidate) => candidate.orderId === orderId);
  const domRow = dom.find((candidate) => candidate.orderId === orderId);

  note('');
  note(`--- ${label} -------------------------------------------------`);
  note(`order ${orderId}`);
  note(`  worker state: ${String(order?.state)}; allocated ${JSON.stringify(order?.allocated ?? [])}`);
  note(`  advertised (worker projection, tick ${String(advertised.tick)}): ${String(row?.cancelRefundMinorUnits)}`);
  note(`  advertised (DOM row): ${String(domRow?.back)}  [${String(domRow?.text)}]`);
  note(`  before: tick ${String(before.tick)}, treasury ${String(before.treasuryMinorUnits)},`
    + ` bricks held ${String(before.brickQuantity)} (reserved ${String(before.brickReserved)}),`
    + ` bricks in flight ${String(before.bricksInFlight)}, deliveries ${JSON.stringify(before.deliveries)}`);
  note(`  chip before: ${JSON.stringify(chipBefore)}`);

  const commandsBefore = (await sentCommands(page)).length;
  const button = page.locator(`${QUEUE_ROW}[data-order="${orderId}"]`).getByRole('button', { name: 'Cancel' });
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  await button.click();
  /*
   * The tick the press was scheduled for, which is the whole difference
   * between this reading and a headless one.
   * `tests/integration/construction-queue-row-pays-what-it-shows.test.ts`
   * submits with `executeAtTick: runtime.kernel.tick` and steps once, so its
   * command runs at the tick the row was read. A browser press runs at
   * whatever `SimulationCommandSender.projectExecuteTick` chose, which is the
   * bare reported tick while the clock is paused and that plus an elapsed
   * estimate plus `DEFAULT_LEAD_TICKS` while it runs
   * (`src/ui/simulation-commands.ts:77,188-192`).
   */
  const envelope = await lastSubmitEnvelope(page);
  await page.waitForTimeout(700);
  const after = await readWorker(page);
  const chipAfter = await readChip(page);
  const afterOrder = after.orders.find((candidate) => candidate.id === orderId);

  note(`  command sent: ${JSON.stringify((await sentCommands(page)).slice(commandsBefore))}`);
  note(`  submitted at tick ${String(before.tick)}, scheduled to execute at ${String(envelope?.executeAtTick)}`
    + ` (lead ${String((envelope?.executeAtTick ?? Number.NaN) - before.tick)} ticks)`);
  note(`  after: tick ${String(after.tick)}, treasury ${String(after.treasuryMinorUnits)},`
    + ` bricks held ${String(after.brickQuantity)} (reserved ${String(after.brickReserved)}),`
    + ` bricks in flight ${String(after.bricksInFlight)}, deliveries ${JSON.stringify(after.deliveries)}`);
  note(`  order state after: ${String(afterOrder?.state)}; allocated ${JSON.stringify(afterOrder?.allocated ?? [])}`);
  note(`  chip after: ${JSON.stringify(chipAfter)}`);
  note(`  RESULT ${label}: advertised ${String(row?.cancelRefundMinorUnits)}`
    + ` | money ${String(after.treasuryMinorUnits - before.treasuryMinorUnits)}`
    + ` | bricks in the container ${String(after.brickQuantity - before.brickQuantity)}`
    + ` | bricks in flight ${String(after.bricksInFlight - before.bricksInFlight)}`
    + ` | ticks elapsed ${String(after.tick - before.tick)}`
    + ` | chip ${String(chipAfter.byMetric - chipBefore.byMetric)}`);
}

/** Runs the clock until `predicate` holds of the worker's own order list, or gives up and says what it saw. */
async function runUntil(
  page: Page,
  predicate: (reading: WorkerReading) => boolean,
  budgetMs: number,
  label: string,
): Promise<WorkerReading> {
  await transport(page, 'play').click();
  const startedAt = Date.now();
  let last = await readWorker(page);
  while (Date.now() - startedAt < budgetMs) {
    last = await readWorker(page);
    if (predicate(last)) {
      await transport(page, 'pause').click();
      await page.waitForTimeout(150);
      return readWorker(page);
    }
    await page.waitForTimeout(60);
  }
  await transport(page, 'pause').click();
  await page.waitForTimeout(150);
  console.log(`GAVE UP waiting for ${label} after ${String(budgetMs)}ms; states were `
    + JSON.stringify(last.orders.map((order) => order.state)));
  return readWorker(page);
}

/**
 * An order in `state` that the panel has actually drawn a row for.
 *
 * `BUILD_QUEUE_ROW_LIMIT` is 3 (`src/ui/hud/build-panel.ts:576`), so a queue of
 * six has three rows and three orders with no control at all. Picking by worker
 * state alone therefore aims at a `Cancel` button that does not exist, which
 * looks like a hung click rather than a wrong target.
 */
async function pickRowInState(page: Page, reading: WorkerReading, state: string): Promise<string | undefined> {
  await openQueueFold(page);
  const drawn = new Set((await readDomRows(page)).map((row) => row.orderId));
  return reading.orders.find((order) => order.state === state && drawn.has(order.id))?.id;
}

const stateCounts = (reading: WorkerReading): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const order of reading.orders) counts[order.state] = (counts[order.state] ?? 0) + 1;
  return counts;
};

test.describe('what Cancel gives back, per state, read off the worker', () => {
  test('approved: one segment, and then five, with the clock paused', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);

    const opening = await readWorker(page);
    note(`opening: treasury ${String(opening.treasuryMinorUnits)}, bricks ${String(opening.brickQuantity)}`);

    // One segment on its own. Its just-in-time purchase is the only demand for
    // the delivery it causes, so cancelling it makes that whole delivery
    // surplus -- which is the case `refundSurplusDeliveries` can act on.
    await dragWall(page, from, 1);
    const placed = await readWorker(page);
    note(`after a 1-tile drag: ${JSON.stringify(stateCounts(placed))}, ${String(placed.orders.length)} orders,`
      + ` treasury ${String(placed.treasuryMinorUnits)}, deliveries ${JSON.stringify(placed.deliveries)}`);
    note(`queue readout: ${await panelText(page, '.hud-build__queue')}`);
    if (placed.orders.length === 0) {
      note('NO ORDERS from the drag, which is this run’s finding rather than a step to work around.');
      note(`commands: ${JSON.stringify((await sentCommands(page)).slice(-6))}`);
      return;
    }
    const single = placed.orders[0]!;
    await measureCancel(page, single.id, `approved, sole order (state ${single.state})`);

    expect(placed.orders.length).toBeGreaterThan(0);
  });

  test('approved: one of a run of six, on its own page', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);

    /*
     * A fresh page, and not a second drag inside the test above, because of a
     * collision that test measured and that is worth stating rather than
     * working around silently.
     *
     * A just-in-time purchase id is `jit:<tick>:<itemId>:<inFlightBefore>`
     * (`justInTimePurchaseOrderId`, `src/simulation/economy/just-in-time-materials.ts:74`),
     * and `inFlightBefore` is what separates two purchases of the same item at
     * the same tick. With the clock paused every press lands at the *same*
     * tick, so cancelling an order -- which cancels its delivery and lowers
     * the in-flight total -- makes the *next* purchase at that tick compose an
     * id a cancelled purchase already used. `ProcurementSystem` answers
     * `duplicate-order`, which the caller treats as already satisfied, so
     * nothing is bought and nothing is reported.
     *
     * Measured, on the run of 2026-09-03: after cancelling one of two orders
     * at tick 0, a six-segment drag at tick 0 placed six orders, bought
     * nothing, and left the treasury exactly where it was, with 2 bricks in
     * flight against a demand of 14. That is a real sequence -- ADR 0051 lets
     * a player do all of it while paused -- but it is not the case this test
     * is about, and a run with no supply at all would answer `0 back` for a
     * reason that has nothing to do with the surplus rule.
     */
    await dragWall(page, from, 6);
    const placed = await readWorker(page);
    const live = placed.orders.filter((order) => order.state !== 'cancelled');
    note(`after a 6-tile drag: ${JSON.stringify(stateCounts(placed))}, ${String(live.length)} live orders,`
      + ` treasury ${String(placed.treasuryMinorUnits)}, deliveries ${JSON.stringify(placed.deliveries)}`);
    if (live.length < 2) {
      note(`only ${String(live.length)} live order, so the "one of several" case is not reached.`);
      return;
    }

    const drawn = await pickRowInState(page, placed, 'approved');
    if (drawn === undefined) {
      note('NO DRAWN ROW IN approved, which is the finding.');
      return;
    }
    await measureCancel(page, drawn, `approved, one of ${String(live.length)}`);

    // And now cancel the rest, one at a time, so the figure can be watched
    // crossing from "no delivery fits inside the surplus" to "one does".
    for (let index = 0; index < 6; index += 1) {
      const reading = await readWorker(page);
      const next = await pickRowInState(page, reading, 'approved');
      if (next === undefined) break;
      await measureCancel(page, next, `approved, ${String(reading.orders.filter((order) => order.state === 'approved').length)} still live`);
    }

    expect(placed.orders.length).toBeGreaterThan(0);
  });

  test('materials-pending: caught before the delivery lands', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);
    await dragWall(page, from, 1);
    const placed = await readWorker(page);
    note(`placed: ${JSON.stringify(stateCounts(placed))}, deliveries ${JSON.stringify(placed.deliveries)}`);
    if (placed.orders.length === 0) {
      note('NO ORDERS from the drag; nothing to measure.');
      return;
    }

    // `approved` -> `materials-pending` is one scheduled construction tick
    // (`schedule.intervalTicks: 10`), and the delivery is 100 ticks out
    // (`PROCUREMENT_DELIVERY_DELAY_TICKS`), so there is a wide window.
    const reached = await runUntil(
      page,
      (reading) => reading.orders.some((order) => order.state === 'materials-pending'),
      20_000,
      'materials-pending',
    );
    note(`reached: tick ${String(reached.tick)}, ${JSON.stringify(stateCounts(reached))},`
      + ` bricks held ${String(reached.brickQuantity)}, in flight ${String(reached.bricksInFlight)}`);
    const target = reached.orders.find((order) => order.state === 'materials-pending');
    if (target === undefined) {
      note('NO ORDER IN materials-pending, which is the finding.');
      return;
    }
    await measureCancel(page, target.id, 'materials-pending, sole order');
    expect(reached.orders.length).toBeGreaterThan(0);
  });

  test('approved against a delivery the player bought by hand, still in flight', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);

    /*
     * The case #853's own numbers came from, and the one that makes its
     * `approved:0` correct rather than a defect.
     *
     * `refundSurplusDeliveries` will not cancel a delivery whose order id is
     * not a `jit:` one -- stock the player chose to hold, the distinction #687
     * drew through `isJustInTimePurchaseOrderId`. So an order placed while a
     * hand-bought delivery covers its demand causes no purchase of its own
     * (deficit = demand - held - inFlight) and has no `jit:` delivery for a
     * cancellation to turn around. There is nothing surplus that this may
     * take, and `0` is the honest figure.
     */
    await buy(page, 'wall-brick', 40);
    const bought = await readWorker(page);
    note(`after buying by hand: treasury ${String(bought.treasuryMinorUnits)},`
      + ` bricks held ${String(bought.brickQuantity)}, in flight ${String(bought.bricksInFlight)},`
      + ` deliveries ${JSON.stringify(bought.deliveries)}`);
    note(`is that delivery a just-in-time one? ${String(bought.deliveries.every((delivery) => delivery.orderId.startsWith('jit:')))}`);

    await dragWall(page, from, 4);
    const placed = await readWorker(page);
    note(`placed while it is still on the road: ${JSON.stringify(stateCounts(placed))},`
      + ` treasury ${String(placed.treasuryMinorUnits)}, bricks held ${String(placed.brickQuantity)},`
      + ` in flight ${String(placed.bricksInFlight)}, deliveries ${JSON.stringify(placed.deliveries)}`);
    if (placed.orders.length === 0) {
      note('NO ORDERS from the drag; nothing to measure.');
      return;
    }

    const target = await pickRowInState(page, placed, 'approved');
    if (target === undefined) {
      note('NO DRAWN ROW IN approved, which is the finding.');
      return;
    }
    await measureCancel(page, target, 'approved, against a hand-bought delivery still in flight');
    expect(placed.orders.length).toBeGreaterThan(0);
  });

  test('assigned and in-progress: bricks in the container first', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);

    // Buy the bricks up front and let them land, so `tryAllocate` succeeds the
    // first time it is asked and the orders reach `assigned` without a
    // just-in-time purchase of their own (deficit = demand - held - inFlight).
    await buy(page, 'wall-brick', 40);
    const bought = await readWorker(page);
    note(`after buying: treasury ${String(bought.treasuryMinorUnits)}, deliveries ${JSON.stringify(bought.deliveries)}`);
    const landed = await runUntil(page, (reading) => reading.brickQuantity >= 40, 60_000, '40 bricks in the container');
    note(`bricks landed at tick ${String(landed.tick)}: held ${String(landed.brickQuantity)},`
      + ` in flight ${String(landed.bricksInFlight)}, treasury ${String(landed.treasuryMinorUnits)}`);

    // Six segments: one crew member means one order goes `in-progress` and the
    // rest sit `assigned` (`crewBusy`, `src/simulation/construction/system.ts:1308`).
    await dragWall(page, from, 6);
    const placed = await readWorker(page);
    note(`placed: ${JSON.stringify(stateCounts(placed))}, ${String(placed.orders.length)} orders,`
      + ` deliveries ${JSON.stringify(placed.deliveries)}`);
    if (placed.orders.length === 0) {
      note('NO ORDERS from the drag; nothing to measure.');
      return;
    }

    const reached = await runUntil(
      page,
      (reading) =>
        reading.orders.some((order) => order.state === 'assigned') && reading.orders.some((order) => order.state === 'in-progress'),
      30_000,
      'one assigned and one in-progress at the same time',
    );
    note(`reached: tick ${String(reached.tick)}, ${JSON.stringify(stateCounts(reached))},`
      + ` bricks held ${String(reached.brickQuantity)} (reserved ${String(reached.brickReserved)}),`
      + ` treasury ${String(reached.treasuryMinorUnits)}`);
    note(`advertised now: ${JSON.stringify((await readAdvertised(page)).rows)}`);

    await openQueueFold(page);
    note(`rows the panel drew: ${JSON.stringify(await readDomRows(page))}`);
    const assigned = await pickRowInState(page, reached, 'assigned');
    if (assigned !== undefined) await measureCancel(page, assigned, 'assigned');
    else note('NO DRAWN ROW IN assigned, which is the finding for that row.');

    const afterAssigned = await readWorker(page);
    const inProgress = await pickRowInState(page, afterAssigned, 'in-progress');
    if (inProgress !== undefined) await measureCancel(page, inProgress, 'in-progress');
    else note('NO DRAWN ROW IN in-progress, which is the finding for that row.');

    const afterInProgress = await readWorker(page);
    const stillPending = (await pickRowInState(page, afterInProgress, 'materials-pending'))
      ?? (await pickRowInState(page, afterInProgress, 'approved'));
    if (stillPending !== undefined) {
      await measureCancel(page, stillPending, 'approved or materials-pending, with bricks already in the container');
    }

    note('');
    note(`planned: ${String(afterInProgress.orders.filter((order) => order.state === 'planned').length)} orders were ever in it.`
      + ' `submitOrder` writes `approved` synchronously (src/simulation/construction/system.ts:398),'
      + ' so no command can leave an order in `planned` for a row to advertise.');
    expect(placed.orders.length).toBeGreaterThan(0);
  });

  test('#853 as reported: cancel an assigned order with the clock at 1x and watch both instruments for eight seconds', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);
    await buy(page, 'wall-brick', 40);
    await runUntil(page, (reading) => reading.brickQuantity >= 40, 60_000, '40 bricks in the container');
    await dragWall(page, from, 6);
    if ((await readWorker(page)).orders.length === 0) {
      note('NO ORDERS from the drag; nothing to measure.');
      return;
    }

    // Left running deliberately: this is the run #853 describes.
    await transport(page, 'play').click();
    const startedAt = Date.now();
    let target: OrderReading | undefined;
    let advertisedAtPress = Number.NaN;
    while (Date.now() - startedAt < 30_000) {
      const reading = await readWorker(page);
      const drawnId = await pickRowInState(page, reading, 'assigned');
      const candidate = reading.orders.find((order) => order.id === drawnId);
      if (candidate !== undefined) {
        const rows = await readAdvertised(page);
        const row = rows.rows.find((entry) => entry.orderId === candidate.id);
        if (row !== undefined && row.cancelRefundMinorUnits > 0) {
          target = candidate;
          advertisedAtPress = row.cancelRefundMinorUnits;
          break;
        }
      }
      await page.waitForTimeout(50);
    }
    if (target === undefined) {
      note('NO ASSIGNED ORDER EVER ADVERTISED A NON-ZERO REFUND with the clock running, which is the finding.');
      return;
    }

    const before = await readWorker(page);
    const chipBefore = await readChip(page);
    const domBefore = (await readDomRows(page)).find((row) => row.orderId === target!.id);
    note('');
    note('--- #853, clock at 1x -------------------------------------------');
    note(`order ${target.id}, worker state ${target.state}, advertised ${String(advertisedAtPress)},`
      + ` DOM row ${String(domBefore?.back)} [${String(domBefore?.text)}]`);
    note(`before: tick ${String(before.tick)}, treasury ${String(before.treasuryMinorUnits)}, chip ${JSON.stringify(chipBefore)}`);

    const button = page.locator(`${QUEUE_ROW}[data-order="${target.id}"]`).getByRole('button', { name: 'Cancel' });
    await button.waitFor({ state: 'visible', timeout: 15_000 });
    await button.click();

    // Eight seconds, sampled at 150ms, exactly as #853 sampled it -- with the
    // worker's own treasury beside the chip on every sample.
    const samples: { at: number; tick: number; treasury: number; chip: number }[] = [];
    const pressedAt = Date.now();
    while (Date.now() - pressedAt < 8_000) {
      const reading = await readWorker(page);
      const chip = await readChip(page);
      samples.push({
        at: Date.now() - pressedAt,
        tick: reading.tick,
        treasury: reading.treasuryMinorUnits,
        chip: chip.byMetric,
      });
      await page.waitForTimeout(150);
    }
    note(`samples (ms, tick, worker treasury, chip): ${JSON.stringify(samples)}`);
    const treasuries = new Set(samples.map((sample) => sample.treasury));
    const chips = new Set(samples.map((sample) => sample.chip));
    note(`worker treasury values seen: ${JSON.stringify([...treasuries])}`);
    note(`chip values seen: ${JSON.stringify([...chips])}`);
    const first = samples[0];
    note(`worker treasury before the press ${String(before.treasuryMinorUnits)}, first sample after`
      + ` ${String(first?.treasury)} (delta ${String((first?.treasury ?? Number.NaN) - before.treasuryMinorUnits)}),`
      + ` advertised ${String(advertisedAtPress)}`);
    note(`chip before ${String(chipBefore.byMetric)}, first sample after ${String(first?.chip)}`);
    expect(samples.length).toBeGreaterThan(0);
  });

  test('the press a player actually makes: click the instant the row shows a figure, clock at 1x', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };
    const from = await freshPrison(page);
    await buy(page, 'wall-brick', 40);
    await runUntil(page, (reading) => reading.brickQuantity >= 40, 60_000, '40 bricks in the container');
    // Two runs, so there is a queue left to press against after half a dozen
    // cancellations. Both drags land while the clock is paused and with 40
    // bricks already in the container, so the deficit is zero and neither buys
    // anything -- no delivery is involved in this test at all.
    await dragWall(page, from, 6);
    await dragWall(page, { x: from.x, y: from.y + 128 }, 6);
    await openQueueFold(page);
    const queued = await readWorker(page);
    note(`queued: ${JSON.stringify(stateCounts(queued))}, ${String(queued.orders.length)} orders,`
      + ` bricks held ${String(queued.brickQuantity)}, deliveries ${JSON.stringify(queued.deliveries)}`);
    if (queued.orders.length === 0) {
      note('NO ORDERS from the drags; nothing to measure.');
      return;
    }

    /*
     * The tightest press this file can make. Everything a player does before
     * clicking -- read the row, decide -- is replaced by one DOM read, and the
     * click follows it with nothing in between: no snapshot, no projection
     * request, no worker round trip. The treasury is read from the worker
     * *before* the loop and again after each press, so the interval between
     * "the row said a number" and "the button went down" is a single
     * `page.evaluate` rather than three.
     *
     * The point of the tally is the interval. `assigned` becomes
     * `in-progress` on the next scheduled construction pass
     * (`schedule.intervalTicks: 10`), and a press that arrives after it pays
     * `0` by ruling 20 however honest the row was when it was read.
     */
    await transport(page, 'play').click();
    const outcomes: {
      advertisedOnTheRow: number;
      stateWord: string;
      money: number;
      tickBefore: number;
      tickAfter: number;
      executeAtTick: number;
      stateAtRead: string;
      stateAfter: string;
      aimedAtTheRowItRead: boolean;
      row: string;
    }[] = [];
    const startedAt = Date.now();
    while (outcomes.length < 8 && Date.now() - startedAt < 300_000) {
      /*
       * Alternating the **first** paying row and the **last**, because the two
       * are not the same question and taking only the first would answer the
       * narrower one.
       *
       * Rows are drawn in the crew's own walk order
       * (`compareBuildOrderExecution`), so row 1 is the order being built and
       * the first paying row is the very next one to start -- ten ticks from
       * `in-progress` on the next scheduled pass. The last of the three is one
       * or two whole walls further back, which is 50 ticks of work each
       * (`workRequired: 50`, `progress += 10` per pass). If the lead beats even
       * that, the `assigned` figure is not reachable at all while the clock
       * runs; if it does not, it is reachable for a row further down the list
       * and not for the one at the top.
       */
      const takeLast = outcomes.length % 2 === 1;
      const candidate = await page.evaluate(([selector, last]) => {
        const paying: { orderId: string; back: number; text: string }[] = [];
        for (const node of Array.from(document.querySelectorAll(selector as string))) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.hidden || node.getClientRects().length === 0) continue;
          const text = (node.innerText ?? '').replace(/\s+/g, ' ').trim();
          const match = /([\d\u00a0\u202f\s,.]+)\s*back/.exec(text);
          if (match === null) continue;
          const back = Number.parseInt(match[1]!.replace(/[^\d]/g, ''), 10);
          if (!Number.isFinite(back) || back <= 0) continue;
          paying.push({ orderId: node.getAttribute('data-order') ?? '', back, text });
        }
        if (paying.length === 0) return undefined;
        return last === true ? paying[paying.length - 1] : paying[0];
      }, [QUEUE_ROW, takeLast] as const);
      if (candidate === undefined) {
        await page.waitForTimeout(25);
        continue;
      }
      const before = await readWorker(page);
      /*
       * `catch` and carry on, because the failure is itself a reading. The
       * queue rows are a pool of three that are re-pointed at whichever orders
       * the last publication put in them
       * (`src/ui/hud/build-panel.ts:1881`), so a row can be hidden or
       * re-labelled between the read and the click -- Playwright reports
       * `subtree intercepts pointer events` and then `element is not visible`.
       * Measured on the run of 2026-09-03 at press 4 of 6.
       */
      try {
        await page.locator(`${QUEUE_ROW}[data-order="${candidate.orderId}"]`).getByRole('button', { name: 'Cancel' }).click({ timeout: 4_000 });
      } catch {
        note(`press ${String(outcomes.length + 1)}: the row for ${candidate.orderId} was re-pointed or hidden before the click landed;`
          + ' recorded and skipped.');
        await page.waitForTimeout(400);
        continue;
      }
      const envelope = await lastSubmitEnvelope(page);
      /*
       * Which order the command actually names, read off the wire rather than
       * assumed to be the one whose row was read.
       *
       * **This is the second thing the pool costs and it is not the same as
       * the click that misses.** `row.cancel`'s handler reads `row.orderId`
       * *at press time*, deliberately (`src/ui/hud/build-panel.ts:1893`), so a
       * row re-pointed between the DOM read and the pointer going down submits
       * a `CancelBuildOrder` for a **different order than the one the label
       * described**. Measured on the run of 2026-09-03: two presses out of six
       * moved the treasury by 80 while the order whose row had been read went
       * on to `completed`, which is the signature of exactly that.
       */
      const cancelled = await page.evaluate(() => {
        const messages = (window as unknown as ProbeWindow).lockstateSentToWorker ?? [];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index] as {
            kind?: string;
            payload?: { command?: { data?: { type?: string; orderId?: string } } };
          };
          if (message.kind !== 'simulation/submit-command') continue;
          const data = message.payload?.command?.data;
          if (data?.type !== 'CancelBuildOrder') continue;
          return data.orderId ?? '';
        }
        return '';
      });
      await page.waitForTimeout(1_200);
      const after = await readWorker(page);
      const stateAtRead = before.orders.find((order) => order.id === cancelled)?.state ?? 'gone';
      outcomes.push({
        advertisedOnTheRow: candidate.back,
        stateWord: candidate.text,
        money: after.treasuryMinorUnits - before.treasuryMinorUnits,
        tickBefore: before.tick,
        tickAfter: after.tick,
        executeAtTick: envelope?.executeAtTick ?? -1,
        stateAtRead,
        stateAfter: after.orders.find((order) => order.id === cancelled)?.state ?? 'gone',
        aimedAtTheRowItRead: cancelled === candidate.orderId,
        row: takeLast ? 'last paying row' : 'first paying row',
      });
      note(`press ${String(outcomes.length)} (${takeLast ? 'last' : 'first'} paying row):`
        + ` row said ${String(candidate.back)} [${candidate.text}]`
        + ` | the command named ${cancelled === candidate.orderId ? 'that same order' : `a DIFFERENT order (${cancelled})`}`
        + ` | that order's state when the row was read: ${stateAtRead}`
        + ` | submitted at tick ${String(before.tick)} to execute at ${String(envelope?.executeAtTick)}`
        + ` (lead ${String((envelope?.executeAtTick ?? Number.NaN) - before.tick)} ticks)`
        + ` | money ${String(after.treasuryMinorUnits - before.treasuryMinorUnits)}`
        + ` | state after ${String(after.orders.find((order) => order.id === cancelled)?.state)}`
        + ` | tick now ${String(after.tick)}`);
    }
    await transport(page, 'pause').click();

    const aimed = outcomes.filter((outcome) => outcome.aimedAtTheRowItRead);
    const honoured = aimed.filter((outcome) => outcome.money === outcome.advertisedOnTheRow).length;
    note('');
    note(`PRESSES: ${String(outcomes.length)}, of which ${String(aimed.length)} named the order whose row was read.`);
    note(`OF THOSE ${String(aimed.length)}: paid what the row said ${String(honoured)}; paid less ${String(aimed.length - honoured)}.`);
    note(`presses that named a different order than the row described: ${String(outcomes.length - aimed.length)}`);
    for (const which of ['first paying row', 'last paying row']) {
      const group = aimed.filter((outcome) => outcome.row === which);
      note(`  ${which}: ${String(group.filter((outcome) => outcome.money === outcome.advertisedOnTheRow).length)}`
        + ` of ${String(group.length)} paid what the row said`);
    }
    note(`outcomes: ${JSON.stringify(outcomes)}`);
    expect(outcomes.length).toBeGreaterThan(0);
  });
});
