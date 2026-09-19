import { describe, expect, it } from 'vitest';
import type { PendingDeliveriesViewModel } from '../../src/simulation/presentation/procurement-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { PENDING_DELIVERY_ROW_LIMIT } from '../../src/ui/hud';
import { PendingDeliveriesReader, pendingDeliveriesFromProjection } from '../../src/ui/simulation-pending-deliveries';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';

/**
 * The main thread's translator for what has been bought and has not arrived,
 * proven with no worker and no DOM (#285).
 *
 * Two claims, different in kind. The pure mapping is one: **the purchase ids and
 * the paid figures come through unchanged**, because the first is what a
 * `CancelMaterialPurchase` names and the second is what a row *promises a player
 * will come back*. The reader is the other: it asks for the panel's own window
 * rather than the projection's default hundred, and it refuses to stack requests
 * on a cadence.
 */

const projection = (overrides: Partial<PendingDeliveriesViewModel> = {}): PendingDeliveriesViewModel => ({
  schemaVersion: 1,
  refundableMinorUnits: 305,
  deliveries: {
    total: 4,
    offset: 0,
    limit: 3,
    rows: [
      { orderId: 'buy-a', itemId: 'item.brick', quantity: 3, paidMinorUnits: 120, arrivesAtTick: 100 },
      { orderId: 'buy-b', itemId: 'item.wood-plank', quantity: 1, paidMinorUnits: 65, arrivesAtTick: 100 },
      { orderId: 'buy-c', itemId: 'item.brick', quantity: 2, paidMinorUnits: 80, arrivesAtTick: 200 },
    ],
  },
  ...overrides,
});

const labels: Readonly<Record<string, string>> = {
  'item.brick': 'item.brick.name',
  'item.wood-plank': 'item.wood-plank.name',
};

const labelKeyOf = (itemId: string): string | undefined => labels[itemId];

