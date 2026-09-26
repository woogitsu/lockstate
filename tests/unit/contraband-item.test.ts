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

  it('indexes only the final record when a saved item id appears twice', () => {
    const registry = new ContrabandRegistry();
    registry.introduce('item-1', 'contraband.phone', { kind: 'prisoner', id: '1' }, { sourceType: 'visit', sourceId: 'v1', introducedAtTick: 0 });
    const concealed = registry.getSnapshot()[0]!;
    registry.confiscate('item-1');
    const confiscated = registry.getSnapshot()[0]!;
    const restored = new ContrabandRegistry();
    restored.loadSnapshot([concealed, confiscated]);

    expect(restored.get('item-1')?.state).toBe('confiscated');
    expect(restored.byHolder('prisoner', '1')).toEqual([]);
  });
});

describe('a holder who leaves takes what they were concealing with them', () => {
  /**
   * `'departed'`, the third `ContrabandState`
   * ([ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md)).
   * Once contraband can enter on an arriving prisoner it has to be able to
   * leave with them -- at the end of a sentence, or through an escape attempt
   * nobody contained.
   */
  function withTwoOnOnePrisoner(): ContrabandRegistry {
    const registry = new ContrabandRegistry();
    registry.introduce('a', 'contraband.phone', { kind: 'prisoner', id: '7' }, { sourceType: 'prisoner', sourceId: '7', introducedAtTick: 0 });
    registry.introduce('b', 'contraband.drug', { kind: 'prisoner', id: '7' }, { sourceType: 'prisoner', sourceId: '7', introducedAtTick: 1 });
    registry.introduce('c', 'contraband.tool', { kind: 'prisoner', id: '8' }, { sourceType: 'prisoner', sourceId: '8', introducedAtTick: 2 });
    return registry;
  }

  it('marks every concealed item at that holder, in ascending item id, and touches nobody else’s', () => {
    const registry = withTwoOnOnePrisoner();

    expect(registry.departHolder('prisoner', '7', 50)).toEqual(['a', 'b']);

    expect(registry.get('a')?.state).toBe('departed');
    expect(registry.get('b')?.state).toBe('departed');
    expect(registry.get('c')?.state).toBe('concealed');
    expect(registry.byHolder('prisoner', '7')).toEqual([]);
    expect(registry.byHolder('prisoner', '8').map((item) => item.id)).toEqual(['c']);
  });

  it('keeps the record and writes the departure into the movement log, rather than deleting the evidence', () => {
    const registry = withTwoOnOnePrisoner();
    registry.departHolder('prisoner', '7', 50);

    // Provenance survives: an item that left is still traceable to the arrival
    // who brought it in, which is issue #27's "stable identity/provenance
    // sufficient for debugging and evidence".
    expect(registry.get('a')?.provenance).toEqual({ sourceType: 'prisoner', sourceId: '7', introducedAtTick: 0 });
    expect(registry.getMovementHistory('a')).toEqual([
      { holder: { kind: 'prisoner', id: '7' }, atTick: 0 },
      { holder: { kind: 'prisoner', id: '7' }, atTick: 50 },
    ]);
    expect(registry.all()).toHaveLength(3);
  });

  it('is a no-op for a holder that never held anything, which is the ordinary discharge', () => {
    const registry = withTwoOnOnePrisoner();
    expect(registry.departHolder('prisoner', '99', 50)).toEqual([]);
    expect(registry.all().filter((item) => item.state !== 'concealed')).toEqual([]);
  });

  it('leaves a departed item out of circulation for good: no move, no confiscation, no re-index on restore', () => {
    const registry = withTwoOnOnePrisoner();
    registry.departHolder('prisoner', '7', 50);

    expect(() => registry.moveHolder('a', { kind: 'cell', id: 'cell-1' }, 60)).toThrow(/not concealed/);
    expect(() => registry.confiscate('a')).toThrow(/not concealed/);

    const restored = new ContrabandRegistry();
    restored.loadSnapshot(registry.getSnapshot());
    expect(restored.get('a')).toEqual(registry.get('a'));
    expect(restored.getMovementHistory('a')).toEqual(registry.getMovementHistory('a'));
    expect(restored.byHolder('prisoner', '7')).toEqual([]);
  });
});
