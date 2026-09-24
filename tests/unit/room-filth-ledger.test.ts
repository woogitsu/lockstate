import { describe, expect, it } from 'vitest';
import { RoomFilthLedger } from '../../src/simulation/prisoners/room-filth-ledger';

describe('RoomFilthLedger', () => {
  it('charges each exposed prisoner for each dirty room only when waste disposal is absent', () => {
    const ledger = new RoomFilthLedger();
    ledger.recordUse('canteen.1', 'room.canteen', 7);
    ledger.recordUse('canteen.1', 'room.canteen', 7);
    ledger.recordUse('laundry.1', 'room.laundry', 7);
    ledger.recordUse('canteen.1', 'room.canteen', 8);

    expect(ledger.settleDay(false, ['canteen.1', 'laundry.1'])).toEqual([[7, 2], [8, 1]]);
    expect(ledger.settleDay(true, ['canteen.1', 'laundry.1'])).toEqual([]);
    expect(ledger.getSnapshot()).toEqual({ rooms: [['canteen.1', 0], ['laundry.1', 0]], exposures: [] });
  });

  it('round-trips a partly served day in canonical order and discards removed rooms', () => {
    const ledger = new RoomFilthLedger();
    ledger.recordUse('laundry.1', 'room.laundry', 9);
    ledger.recordUse('canteen.1', 'room.canteen', 3);
    ledger.recordUse('office.1', 'room.security-office', 3);
    const snapshot = ledger.getSnapshot();
    expect(snapshot).toEqual({ rooms: [['canteen.1', 1], ['laundry.1', 1]], exposures: [['canteen.1', [3]], ['laundry.1', [9]]] });

    const restored = new RoomFilthLedger();
    restored.loadSnapshot(snapshot);
    expect(restored.settleDay(false, ['canteen.1'])).toEqual([[3, 1]]);
    expect(restored.getSnapshot()).toEqual({ rooms: [['canteen.1', 2]], exposures: [] });
  });
});
