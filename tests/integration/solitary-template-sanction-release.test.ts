import {expect,it} from 'vitest';
import {packCommand,type SimulationCommand} from '../../src/simulation/protocol/commands';
import {createNewSimulationRuntime} from '../../src/simulation/runtime/new-session';
import {captureSessionSnapshot,restoreSimulationRuntime} from '../../src/simulation/runtime/restore-session';
import {createSaveEnvelope,decodeSaveEnvelope} from '../../src/persistence/save-schema';

it.each([false,true].flatMap(saved=>[false,true].map(highRisk=>({saved,highRisk}))))('same completed template release saved=$saved highRisk=$highRisk',({saved,highRisk})=>{
let r=createNewSimulationRuntime(73);
const send=(c:SimulationCommand)=>{const s=r.kernel.expectedSequence;r.kernel.submitCommand(`sanction-${s}`,s,r.kernel.tick,packCommand(c));expect(r.kernel.dispatchDueCommands()).toBe(1);};
const until=(p:()=>boolean,max=30000)=>{for(let i=0;i<max&&!p();i++)r.kernel.step();expect(p()).toBe(true);};
for(const [templateId,x,y] of [['solitary-cell-basic',5,5],['cell-basic',15,15]] as const){send({type:'PlaceRoomTemplate',templateId,origin:{x,y},mirrorX:true,quarterTurns:1});expect(r.roomTemplates.snapshot().pending).toHaveLength(1);until(()=>r.roomTemplates.snapshot().pending.length===0&&r.construction.allOrders().every(o=>o.state==='completed'));}
for(let g=0;g<3;g++)send({type:'HireStaff',staffRoleId:'staff-role.guard',x:16,y:16});expect(r.refusals.count).toBe(0);
 send({type:'AdmitPrisoner',sentenceLengthTicks:1000000,priorIncidents:highRisk?255:0,x:16,y:16});until(()=>r.prisoners.roomInstances.totalOccupancy===1);
const id=r.prisoners.entityStore.getIdByIndex(0);const index=r.prisoners.entityStore.getIndex(id);const home=r.prisoners.coldState.getAccommodation(id)!;
expect(r.prisoners.roomInstances.getById(home)?.roomCatalogId).toBe(highRisk?'room.solitary-cell':'room.cell');
// This is the real incident follow-through API, not a synthetic record write.
r.prisoners.imposeSolitarySanction(id,r.kernel.tick);
const end=r.prisoners.records.solitarySanctionEndTick[index]!;
const owners=r.placedObjects.getSnapshot();
const history=r.construction.snapshot();
until(()=>r.prisoners.isServingSolitarySanction(id));
if(saved){const b=captureSessionSnapshot(r);const d=decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({gameVersion:'test',prisonId:'same-room-release',revision:1,createdAt:0,updatedAt:1,...b}))));expect(d.ok).toBe(true);if(!d.ok)throw Error('decode');r=restoreSimulationRuntime(d.value.payload as unknown as typeof b).runtime;}
while(r.kernel.tick<end+10)r.kernel.step(); expect(r.prisoners.entityStore.isAlive(id),'resident must survive the real term').toBe(true);
console.log('RELEASE',JSON.stringify({saved,highRisk,group:r.prisoners.records.classificationGroupIndex[index],tick:r.kernel.tick,end,actualEnd:r.prisoners.records.solitarySanctionEndTick[index],home,current:r.prisoners.coldState.getAccommodation(id),metrics:r.prisoners.sanctionSystem.getMetrics()}));
expect(r.placedObjects.getSnapshot()).toEqual(owners);
expect(r.construction.snapshot()).toEqual(history);
expect(r.prisoners.records.solitarySanctionEndTick[index]).toBe(0);
expect(r.prisoners.coldState.getAccommodation(id)).toBe(home);
expect(r.prisoners.roomInstances.totalOccupancy).toBe(1);
});


