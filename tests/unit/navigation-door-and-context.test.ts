import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { DoorRegistry, type DoorDefinition } from '../../src/simulation/navigation/door';
import { checkDoorAccess, doorTraversalCost, type RouteContext } from '../../src/simulation/navigation/route-context';

function makeDoor(overrides: Partial<DoorDefinition> = {}): DoorDefinition {
  return {
    id: 'door-1',
    position: { x: tileCoordinate(4), y: tileCoordinate(1) },
    side: 'left',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
    ...overrides,
  };
}

describe('checkDoorAccess', () => {
  it('allows an open or closed door when clearance/permission requirements are met', () => {
    const context: RouteContext = { role: 'staff', securityClearance: 3 };
    expect(checkDoorAccess(makeDoor({ state: 'open', requiredSecurityClearance: 3 }), context)).toEqual({ allowed: true });
    expect(checkDoorAccess(makeDoor({ state: 'closed', requiredSecurityClearance: 3 }), context)).toEqual({ allowed: true });
  });

  it('denies insufficient clearance regardless of open/closed state', () => {
    const context: RouteContext = { role: 'prisoner', securityClearance: 0 };
    expect(checkDoorAccess(makeDoor({ state: 'open', requiredSecurityClearance: 1 }), context)).toEqual({
      allowed: false,
      reason: 'insufficient-clearance',
    });
  });

  it('denies a missing named permission even with sufficient clearance', () => {
    const context: RouteContext = { role: 'staff', securityClearance: 10 };
    const door = makeDoor({ state: 'open', requiredPermission: 'medical-wing' });
    expect(checkDoorAccess(door, context)).toEqual({ allowed: false, reason: 'missing-permission' });
    expect(checkDoorAccess(door, { ...context, permissions: ['medical-wing'] })).toEqual({ allowed: true });
  });

  it('blocks a locked door for everyone without emergencyOverride, regardless of clearance', () => {
    const door = makeDoor({ state: 'locked', requiredSecurityClearance: 0 });
    expect(checkDoorAccess(door, { role: 'guard', securityClearance: 99 })).toEqual({ allowed: false, reason: 'locked' });
  });

  it('emergencyOverride bypasses only the lock, not clearance/permission', () => {
    const door = makeDoor({ state: 'locked', requiredSecurityClearance: 5, requiredPermission: 'medical-wing' });
    expect(checkDoorAccess(door, { role: 'prisoner', securityClearance: 0, emergencyOverride: true })).toEqual({
      allowed: false,
      reason: 'insufficient-clearance',
    });
    expect(
      checkDoorAccess(door, { role: 'guard', securityClearance: 5, permissions: ['medical-wing'], emergencyOverride: true }),
    ).toEqual({ allowed: true });
  });
});

describe('doorTraversalCost', () => {
  it('scales with door state: open cheapest, closed next, locked most expensive', () => {
    const base = makeDoor({ costMultiplier: 2 });
    expect(doorTraversalCost({ ...base, state: 'open' })).toBe(2);
    expect(doorTraversalCost({ ...base, state: 'closed' })).toBe(3);
    expect(doorTraversalCost({ ...base, state: 'locked' })).toBe(4);
  });
});

describe('DoorRegistry', () => {
  it('registers and looks up doors by edge and by id', () => {
    const doors = new DoorRegistry();
    const door = makeDoor();
    doors.register(door);
    expect(doors.getByEdge(door.position, door.side)).toEqual(door);
    expect(doors.getById(door.id)).toEqual(door);
    expect(doors.all()).toEqual([door]);
  });

  it('rejects a duplicate edge or duplicate id', () => {
    const doors = new DoorRegistry();
    doors.register(makeDoor());
    expect(() => doors.register(makeDoor({ id: 'door-2' }))).toThrow(RangeError); // same edge, different id
    expect(() => doors.register(makeDoor({ position: { x: tileCoordinate(9), y: tileCoordinate(9) } }))).toThrow(RangeError); // same id, different edge
  });

  it('setState updates the stored door on both lookup paths and bumps accessRevision + that door\'s own version, but not structuralRevision', () => {
    const doors = new DoorRegistry();
    doors.register(makeDoor());
    const structuralBefore = doors.structuralRevision;
    const accessBefore = doors.accessRevision;
    const versionBefore = doors.getAccessVersion('door-1');

    doors.setState('door-1', 'locked');

    expect(doors.structuralRevision).toBe(structuralBefore);
    expect(doors.accessRevision).toBe(accessBefore + 1);
    expect(doors.getAccessVersion('door-1')).toBe(versionBefore + 1);
    expect(doors.getById('door-1')?.state).toBe('locked');
    expect(doors.getByEdge({ x: tileCoordinate(4), y: tileCoordinate(1) }, 'left')?.state).toBe('locked');
  });

  it('registering a new door bumps both structuralRevision and accessRevision', () => {
    const doors = new DoorRegistry();
    doors.register(makeDoor());
    const structuralBefore = doors.structuralRevision;
    const accessBefore = doors.accessRevision;

    doors.register(makeDoor({ id: 'door-2', position: { x: tileCoordinate(9), y: tileCoordinate(9) } }));

    expect(doors.structuralRevision).toBe(structuralBefore + 1);
    expect(doors.accessRevision).toBe(accessBefore + 1);
  });

  it('throws for an unknown door id', () => {
    const doors = new DoorRegistry();
    expect(() => doors.setState('missing', 'open')).toThrow(RangeError);
  });
});
