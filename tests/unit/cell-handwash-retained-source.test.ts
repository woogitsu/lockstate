import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const root=new URL('../../',import.meta.url);
const read=(path:string):Buffer=>readFileSync(new URL(path,root));
const hash=(bytes:Buffer):string=>/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(bytes.toString('utf8'))?.[1]??createHash('sha256').update(bytes).digest('hex');
type Graph={canonicalMaterialSha256?:string;diffuse:number[];roughness:number;nodes:{type:string;inputs:{name:string;value:unknown}[]}[]};
type Receipt={source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;literalGraphSource:string;literalGraphSourceSha256:string;literalStoredGraphs:Graph[];exactRepairSockets:string[];physicalAssembly:{meshCount:number;rawMeshes:unknown[];completeStoredMaterialGraphs:Graph[];actualInteriorContacts:unknown[];minCornerBounds:unknown; evaluatedNormals:{degenerateIndices:number[];inwardPolygons:number}[]};repairedMaterialAudit:{diffuseRGBA:number[];shaderBaseColor:number[];viewportRoughnessProperty:number;shaderRoughness:number;shaderMetallic:number}[];protectedBefore:unknown;protectedAfter:unknown;lightingProfile:unknown;afterRenderedFromActualSavedSource:boolean;frames:{image:string;sha256:string}[]};
const soft=JSON.parse(read('assets/source/blender/fixture.cell.sink.handwash.soft-light.provenance.json').toString('utf8')) as Receipt;
it('retains all17 original parts and five graphs with only ten exact approved Base/Roughness sockets changed',()=>{
 expect(soft.sourceSha256).toBe('da0cb22ebf39edc83df539bc9788fc88f414eac588987f9890cb6ad233b9c6e5');expect(hash(read(soft.source))).toBe(soft.sourceSha256);
 expect(soft.retainedSourceSha256).toBe('ffcf0973794e39e59b5ee65e259d7149daf616bd0518a1c78a1c5f5a9b502158');expect(hash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);expect(hash(read(soft.literalGraphSource))).toBe(soft.literalGraphSourceSha256);
 expect(soft.physicalAssembly.meshCount).toBe(17);expect(soft.physicalAssembly.rawMeshes).toHaveLength(17);expect(soft.literalStoredGraphs).toHaveLength(5);expect(soft.exactRepairSockets).toEqual(['Base Color','Roughness']);
 const expected=structuredClone(soft.literalStoredGraphs);for(const g of expected){delete g.canonicalMaterialSha256;for(const n of g.nodes)if(n.type==='ShaderNodeBsdfPrincipled')for(const input of n.inputs){if(input.name==='Base Color')input.value=g.diffuse;if(input.name==='Roughness')input.value=g.roughness;}}
 const actual=structuredClone(soft.physicalAssembly.completeStoredMaterialGraphs);for(const g of actual)delete g.canonicalMaterialSha256;expect(actual).toEqual(expected);
 for(const row of soft.repairedMaterialAudit){expect(row.shaderBaseColor).toEqual(row.diffuseRGBA);expect(row.shaderRoughness).toBe(row.viewportRoughnessProperty);expect(row.shaderMetallic).toBe(0);}
 expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(4);expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.12000000476837158,.11000000685453415,0],max:[.8799999952316284,.8299999833106995,1.0099999904632568]});
 expect(soft.protectedAfter).toEqual(soft.protectedBefore);expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threads:1,samples:64,seed:0,adaptiveSampling:false,denoising:false,viewTransform:'AgX',filmTransparent:true});
});
it('requires actual saved/reopened two-angle comparisons with delivered image bytes',()=>{
 expect(soft.afterRenderedFromActualSavedSource).toBe(true);expect(soft.frames).toHaveLength(4);for(const frame of soft.frames)expect(hash(read(frame.image))).toBe(frame.sha256);
 const distances=JSON.parse(read('docs/research/2026-10-04-cell-handwash-retained-cycles/actual-legacy-nearest-surfaces.json').toString('utf8')) as {nearestVertexToEvaluatedTriangleUpperBoundTiles:number}[];
 expect(distances.map(row=>row.nearestVertexToEvaluatedTriangleUpperBoundTiles)).toEqual([.0350000262260437,.01750001311302185,0,0]);
});
