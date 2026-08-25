import { describe, expect, it } from 'vitest';
import { rateCellSharing, type CellSharingView } from '../../src/simulation/prisoners/cell-sharing';

function view(entityId: number, riskTier: number): CellSharingView {
  return { entityId, riskTier };
}

describe('rateCellSharing', () => {
  it('rates an empty cell 0, so an arrival always prefers one', () => {
    expect(rateCellSharing(view(1, 3), [])).toBe(0);
    expect(rateCellSharing(view(1, 0), [])).toBe(0);
  });

  it('rates a same-tier cellmate 0 and a maximum-distance pairing 3', () => {
    expect(rateCellSharing(view(1, 2), [view(2, 2)])).toBe(0);
    // The pairing #79's summary names: a maximum-security prisoner and the
    // least-risky person in the prison, in one cell.
    expect(rateCellSharing(view(1, 3), [view(2, 0)])).toBe(3);
    expect(rateCellSharing(view(1, 0), [view(2, 3)])).toBe(3);
  });

  it('takes the worst pairing in the cell, not the average -- one bad cellmate is not diluted by three fine ones', () => {
    const arrival = view(1, 3);
    expect(rateCellSharing(arrival, [view(2, 3), view(3, 3), view(4, 0)])).toBe(3);
    expect(rateCellSharing(arrival, [view(2, 3), view(3, 3), view(4, 3)])).toBe(0);
  });

  it('ignores the arrival appearing in its own occupant list, so re-rating an occupied cell is stable', () => {
    expect(rateCellSharing(view(1, 3), [view(1, 3)])).toBe(0);
    expect(rateCellSharing(view(1, 3), [view(1, 3), view(2, 1)])).toBe(2);
  });

  it('is order-independent: the same occupants in any order give the same rating', () => {
    const arrival = view(1, 1);
    const occupants = [view(2, 3), view(3, 0), view(4, 2)];
    const forward = rateCellSharing(arrival, occupants);
    const reversed = rateCellSharing(arrival, [...occupants].reverse());
    expect(forward).toBe(reversed);
    expect(forward).toBe(2);
  });

  it('draws nothing and reads no clock: repeated calls with the same inputs are identical', () => {
    const arrival = view(1, 2);
    const occupants = [view(2, 0), view(3, 3)];
    const ratings = Array.from({ length: 5 }, () => rateCellSharing(arrival, occupants));
    expect(new Set(ratings).size).toBe(1);
  });
});
