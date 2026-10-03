import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect,it } from 'vitest';
import { obliqueAssetIdForActor } from '../../src/rendering/assets/oblique-actor-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root=new URL('../../',import.meta.url);
const hash=(bytes:Buffer):string=>createHash('sha256').update(bytes).digest('hex');

it('retains the original Guard, actual animation poses and complete packed graphs while connecting its rear belt',()=>{
 const p=JSON.parse(readFileSync(new URL('assets/source/blender/actor.guard.base.angled-detail.provenance.json',root),'utf8')) as {
  originalSource:string;originalSourceSha256:string;source:string;sourceSha256:string;
  retainedMeshesBefore:unknown[];retainedMeshesAfter:unknown[];retainedMaterialValues:{name:string;canonicalMaterialSha256:string}[];
  allAuthoredRawMeshes:unknown[];addedMeshNames:string[];retainedAnimations:unknown[];
  unusedOriginalGraphsRetainedForStorage:string[];
  retainedEightAnimationPoses:{frame:number;retained:Record<string,{evaluatedPositionSha256:string;matrixWorld:number[][]}>}[];
  authoredEightAnimationPoses:{frame:number;retained:Record<string,{evaluatedPositionSha256:string;matrixWorld:number[][]}>}[];
  sourceEvaluatedBounds:{min:number[];max:number[]};
  originalGeometricNormalAudit:{name:string;polygons:number;degenerateIndices:number[];inwardPolygons:number}[];
  evaluatedGeometricNormalAudit:{name:string;polygons:number;degenerateIndices:number[];inwardPolygons:number;minimumOutwardDistance:number}[];
  actualContactTargets:Record<string,string[]>;actualTriangleInteriorContacts:{shoe:string;retainedTarget:string;actualInteriorWitness:number[];overlappingDepth:number}[];
 };
 expect(hash(readFileSync(new URL(p.originalSource,root)))).toBe(p.originalSourceSha256);
 expect(p.originalSourceSha256).toBe('4a900b2d61ad2c7386f48176381a08ee6f796da9d57f096b478f7ba7e42501c7');
 expect(hash(readFileSync(new URL(p.source,root)))).toBe(p.sourceSha256);
 expect(p.sourceSha256).toBe('b1f402e1096c49e1ea65c2e7727df2b6c498a77d09fc485679f1dcf72c95b456');
 expect(p.retainedMeshesBefore).toHaveLength(68);expect(p.retainedMeshesAfter).toEqual(p.retainedMeshesBefore);
 expect(p.allAuthoredRawMeshes).toHaveLength(69);
 expect(p.retainedMaterialValues).toHaveLength(11);
 expect(p.retainedMaterialValues.map(m=>m.name)).toEqual(['Dull steel buttons','Guard badge and patches','Guard duty belt','Guard slate epaulettes','Guard worn navy cotton','Material','Navy seam shadow','Pale undershirt','Short dark hair','Warm skin','Worn charcoal shoes']);
 for(const m of p.retainedMaterialValues)expect(m.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
 expect(p.unusedOriginalGraphsRetainedForStorage).toEqual(['Material']);
 expect(p.retainedAnimations).toHaveLength(4);expect(p.retainedEightAnimationPoses.map(row=>row.frame)).toEqual([1,2,3,4,5,6,7,8]);
 for(const pose of p.retainedEightAnimationPoses){expect(Object.keys(pose.retained)).toHaveLength(68);for(const row of Object.values(pose.retained)){expect(row.evaluatedPositionSha256).toMatch(/^[0-9a-f]{64}$/);expect(row.matrixWorld).toHaveLength(4);}}
 expect(p.authoredEightAnimationPoses.map(row=>row.frame)).toEqual([1,2,3,4,5,6,7,8]);for(const pose of p.authoredEightAnimationPoses)expect(Object.keys(pose.retained)).toHaveLength(69);
 const name='physical-guard.rear duty belt band';expect(p.addedMeshNames).toEqual([name]);
 expect(p.actualContactTargets).toEqual({[name]:['Duty belt side.-1','Duty belt side.1','Jumpsuit hips']});
 expect(p.actualTriangleInteriorContacts).toHaveLength(3);
 for(const witness of p.actualTriangleInteriorContacts){expect(witness.shoe).toBe(name);expect(p.actualContactTargets[name]).toContain(witness.retainedTarget);expect(witness.actualInteriorWitness).toHaveLength(3);expect(witness.overlappingDepth).toBeGreaterThan(.12);}
 expect(p.originalGeometricNormalAudit).toHaveLength(68);
 expect(p.originalGeometricNormalAudit.reduce((n,row)=>n+row.polygons,0)).toBe(10678);
 expect(p.originalGeometricNormalAudit.reduce((n,row)=>n+row.degenerateIndices.length,0)).toBe(122);
 expect(p.evaluatedGeometricNormalAudit.filter(row=>row.name!==name)).toEqual(p.originalGeometricNormalAudit);
 const added=p.evaluatedGeometricNormalAudit.find(row=>row.name===name)!;expect(added.polygons).toBe(98);expect(added.degenerateIndices).toEqual([]);expect(added.inwardPolygons).toBe(0);expect(added.minimumOutwardDistance).toBeGreaterThan(0);
 expect(p.sourceEvaluatedBounds).toEqual({min:[-.5929999947547913,-.41499999165534973,.02500000223517418],max:[.5929999947547913,.3449999988079071,3.568000078201294]});
 expect(obliqueAssetIdForActor('actor.guard')).toBe('actor.guard.base');expect(obliqueAssetIdForActor('actor.guard.base')).toBe('actor.guard.base');
 const catalog=parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-actor-guard.v1.json',root),'utf8')));
 expect(catalog.assetId).toBe('actor.guard.base');expect(catalog.source).toBe('actor.guard.base.angled-detail.blend');expect(catalog.sourceSha256).toBe(p.sourceSha256);
 expect(catalog.resolutionPx).toEqual([512,512]);expect(catalog.nominalPixelsPerTile).toBe(64);expect(catalog.pivotPx).toEqual([256,256]);expect(catalog.cameraTargetTiles).toEqual([0,0,0]);
 expect(catalog.yawDegrees).toEqual(Array.from({length:24},(_,i)=>-180+i*15));expect(catalog.elevationDegrees).toEqual([25,45,65]);expect(catalog.frames).toHaveLength(72);
 for(const frame of catalog.frames){const png=readFileSync(new URL(`public${frame.image}`,root));expect(hash(png),frame.image).toBe(frame.sha256);expect(frame.image).toContain(`.${frame.sha256.slice(0,12)}.png`);expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([512,512]);expect(hasTransparentBorder(png),frame.image).toBe(true);}
});

function hasTransparentBorder(png: Buffer): boolean {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), stride = width * 4;
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) return false;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== (stride + 1) * height) return false;
  let previous = Buffer.alloc(stride), position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++]!;
    if (filter > 4) return false;
    const row = Buffer.from(raw.subarray(position, position + stride)); position += stride;
    for (let i = 0; i < stride; i++) {
      const left = i < 4 ? 0 : row[i - 4]!, above = previous[i]!, corner = i < 4 ? 0 : previous[i - 4]!;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = above;
      if (filter === 3) predictor = (left + above) >> 1;
      if (filter === 4) {
        const p = left + above - corner, a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? above : corner;
      }
      row[i] = (row[i]! + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      if ((x === 0 || x === width - 1 || y === 0 || y === height - 1) && row[x * 4 + 3] !== 0) return false;
    }
    previous = row;
  }
  return true;
}
