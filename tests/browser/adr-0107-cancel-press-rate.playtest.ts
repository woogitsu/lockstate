import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TILE, armBuildable, buy, drag, openApp, tab } from './playtest-harness';

/**
 * **ADR 0107's own named falsifier, run rather than assumed.**
 *
 * "an implementer instrumenting `CancelBuildOrder` post-implementation with
 * the same 10-press-at-1×-against-a-freshly-`assigned`-row protocol #859
 * used" -- ADR 0107, "Weakest claim". This file is that instrument, adapted
 * from `playtest-2026-09-03-what-cancel-actually-gives-back.playtest.ts`'s
 * own probe technique (`lockstateAsk`, reading the worker directly rather
 * than the DOM) but tightened to one live order at a time: ten wall orders,
 * placed one after another at distinct tiles, each pressed the instant its
 * own row is read as `assigned` with a non-zero advertised refund, with the
 * clock running at 1x throughout. One order at a time avoids #859's own
 * side-finding 1 (a pooled row re-aimed under the pointer) so this file
 * measures the tick-projection race alone.
 *
 * It is not a gate: `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects a `.playtest.ts`.
 * Nothing here asserts a rate; the log is the deliverable.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5322 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/adr-0107-cancel-press-rate.playtest.ts
 * ```
 */

const QUEUE_ROW = '.hud-build__queue-row';
const CONSTRUCTION_CONTAINER = 'construction-materials';
const BRICK = 'item.brick';
const PRESSES = 10;

interface ProbeWindow {
  lockstateAsk?: (kind: string, payload: unknown) => Promise<unknown>;
}

/** Installs a way to ask the worker a question directly, over the same port the app uses. */
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const waiters = new Map<string, (message: unknown) => void>();
    let instance: Worker | undefined;

    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        instance = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as { kind?: string; replyTo?: string };
          const replyTo = data.replyTo;
          if (replyTo === undefined) return;
          const waiter = waiters.get(replyTo);
          if (waiter === undefined) return;
          waiters.delete(replyTo);
          waiter(event.data);
        });
      }
    }

    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as unknown as ProbeWindow).lockstateAsk = (kind: string, payload: unknown) =>
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

interface WorkerReading {
  readonly tick: number;
  readonly treasuryMinorUnits: number;
  readonly brickQuantity: number;
  readonly orders: readonly { readonly id: string; readonly state: string }[];
}

async function readWorker(page: Page): Promise<WorkerReading> {
  return page.evaluate(async ([containerId, itemId]) => {
    const probe = window as unknown as ProbeWindow;
    const reply = (await probe.lockstateAsk!('simulation/request-snapshot', { reason: 'consistency-check' })) as {
      payload?: {
        tick?: number;
        snapshot?: {
          data?: {
            construction?: { orders?: { id: string; state: string }[] };
            simulation?: {
              economy?: { treasury?: { balanceMinorUnits?: number } };
              operations?: { containers?: [string, [string, number, number][]][] };
            };
          };
        };
      };
    };
    const bundle = reply.payload?.snapshot?.data;
    const containers = bundle?.simulation?.operations?.containers ?? [];
    const container = containers.find((entry) => entry[0] === containerId);
    const line = (container?.[1] ?? []).find((entry) => entry[0] === itemId);
    return {
      tick: reply.payload?.tick ?? -1,
      treasuryMinorUnits: bundle?.simulation?.economy?.treasury?.balanceMinorUnits ?? Number.NaN,
      brickQuantity: line?.[1] ?? 0,
      orders: (bundle?.construction?.orders ?? []).map((o) => ({ id: o.id, state: o.state })),
    };
  }, [CONSTRUCTION_CONTAINER, BRICK] as const);
}

async function readAdvertised(
  page: Page,
): Promise<readonly { readonly orderId: string; readonly state: string; readonly cancelRefundMinorUnits: number }[]> {
  return page.evaluate(async () => {
    const probe = window as unknown as ProbeWindow;
    const reply = (await probe.lockstateAsk!('simulation/request-projection', {
      projectionId: 'hud/build-queue',
      offset: 0,
      limit: 50,
    })) as { payload?: { view?: { data?: { orders?: { rows?: { orderId: string; state: string; cancelRefundMinorUnits: number }[] } } } } };
    return reply.payload?.view?.data?.orders?.rows ?? [];
  });
}

async function refusalText(page: Page): Promise<string> {
  return page.evaluate(() => (document.querySelector('.hud__refusal')?.textContent ?? '').trim());
}

const transport = (page: Page, which: 'pause' | 'play') => page.locator('.hud-strip__transport button').nth(which === 'pause' ? 0 : 1);

async function openQueueFold(page: Page): Promise<void> {
  const section = page.locator('.hud-build__queue');
  if ((await section.count()) === 0) return;
  if ((await section.getAttribute('data-collapsed')) !== 'true') return;
  await section.locator('.ui-section__header').click();
  await page.waitForTimeout(150);
}

interface PressOutcome {
  readonly index: number;
  readonly orderId: string;
  readonly advertised: number;
  readonly moneyMoved: number;
  readonly honoured: boolean;
  readonly refusalSeen: string;
  readonly stateAfter: string | undefined;
}

