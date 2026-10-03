import { expect, it } from 'vitest';
import { objectThumbnailBounds } from '../../src/ui/hud/object-thumbnail';
it('fits actual alpha bounds instead of transparent export margins', () => {
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 3; y <= 4; y++) for (let x = 2; x <= 5; x++) pixels[(y * 8 + x) * 4 + 3] = 255;
  expect(objectThumbnailBounds(pixels, 8, 8)).toEqual({ x: 2, y: 3, width: 4, height: 2 });
});
it('rejects an empty authored image instead of hiding the explicit fallback', () => {
  expect(objectThumbnailBounds(new Uint8ClampedArray(16), 2, 2)).toBeUndefined();
});
