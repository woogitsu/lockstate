import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { decodeStaffMaterialPng } from '../browser/staff-room-padded-chair/material-observer';
import { COT_BLANKET_RGB_KEYS, COT_GRAPHITE_RGB_KEYS, COT_BLANKET_ROI, COT_INITIAL_FRAME,
  cotAuthoredBlanketPixels, cotBlanketMaterialEvidence } from '../browser/cell-cot-material-observer';

const root=new URL('../../',import.meta.url);
const record='docs/research/2026-10-04-cell-cot-native-material-observer/';
const bytes=(path:string):Buffer=>readFileSync(new URL(path,root));
const sha=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const catalog=(name:string)=>parseObliqueModuleCatalog(JSON.parse(bytes(`public/game-content/${name}`).toString('utf8')));
interface ProjectionMesh { mesh:string; materials:string[]; rayHitPixels:number; opaqueInsetPixelIndices:number[] }
interface Projection { sourceSha256:string; sourceUnchanged:boolean; renderPerformed:boolean; savedSourceEdited:boolean;
  meshes:ProjectionMesh[] }
const projection=JSON.parse(bytes(`${record}read-only-projection.json`).toString('utf8')) as Projection;
interface MaterialAudit { name:string; shaderBaseColor:number[]; shaderRoughness:number; shaderMetallic:number }
interface SourceReceipt { physicalAssembly:{meshCount:number;actualInteriorContacts:unknown[];completeStoredMaterialGraphs:unknown[]}; originalMaterialAudit:MaterialAudit[] }
const receipt=JSON.parse(bytes('assets/source/blender/furniture.cell.cot.single.soft-light.provenance.json').toString('utf8')) as SourceReceipt;

function actualSourceBitmap() {
  const actual=catalog('oblique-furniture.cell-cot.v1.json');
  expect(selectObliqueModuleFrame(actual,{yawRadians:-Math.PI/4,elevationRadians:Math.PI/4})).toEqual(COT_INITIAL_FRAME);
  const body=bytes(`public${COT_INITIAL_FRAME.image}`);
  expect(sha(body)).toBe('0c46d3637182dee0254f34de2789f113c4273e1bc061799899c5ffac9d3e4123');
  return decodeStaffMaterialPng(body);
}

