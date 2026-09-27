import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

describe('delivery gate capacity (#587)', () => {
  it('refuses a bulk purchase before charging a fresh prison', () => {
    const runtime = createNewSimulationRuntime(587);
    const before = runtime.treasury.balanceMinorUnits;
    runtime.kernel.submitCommand(
      'bulk-bricks', runtime.kernel.expectedSequence, runtime.kernel.tick,
      packCommand({ type: 'PurchaseMaterials', orderId: 'bulk-bricks', itemId: 'item.brick', quantity: 625 }),
    );
    runtime.kernel.step();

    expect(runtime.refusals.last?.reason).toBe('purchase.storage-full');
    expect(runtime.treasury.balanceMinorUnits).toBe(before);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
  });
});