describe('what the Build panel is told about deliveries on the way', () => {
  it('carries every purchase id through unchanged, which is the whole contract of a stable id', () => {
    const view = pendingDeliveriesFromProjection(projection(), labelKeyOf);
    expect(view.deliveries.map((delivery) => delivery.orderId)).toEqual(['buy-a', 'buy-b', 'buy-c']);
  });

  it('carries the paid figure a row promises, unchanged and per delivery', () => {
    // The row says what cancelling gives back, and the simulation refunds the
    // recorded price -- so a figure this layer recomputed, rounded or shared
    // across rows would be a lie about money on the one control whose subject is
    // money.
    const view = pendingDeliveriesFromProjection(projection(), labelKeyOf);
    expect(view.deliveries.map((delivery) => delivery.paidMinorUnits)).toEqual([120, 65, 80]);
  });

  it('reports the whole list and the whole refund, not the rows it was handed', () => {
    // Three rows of four purchases. A header built from `deliveries.length`, or a
    // total summed over the window, would tell a player with 305 out that they
    // have 265 -- understating both the count and the money by the same row.
    const view = pendingDeliveriesFromProjection(projection(), labelKeyOf);
    expect(view.total).toBe(4);
    expect(view.refundableMinorUnits).toBe(305);
    expect(view.deliveries).toHaveLength(3);
  });

  it("keeps the projection's own order, which is the order the deliveries will land in", () => {
    const view = projection();
    const mapped = pendingDeliveriesFromProjection(view, labelKeyOf);
    expect(mapped.deliveries.map((delivery) => delivery.orderId)).toEqual(
      view.deliveries.rows.map((row) => row.orderId),
    );
  });

  it("names each delivery's item through the host's lookup and nothing else", () => {
    const view = pendingDeliveriesFromProjection(projection(), labelKeyOf);
    expect(view.deliveries.map((delivery) => delivery.labelKey)).toEqual([
      'item.brick.name',
      'item.wood-plank.name',
      'item.brick.name',
    ]);
  });

  it('keeps a row whose item the host cannot name, with the property absent rather than undefined', () => {
    /*
     * Money nobody can label is still money, so the row stays and the panel says
     * so in its own words -- dropping it would hide the only control that
     * recovers the payment.
     *
     * `exactOptionalPropertyTypes` is on, so "the host names none" has to be an
     * absent property; `in` is what tells that apart from a present `undefined`,
     * which `toEqual` treats as the same thing.
     */
    const view = pendingDeliveriesFromProjection(projection(), () => undefined);
    expect(view.deliveries.map((delivery) => delivery.orderId)).toEqual(['buy-a', 'buy-b', 'buy-c']);
    for (const delivery of view.deliveries) expect('labelKey' in delivery).toBe(false);
  });

  it('says nothing is on the way rather than saying nothing, which is a different fact', () => {
    const view = pendingDeliveriesFromProjection(
      projection({ refundableMinorUnits: 0, deliveries: { total: 0, offset: 0, limit: 3, rows: [] } }),
      labelKeyOf,
    );
    expect(view).toEqual({ total: 0, refundableMinorUnits: 0, deliveries: [] });
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

  public reply(index: number, view: PendingDeliveriesViewModel): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    const replyTo = (this.sent[index] as { messageId: string }).messageId;
    this.handler({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `reply-${replyTo}`,
      replyTo,
      kind: 'simulation/projection',
      payload: {
        projectionId: 'hud/pending-deliveries',
        tick: 42,
        page: { total: view.deliveries.total, offset: view.deliveries.offset, limit: view.deliveries.limit },
        view: {
          transport: 'structured-clone',
          schemaId: 'lockstate.hud-view-model.pending-deliveries',
          schemaVersion: 1,
          data: view as never,
        },
      },
    } as WorkerToMainMessage);
  }
}

describe('the reader that asks what is on the way', () => {
  it("asks for the panel's own window and no more", async () => {
    /*
     * The projection's default window is a hundred rows and the block draws
     * three. Asking for the default would build ninety-odd rows nothing can
     * render, twice a second, for the life of every session with the Build tab
     * open.
     */
    const channel = new FakeChannel();
    const reader = new PendingDeliveriesReader(channel, labelKeyOf, { generateMessageId: () => 'req-1' });

    const pending = reader.read();
    expect(channel.sent).toEqual([
      {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'req-1',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/pending-deliveries', limit: PENDING_DELIVERY_ROW_LIMIT },
      },
    ]);

    channel.reply(0, projection());
    await expect(pending).resolves.toEqual({
      total: 4,
      refundableMinorUnits: 305,
      deliveries: [
        { orderId: 'buy-a', labelKey: 'item.brick.name', quantity: 3, paidMinorUnits: 120 },
        { orderId: 'buy-b', labelKey: 'item.wood-plank.name', quantity: 1, paidMinorUnits: 65 },
        { orderId: 'buy-c', labelKey: 'item.brick.name', quantity: 2, paidMinorUnits: 80 },
      ],
    });
  });

  it('refuses to stack a second question while the first is unanswered', async () => {
    /*
     * It is driven by the counts publication, which arrives up to twice a second.
     * A reader that queued one request per publication would build a backlog
     * against a busy worker, and every answer in it would name deliveries a press
     * is about to try to refund.
     */
    const channel = new FakeChannel();
    let next = 0;
    const reader = new PendingDeliveriesReader(channel, labelKeyOf, {
      generateMessageId: () => `req-${String((next += 1))}`,
    });

    const first = reader.read();
    // `undefined` is "already asking", not an answer: a caller must leave what is
    // on screen alone rather than blanking it.
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent).toHaveLength(1);

    channel.reply(0, projection());
    await expect(first).resolves.toBeDefined();

    // And the next publication asks again, so the block is not frozen by the
    // guard above.
    void reader.read();
    expect(channel.sent).toHaveLength(2);
  });
});