describe('retained Cot material observer: source-derived exact colors, original native ROI and floor',()=>{
  it('binds real saved25-part/9-graph/6-contact source and deliberate cloth/steel shaders',()=>{
    const expected='1e3710b77601d6864f1de30d7b37a6220357320ae832354d3920b9fa95b17eba';
    expect(sha(bytes('assets/source/blender/furniture.cell.cot.single.soft-light.blend'))).toBe(expected);
    expect(projection).toMatchObject({sourceSha256:expected,sourceUnchanged:true,renderPerformed:false,savedSourceEdited:false});
    expect(projection.meshes).toHaveLength(25);expect(receipt.physicalAssembly.meshCount).toBe(25);
    expect(receipt.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(9);
    expect(receipt.physicalAssembly.actualInteriorContacts).toHaveLength(6);
    for(const [name,rgba,roughness,metallic] of [
      ['folded muted ochre blanket',[.67,.38,.19,1],.65,0],
      ['blanket narrow fold',[.77,.47,.26,1],.65,0],
      ['powder coated graphite steel',[.16,.23,.26,1],.50,.38],
    ] as const){
      const material=receipt.originalMaterialAudit.find(row=>row.name===name)!;
      expect(material).toBeDefined();rgba.forEach((value,index)=>expect(material.shaderBaseColor[index]).toBeCloseTo(value,6));
      expect(material.shaderRoughness).toBeCloseTo(roughness,6);expect(material.shaderMetallic).toBeCloseTo(metallic,6);
    }
    expect(projection.meshes.filter(row=>row.materials[0]==='powder coated graphite steel')).toHaveLength(15);
  });
  it('rederives all86 exact blanket keys from real evaluated-mesh source pixels, never the screenshot',()=>{
    const bitmap=actualSourceBitmap(),colors=new Set<number>();
    const authored=[['folded foot blanket','folded muted ochre blanket',790,595],['blanket turned top edge','blanket narrow fold',153,68]] as const;
    for(const [name,material,rayHits,insetPixels] of authored){
      const mesh=projection.meshes.find(row=>row.mesh===name)!;
      expect(mesh.materials).toEqual([material]);expect(mesh.rayHitPixels).toBe(rayHits);
      expect(mesh.opaqueInsetPixelIndices).toHaveLength(insetPixels);
      for(const pixel of mesh.opaqueInsetPixelIndices){
        const index=pixel*4;expect(bitmap.rgba[index+3]).toBe(255);
        colors.add((bitmap.rgba[index]!<<16)|(bitmap.rgba[index+1]!<<8)|bitmap.rgba[index+2]!);
      }
    }
    expect(colors.size).toBe(86);expect([...colors].sort((a,b)=>a-b)).toEqual(COT_BLANKET_RGB_KEYS);
    const steel=new Set<number>();
    for(const mesh of projection.meshes.filter(row=>row.materials[0]==='powder coated graphite steel')){
      for(const pixel of mesh.opaqueInsetPixelIndices){const index=pixel*4;
        if(bitmap.rgba[index+3]===255)steel.add((bitmap.rgba[index]!<<16)|(bitmap.rgba[index+1]!<<8)|bitmap.rgba[index+2]!);
      }
    }
    expect([...steel].sort((a,b)=>a-b)).toEqual(COT_GRAPHITE_RGB_KEYS);
  });
  it('preserves immutable21d actual q0 old72 RED and recognizes1033 source-colored pixels above the unchanged700 floor',()=>{
    const png=bytes(`${record}immutable21d-q0-completed-fullhd.png`);
    expect(sha(png)).toBe('817eea096d0bd361607dc7f0e498f4b2a5eef9dd80d4f5624019116cc16f9273');
    const bitmap=decodeStaffMaterialPng(png);expect([bitmap.width,bitmap.height]).toEqual([1920,1080]);
    expect(COT_BLANKET_ROI).toEqual([925,490,75,50]);
    const evidence=cotBlanketMaterialEvidence(png);
    expect(evidence.originalOchreRangePixels).toBe(72);expect(evidence.originalOchreRangePixels).toBeLessThanOrEqual(700);
    expect(evidence.authoredBlanketPixels).toBe(1033);expect(evidence.authoredBlanketPixels).toBeGreaterThan(700);
    expect(evidence.projectedGraphiteRgbPixels).toBe(19);expect(evidence.hardwarePixelAcceptanceClaimed).toBe(false);
  });
  // Whole-body negatives include all real opaque pixels, not cherry-picked crops.
  it.each([
    ['oblique-floor-cell.v1.json',72],['oblique-square-brick-full-wall.v1.json',72],['oblique-wall-cutaway.v1.json',72],
    ['oblique-cell-bed.v1.json',9],['oblique-reception-employee-desk.v1.json',72],['oblique-furniture-office-desk-generic.v1.json',72],
  ] as const)('rejects all genuine whole-body frames in %s', (name,count)=>{
    const actual=catalog(name);expect(actual.frames).toHaveLength(count);
    for(const frame of actual.frames){
      const png=bytes(`public${frame.image}`);expect(sha(png),frame.image).toBe(frame.sha256);
      const bitmap=decodeStaffMaterialPng(png);
      expect(cotAuthoredBlanketPixels(bitmap,[0,0,bitmap.width,bitmap.height]),frame.image).toBe(0);
    }
  });
  it('rejects actual unrotated Cell floor source art and an out-of-image ROI',()=>{
    const bitmap=decodeStaffMaterialPng(bytes('public/game-content/source-art/rendered.floor.cell.sealed-concrete.ce7e0bef8213.png'));
    expect(cotAuthoredBlanketPixels(bitmap,[0,0,bitmap.width,bitmap.height])).toBe(0);
    expect(()=>cotAuthoredBlanketPixels(bitmap,COT_BLANKET_ROI)).toThrow('Cot ROI outside actual screenshot');
  });
});
