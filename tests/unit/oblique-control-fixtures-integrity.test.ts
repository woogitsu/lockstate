import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

it.each([
  ['oblique-utility.security-console.v1.json', [1, 0.5, 0.65]],
  ['oblique-utility.utility-panel.v1.json', [0.5, 0.5, .5049999952316284]],
] as const)('verifies authored bytes and square scale for %s', (name, target) => {
  const root = new URL('../../', import.meta.url);
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(`public/game-content/${name}`, root), 'utf8')));
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect(sha(readFileSync(new URL(catalog.source, root)))).toBe(catalog.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual(target);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    expect(sha(readFileSync(new URL(`public${frame.image}`, root))), frame.image).toBe(frame.sha256);
  }
});
