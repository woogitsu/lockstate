import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
type Mesh = { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; materials: string[] };
type Normal = { name: string; inwardPolygons: number; degenerateIndices: number[]; minimumOutwardDistance: number };
const p = JSON.parse(readFileSync(new URL('assets/source/blender/fixture.cell.toilet_sink.angled-connection.provenance.json', root), 'utf8')) as {
  originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
  retainedMeshesBefore: Mesh[]; retainedMeshesAfter: Mesh[]; allAuthoredRawMeshes: Mesh[];
  retainedMaterialValues: unknown[]; retainedObjectMatrices: Record<string, number[][]>;
  retainedEvaluatedHashes: Record<string, string>; allAuthoredEvaluatedHashes: Record<string, string>;
  sourceEvaluatedBounds: { min: number[]; max: number[] }; retainedActions: unknown[];
  originalEvaluatedNormals: Normal[]; authoredEvaluatedNormals: Normal[]; addedMeshNames: string[];
  originalCisternBandToBowlSeparatingYPlanes: { gapTiles: number };
  actualTriangleInteriorContacts: { addedPart: string; retainedTarget: string; actualInteriorWitness: number[]; distanceToActualSurfaces: number[] }[];
  acceptedCamera: unknown;
};

it('preserves every current44 toilet part, eight stored graphs and source bounds with one actual ceramic outlet', () => {
  expect(p.originalSourceSha256).toBe('335544282e27ff01608f7f10987c054012d38ec3905340c24c142b7b794b1b2a');
  expect(hash(readFileSync(new URL(p.originalSource, root)))).toBe(p.originalSourceSha256);
  expect(p.sourceSha256).toBe('ebc1570274663d22315eed0adfafe8886120bdbf9901dfa744edcde540428ff8');
  expect(hash(readFileSync(new URL(p.source, root)))).toBe(p.sourceSha256);
  const original = JSON.parse(readFileSync(new URL('docs/research/2026-10-03-cell-toilet-flush-neck/actual-original-inventory-and-source-poses.json', root), 'utf8')) as { allRawMeshes: Mesh[]; allFullStoredMaterialGraphs: unknown[]; actualRawSourceBounds: unknown; allObjectMatrices: unknown; allEvaluatedHashes: unknown; allEvaluatedNormalAudit: unknown };
  expect(p.retainedMeshesBefore).toHaveLength(44);
  expect(p.retainedMeshesBefore).toEqual(original.allRawMeshes);
  expect(p.retainedMeshesAfter).toEqual(p.retainedMeshesBefore);
  expect(p.allAuthoredRawMeshes.filter(row => p.retainedMeshesBefore.some(old => old.name === row.name))).toEqual(p.retainedMeshesBefore);
  expect(p.allAuthoredRawMeshes).toHaveLength(45);
  expect(p.retainedMaterialValues).toHaveLength(8);
  expect(p.retainedMaterialValues).toEqual(original.allFullStoredMaterialGraphs);
  expect(p.sourceEvaluatedBounds).toEqual(original.actualRawSourceBounds);
  expect(p.retainedObjectMatrices).toEqual(original.allObjectMatrices);
  expect(p.retainedEvaluatedHashes).toEqual(original.allEvaluatedHashes);
  for (const [name, digest] of Object.entries(p.retainedEvaluatedHashes)) expect(p.allAuthoredEvaluatedHashes[name]).toBe(digest);
  expect(p.originalEvaluatedNormals).toEqual(original.allEvaluatedNormalAudit);
  expect(p.authoredEvaluatedNormals.filter(row => p.retainedMeshesBefore.some(old => old.name === row.name))).toEqual(p.originalEvaluatedNormals);
  expect(p.retainedActions).toEqual([]);
  expect(p.addedMeshNames).toEqual(['physical-toilet.rear ceramic flush neck']);
  const normal = p.authoredEvaluatedNormals.find(row => row.name === p.addedMeshNames[0])!;
  expect(normal.inwardPolygons).toBe(0); expect(normal.degenerateIndices).toEqual([]); expect(normal.minimumOutwardDistance).toBeGreaterThan(0);
  expect(p.actualTriangleInteriorContacts.map(row => row.retainedTarget)).toEqual(['Cistern teal ceramic band', 'Sculpted ceramic bowl']);
  for (const row of p.actualTriangleInteriorContacts) {
    expect(row.addedPart).toBe(p.addedMeshNames[0]); expect(row.actualInteriorWitness).toHaveLength(3);
    expect(row.distanceToActualSurfaces).toHaveLength(2); for (const depth of row.distanceToActualSurfaces) expect(depth).toBeGreaterThan(.001);
  }
  expect(p.originalCisternBandToBowlSeparatingYPlanes.gapTiles).toBeCloseTo(.0056, 7);
  expect(p.acceptedCamera).toEqual({resolution:[512,512],orthoScale:8,nominalPixelsPerTile:64,target:[.5,.5,.553750041872263],sourceFit:[1,1,1],footprint:[1,1]});
  expect(obliqueAssetIdForObject('object.toilet')).toBe('fixture.cell.toilet_sink');
  expect(defaultObjectRegistry.getById('object.toilet')!.footprint).toEqual({width:1,height:1});
});

it('keeps the dedicated physical guard in the actual canonical producer before min-corner translation', () => {
  const wrapper = readFileSync(new URL('tooling/blender/render-oblique-cell-toilet.py',root),'utf8');
  expect(wrapper).toContain('fixture.cell.toilet_sink.angled-connection.blend');
  expect(wrapper).toContain('guard.verify_loaded(bpy.context.scene)');
  expect(wrapper.indexOf('guard.verify_loaded(bpy.context.scene)')).toBeLessThan(wrapper.indexOf('Matrix.Translation((.5, .5, 0))'));
});
