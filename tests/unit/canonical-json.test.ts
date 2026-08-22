import { describe, expect, it } from 'vitest';
import { canonicalJson, deterministicStateHash } from '../../src/simulation/determinism';

describe('canonical JSON', () => {
  it('orders object keys independently of insertion order', () => {
    expect(canonicalJson({ z: [true, null], a: { y: 2, b: 'x' } })).toBe('{"a":{"b":"x","y":2},"z":[true,null]}');
  });

  it('hashes canonical state deterministically', () => {
    expect(deterministicStateHash({ b: 2, a: 1 })).toBe(deterministicStateHash({ a: 1, b: 2 }));
    expect(deterministicStateHash({ a: 1 })).not.toBe(deterministicStateHash({ a: 2 }));
  });
});
