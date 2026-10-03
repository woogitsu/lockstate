import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import type { ToiletSnapshotData } from '../browser/cell-toilet-flush-neck-evidence';
import { decodeStaffMaterialPng } from '../browser/staff-room-padded-chair/material-observer';
import { TOILET_TEAL_RGB_KEYS, TOILET_MATERIAL_RECTS, TOILET_PALETTE_SOURCE_FRAMES,
  toiletAuthoredTealPixels, toiletOriginalSteelPixels, toiletMaterialEvidence } from '../browser/cell-toilet-material-observer';

const root=new URL('../../',import.meta.url),record='docs/research/2026-10-04-cell-toilet-native-material-observer/';
const bytes=(path:string):Buffer=>readFileSync(new URL(path,root));
const sha=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const catalog=(name:string)=>parseObliqueModuleCatalog(JSON.parse(bytes(`public/game-content/${name}`).toString('utf8')));
interface Mesh {mesh:string;materials:string[];rayHitPixelIndices:number[];opaqueInsetPixelIndices:number[]}
interface Projection {sourceSha256:string;sourceUnchanged:boolean;renderPerformed:boolean;savedSourceEdited:boolean;
  poses:{yawDegrees:number;elevationDegrees:number;meshes:Mesh[]}[]}
const projection=JSON.parse(bytes(`${record}read-only-projection.json`).toString('utf8')) as Projection;
interface Material {name:string;shaderBaseColorDefault:number[];shaderRoughness:number;actualBaseColorLinks:string[][]}
interface Receipt {physicalAssembly:{meshCount:number;completeStoredMaterialGraphs:unknown[];actualInteriorContacts:unknown[]};originalMaterialAudit:Material[]}
const receipt=JSON.parse(bytes('assets/source/blender/fixture.cell.toilet_sink.soft-light.provenance.json').toString('utf8')) as Receipt;

const negativeScore=(path:string,turns:0|1)=>{
  const bitmap=decodeStaffMaterialPng(bytes(path)),rect=[0,0,bitmap.width,bitmap.height] as const;
  const first=toiletAuthoredTealPixels(bitmap,rect,turns),second=toiletOriginalSteelPixels(bitmap,rect);
  expect(first,`${path}: not the authored teal band`).toBe(0);
  // Original independent hardware colors can occur on other furniture. Both
  // untouched100/8 gates must pass; hardware alone is not model identity.
  expect(first>100&&second>8,`${path}: cannot replace the composed toilet`).toBe(false);
};

