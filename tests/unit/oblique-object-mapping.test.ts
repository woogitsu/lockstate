import { describe, expect, it } from 'vitest';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
describe('medical oblique object mapping', () => {
 it.each([
  ['object.medical-bed','furniture.medical-bed.variants'],
  ['object.medicine-cabinet','fixture.medicine-cabinet.variants'],
 ] as const)('maps %s to registered asset', (objectId, assetId) => expect(obliqueAssetIdForObject(objectId)).toBe(assetId));
 it('fails closed for unknown ids', () => expect(obliqueAssetIdForObject('object.bed')).toBeUndefined());
});
