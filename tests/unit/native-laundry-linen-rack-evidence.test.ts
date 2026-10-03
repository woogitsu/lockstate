import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { assertLaundryDeliveredArt, assertLaundryNativeOwners } from '../browser/laundry-linen-rack/native-evidence';
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

/** Actual recorded typed-kernel output, not an injected browser placement. */
it.each([0, 1] as const)('requires both literal original washer owners and the independently paid Laundry q%s rack', turns => {
  const receipt = JSON.parse(readFileSync(new URL(`docs/research/2026-10-03-laundry-linen-rack-native/actual-public-typed-q${turns}-V9.json`, root), 'utf8')) as {
    wholeBefore: import('../../src/simulation/runtime/restore-session').SessionSnapshotBundle;
    wholeAfter: import('../../src/simulation/runtime/restore-session').SessionSnapshotBundle;
    wholeV9Exact: boolean;
  };
  expect(receipt.wholeV9Exact).toBe(true);
  expect(receipt.wholeAfter).toEqual(receipt.wholeBefore);
  assertLaundryNativeOwners(receipt.wholeBefore, turns, 'laundry-individual-linen-rack');
  const simulation = receipt.wholeBefore.simulation;
  const objects = simulation?.objects;
  if (simulation === undefined || objects === undefined) throw new Error('actual typed owner snapshot absent');
  const wrongPaidOwner = { ...receipt.wholeBefore, simulation: { ...simulation, objects: { ...objects,
    placedObjects: objects.placedObjects.map(object => object.sourceOrderId === 'laundry-individual-linen-rack'
      ? { ...object, orientation: 1 as const } : object),
  } } };
  expect(() => assertLaundryNativeOwners(wrongPaidOwner, turns, 'laundry-individual-linen-rack')).toThrow();
  const wrongWasher = { ...receipt.wholeBefore, simulation: { ...simulation, objects: { ...objects,
    placedObjects: objects.placedObjects.map(object => object.sourceOrderId === 'room-template-000000000002-2-object-000'
      ? { ...object, anchorTile: { ...object.anchorTile, x: tileCoordinate(object.anchorTile.x + 1) } } : object),
  } } };
  expect(() => assertLaundryNativeOwners(wrongWasher, turns, 'laundry-individual-linen-rack')).toThrow();
});