describe('Cell toilet observer: real authored teal, unchanged independent steel and floors',()=>{
  it('retains actual saved45/eight/two source and deliberate ceramic shader values',()=>{
    const expected='1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5';
    expect(sha(bytes('assets/source/blender/fixture.cell.toilet_sink.soft-light.blend'))).toBe(expected);
    expect(projection).toMatchObject({sourceSha256:expected,sourceUnchanged:true,renderPerformed:false,savedSourceEdited:false});
    expect(receipt.physicalAssembly.meshCount).toBe(45);expect(receipt.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(8);
    expect(receipt.physicalAssembly.actualInteriorContacts).toHaveLength(2);
    const teal=receipt.originalMaterialAudit.find(row=>row.name==='medical_teal')!;
    [.04,.35,.38,1].forEach((value,index)=>expect(teal.shaderBaseColorDefault[index]).toBeCloseTo(value,6));
    expect(teal.shaderRoughness).toBeCloseTo(.72,6);expect(teal.actualBaseColorLinks).toEqual([]);
    const ceramic=receipt.originalMaterialAudit.find(row=>row.name==='Cell toilet warm glazed porcelain')!;
    expect(ceramic.shaderRoughness).toBeCloseTo(.29,6);expect(ceramic.actualBaseColorLinks).toEqual([['Color Ramp','Color']]);
  });
  it.each([0,1] as const)('rederives actual q%s band colors from evaluated rays and source PNG, not native colors',turns=>{
    const actual=catalog('oblique-cell-toilet.v1.json');
    const localYaw=turns===0?15:-105+90;
    expect(selectObliqueModuleFrame(actual,{yawRadians:localYaw*Math.PI/180,elevationRadians:Math.PI/4})).toEqual(TOILET_PALETTE_SOURCE_FRAMES[turns]);
    const frame=TOILET_PALETTE_SOURCE_FRAMES[turns],png=bytes(`public${frame.image}`);
    expect(sha(png)).toBe(turns===0?'47730375f0d182cf9954923fb2e2cbdc9f86b114fbba57cccce51dfab2deccf2':'c3d7053f333f65f170a25d38c030b8087922392963448a96b3e86adbcbe116a5');
    const bitmap=decodeStaffMaterialPng(png);expect([bitmap.width,bitmap.height]).toEqual([512,512]);
    const pose=projection.poses.find(row=>row.yawDegrees===localYaw)!;expect(pose.elevationDegrees).toBe(40);expect(pose.meshes).toHaveLength(45);
    const mesh=pose.meshes.find(row=>row.mesh==='Cistern teal ceramic band')!;
    expect(mesh.materials).toEqual(['medical_teal']);expect(mesh.opaqueInsetPixelIndices).toHaveLength(turns===0?265:268);
    const colors=new Set<number>();let opaqueSamples=0;
    for(const pixel of mesh.opaqueInsetPixelIndices){
      const index=pixel*4;if(bitmap.rgba[index+3]!==255)continue;opaqueSamples++;
      colors.add((bitmap.rgba[index]!<<16)|(bitmap.rgba[index+1]!<<8)|bitmap.rgba[index+2]!);
    }
    expect(opaqueSamples).toBe(turns===0?264:267);
    expect(colors.size).toBe(turns===0?66:64);expect([...colors].sort((a,b)=>a-b)).toEqual(TOILET_TEAL_RGB_KEYS[turns]);
  });
  it.each([
    ['immutable21d-q0-completed-fullhd.png','e9781afef1b24bd5aa5031bcf77f2396c1a3fdaefc73dd07f21e2b324fa5f8c7'],
    ['immutable21d-q0-loaded-fullhd.png','bd9de6f541b14649451d18e5a733fef4185019d1138cde10a718bac6a3845e24'],
  ])('preserves actual21d original[0,22] and recognizes[327,22] in %s', (name,expectedHash)=>{
    const png=bytes(`${record}${name}`);expect(sha(png)).toBe(expectedHash);
    const evidence=toiletMaterialEvidence(png,0);
    expect(evidence.originalPixels).toEqual([0,22]);expect(evidence.pixels).toEqual([327,22]);
    expect(evidence.pixels[0]).toBeGreaterThan(100);expect(evidence.pixels[1]).toBeGreaterThan(8);
    expect(evidence.hardwareUniqueSourceIsolationClaimed).toBe(false);
    expect(evidence.rects).toEqual([[936,678,53,29],[983,707,16,17]]);
  });
  it('retains both original native rectangles and actual whole paused worker state/owners after Load',()=>{
    expect(TOILET_MATERIAL_RECTS).toEqual({0:[[936,678,53,29],[983,707,16,17]],1:[[993,440,44,26],[1040,458,17,18]]});
    interface Reply {payload:{snapshot:{schemaVersion:number;data:ToiletSnapshotData}}}
    const before=JSON.parse(bytes(`${record}toilet-completed-whole-paused-worker-snapshot.json`).toString('utf8')) as Reply;
    const after=JSON.parse(bytes(`${record}toilet-loaded-whole-paused-worker-snapshot.json`).toString('utf8')) as Reply;
    expect(before.payload.snapshot.schemaVersion).toBe(4);expect(after.payload.snapshot).toEqual(before.payload.snapshot);
    const data=after.payload.snapshot.data;
    expect(data.simulation.objects.placedObjects.filter(row=>row.objectId==='object.toilet')).toEqual([
      {placedObjectId:'object:22:9',objectId:'object.toilet',anchorTile:{x:22,y:9},orientation:0,sourceOrderId:'room-template-000000000002-2-object-001'},
    ]);
    expect(data.construction.orders.find(row=>row.id==='room-template-000000000002-2-object-001')).toMatchObject({definitionId:'toilet-brick',state:'completed',location:{x:22,y:9}});
  });
  it.each(['oblique-floor-cell.v1.json','oblique-square-brick-full-wall.v1.json','oblique-wall-cutaway.v1.json',
    'oblique-reception-employee-desk.v1.json','oblique-furniture-office-desk-generic.v1.json','oblique-furniture.cell-cot.v1.json'])(
    'rejects all72 real whole-body frames in %s at the same compound100/8 floors',name=>{
      const actual=catalog(name);expect(actual.frames).toHaveLength(72);
      for(const frame of actual.frames){
        const path=`public${frame.image}`;expect(sha(bytes(path))).toBe(frame.sha256);
        negativeScore(path,0);negativeScore(path,1);
      }
    });
  it('rejects all three genuine retained default/historical toilet source bodies and original floor',()=>{
    for(const file of ['fixture.cell.toilet_sink.18b4c51aa610.png','rendered.fixture.cell.toilet_sink.174633e075fb.png','rendered.fixture.cell.toilet_sink.be3079343f3c.png',
      'rendered.floor.cell.sealed-concrete.ce7e0bef8213.png']){
      const path=`public/game-content/source-art/${file}`;expect(sha(bytes(path)).slice(0,12)).toBe(file.split('.').at(-2));
      negativeScore(path,0);negativeScore(path,1);
    }
  });
  it('retains the original actual HTTP/Blob record as evidence without fabricating native execution',()=>{
    const evidence=JSON.parse(bytes(`${record}toilet-actual-network-and-htmlimage-evidence.json`).toString('utf8')) as {
      sourceSha256:string;exposedFrameBodySha256:string;syntheticFetchUsed:boolean;privateRendererTextureRead:boolean;
      decoded:{width:number;height:number;decoder:string};hardwareRoiMeasured:boolean};
    expect(evidence).toMatchObject({sourceSha256:'1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5',
      exposedFrameBodySha256:'12522e96db7e5cd627928558800c25dda9a33f43643a999213443144a30df312',
      syntheticFetchUsed:false,privateRendererTextureRead:false,hardwareRoiMeasured:false,
      decoded:{width:512,height:512,decoder:'HTMLImageElement from actual200body Blob'}});
  });
});
