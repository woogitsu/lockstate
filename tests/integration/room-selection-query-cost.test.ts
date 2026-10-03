import { expect, it, vi } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it('ordinary full Shower rooms need no physical query when no capability seat is free',()=>{
  const runtime=createNewSimulationRuntime(73);
  for(const [sequence,x] of [[0,5],[1,20]] as const){
    runtime.kernel.submitCommand('saturated-'+sequence,sequence,runtime.kernel.tick,packCommand({type:'PlaceRoomTemplate',templateId:'shower-room',origin:{x,y:14},quarterTurns:1}));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  }
  let elapsed=0;
  for(;elapsed<30_000;elapsed++){
    if(runtime.roomTemplates.snapshot().pending.length===0&&runtime.construction.allOrders().every(order=>order.state==='completed'))break;
    runtime.kernel.step();
  }
  expect(elapsed).toBeLessThan(30_000);
  const rooms=runtime.prisoners.roomInstances.allByRoomCatalogId('room.shower-room');expect(rooms).toHaveLength(2);
  let claimId=1;
  // Typed public concurrent-use fixture, as in the existing registry tests:
  // genuine authored fixtures/capacity, ordinary claimUse, no fake verdict.
  for(const room of rooms){
    expect(runtime.prisoners.roomInstances.concurrentUseCapacityFor(room,'hygiene')).toBe(2);
    for(let seat=0;seat<2;seat++)expect(runtime.prisoners.roomInstances.claimUse(room.instanceId,claimId++ as never,'hygiene')).toBe(true);
    expect(runtime.prisoners.roomInstances.useOccupancyOf(room.instanceId,'hygiene')).toBe(2);
  }
  const origin={x:tileCoordinate(16),y:tileCoordinate(16)};
  for(const room of rooms)expect(runtime.navigation.sharesPhysicalComponent(origin,room.anchorTile)).toBe(true);
  const chunks=vi.spyOn(runtime.world,'getChunk');
  // The earlier consumer asked availability first and called getGraph only
  // if an instance existed. Ordinary saturation therefore scanned no chunks.
  expect(runtime.prisoners.roomInstances.findAvailableForUse('room.shower-room','hygiene')).toBeUndefined();
  const previousReads=chunks.mock.calls.length;expect(previousReads).toBe(0);chunks.mockClear();
  const physical=vi.fn((candidate:typeof rooms[number])=>runtime.navigation.sharesPhysicalComponent(origin,candidate.anchorTile));
  const chosen=runtime.prisoners.roomInstances.findAvailableForUse('room.shower-room','hygiene',physical);
  const reads=chunks.mock.calls.length;chunks.mockRestore();
  expect(chosen).toBeUndefined();
  console.log(JSON.stringify({kind:'ordinary-saturated-rooms',roomCount:2,seats:4,previousFreshnessChunkReads:previousReads,physicalQueries:physical.mock.calls.length,freshnessChunkReads:reads}));
  expect(physical.mock.calls.length).toBe(0);
  expect(reads).toBe(0);
});
