import { describe, expect, it } from 'vitest';
import { CellSharingAssessmentLedger } from '../../src/simulation/prisoners/cell-sharing-assessment';

describe('CellSharingAssessmentLedger', () => {
  it('keeps the first placement assessment when a cellmate changes classification', () => {
    const ledger = new CellSharingAssessmentLedger();
    ledger.reconcile('cell-a', [{ entityId: 1, riskTier: 3 }, { entityId: 2, riskTier: 0 }], 10);
    expect(ledger.forPrisoner(1)).toMatchObject({ roomInstanceId: 'cell-a', initialRating: 3, currentRating: 3, assessedAtTick: 10 });

    ledger.reconcile('cell-a', [{ entityId: 1, riskTier: 3 }, { entityId: 2, riskTier: 2 }], 20);
    expect(ledger.forPrisoner(1)).toMatchObject({ initialRating: 3, currentRating: 1, assessedAtTick: 10, reassessedAtTick: 20 });
  });

  it('does not move the reassessment time when the inputs have not changed', () => {
    const ledger = new CellSharingAssessmentLedger();
    ledger.reconcile('cell-a', [{ entityId: 2, riskTier: 0 }, { entityId: 1, riskTier: 3 }], 10);
    ledger.reconcile('cell-a', [{ entityId: 1, riskTier: 3 }, { entityId: 2, riskTier: 0 }], 20);
    expect(ledger.forPrisoner(1)?.reassessedAtTick).toBe(10);
  });

  it('starts a new placement assessment after a transfer and drops former residents', () => {
    const ledger = new CellSharingAssessmentLedger();
    ledger.reconcile('cell-a', [{ entityId: 1, riskTier: 3 }, { entityId: 2, riskTier: 0 }], 10);
    ledger.reconcile('cell-a', [{ entityId: 2, riskTier: 0 }], 20);
    ledger.reconcile('cell-b', [{ entityId: 1, riskTier: 3 }], 20);
    expect(ledger.forPrisoner(1)).toMatchObject({ roomInstanceId: 'cell-b', initialRating: 0, currentRating: 0, assessedAtTick: 20 });
    expect(ledger.forPrisoner(2)?.currentRating).toBe(0);
  });

  it('restores the original rating and reassesses changed occupants deterministically', () => {
    const first = new CellSharingAssessmentLedger();
    first.reconcile('cell-a', [{ entityId: 1, riskTier: 3 }, { entityId: 2, riskTier: 0 }], 10);
    const restored = new CellSharingAssessmentLedger();
    restored.loadSnapshot(first.getSnapshot());
    restored.reconcile('cell-a', [{ entityId: 2, riskTier: 2 }, { entityId: 1, riskTier: 3 }], 20);
    expect(restored.getSnapshot()).toEqual([
      expect.objectContaining({ entityId: 1, initialRating: 3, currentRating: 1, assessedAtTick: 10, reassessedAtTick: 20 }),
      expect.objectContaining({ entityId: 2, initialRating: 3, currentRating: 1, assessedAtTick: 10, reassessedAtTick: 20 }),
    ]);
  });

  it('forgets assessments for rooms that were removed', () => {
    const ledger = new CellSharingAssessmentLedger();
    ledger.reconcile('removed-cell', [{ entityId: 1, riskTier: 3 }], 10);
    ledger.retainRooms(new Set());
    expect(ledger.forPrisoner(1)).toBeUndefined();
  });
});
