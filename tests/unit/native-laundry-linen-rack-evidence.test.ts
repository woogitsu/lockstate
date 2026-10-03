import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assertLaundryDeliveredArt } from '../browser/laundry-linen-rack/native-evidence';
import { LAUNDRY_LINEN_ART } from '../browser/laundry-linen-rack/art-fixture';

const root = new URL('../../', import.meta.url);
const readPublic = (path: string): Buffer => readFileSync(new URL(`public${path}`, root));
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');

it('accepts independently pinned real source/descriptor/PNG using the native observer assertions', () => {
  expect(sha(readFileSync(new URL(LAUNDRY_LINEN_ART.source, root)))).toBe('779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec');
  const verified = assertLaundryDeliveredArt(readPublic(LAUNDRY_LINEN_ART.descriptor), readPublic(LAUNDRY_LINEN_ART.exposedFrame));
  expect(verified.catalog.assetId).toBe('furniture.laundry.linen-rack');
  expect(verified.catalog.frames).toHaveLength(72);
});

it('rejects the actual old/default generic-rack descriptor and frame body', () => {
  const old = readPublic('/game-content/oblique-cell-storage-rack.v1.json');
  const png = readPublic('/assets/environment/oblique/furniture.storage.rack.wooden-yaw+60-elev40.c7488e2ca937.png');
  expect(() => assertLaundryDeliveredArt(old, png)).toThrow();
});
