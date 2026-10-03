/** Measure existing source/camera against real renderer expressions; no browser or renderer mutation. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Module,{createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=path.join(root,'assets/intermediate/prisoner-scale-audit/original-source-and-camera-audit.json');
const source=JSON.parse(fs.readFileSync(input,'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/game-content/oblique-actor-prisoner.v1.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
assert(source.sourceSha256===catalog.sourceSha256&&source.sourceBytesUnchanged,'Actual original source identity does not match canonical');
assert(source.meshCount===48&&source.materials.length===8,'Original Prisoner full inventory differs');
assert(catalog.resolutionPx[0]===512&&catalog.nominalPixelsPerTile===64&&catalog.cameraTargetTiles.every(x=>x===0),'Accepted canonical source/scale differs');
const scenePath=path.join(root,'src/rendering/scene/oblique-world-scene.ts');
const sceneText=fs.readFileSync(scenePath,'utf8');
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite/package.json'));
const {parseSync}=viteRequire('rolldown/experimental');
const {build}=viteRequire('rolldown');
const scene=parseSync(scenePath,sceneText,{lang:'ts'});
assert(scene.errors.length===0,'Actual scene syntax cannot be parsed');
const text=node=>sceneText.slice(node.start,node.end);
let scaleArgument;
const scan=node=>{if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&text(node.callee)==='image.setScale')scaleArgument=node.arguments[0];for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==='object')scan(value);}};scan(scene.program);
assert(scaleArgument,'Actual authored image scale consumer not found');
function evaluate(node,zoom,nominal){
 if(node.type==='Literal')return Number(node.value);
 if(node.type==='Identifier'&&node.name==='TILE_SIZE_PX')return tile;
 if(node.type==='MemberExpression'&&text(node)==='this.pose.zoom')return zoom;
 if(node.type==='MemberExpression'&&text(node)==='catalog.nominalPixelsPerTile')return nominal;
 if(node.type==='ParenthesizedExpression')return evaluate(node.expression,zoom,nominal);
 if(node.type==='BinaryExpression'){const a=evaluate(node.left,zoom,nominal),b=evaluate(node.right,zoom,nominal);if(node.operator==='*')return a*b;if(node.operator==='/')return a/b;}
 throw Error('Unsupported actual renderer scale expression: '+text(node));
}
const entry=path.join(root,'assets/intermediate/prisoner-scale-audit/actual-projection-entry.ts');
fs.writeFileSync(entry,"export {TILE_SIZE_PX} from '../../../src/rendering/tile-metrics';\nexport {groundToScreen} from '../../../src/rendering/camera/oblique-projection';\nexport {projectObliqueActors} from '../../../src/rendering/camera/oblique-world-projection';\n");
const built=await build({input:entry,platform:'node',write:false,output:{format:'cjs'}});
assert(built.output.length===1,'Actual projection audit must remain one module');
const loaded=new Module(entry);loaded.filename=entry;loaded.paths=Module._nodeModulePaths(path.dirname(entry));loaded._compile(built.output[0].code,entry);
const {TILE_SIZE_PX:tile,groundToScreen,projectObliqueActors}=loaded.exports;
const pose={target:{x:0,y:0},viewport:{width:512,height:512},zoom:1,yawRadians:0,elevationRadians:Math.PI/4};
const rate=512/15.5;
const rows=[];
for(const authored of source.actualCameraPoses){
 const camera={...pose,yawRadians:authored.yawDegrees*Math.PI/180,elevationRadians:authored.elevationDegrees*Math.PI/180};
 // Blender local -Y front corresponds to world +Y South; current X/Y basis preserves facing.
 const map=point=>groundToScreen({x:point[0]*rate,y:-point[1]*rate,z:point[2]*rate},camera);
 const projected=source.sourcePoints.map(map);
 const bounds=[Math.min(...projected.map(p=>p.x)),Math.min(...projected.map(p=>p.y)),Math.max(...projected.map(p=>p.x)),Math.max(...projected.map(p=>p.y))];
 const error=Math.max(...bounds.map((x,i)=>Math.abs(x-authored.geometricProjectedBoundsPx[i])));
 assert(error<.0002,'Real runtime projector disagrees with actual Blender silhouette at '+authored.yawDegrees+'/'+authored.elevationDegrees+':'+error);
 const markerErrors=Object.entries(authored.markersPx).map(([name,pixels])=>{const p=map(source.sourceCentroids[name]);return Math.max(Math.abs(p.x-pixels[0]),Math.abs(p.y-pixels[1]));});
 assert(Math.max(...markerErrors)<.0002,'Real front/back marker projection is reversed');
 rows.push({yawDegrees:authored.yawDegrees,elevationDegrees:authored.elevationDegrees,maximumActualBlenderVsProductionProjectionErrorPx:error,maximumFrontBackMarkerErrorPx:Math.max(...markerErrors),geometricBoundsAtZoom1:bounds});
}
const headingCases=[];
for(const [facing,degrees] of [['south',0],['east',90],['north',180],['west',-90]]){
 for(const cameraYaw of [0,90]){
  const actor=projectObliqueActors([{id:1,assetId:'actor.prisoner',tileX:0,tileY:0,deltaX:0,deltaY:0,facing}],{...pose,yawRadians:cameraYaw*Math.PI/180})[0];
  assert(actor&&Math.abs(actor.assetYawRadians-(cameraYaw-degrees)*Math.PI/180)<1e-10,'Actual world-heading yaw differs');
  headingCases.push({worldFacing:facing,cameraYawDegrees:cameraYaw,actualAssetYawDegrees:actor.assetYawRadians*180/Math.PI});
 }
}
const receipt={sourceSha256:source.sourceSha256,canonicalDescriptorSha256:hash(fs.readFileSync(path.join(root,'public/game-content/oblique-actor-prisoner.v1.json'))),
 productionSceneSha256:hash(Buffer.from(sceneText)),actualScaleExpression:text(scaleArgument),tileSizePx:tile,
 actualScaleByZoom:[.5,1,1.25,2].map(zoom=>({zoom,actualImageScale:evaluate(scaleArgument,zoom,catalog.nominalPixelsPerTile)})),
 configuredRoleCameraIsPublishedCanonicalProducer:false,
 historicalPublishedCamera:{rootScale:.5,orthoScale:8,pixelsPerUnscaledSourceUnit:32,effectiveWorldTilesPerSourceUnit:.5,bodyHeightTiles:(source.sourceBounds.max[2]-source.sourceBounds.min[2])*.5},
 pixelsPerBlenderSourceUnit:rate,effectiveWorldTilesPerSourceUnit:rate/catalog.nominalPixelsPerTile,
 effectiveGeometricBodyHeightTiles:(source.sourceBounds.max[2]-source.sourceBounds.min[2])*rate/catalog.nominalPixelsPerTile,
 geometricCoordinateTransform:{worldX:'sourceX * 512/15.5',worldY:'-sourceY * 512/15.5',worldZ:'sourceZ * 512/15.5'},
 actualProductionHeadingCases:headingCases,actual72ProjectionCases:rows,
 graphicsFallbackHeadHeightTiles:.8,graphicsFallbackIsAuthoredSpriteHeight:false,
 nativePixelsMeasured:false,productionSourcesChanged:false,browserStarted:false,serverStarted:false};
const output=path.join(root,'assets/intermediate/prisoner-scale-audit/runtime-scale-math.json');fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({heightTiles:receipt.effectiveGeometricBodyHeightTiles,scale:receipt.actualScaleByZoom,cases:rows.length,maxError:Math.max(...rows.map(r=>r.maximumActualBlenderVsProductionProjectionErrorPx)),headings:headingCases.length}));