test.describe('ADR 0107: the 10-press-at-1x-against-a-freshly-assigned-row protocol', () => {
  test('measures the current tree exactly as #859 would', async ({ page }) => {
    test.slow();
    await installProbe(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
    const from = { x: Math.round(viewport.width * 0.35), y: Math.round(viewport.height / 2) };

    // 200 bricks up front so every order's own demand is met from the shelf
    // -- no just-in-time purchase, no delivery wait -- and so a run that
    // destroys a few allocations by landing on `in-progress` does not run the
    // supply out partway through the ten presses.
    await buy(page, 'wall-brick', 200);
    {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 60_000) {
        const reading = await readWorker(page);
        if (reading.brickQuantity >= 200) break;
        await page.waitForTimeout(200);
      }
    }

    await transport(page, 'play').click();
    await expect(page.locator('.hud-clock__speed')).toHaveText('×1');

    const outcomes: PressOutcome[] = [];
    for (let index = 0; index < PRESSES; index += 1) {
      const orderId = `press-${String(index)}`;
      // A one-tile drag at a fresh row of tiles, well clear of the last one,
      // so admits never refuses on adjacency.
      await armBuildable(page, 'wall-brick');
      // A grid rather than a single line: ten rows at `TILE * 2` spacing runs
      // off the bottom of a 900px-tall viewport (and off a 1440px-wide one
      // just as fast), and a drag whose tiles are never resolved places
      // nothing at all -- measured directly, that is why presses 5-10 read
      // "NO ORDER EVER READ assigned" on the first run of this file. Five
      // columns of two rows stays inside both bounds.
      const column = index % 5;
      const row = Math.floor(index / 5);
      const at = { x: from.x + column * TILE * 2, y: from.y + row * TILE * 3 };
      await drag(page, at, { x: at.x + Math.round(TILE * 0.5), y: at.y });

      // Poll the worker's own projection -- not the DOM -- until THIS
      // specific order (there is only ever one live order at a time in this
      // loop) is read as `assigned` with a non-zero advertised refund, and
      // press the instant that is true. This is the row a player would have
      // been reading.
      let advertised = 0;
      let workerOrderId: string | undefined;
      const findStartedAt = Date.now();
      while (Date.now() - findStartedAt < 30_000) {
        const rows = await readAdvertised(page);
        const fresh = rows.find((row) => row.state === 'assigned' && row.cancelRefundMinorUnits > 0);
        if (fresh !== undefined) {
          advertised = fresh.cancelRefundMinorUnits;
          workerOrderId = fresh.orderId;
          break;
        }
        await page.waitForTimeout(15);
      }
      if (workerOrderId === undefined) {
        // eslint-disable-next-line no-console
        console.log(`press ${String(index + 1)}: NO ORDER EVER READ assigned WITH A NON-ZERO ADVERTISED REFUND -- skipped.`);
        continue;
      }

      await openQueueFold(page);
      const before = await readWorker(page);
      const button = page.locator(`${QUEUE_ROW}[data-order="${workerOrderId}"]`).getByRole('button', { name: 'Cancel' });
      try {
        await button.click({ timeout: 5_000 });
      } catch {
        // eslint-disable-next-line no-console
        console.log(`press ${String(index + 1)}: the row for ${workerOrderId} was not clickable in time -- skipped.`);
        continue;
      }
      await page.waitForTimeout(700);
      const after = await readWorker(page);
      const refusal = await refusalText(page);
      const moneyMoved = after.treasuryMinorUnits - before.treasuryMinorUnits;
      const stateAfter = after.orders.find((o) => o.id === workerOrderId)?.state;
      const honoured = moneyMoved === advertised;
      outcomes.push({ index: index + 1, orderId: workerOrderId, advertised, moneyMoved, honoured, refusalSeen: refusal, stateAfter });
      // eslint-disable-next-line no-console
      console.log(
        `press ${String(index + 1)}: order ${workerOrderId} | advertised ${String(advertised)}`
          + ` | money moved ${String(moneyMoved)} | ${honoured ? 'HONOURED' : 'NOT HONOURED'}`
          + ` | refusal line: ${JSON.stringify(refusal)} | state after: ${String(stateAfter)}`,
      );

      // Let this order fully settle (cancelled, or built and standing) before
      // the next iteration's drag, so the next press never has to share the
      // pooled queue with this one.
      const settleStartedAt = Date.now();
      while (Date.now() - settleStartedAt < 15_000) {
        const reading = await readWorker(page);
        const still = reading.orders.find((o) => o.id === workerOrderId);
        if (still === undefined || still.state === 'cancelled' || still.state === 'completed') break;
        await page.waitForTimeout(100);
      }
    }

    await transport(page, 'pause').click();

    const honouredCount = outcomes.filter((o) => o.honoured).length;
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(
      `SUMMARY: ${String(outcomes.length)} presses landed on a row read as freshly \`assigned\`.`
        + ` ${String(honouredCount)} paid what the row said; ${String(outcomes.length - honouredCount)} did not.`,
    );
    // eslint-disable-next-line no-console
    console.log(`outcomes: ${JSON.stringify(outcomes)}`);
    expect(outcomes.length).toBeGreaterThan(0);
  });
});
