import { describe, expect, it, vi } from 'vitest';
import { createOptionalRenderScene } from '../../src/rendering/scene/optional-render-scene-factory';

describe('optional render scene factory', () => {
  it('keeps WorldScene as the default and does not construct oblique', () => {
    const world = vi.fn(() => ({ kind: 'world' }));
    const oblique = vi.fn(() => ({ kind: 'oblique' }));
    expect(createOptionalRenderScene({ world, oblique })).toEqual({ mode: 'world', scene: { kind: 'world' } });
    expect(world).toHaveBeenCalledOnce();
    expect(oblique).not.toHaveBeenCalled();
  });

  it('constructs oblique only when explicitly selected', () => {
    const world = vi.fn(() => ({ kind: 'world' }));
    const oblique = vi.fn(() => ({ kind: 'oblique' }));
    expect(createOptionalRenderScene({ mode: 'oblique', world, oblique })).toEqual({ mode: 'oblique', scene: { kind: 'oblique' } });
    expect(oblique).toHaveBeenCalledOnce();
    expect(world).not.toHaveBeenCalled();
  });
});
