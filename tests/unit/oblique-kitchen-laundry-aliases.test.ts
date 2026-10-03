import { expect, it } from 'vitest';
import { obliqueAssetIdForObject, obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';
import type { ObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

it.each([
  ['object.washing-machine', 'utility.washing-machine.variants'],
  ['object.stove', 'furniture.kitchen.stove.variants'],
  ['object.fridge', 'furniture.kitchen.fridge.variants'],
])('connects %s to its authored oblique asset when its catalog loads', (objectId, assetId) => {
  expect(obliqueAssetIdForObject(objectId)).toBe(assetId);
  const catalog = { assetId } as ObliqueModuleCatalog;
  expect(obliqueCatalogForObject(objectId, new Map([[assetId, catalog]]))).toBe(catalog);
  expect(obliqueCatalogForObject(objectId, new Map())).toBeUndefined();
});
