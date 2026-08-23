import { describe, expect, it } from 'vitest';
import { buildContentRegistry, ContentRegistry } from '../../src/content/registry';

interface Widget {
  readonly id: string;
  readonly numericId: number;
}

describe('ContentRegistry', () => {
  it('registers entries and looks them up by id and numeric id', () => {
    const registry = new ContentRegistry<Widget>();
    registry.register({ id: 'a', numericId: 1 });
    registry.register({ id: 'b', numericId: 2 });

    expect(registry.getById('a')).toEqual({ id: 'a', numericId: 1 });
    expect(registry.getByNumericId(2)).toEqual({ id: 'b', numericId: 2 });
    expect(registry.getById('missing')).toBeUndefined();
    expect(registry.size()).toBe(2);
  });

  it('throws on a duplicate id', () => {
    const registry = new ContentRegistry<Widget>();
    registry.register({ id: 'a', numericId: 1 });
    expect(() => registry.register({ id: 'a', numericId: 2 })).toThrow(/Duplicate content id/);
  });

  it('throws on a duplicate numeric id', () => {
    const registry = new ContentRegistry<Widget>();
    registry.register({ id: 'a', numericId: 1 });
    expect(() => registry.register({ id: 'b', numericId: 1 })).toThrow(/Duplicate content numeric id/);
  });

  it('all() is sorted by id, independent of registration order (deterministic loaded output)', () => {
    const registry = new ContentRegistry<Widget>();
    registry.register({ id: 'zebra', numericId: 3 });
    registry.register({ id: 'apple', numericId: 1 });
    registry.register({ id: 'mango', numericId: 2 });

    expect(registry.all().map((w) => w.id)).toEqual(['apple', 'mango', 'zebra']);

    const reordered = new ContentRegistry<Widget>();
    reordered.register({ id: 'apple', numericId: 1 });
    reordered.register({ id: 'mango', numericId: 2 });
    reordered.register({ id: 'zebra', numericId: 3 });

    expect(reordered.all()).toEqual(registry.all());
  });
});

describe('buildContentRegistry', () => {
  it('collects every duplicate rather than stopping at the first one', () => {
    const { registry, errors } = buildContentRegistry<Widget>([
      { id: 'a', numericId: 1 },
      { id: 'a', numericId: 2 }, // duplicate id
      { id: 'b', numericId: 1 }, // duplicate numeric id
      { id: 'c', numericId: 3 },
    ]);

    expect(registry.size()).toBe(2); // 'a' and 'c' only
    expect(errors).toEqual([
      { kind: 'duplicate-id', id: 'a' },
      { kind: 'duplicate-numeric-id', id: 'b', numericId: 1 },
    ]);
  });

  it('returns zero errors and a full registry for clean input', () => {
    const { registry, errors } = buildContentRegistry<Widget>([
      { id: 'a', numericId: 1 },
      { id: 'b', numericId: 2 },
    ]);
    expect(errors).toEqual([]);
    expect(registry.size()).toBe(2);
  });
});
