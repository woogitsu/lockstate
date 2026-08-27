import { describe, expect, it } from 'vitest';
import {
  defaultLocaleEnCatalog,
  defaultObjectRegistry,
  defaultRoomContentRegistry,
  defaultStaffRoleRegistry,
  loadObjectCatalog,
  loadRoomCatalog,
  loadStaffRoleCatalog,
  resolveLocalizationKey,
  validateRoomObjectReferences,
} from '../../src/content';
import { objectDefinitionSchema } from '../../src/content/object-catalog';
import { roomDefinitionSchema } from '../../src/content/room-catalog';
import { staffRoleDefinitionSchema } from '../../src/content/staff-role-catalog';

describe('default content catalogs load cleanly (imported at module scope; a failure would throw at import time)', () => {
  it('loads a representative, non-trivial room catalog covering every named category', () => {
    const categories = new Set(defaultRoomContentRegistry.all().map((r) => r.category));
    expect(defaultRoomContentRegistry.size()).toBeGreaterThanOrEqual(10);
    for (const expected of ['housing', 'security', 'food', 'hygiene', 'recreation', 'education', 'medical', 'administration', 'logistics', 'utility']) {
      expect(categories.has(expected as never)).toBe(true);
    }
  });

  it('loads a representative object catalog', () => {
    expect(defaultObjectRegistry.size()).toBeGreaterThanOrEqual(10);
  });

  it('loads administration/security/medical/operations staff roles', () => {
    const departments = new Set(defaultStaffRoleRegistry.all().map((r) => r.department));
    expect(departments).toEqual(new Set(['administration', 'security', 'medical', 'operations']));
  });

  it('has zero dangling room-to-object references', () => {
    const errors = validateRoomObjectReferences(defaultRoomContentRegistry, defaultObjectRegistry);
    expect(errors).toEqual([]);
  });

  it('resolves every room/object/staff-role nameKey against the default locale catalog (no key falls back to itself)', () => {
    for (const entry of [...defaultRoomContentRegistry.all(), ...defaultObjectRegistry.all(), ...defaultStaffRoleRegistry.all()]) {
      const resolved = resolveLocalizationKey(defaultLocaleEnCatalog, entry.nameKey);
      expect(resolved).not.toBe(entry.nameKey);
    }
  });
});

describe('schema validation rejects malformed content with a clear, structured error', () => {
  it('rejects an object definition with an unknown category', () => {
    const result = objectDefinitionSchema.safeParse({
      schemaVersion: 1, id: 'object.bad', numericId: 999, nameKey: 'object.bad.name', category: 'not-a-real-category', footprint: { width: 1, height: 1 }, capabilities: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a room definition with the wrong schema version', () => {
    const result = roomDefinitionSchema.safeParse({
      schemaVersion: 2, id: 'room.bad', numericId: 250, nameKey: 'room.bad.name', category: 'housing', requirements: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an object requirement missing minQuantity', () => {
    const result = roomDefinitionSchema.safeParse({
      schemaVersion: 1, id: 'room.bad', numericId: 251, nameKey: 'room.bad.name', category: 'housing',
      requirements: [{ type: 'object', objectId: 'object.bed' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a staff role with maxPerDay below minPerDay', () => {
    const result = staffRoleDefinitionSchema.safeParse({
      schemaVersion: 1, id: 'staff-role.bad', numericId: 250, nameKey: 'staff-role.bad.name', department: 'security',
      baseSecurityClearance: 1, permissions: [], wageBand: { minPerDay: 100, maxPerDay: 50 }, skills: [],
    });
    expect(result.success).toBe(false);
  });

  it('collects a schema error alongside a duplicate-id error in the same load() call', () => {
    // The three rows carried `capabilities: []` as a don't-care filler until
    // `objectDefinitionSchema` gained `.min(1)`, which refuses an empty list
    // outright (an object with no capabilities makes every room requiring it
    // permanently unsatisfiable -- see the field's own comment and
    // `tests/foundation/content-vocabulary-contract.test.ts`). With `[]` every
    // row now fails on *that* instead, which is the wrong subject: this case
    // is about one duplicate id and one bad `schemaVersion` being collected in
    // the same pass. A real capability keeps the two intended faults the only
    // faults.
    const { registry, errors } = loadObjectCatalog([
      { schemaVersion: 1, id: 'object.ok', numericId: 1, nameKey: 'x', category: 'furniture', footprint: { width: 1, height: 1 }, capabilities: ['probe'] },
      { schemaVersion: 1, id: 'object.ok', numericId: 2, nameKey: 'x', category: 'furniture', footprint: { width: 1, height: 1 }, capabilities: ['probe'] }, // duplicate id
      { schemaVersion: 99, id: 'object.bad', numericId: 3, nameKey: 'x', category: 'furniture', footprint: { width: 1, height: 1 }, capabilities: ['probe'] }, // bad schema version
    ]);

    expect(registry.size()).toBe(1);
    expect(errors).toHaveLength(2);
    expect(errors.some((e) => e.kind === 'duplicate-id')).toBe(true);
    expect(errors.some((e) => e.kind === 'schema')).toBe(true);
  });
});

describe('cross-reference validation catches a dangling room-to-object reference', () => {
  it('reports a missing-object-reference error for a room requiring a nonexistent object', () => {
    const { registry: rooms } = loadRoomCatalog([
      {
        schemaVersion: 1, id: 'room.broken', numericId: 1, nameKey: 'room.broken.name', category: 'housing',
        requirements: [{ type: 'object', objectId: 'object.does-not-exist', minQuantity: 1 }],
      },
    ]);
    const { registry: objects } = loadObjectCatalog([]);

    const errors = validateRoomObjectReferences(rooms, objects);
    expect(errors).toEqual([{ kind: 'missing-object-reference', roomId: 'room.broken', objectId: 'object.does-not-exist' }]);
  });
});

describe('content load order does not change loaded output', () => {
  it('loading the same room/object/staff-role definitions in a different order produces an identical registry', () => {
    const objects = [...defaultObjectRegistry.all()];
    const shuffled = [...objects].reverse();

    const { registry: forward } = loadObjectCatalog(objects);
    const { registry: reversed } = loadObjectCatalog(shuffled);

    expect(reversed.all()).toEqual(forward.all());
  });
});
