import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content';
import { buildRoomRegistryFromCatalog, defaultRoomRegistry, roomDefinitionFromCatalog } from '../../src/simulation/rooms/definition';
import { RoomSystem } from '../../src/simulation/rooms/system';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { TopologyManager } from '../../src/simulation/rooms/topology';

describe('defaultRoomRegistry is built from issue #23s validated content catalog', () => {
  it('has the same number of entries as the content catalog, id-for-id', () => {
    const catalogEntries = defaultRoomContentRegistry.all();
    for (const entry of catalogEntries) {
      const runtimeDefinition = defaultRoomRegistry.getById(entry.id);
      expect(runtimeDefinition).toBeDefined();
      expect(runtimeDefinition?.numericId).toBe(entry.numericId);
      expect(runtimeDefinition?.requirements).toEqual(entry.requirements);
    }
  });

  it('resolves a human-readable name from the nameKey, not the raw key', () => {
    const cell = defaultRoomRegistry.getById('room.cell');
    expect(cell?.name).toBe('Cell');
  });

  it('roomDefinitionFromCatalog falls back to the raw key when a locale entry is missing', () => {
    const entry = defaultRoomContentRegistry.getById('room.cell')!;
    const converted = roomDefinitionFromCatalog(entry, new Map());
    expect(converted.name).toBe('room.cell.name');
  });

  it('buildRoomRegistryFromCatalog rejects duplicate ids, matching RoomRegistry.register()s existing contract', () => {
    const entry = defaultRoomContentRegistry.getById('room.cell')!;
    expect(() => buildRoomRegistryFromCatalog([entry, entry])).toThrow(/already registered/);
  });
});

describe('the catalog-driven defaultRoomRegistry remains usable by #17s RoomSystem', () => {
  it('RoomSystem.validateRoom resolves a known catalog room type by its numeric zoning id', () => {
    const world = new SparseWorld(8);
    const topology = new TopologyManager(world);
    const system = new RoomSystem(world, topology, defaultRoomRegistry);

    const cellNumericId = defaultRoomRegistry.getById('room.cell')!.numericId;
    const result = system.validateRoom(1, cellNumericId);
    // #17s validateRoom is still a mock pending real object-placement tracking (out of scope for #23);
    // the point here is only that a catalog-driven room type resolves and is evaluated, not left "unknown".
    expect(result.missingRequirements).not.toContain('Unknown room type');
  });

  it('RoomSystem.validateRoom reports "Unknown room type" for a numeric id no catalog room uses', () => {
    const world = new SparseWorld(8);
    const topology = new TopologyManager(world);
    const system = new RoomSystem(world, topology, defaultRoomRegistry);

    const result = system.validateRoom(1, 250);
    expect(result.missingRequirements).toContain('Unknown room type');
  });
});
