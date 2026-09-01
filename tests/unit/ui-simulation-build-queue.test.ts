import { describe, expect, it } from 'vitest';
import type { BuildQueueViewModel } from '../../src/simulation/presentation/construction-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { BUILD_QUEUE_ROW_LIMIT } from '../../src/ui/hud';
import { BuildQueueReader, buildQueueFromProjection } from '../../src/ui/simulation-build-queue';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';

/**
 * The main thread's translator for the build queue, proven with no worker and no
 * DOM.
 *
 * Two claims are worth asserting here and they are different in kind. The pure
 * mapping is one: **the order ids come through unchanged**, because they are what
 * a `CancelBuildOrder` names and a mangled one is a control aimed at nothing.
 * The reader is the other: it asks for the panel's own window rather than the
 * projection's default hundred, and it refuses to stack requests on a cadence.
 */

const projection = (overrides: Partial<BuildQueueViewModel> = {}): BuildQueueViewModel => ({
  schemaVersion: 1,
  started: 1,
  // A queue that is not short of money, which is what every case in this file
  // is about: the reader's job is the window and the ids, and #627's funding
  // block is asserted where it is produced
  // (`tests/unit/construction-build-queue-projection.test.ts`).
  materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0, items: [] },
  orders: {
    total: 12,
    offset: 0,
    limit: 3,
    rows: [
      { orderId: 'order-01', definitionId: 'wall-brick', tile: { x: 3, y: 3 }, edge: 'north', state: 'in-progress' },
      { orderId: 'order-02', definitionId: 'wall-brick', tile: { x: 3, y: 4 }, edge: 'north', state: 'assigned' },
      { orderId: 'order-03', definitionId: 'door-wooden', tile: { x: 3, y: 5 }, edge: 'west', state: 'materials-pending' },
    ],
  },
  ...overrides,
});

const labels: Readonly<Record<string, string>> = {
  'wall-brick': 'hud.build.buildable.wall-brick',
  'door-wooden': 'hud.build.buildable.door-wooden',
};

const labelKeyOf = (definitionId: string): string | undefined => labels[definitionId];

describe('what the Build panel is told about the queue', () => {
  it('carries every order id through unchanged, which is the whole contract of a stable id', () => {
    const queue = buildQueueFromProjection(projection(), labelKeyOf);
    expect(queue.orders.map((order) => order.orderId)).toEqual(['order-01', 'order-02', 'order-03']);
  });

  it('keeps the projection\'s own order, which is the order the crew will reach them in', () => {
    // Not re-sorted here, and not sorted by anything this layer chose: the
    // projection's ascending-order-id sequence *is* the build schedule, so a
    // reordering on this side would put the rows out of the order the player
    // will watch them happen in.
    const shuffled = projection();
    const queue = buildQueueFromProjection(shuffled, labelKeyOf);
    expect(queue.orders.map((order) => order.orderId)).toEqual(shuffled.orders.rows.map((row) => row.orderId));
  });

  it('reports the whole queue and how much of it is moving, not the row count', () => {
    // Three rows out of twelve orders. A header built from `orders.length` would
    // tell a player with twelve queued walls that they have three.
    const queue = buildQueueFromProjection(projection(), labelKeyOf);
    expect(queue.total).toBe(12);
    expect(queue.started).toBe(1);
    expect(queue.orders).toHaveLength(3);
  });

  it('names each order\'s buildable through the host\'s lookup and nothing else', () => {
    const queue = buildQueueFromProjection(projection(), labelKeyOf);
    expect(queue.orders.map((order) => order.labelKey)).toEqual([
      'hud.build.buildable.wall-brick',
      'hud.build.buildable.wall-brick',
      'hud.build.buildable.door-wooden',
    ]);
  });

  it('keeps a row whose buildable the host cannot name, with the property absent rather than undefined', () => {
    /*
     * The opposite of `roomNeedsFromProjections`, which *skips* a room the
     * catalogue cannot name, and the difference is what the row is for: a
     * nameless build order is still an order a player may want to cancel.
     *
     * `exactOptionalPropertyTypes` is on, so "the host names none" has to be an
     * absent property -- `in` is what tells the two apart, since a present
     * `undefined` compares equal to an absent one under `toEqual`.
     */
    const queue = buildQueueFromProjection(projection(), () => undefined);
    expect(queue.orders).toHaveLength(3);
    expect(queue.orders.map((order) => order.orderId)).toEqual(['order-01', 'order-02', 'order-03']);
    for (const order of queue.orders) expect('labelKey' in order).toBe(false);
  });

  it('carries the tile and edge each row is recognised by, and the state it is waiting in', () => {
    const queue = buildQueueFromProjection(projection(), labelKeyOf);
    expect(queue.orders[2]).toEqual({
      orderId: 'order-03',
      labelKey: 'hud.build.buildable.door-wooden',
      tile: { x: 3, y: 5 },
      edge: 'west',
      state: 'materials-pending',
    });
  });

  it('says the queue is empty rather than saying nothing, which is a different fact', () => {
    const queue = buildQueueFromProjection(
      projection({ started: 0, orders: { total: 0, offset: 0, limit: 3, rows: [] } }),
      labelKeyOf,
    );
    expect(queue).toEqual({
      total: 0,
      started: 0,
      orders: [],
      materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 },
    });
  });

  it('carries the shortfall the queue is stalled on, which is the one fact the rows cannot state', () => {
    /*
     * #627 computes it, #629 is why it has to reach a surface, and until #640's
     * playtest measured it this line was where it stopped: the field crossed the
     * worker boundary inside the projection's JSON and `HudBuildQueueViewModel`
     * had no member to receive it, so nothing on this thread could read it and
     * no test above the projection could assert it.
     *
     * Asserted over the whole block rather than the number alone, because
     * `unfunded` and `shortfallMinorUnits` are two different claims -- "the
     * queue is stalled on money" and "by this much" -- and a passthrough that
     * carried one and defaulted the other would satisfy either assertion on its
     * own. The end-to-end claim, over a prison that genuinely cannot pay rather
     * than over a literal written here, is in
     * `tests/integration/construction-just-in-time-materials.test.ts`.
     */
    const queue = buildQueueFromProjection(
      projection({
        materialsFunding: {
          unfunded: true,
          shortfallMinorUnits: 80,
          // Deliberately not equal to `shortfallMinorUnits`, so a passthrough
          // that quietly reused one number for the other could not pass this.
          nextOrderShortfallMinorUnits: 40,
          items: [{ itemId: 'item.brick', quantity: 2, costMinorUnits: 80 }],
        },
      }),
      labelKeyOf,
    );
    expect(queue.materialsFunding).toEqual({ unfunded: true, shortfallMinorUnits: 80, nextOrderShortfallMinorUnits: 40 });
  });

  it('does not carry the projection\'s per-item list, which nothing on this thread can name yet', () => {
    // Not an omission to be fixed by a passthrough: an item row needs the
    // catalogue lookup `HudPendingDeliveryViewModel.labelKey` needs, injected
    // across both boundaries from the composition root. Carrying the ids with
    // no way to name them would be a second field with no reader.
    const queue = buildQueueFromProjection(
      projection({
        materialsFunding: {
          unfunded: true,
          shortfallMinorUnits: 80,
          nextOrderShortfallMinorUnits: 40,
          items: [{ itemId: 'item.brick', quantity: 2, costMinorUnits: 80 }],
        },
      }),
      labelKeyOf,
    );
    expect('items' in queue.materialsFunding).toBe(false);
  });
});

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public reply(index: number, view: BuildQueueViewModel): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    const replyTo = (this.sent[index] as { messageId: string }).messageId;
    this.handler({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `reply-${replyTo}`,
      replyTo,
      kind: 'simulation/projection',
      payload: {
        projectionId: 'hud/build-queue',
        tick: 42,
        page: { total: view.orders.total, offset: view.orders.offset, limit: view.orders.limit },
        view: {
          transport: 'structured-clone',
          schemaId: 'lockstate.hud-view-model.build-queue',
          schemaVersion: 1,
          data: view as never,
        },
      },
    } as WorkerToMainMessage);
  }
}

