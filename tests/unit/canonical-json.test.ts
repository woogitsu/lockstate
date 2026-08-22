import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/simulation/determinism';

describe('canonical JSON', () => {
  it('orders object keys independently of insertion order', () => {
    expect(canonicalJson({ z: [true, null], a: { y: 2, b: 'x' } })).toBe('{"a":{"b":"x","y":2},"z":[true,null]}');
  });
});
