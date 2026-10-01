import { describe, expect, it } from 'vitest';
import { projectObliqueActors } from '../../src/rendering/camera/oblique-world-projection';

describe('authored actor anchors in the angled world', () => {
  const pose = { target: { x: 0, y: 0 }, viewport: { width: 1920, height: 1080 },
    zoom: 1, yawRadians: 0, elevationRadians: Math.PI / 2 };

  it('keeps continuous simulation feet at the same anchor for distinct Blender roles', () => {
    const actors = projectObliqueActors([
      { id: 1, assetId: 'actor.prisoner', tileX: 1.25, tileY: 2.5, deltaX: 0, deltaY: 0 },
      { id: 2, assetId: 'actor.guard', tileX: 1.25, tileY: 2.5, deltaX: 0, deltaY: 0 },
    ], pose);
    expect(actors.map(actor => actor.assetId)).toEqual(['actor.prisoner.base', 'actor.guard.base']);
    for (const actor of actors) {
      expect([actor.tileX, actor.tileY]).toEqual([1.75, 3]);
      expect(actor.foot).toEqual({ x: 1072, y: 732 });
    }
    expect(actors[0]!.viewDepth).toBe(actors[1]!.viewDepth);
  });

  it('retains an explicit graphics fallback for an unregistered role', () => {
    const [actor] = projectObliqueActors([
      { id: 3, assetId: 'actor.medic', tileX: 1.25, tileY: 2.5, deltaX: 0, deltaY: 0 },
    ], pose);
    expect(actor?.assetId).toBeUndefined();
    expect(actor?.foot).toEqual({ x: 1072, y: 732 });
  });
});
