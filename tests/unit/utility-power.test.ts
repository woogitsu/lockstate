import { describe, expect, it } from 'vitest';
import { PlacedObjectRegistry } from '../../src/simulation/objects/placed-object-registry';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { utilityProvisionFactors } from '../../src/simulation/prisoners/utility-power';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

function fixture() {
  const rooms = new RoomInstanceRegistry();
  const objects = new PlacedObjectRegistry();
  rooms.register({
    instanceId: 'shower', roomCatalogId: 'room.shower-room',
    anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) }, width: 3, height: 3,
    residentCapacity: 0, concurrentUseCapacity: 9, objectCapabilities: ['hygiene'],
  });
  rooms.register({
    instanceId: 'utility', roomCatalogId: 'room.utility-room',
    anchorTile: { x: tileCoordinate(20), y: tileCoordinate(0) }, width: 2, height: 2,
    residentCapacity: 0, concurrentUseCapacity: 1, objectCapabilities: ['utility-control'],
  });
  for (let index = 0; index < 9; index += 1) {
    const x = index % 3;
    const y = Math.floor(index / 3);
    expect(objects.place({ placedObjectId: `head-${index}`, objectId: 'object.shower-head', anchorTile: { x: tileCoordinate(x), y: tileCoordinate(y) }, orientation: 0 })).toBe(true);
  }
  return { rooms, objects };
}

describe('issue #595 utility panel provisioning', () => {
  it('halves shower provision without a panel and powers only eight of nine heads with one', () => {
    const { rooms, objects } = fixture();
    expect(utilityProvisionFactors(rooms, objects).get('shower')).toBe(0.5);

    expect(objects.place({ placedObjectId: 'panel', objectId: 'object.utility-panel', anchorTile: { x: tileCoordinate(20), y: tileCoordinate(0) }, orientation: 0 })).toBe(true);
    expect(utilityProvisionFactors(rooms, objects).get('shower')).toBeCloseTo(17 / 18);

    expect(objects.place({ placedObjectId: 'panel-2', objectId: 'object.utility-panel', anchorTile: { x: tileCoordinate(21), y: tileCoordinate(0) }, orientation: 0 })).toBe(true);
    expect(utilityProvisionFactors(rooms, objects).get('shower')).toBe(1);
  });

  it('does not count a panel that is not in a utility room', () => {
    const { rooms, objects } = fixture();
    expect(objects.place({ placedObjectId: 'outside', objectId: 'object.utility-panel', anchorTile: { x: tileCoordinate(30), y: tileCoordinate(0) }, orientation: 0 })).toBe(true);
    expect(utilityProvisionFactors(rooms, objects).get('shower')).toBe(0.5);
  });
});
