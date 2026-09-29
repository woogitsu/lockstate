import { describe, expect, it } from 'vitest';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
describe('medical oblique object mapping', () => {
 it.each([
  ['object.medical-bed','furniture.medical-bed.variants'],
  ['object.medicine-cabinet','fixture.medicine-cabinet.variants'],
 ] as const)('maps %s to registered asset', (objectId, assetId) => expect(obliqueAssetIdForObject(objectId)).toBe(assetId));
 it('fails closed for unknown ids', () => expect(obliqueAssetIdForObject('object.bed')).toBeUndefined());
});
import { obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';
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
