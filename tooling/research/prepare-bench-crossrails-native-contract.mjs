/** Pending-native expectation receipt from genuine production kernel completion; no browser/server. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const scratch=path.join(root,'assets/intermediate/bench-crossrails-native-prep');fs.mkdirSync(scratch,{recursive:true});
const entry=path.join(scratch,'production-contract-entry.ts');
fs.writeFileSync(entry,"export {createNewSimulationRuntime} from '../../../src/simulation/runtime/new-session';\nexport {captureSessionSnapshot,restoreSimulationRuntime} from '../../../src/simulation/runtime/restore-session';\nexport {packCommand} from '../../../src/simulation/protocol/commands';\nexport {instantiateRoomTemplate} from '../../../src/content/room-template-catalog';\nexport {objectArtYaw} from '../../../src/rendering/world/object-art-orientation';\nexport {selectObliqueModuleFrame} from '../../../src/rendering/assets/oblique-module-catalog';\n");
const require=createRequire(import.meta.url);const vr=createRequire(require.resolve('vite/package.json'));const {build}=vr('rolldown');
const bundled=await build({input:entry,platform:'node',write:false,output:{format:'esm'}});if(bundled.output.length!==1)throw Error('Expected one offline kernel module');
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.output[0].code).toString('base64'));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalogPath=path.join(root,'public/game-content/oblique-canteen-bench.v1.json');const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
const complete=runtime=>{for(let ticks=0;ticks<30000;ticks++){runtime.kernel.step();if(runtime.roomTemplates.snapshot().pending.length===0&&runtime.construction.allOrders().every(order=>order.state==='completed'))return ticks+1;}throw Error('Real construction did not complete');};
const place=(runtime,seq,id,x,quarterTurns=0)=>{runtime.kernel.submitCommand('bench-native-reference-'+seq,seq,runtime.kernel.tick,api.packCommand({type:'PlaceRoomTemplate',templateId:id,origin:{x,y:5},...(quarterTurns===0?{}:{quarterTurns})}));runtime.kernel.step();};
let capacity=api.createNewSimulationRuntime(73);place(capacity,0,'storage-room-basic',5);place(capacity,1,'delivery-bay-basic',12);const capacityTicks=complete(capacity);const capacitySnapshot=api.captureSessionSnapshot(capacity);
assert(capacity.placedObjects.getSnapshot().filter(object=>object.objectId==='object.bench').length===0,'Capacity fixture already has benches');
const cases=[];
for(const quarterTurns of [0,1]){
 const runtime=api.restoreSimulationRuntime(capacitySnapshot).runtime;place(runtime,2,'holding-cell-basic',20,quarterTurns);const ticks=complete(runtime);const data=api.captureSessionSnapshot(runtime);const benches=runtime.placedObjects.getSnapshot().filter(object=>object.objectId==='object.bench');
 const anchors=quarterTurns===0?[[21,6],[23,8]]:[[24,6],[22,8]];
 const expected=anchors.map(([x,y],index)=>({placedObjectId:`object:${x}:${y}`,objectId:'object.bench',anchorTile:{x,y},orientation:quarterTurns,sourceOrderId:`room-template-000000000002-2-object-${String(index).padStart(3,'0')}`}));
 assert(JSON.stringify([...benches].sort((a,b)=>a.sourceOrderId.localeCompare(b.sourceOrderId)))===JSON.stringify(expected),'Literal independently-authored owner expectations differ');
 const orders=expected.map(object=>{const rows=data.construction.orders.filter(order=>order.id===object.sourceOrderId);assert(rows.length===1,'Nonunique source owner');const order=rows[0];assert(order.definitionId==='bench-wooden'&&order.state==='completed'&&order.location.x===object.anchorTile.x&&order.location.y===object.anchorTile.y&&(order.objectOrientation??0)===quarterTurns,'Completed producer mismatch');return order;});
 const rightButtons=quarterTurns===0?7:1;const yaw=(-45+rightButtons*15)*Math.PI/180;const elevation=45*Math.PI/180-17*.005;const localYaw=api.objectArtYaw(yaw,quarterTurns);const frame=api.selectObliqueModuleFrame(catalog,{yawRadians:localYaw,elevationRadians:elevation});assert(frame.yawDegrees===60&&frame.elevationDegrees===40,'Public camera recipe selects a different source frame');
 cases.push({quarterTurns,originalAuthoritativeObjects:api.instantiateRoomTemplate('holding-cell-basic',{x:0,y:0}).objects,realOfflineConstructionTicks:ticks,expectedPlacedObjects:expected,actualCompletedBuildOrders:orders,publicCameraRecipe:{startingYawDegrees:-45,startingElevationDegrees:45,rotateCameraRightButtons:rightButtons,nativeRightButtonDrag:{from:[1200,650],to:[1200,667]},actualCameraYawDegrees:yaw*180/Math.PI,actualCameraElevationDegrees:elevation*180/Math.PI,actualObjectLocalYawDegrees:localYaw*180/Math.PI,selectedCanonicalFrame:frame},worldVersion:data.world.version});
}
const receipt={preparedBaseCommit:'371c964f6720f59f99f13d092441aabae25f1877',kind:'pending-native-preparation',offlineGenuineKernelCompletion:true,browserStarted:false,serverStarted:false,nativeAcceptanceClaimed:false,canonicalSource:catalog.source,canonicalSourceSha256:catalog.sourceSha256,descriptorSha256:hash(fs.readFileSync(catalogPath)),capacityCompletionTicks:capacityTicks,cases};
const out=path.join(root,'docs/research/2026-10-03-wooden-bench-crossrails-native-preparation');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'offline-production-owner-and-camera-reference.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({kind:receipt.kind,cases:cases.map(c=>({quarterTurns:c.quarterTurns,owners:c.expectedPlacedObjects,pose:c.publicCameraRecipe.selectedCanonicalFrame})),capacityTicks}));
