import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assertStaffDeliveredArt } from '../browser/staff-room-padded-chair/native-evidence';
import { STAFF_CHAIR_ART } from '../browser/staff-room-padded-chair/art-fixture';

const root = new URL('../../', import.meta.url);
const readPublic = (path: string): Buffer => readFileSync(new URL(`public${path}`, root));
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');

it('accepts independently pinned real source/descriptor/PNG using the native observer assertions', () => {
  expect(sha(readFileSync(new URL(STAFF_CHAIR_ART.source, root)))).toBe('2dde0a33689685fd067c124c82b7b88b31c606d6c950a0789903e1b0b4b0e934');
  const verified = assertStaffDeliveredArt(readPublic(STAFF_CHAIR_ART.descriptor), readPublic(STAFF_CHAIR_ART.exposedFrame));
  expect(verified.catalog.assetId).toBe('furniture.staff-room.padded-chair');
  expect(verified.catalog.frames).toHaveLength(72);
});

it('rejects the actual old/default wooden-chair descriptor and frame body', () => {
  const old = readPublic('/game-content/oblique-cell-chair.v1.json');
  const png = readPublic('/assets/environment/oblique/furniture.chair.wooden-yaw+60-elev40.c235ab779920.png');
  expect(() => assertStaffDeliveredArt(old, png)).toThrow();
});
