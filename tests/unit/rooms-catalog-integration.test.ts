import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { buildRoomRegistryFromCatalog, roomDefinitionFromCatalog } from '../../src/simulation/rooms/definition';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * The registry these assertions read, built here rather than imported.
 *
 * `src/simulation/rooms/definition.ts` used to export a module-level
 * `defaultRoomRegistry` built eagerly at import. After #181 deleted
 * `RoomSystem` its only reader was this file, so #182 finding 2 recorded it as
 * an exported value with no consumer in `src/` -- and building it here rather
 * than keeping a production export alive for a test is the option that loses
 * nothing: `buildRoomRegistryFromCatalog` is the live API, and this file was
 * already importing it alongside the singleton.
 *
 * The alternative #182 raises -- widening
 * `tests/foundation/unconsumed-content-contract.test.ts` to cover exported
 * values whose only importer is under `tests/` -- was measured rather than
 * argued: **258** exports are in that position. A gate needing 258 allow-list
 * entries is a list nobody reads, so the singleton goes and the gate does not
 * grow.
 */
const catalogRegistry = buildRoomRegistryFromCatalog();

describe('the catalog registry is built from issue #23s validated content catalog', () => {
  it('has the same number of entries as the content catalog, id-for-id', () => {
    const catalogEntries = defaultRoomContentRegistry.all();
    for (const entry of catalogEntries) {
      const runtimeDefinition = catalogRegistry.getById(entry.id);
      expect(runtimeDefinition).toBeDefined();
      expect(runtimeDefinition?.numericId).toBe(entry.numericId);
      expect(runtimeDefinition?.requirements).toEqual(entry.requirements);
    }
  });

  it('resolves a human-readable name from the nameKey, not the raw key', () => {
    const cell = catalogRegistry.getById('room.cell');
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

/**
 * These two tests used to go through `RoomSystem.validateRoom`, asserting
 * that its output did or did not contain the string `'Unknown room type'`.
 * #123 item 2 deleted that method -- it was a self-described mock that
 * reported *every* object requirement as missing and treated `minimum-size`
 * as always satisfied, and nothing in `src/` ever called it. What the two
 * tests were actually establishing is the numeric-zoning-id lookup underneath
 * it, so they now assert that directly, on the registry, rather than through
 * a mock's phrasing of it.
 *
 * The lookup is worth keeping covered: zoning is stored as a `Uint8Array`
 * plane, so a numeric id is how a zoned tile refers to a room type at all.
 */
describe('the catalog-driven registry resolves a room type by its numeric zoning id', () => {
  it('resolves a known catalog room type', () => {
    const cellNumericId = catalogRegistry.getById('room.cell')!.numericId;
    const resolved = catalogRegistry.getByNumericId(cellNumericId);

    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('room.cell');
  });

  it('resolves nothing for a numeric id no catalog room uses', () => {
    // `RoomRegistry` has no "all" accessor; the content catalog it is built
    // from does, so the premise is checked there. If a room ever claims 250,
    // this test is asserting the wrong id and says so rather than passing.
    expect(defaultRoomContentRegistry.all().some((entry) => entry.numericId === 250)).toBe(false);
    expect(catalogRegistry.getByNumericId(250)).toBeUndefined();
  });
});

/**
 * #123 item 2's other half: with the mock gone, `room-projection.ts` is the
 * single evaluator of "does this room satisfy its catalog requirements", and
 * this pins what it can and cannot answer -- so the next agent to implement
 * object placement inherits one answer rather than two.
 *
 * `RoomInstance` carries an anchor tile, a capacity and capability tags; no
 * bounds, no tile set, no wall topology. So `object` requirements are
 * evaluated for real against the instance's capabilities, and `enclosed` /
 * `minimum-size` are reported `'not-evaluated'` rather than guessed. The mock
 * answered those two anyway -- always-missing for objects, always-satisfied
 * for size -- which is precisely why it could not be kept alongside this one.
 */
describe('one evaluator answers room requirements, and says what it cannot answer', () => {
  it('evaluates a cell object requirement by capability and leaves geometry not-evaluated', () => {
    const cell = defaultRoomContentRegistry.getById('room.cell')!;
    const toilet = defaultObjectRegistry.getById('object.toilet')!;
    expect(toilet.capabilities.length).toBeGreaterThan(0);

    const registry = new RoomInstanceRegistry();
    registry.register({
      instanceId: 'cell-1',
      roomCatalogId: 'room.cell',
      anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
      capacity: 1,
      objectCapabilities: toilet.capabilities,
    });

    const detail = projectRoomDetail({ roomInstances: registry }, 'cell-1');
    expect(detail).toBeDefined();

    const byType = new Map(detail!.requirements.map((requirement) => [requirement.type, requirement.status]));
    // The catalog really does declare all three kinds for a cell; without
    // this the assertions below could pass on an empty requirement list.
    expect(new Set(cell.requirements.map((requirement) => requirement.type))).toEqual(
      new Set(['object', 'enclosed', 'minimum-size']),
    );
    expect(byType.get('object')).toBe('satisfied-by-capability');
    expect(byType.get('enclosed')).toBe('not-evaluated');
    expect(byType.get('minimum-size')).toBe('not-evaluated');
  });

  it('reports a missing capability rather than assuming either answer', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({
      instanceId: 'cell-2',
      roomCatalogId: 'room.cell',
      anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
      capacity: 1,
      objectCapabilities: [],
    });

    const detail = projectRoomDetail({ roomInstances: registry }, 'cell-2');
    const objectRequirement = detail!.requirements.find((requirement) => requirement.type === 'object');
    expect(objectRequirement?.status).toBe('missing-capability');
    expect(detail!.requirementSummary.missingCapability).toBeGreaterThan(0);
  });
});
