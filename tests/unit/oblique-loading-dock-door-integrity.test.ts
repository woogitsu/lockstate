import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

it('exports the loading gate around its authoritative three-tile footprint with verified source and frame bytes', () => {
  const root = new URL('../../', import.meta.url);
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(
    'public/game-content/oblique-utility.loading-dock-door.v1.json', root,
  ), 'utf8')) as unknown);
  const footprint = defaultObjectRegistry.getById('object.loading-dock-door')!.footprint;
  const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
  expect(catalog.cameraTargetTiles).toEqual([footprint.width / 2, footprint.height / 2, 0.89]);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.pivotPx).toEqual([128, 128]);
  expect(sha(readFileSync(new URL(catalog.source, root)))).toBe(catalog.sourceSha256);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const bytes = readFileSync(new URL(`public${frame.image}`, root));
    expect(sha(bytes), frame.image).toBe(frame.sha256);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], frame.image).toEqual(catalog.resolutionPx);
  }
});