describe('the reader that asks for the queue', () => {
  it('asks for the panel\'s own window and no more', async () => {
    /*
     * The projection's default window is a hundred rows and the block draws
     * three. Asking for the default would build ninety-odd rows nothing can
     * render, twice a second, for the life of every session with the Build tab
     * open -- which is the unbounded-read failure `docs/HUD_PROJECTIONS.md`
     * contract 5 exists to prevent, arriving through the caller instead of
     * through the projection.
     */
    const channel = new FakeChannel();
    const reader = new BuildQueueReader(channel, labelKeyOf, { generateMessageId: () => 'req-1' });

    const pending = reader.read();
    expect(channel.sent).toEqual([
      {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'req-1',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/build-queue', limit: BUILD_QUEUE_ROW_LIMIT },
      },
    ]);

    channel.reply(0, projection());
    await expect(pending).resolves.toEqual({
      total: 12,
      started: 1,
      orders: [
        { orderId: 'order-01', labelKey: 'hud.build.buildable.wall-brick', tile: { x: 3, y: 3 }, edge: 'north', state: 'in-progress' },
        { orderId: 'order-02', labelKey: 'hud.build.buildable.wall-brick', tile: { x: 3, y: 4 }, edge: 'north', state: 'assigned' },
        { orderId: 'order-03', labelKey: 'hud.build.buildable.door-wooden', tile: { x: 3, y: 5 }, edge: 'west', state: 'materials-pending' },
      ],
      materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 },
    });
  });

  it('refuses to stack a second question while the first is unanswered', async () => {
    /*
     * It is driven by the counts publication, which arrives up to twice a
     * second. A reader that queued one request per publication would build a
     * backlog against a busy worker, and every answer in it would be about a
     * prison two ticks stale -- with order ids in it that a press would cancel.
     */
    const channel = new FakeChannel();
    let next = 0;
    const reader = new BuildQueueReader(channel, labelKeyOf, {
      generateMessageId: () => `req-${String((next += 1))}`,
    });

    const first = reader.read();
    // `undefined` is "already asking", not an answer -- a caller must leave what
    // is on screen alone rather than blanking it.
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent).toHaveLength(1);

    channel.reply(0, projection());
    await first;

    // And it asks again once the answer is in.
    const third = reader.read();
    expect(channel.sent).toHaveLength(2);
    channel.reply(1, projection());
    await third;
  });

  it('rejects when the reply carries no view, so the caller can take the block off', async () => {
    // A worker that went away, a session that stopped. The block coming *off*
    // is the honest outcome: every row is a control aimed at an order id, and a
    // row nothing is answering for is a button pointed at a prison that may not
    // exist.
    const channel = new FakeChannel();
    const reader = new BuildQueueReader(channel, labelKeyOf, { generateMessageId: () => 'req-1', replyTimeoutMs: 20 });
    const pending = reader.read();
    reader.dispose();
    await expect(pending).rejects.toThrow();
  });
});
