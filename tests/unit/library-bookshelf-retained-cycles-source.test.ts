import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const root = new URL('../../',import.meta.url);
const receipt = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.library.bookshelf.soft-light.provenance.json',root),'utf8'));
it('retains complete Bookshelf physical source and every authored shader input',()=> {
  expect(receipt.physicalAssembly.meshCount).toBe(63);
  expect(receipt.physicalAssembly.rawMeshes).toHaveLength(63);
  expect(receipt.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(9);
  expect(receipt.physicalAssembly.actualInteriorContacts).toHaveLength(48);
  expect(receipt.materialGraphsChanged).toBe(false);
  expect(receipt.protectedAfter).toEqual(receipt.protectedBefore);
  expect(receipt.cameraTargetTiles).toEqual([1,.5,1.05]);
  expect(receipt.footprintTiles).toEqual([2,1]);
  expect(receipt.canonicalMinCornerTranslation).toEqual([1,.5,0]);
  const steel=receipt.originalMaterialAudit.find((row:{name:string})=>row.name==='steel');
  expect(steel.shaderRoughness).toBe(.23000000417232513);
  expect(steel.shaderMetallic).toBe(.6499999761581421);
  expect(receipt.originalMaterialAudit.every((row:{shaderBaseColor:number[];diffuseRGBA:number[]})=>JSON.stringify(row.shaderBaseColor)===JSON.stringify(row.diffuseRGBA))).toBe(true);
  expect(createHash('sha256').update(readFileSync(new URL(receipt.source,root))).digest('hex')).toBe('aff857256da9b5895e3acd8a5fabe387e19b0f15dc36ab0327aa2e28cba0cf9f');
});
it('uses only this saved source bounded CPU128 profile after genuine noisy64 evidence',()=> {
  expect(receipt.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threads:1,samples:128,denoising:true,denoiser:'OPENIMAGEDENOISE',denoisingUseGpu:false});
  expect(receipt.actual64SampleDraft.lightingProfile).toMatchObject({samples:64,denoising:false});
  expect(createHash('sha256').update(readFileSync(new URL(receipt.actual64SampleDraft.source,root))).digest('hex')).toBe(receipt.actual64SampleDraft.sourceSha256);
  expect(receipt.afterRenderedFromActualSavedSource).toBe(true);
  expect(receipt.frames.filter((row:{stage:string;byteExactPublishedWorkbench?:boolean})=>row.stage==='before-workbench').every((row:{byteExactPublishedWorkbench:boolean})=>row.byteExactPublishedWorkbench)).toBe(true);
  expect(receipt.nativeAcceptance).toBe(false);
});
