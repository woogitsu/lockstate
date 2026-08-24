import { describe, expect, it } from 'vitest';
import { MAX_PURCHASE_QUANTITY } from '../../src/simulation/economy';
import { packCommand, unpackCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { VersionedPayload } from '../../src/simulation/protocol/types';

/**
 * `PurchaseMaterials` at the decode boundary.
 *
 * `purchaseMaterialsSchema`'s own comment argues that its bounds are not
 * redundant with `ProcurementSystem.purchase`'s: the system's stop an
 * overflow, the schema's stop a malformed message reaching the system at all.
 * That claim was unproven. Measured before this file existed: replacing
 * `quantity: z.number().int().positive().max(MAX_PURCHASE_QUANTITY)` with a
 * bare `z.number()` left 1,666 tests passing, because `PurchaseMaterials`
 * appeared in exactly one test file -- an integration test that packs
 * `quantity: 2` -- and no test anywhere asserted `unpackCommand` refusing a
 * malformed one.
 *
 * ## Why `unpackCommand` and not `packCommand`
 *
 * `packCommand` calls `.parse` and throws, so its own type signature already
 * refuses most of this at compile time and a caller inside the application
 * cannot reach the failure. `unpackCommand` is where a payload from *outside*
 * the current process arrives: a restored save's pending command queue carries
 * its payload as opaque JSON (`save-schema.ts`'s `queuedCommandSchema` types
 * it as `detachedJsonValueSchema`), so a queued command is re-decoded through
 * this schema and through nothing else. That is the boundary a bound has to
 * hold at, and `null` -- not a throw -- is the contract there.
 *
 * ## The two `identifier` cases are the reason this exists at all
 *
 * They are not tidiness. `save-schema.ts`'s `economySectionSchema` types a
 * pending delivery's `orderId` and `itemId` as `identifierSchema`, and
 * `createSaveEnvelope` parses and throws. While this schema accepted any
 * string, a purchase with `orderId: '_bad id'` decoded, dispatched, entered
 * the procurement queue -- and then made the *save* throw, on a path with no
 * connection to the cause, only while that delivery was in flight, and
 * healing by itself once it arrived. An intermittent unreproducible save
 * failure produced by a validation gap between two boundaries that were
 * supposed to agree.
 */

const VALID: SimulationCommand = {
  type: 'PurchaseMaterials',
  orderId: 'order-1',
  itemId: 'item.brick',
  quantity: 2,
};

/** A payload built by hand, exactly as a restored queue's opaque JSON reaches the decoder. */
function payload(data: Record<string, unknown>): VersionedPayload {
  return {
    schemaId: 'lockstate.simulation.command',
    schemaVersion: 1,
    transport: 'structured-clone',
    data: data as never,
  };
}

describe('a PurchaseMaterials payload is refused at the decode boundary, not at the system', () => {
  it('accepts the shape the application would send, so the refusals below are about the bound and not the shape', () => {
    // The positive control. Every case after this asserts `null`, and a
    // schema that rejected everything would pass all of them.
    expect(unpackCommand(packCommand(VALID))).toEqual(VALID);
  });

  it('refuses a quantity that is not a positive integer', () => {
    for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(unpackCommand(payload({ ...VALID, quantity })), `quantity ${String(quantity)} must not decode`).toBeNull();
    }
  });

  it('refuses a quantity above MAX_PURCHASE_QUANTITY, and accepts the bound itself', () => {
    // Both sides of the boundary, so an off-by-one in either direction fails
    // here rather than being absorbed by the system's own guard.
    expect(unpackCommand(payload({ ...VALID, quantity: MAX_PURCHASE_QUANTITY + 1 }))).toBeNull();
    expect(unpackCommand(payload({ ...VALID, quantity: MAX_PURCHASE_QUANTITY }))).not.toBeNull();
  });

  it('refuses an orderId the save boundary would refuse', () => {
    // Every one of these is a string the previous `z.string()` accepted and
    // `identifierSchema` does not: a leading separator, whitespace, empty,
    // and past the 128-character cap.
    for (const orderId of ['', '_bad id', '-leading', 'has space', 'a'.repeat(129)]) {
      expect(unpackCommand(payload({ ...VALID, orderId })), `orderId "${orderId}" must not decode`).toBeNull();
    }
  });

  it('accepts the id shapes the application actually mints', () => {
    // `src/main.ts` mints `order-${crypto.randomUUID()}`. That it passed the
    // old bound too was luck rather than a constraint; this pins it.
    for (const orderId of ['order-1', 'order-3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'a', '0']) {
      expect(unpackCommand(payload({ ...VALID, orderId })), `orderId "${orderId}" must decode`).not.toBeNull();
    }
  });

  it('refuses an itemId that is not identifier-shaped, which the pending-delivery record also requires', () => {
    for (const itemId of ['', '.item.brick', 'item brick', 'x'.repeat(129)]) {
      expect(unpackCommand(payload({ ...VALID, itemId })), `itemId "${itemId}" must not decode`).toBeNull();
    }
    // The dotted catalog id shape has to keep working -- it is every real item.
    expect(unpackCommand(payload({ ...VALID, itemId: 'item.wood-plank' }))).not.toBeNull();
  });

  it('refuses an unknown extra field, because the schema is strict and a queued payload is untrusted', () => {
    expect(unpackCommand(payload({ ...VALID, urgency: 3 }))).toBeNull();
  });

  it('refuses a missing field rather than defaulting it', () => {
    for (const omitted of ['orderId', 'itemId', 'quantity'] as const) {
      const { [omitted]: _dropped, ...rest } = VALID;
      expect(unpackCommand(payload(rest)), `a payload with no ${omitted} must not decode`).toBeNull();
    }
  });
});
