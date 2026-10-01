import { describe, expect, it } from 'vitest';
import { obliqueAssetIdForObject, obliqueCanonicalAssetIdForObject, obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';
describe('medical oblique object mapping', () => {
 it.each([
  ['object.medical-bed','furniture.medical-bed.variants'],
  ['object.medicine-cabinet','fixture.medicine-cabinet.variants'],
  ['object.security-console','utility.security-console.variants'],
  ['object.loading-dock-door','utility.loading-dock-door.variants'],
  ['object.utility-panel','utility.utility-panel.variants'],
  ['object.sink','fixture.cell.sink.handwash'],
 ] as const)('maps %s to registered asset', (objectId, assetId) => expect(obliqueAssetIdForObject(objectId)).toBe(assetId));
 it('resolves mapped catalogs and fails closed for unknown ids', () => {
  const security = { assetId: 'utility.security-console.variants' } as any;
  const dock = { assetId: 'utility.loading-dock-door.variants' } as any;
  const catalogs = new Map([[security.assetId, security], [dock.assetId, dock]]);
  expect(obliqueCatalogForObject('object.security-console', catalogs)).toBe(security);
  expect(obliqueCatalogForObject('object.loading-dock-door', catalogs)).toBe(dock);
  expect(obliqueAssetIdForObject('object.bed')).toBeUndefined();
 });
});
it('fails closed when the mapped asset is absent from the registry', () => {
 expect(obliqueCatalogForObject('object.medical-bed', new Map())).toBeUndefined();
});
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
const registry = {
 schemaVersion: 1,
 entries: [
  { assetId: 'furniture.medical-bed.variants', manifest: '/game-content/oblique-furniture-medical-bed.v1.json' },
  { assetId: 'fixture.medicine-cabinet.variants', manifest: '/game-content/oblique-fixture-medicine-cabinet.v1.json' },
 ],
};
it('registry contains both medical mapped assets', () => {
 const parsed = parseObliqueModuleRegistry(registry);
 expect(parsed.entries.map((entry) => entry.assetId)).toEqual(expect.arrayContaining([
  'furniture.medical-bed.variants', 'fixture.medicine-cabinet.variants',
 ]));
});

describe('oblique canonical aliases', () => {
 it.each([
  ['wall.interior.module', {}, 'wall.interior.module.full'],
  ['wall.interior.module', { cutaway: true }, 'wall.interior.module.cutaway'],
  ['wall.interior.module', { edge: 'west' }, 'wall.interior.module.west.full'],
  ['wall.interior.module', { edge: 'west', cutaway: true }, 'wall.interior.module.west.cutaway'],
  ['door.interior', {}, 'door.interior.open.full'],
  ['door.interior', { edge: 'west' }, 'door.interior.open.west.full'],
  ['door.interior', { cutaway: true }, 'door.interior.open.cutaway'],
  ['door.interior', { edge: 'west', cutaway: true }, 'door.interior.open.west.cutaway'],
 ] as const)('resolves %s', (objectId, options, expected) => {
  expect(obliqueCanonicalAssetIdForObject(objectId, options)).toBe(expected);
 });
 it('fails closed for unknown ids', () => expect(obliqueCanonicalAssetIdForObject('object.unknown')).toBeUndefined());
});
