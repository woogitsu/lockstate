import { describe, expect, it } from 'vitest';
import { ContrabandRegistry } from '../../src/simulation/contraband/item';

describe('ContrabandRegistry: introduction, movement, stash and confiscation', () => {
  it('introduces an item with stable identity and provenance', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.phone', { kind: 'prisoner', id: '7' }, { sourceType: 'visit', sourceId: 'visit-1', introducedAtTick: 10 });

    const item = registry.get('item-1');
    expect(item).toEqual({
      id: 'item-1',
      categoryId: 'contraband.phone',
      provenance: { sourceType: 'visit', sourceId: 'visit-1', introducedAtTick: 10 },
      holder: { kind: 'prisoner', id: '7' },
      state: 'concealed',
    });
  });

  it('throws introducing a duplicate item id', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.phone', { kind: 'prisoner', id: '7' }, { sourceType: 'visit', sourceId: 'v', introducedAtTick: 0 });
    expect(() => registry.introduce('item-1', 'contraband.phone', { kind: 'prisoner', id: '7' }, { sourceType: 'visit', sourceId: 'v', introducedAtTick: 0 })).toThrow(/Duplicate contraband item id/);
  });

  it('byHolder is indexed: only items concealed at the exact holder, sorted by id', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-b', 'contraband.currency', { kind: 'cell', id: 'cell-1' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    registry.introduce('item-a', 'contraband.currency', { kind: 'cell', id: 'cell-1' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    registry.introduce('item-c', 'contraband.currency', { kind: 'cell', id: 'cell-2' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });

    expect(registry.byHolder('cell', 'cell-1').map((item) => item.id)).toEqual(['item-a', 'item-b']);
    expect(registry.byHolder('cell', 'cell-2').map((item) => item.id)).toEqual(['item-c']);
    expect(registry.byHolder('cell', 'cell-3')).toEqual([]);
  });

  it('moveHolder relocates a concealed item and records movement history', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.drug', { kind: 'container', id: 'delivery-1' }, { sourceType: 'delivery', sourceId: 'delivery-1', introducedAtTick: 0 });

    registry.moveHolder('item-1', { kind: 'cell', id: 'cell-1' }, 5);
    registry.moveHolder('item-1', { kind: 'prisoner', id: '3' }, 9);

    expect(registry.byHolder('container', 'delivery-1')).toEqual([]);
    expect(registry.byHolder('cell', 'cell-1')).toEqual([]);
    expect(registry.byHolder('prisoner', '3').map((item) => item.id)).toEqual(['item-1']);

    expect(registry.getMovementHistory('item-1')).toEqual([
      { holder: { kind: 'container', id: 'delivery-1' }, atTick: 0 },
      { holder: { kind: 'cell', id: 'cell-1' }, atTick: 5 },
      { holder: { kind: 'prisoner', id: '3' }, atTick: 9 },
    ]);
  });

  it('confiscate removes an item from circulation and the holder index', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.weapon', { kind: 'prisoner', id: '7' }, { sourceType: 'staff', sourceId: '2', introducedAtTick: 0 });

    const confiscated = registry.confiscate('item-1');
    expect(confiscated.state).toBe('confiscated');
    expect(registry.byHolder('prisoner', '7')).toEqual([]);
    expect(registry.get('item-1')?.state).toBe('confiscated');
  });

  it('rejects moving or re-confiscating an already-confiscated item', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.weapon', { kind: 'prisoner', id: '7' }, { sourceType: 'staff', sourceId: '2', introducedAtTick: 0 });
    registry.confiscate('item-1');

    expect(() => registry.moveHolder('item-1', { kind: 'cell', id: 'cell-1' }, 1)).toThrow(/not concealed/);
    expect(() => registry.confiscate('item-1')).toThrow(/not concealed/);
  });

  it('snapshot/restore preserves items, holders and movement history across fresh instances', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.phone', { kind: 'prisoner', id: '1' }, { sourceType: 'visit', sourceId: 'v1', introducedAtTick: 0 });
    registry.moveHolder('item-1', { kind: 'cell', id: 'cell-1' }, 3);
    registry.introduce('item-2', 'contraband.tool', { kind: 'cell', id: 'cell-2' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 1 });
    registry.confiscate('item-2');

    const snapshot = registry.getSnapshot();
    const restored = new ContrabandRegistry();
    restored.loadSnapshot(snapshot);

    expect(restored.get('item-1')).toEqual(registry.get('item-1'));
    expect(restored.get('item-2')).toEqual(registry.get('item-2'));
    expect(restored.getMovementHistory('item-1')).toEqual(registry.getMovementHistory('item-1'));
    expect(restored.byHolder('cell', 'cell-1').map((item) => item.id)).toEqual(['item-1']);
    expect(restored.byHolder('cell', 'cell-2')).toEqual([]); // item-2 was confiscated -- not re-indexed on restore
  });
});
