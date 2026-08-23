import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';

const TILE = { x: tileCoordinate(0), y: tileCoordinate(0) };

describe('RoomInstanceRegistry', () => {
  it('registers and looks up instances by id', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: ['sleep-surface'] });
    expect(registry.getById('cell-1')?.roomCatalogId).toBe('room.cell');
    expect(registry.getById('missing')).toBeUndefined();
  });

  it('throws on a duplicate instance id', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
    expect(() => registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] })).toThrow(/Duplicate room instance/);
  });

  it('allByRoomCatalogId is sorted by instance id, filtered by room type', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
    registry.register({ instanceId: 'yard-1', roomCatalogId: 'room.yard', anchorTile: TILE, capacity: 10, objectCapabilities: [] });
    expect(registry.allByRoomCatalogId('room.cell').map((i) => i.instanceId)).toEqual(['cell-1', 'cell-2']);
  });

  it('assign fills capacity and rejects beyond it', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'canteen-0', roomCatalogId: 'room.canteen', anchorTile: TILE, capacity: 2, objectCapabilities: ['dining'] });
    expect(registry.assign('canteen-0', 1)).toBe(true);
    expect(registry.assign('canteen-0', 2)).toBe(true);
    expect(registry.assign('canteen-0', 3)).toBe(false);
    expect(registry.occupancyOf('canteen-0')).toBe(2);
  });

  it('release frees capacity for reassignment', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
    registry.assign('cell-1', 1);
    expect(registry.assign('cell-1', 2)).toBe(false);
    registry.release('cell-1', 1);
    expect(registry.assign('cell-1', 2)).toBe(true);
  });

  it('assign throws for an unknown instance id (a real bug, not a capacity condition)', () => {
    const registry = new RoomInstanceRegistry();
    expect(() => registry.assign('nope', 1)).toThrow(/Unknown room instance/);
  });

  describe('findAvailable', () => {
    it('returns the first (by sorted id) instance with free capacity', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
      expect(registry.findAvailable('room.cell')?.instanceId).toBe('cell-1');
    });

    it('skips a full instance in favor of the next available one', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
      registry.assign('cell-1', 1);
      expect(registry.findAvailable('room.cell')?.instanceId).toBe('cell-2');
    });

    it('returns undefined when no instance of that room type has free capacity', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, capacity: 1, objectCapabilities: [] });
      registry.assign('cell-1', 1);
      expect(registry.findAvailable('room.cell')).toBeUndefined();
    });

    it('filters by required object capability', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'shower-0', roomCatalogId: 'room.shower-room', anchorTile: TILE, capacity: 5, objectCapabilities: [] });
      expect(registry.findAvailable('room.shower-room', 'hygiene')).toBeUndefined();
      registry.register({ instanceId: 'shower-1', roomCatalogId: 'room.shower-room', anchorTile: TILE, capacity: 5, objectCapabilities: ['hygiene'] });
      expect(registry.findAvailable('room.shower-room', 'hygiene')?.instanceId).toBe('shower-1');
    });
  });

  it('instancesOccupiedBy lists every instance holding an entity, sorted', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'a', roomCatalogId: 'room.yard', anchorTile: TILE, capacity: 5, objectCapabilities: [] });
    registry.register({ instanceId: 'b', roomCatalogId: 'room.common-room', anchorTile: TILE, capacity: 5, objectCapabilities: [] });
    registry.assign('b', 7);
    registry.assign('a', 7);
    expect(registry.instancesOccupiedBy(7)).toEqual(['a', 'b']);
    expect(registry.instancesOccupiedBy(999)).toEqual([]);
  });
});
