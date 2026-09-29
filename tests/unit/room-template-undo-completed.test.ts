import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
it('undo completed room clears its zoning',()=>{
 const r=createNewSimulationRuntime(44);
 r.kernel.submitCommand('room',0,r.kernel.tick,packCommand({type:'PlaceRoomTemplate',templateId:'cell-basic',origin:{x:tileCoordinate(10),y:tileCoordinate(10)}})); r.kernel.step();
 for(let i=0;i<30000 && r.roomTemplates.snapshot().pending.length;i++) r.kernel.step();
 expect(r.roomTemplates.snapshot().pending).toHaveLength(0);
 expect(r.world.getZoning({x:tileCoordinate(11),y:tileCoordinate(11)})).not.toBe(0);
 r.kernel.submitCommand('undo',1,r.kernel.tick,packCommand({type:'Undo'})); r.kernel.step();
 expect(r.world.getZoning({x:tileCoordinate(11),y:tileCoordinate(11)})).toBe(0);
});
