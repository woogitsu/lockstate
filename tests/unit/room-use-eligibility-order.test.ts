import { expect, it, vi } from 'vitest';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const anchorTile={x:tileCoordinate(0),y:tileCoordinate(0)};
function finite(registry:RoomInstanceRegistry,instanceId:string,capability=true) {
  registry.register({instanceId,roomCatalogId:'room.canteen',anchorTile,residentCapacity:0,concurrentUseCapacity:1,
    objectCapabilities:capability?['dining']:[]});
}

it('zero required-capability capacity avoids eligibility and concurrent claim-map scans',()=>{
  const registry=new RoomInstanceRegistry();finite(registry,'a-zero',false);
  const eligible=vi.fn(()=>true),occupancy=vi.spyOn(registry,'useOccupancyOf');
  expect(registry.findAvailableForUse('room.canteen','dining',eligible)).toBeUndefined();
  expect(eligible.mock.calls.length).toBe(0);expect(occupancy.mock.calls.length).toBe(0);
});

it.each([false,true])('open-area Infinity still requires eligibility=%s without a claim-map read',allowed=>{
  const registry=new RoomInstanceRegistry();
  registry.register({instanceId:'yard',roomCatalogId:'room.yard',anchorTile,openArea:true,residentCapacity:0,
    concurrentUseCapacity:0,objectCapabilities:[]});
  const room=registry.getById('yard')!;
  expect(registry.concurrentUseCapacityFor(room)).toBe(Number.POSITIVE_INFINITY);
  const eligible=vi.fn(()=>allowed),occupancy=vi.spyOn(registry,'useOccupancyOf');
  expect(registry.findAvailableForUse('room.yard',undefined,eligible)?.instanceId).toBe(allowed?'yard':undefined);
  expect(eligible.mock.calls.length).toBe(1);expect(eligible.mock.calls[0]).toEqual([room]);expect(occupancy.mock.calls.length).toBe(0);
});

it('first free blocked room cannot hide a later eligible free room in deterministic id order',()=>{
  const registry=new RoomInstanceRegistry();finite(registry,'c-free');finite(registry,'b-blocked');
  const checked:string[]=[];
  const chosen=registry.findAvailableForUse('room.canteen','dining',room=>{checked.push(room.instanceId);return room.instanceId!=='b-blocked';});
  expect(chosen?.instanceId).toBe('c-free');expect(checked).toEqual(['b-blocked','c-free']);
});

it('full earlier room is rejected before eligibility while later blocked/free candidates preserve their order',()=>{
  const registry=new RoomInstanceRegistry();finite(registry,'c-free');finite(registry,'a-full');finite(registry,'b-blocked');
  expect(registry.claimUse('a-full',1 as never,'dining')).toBe(true);
  const checked:string[]=[];
  const chosen=registry.findAvailableForUse('room.canteen','dining',room=>{checked.push(room.instanceId);return room.instanceId!=='b-blocked';});
  expect(chosen?.instanceId).toBe('c-free');expect(checked).toEqual(['b-blocked','c-free']);
  expect(registry.useOccupancyOf('a-full','dining')).toBe(1);
  expect(registry.useOccupancyOf('b-blocked','dining')).toBe(0);expect(registry.useOccupancyOf('c-free','dining')).toBe(0);
});
