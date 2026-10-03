import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand): void {
 const sequence=runtime.kernel.expectedSequence;
 runtime.kernel.submitCommand(`redo-zone-${sequence}`,sequence,runtime.kernel.tick,packCommand(command));
 expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function finish(runtime: Runtime): void {
 const done=()=>runtime.roomTemplates.snapshot().pending.length===0&&runtime.construction.allOrders().every(o=>o.state==='completed'||o.state==='cancelled'||o.state==='failed');
 for(let n=0;n<30000&&!done();n++)runtime.kernel.step();
 expect(done()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
 const bundle=captureSessionSnapshot(runtime);
 const decoded=decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({gameVersion:'test',prisonId:'redo-zone',revision:1,createdAt:0,updatedAt:1,...bundle}))));
 expect(decoded.ok).toBe(true); if(!decoded.ok)throw new Error('Save must decode');
 return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
it.each([false,true].flatMap(blocked=>[false,true].map(load=>({blocked,load}))))('saved template Redo remains atomic when later zoning blocks it: blocked=$blocked load=$load',({blocked,load})=>{
 let runtime=createNewSimulationRuntime(73);
 send(runtime,{type:'PlaceRoomTemplate',templateId:'cell-basic',origin:{x:10,y:10},mirrorX:true,quarterTurns:1});
 finish(runtime); expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
 send(runtime,{type:'Undo'});
 expect(runtime.placedObjects.getSnapshot()).toEqual([]);
 expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
 if(blocked){
 send(runtime,{type:'ZoneRoom',roomId:'room.yard',x:10,y:10,width:8,height:8});
 expect(runtime.prisoners.roomInstances.getById('room.yard:10:10')!==undefined).toBe(true);
 }
 if(load)runtime=reload(runtime);
 const before=captureSessionSnapshot(runtime);
 const preflight=PROJECTION_CATALOG['world/room-template-preflight'].project(runtime,runtime.kernel.tick,{target:{kind:'room-template',templateId:'cell-basic',origin:{x:10,y:10},mirrorX:true,quarterTurns:1}}).view;
 expect(preflight).toMatchObject({ok:!blocked});
 expect(captureSessionSnapshot(runtime)).toEqual(before);
 send(runtime,{type:'Redo'});
 const after=captureSessionSnapshot(runtime);
 finish(runtime);
 const settled=captureSessionSnapshot(runtime);
 mkdirSync('.local-redo-zoning',{recursive:true});
 writeFileSync(`.local-redo-zoning/${blocked?'blocked':'legal'}-${load?'load':'live'}.json`,JSON.stringify({base:'4b5e06b4d279260318d34a7dd604bd46c6e9435f',blocked,load,preflight,before,after,settled,refusal:runtime.refusals.last,events:runtime.events.since(0)},null,2));
 if(blocked){
 expect(after.construction).toEqual(before.construction);
 expect(after.world).toEqual(before.world);
 expect(after.simulation).toEqual(before.simulation);
 }else{
 expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
 expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
 }
});
