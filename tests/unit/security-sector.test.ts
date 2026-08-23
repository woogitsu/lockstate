import { describe, expect, it } from 'vitest';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { checkDoorAccess, type RouteContext } from '../../src/simulation/navigation/route-context';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { createGradedDoor, SecuritySectorRegistry } from '../../src/simulation/security/sector';

function buildRegistry() {
  const doors = new DoorRegistry();
  doors.register(createGradedDoor('sector-door-a', { x: tileCoordinate(4), y: tileCoordinate(1) }, 'left', 'open', 'grade.high-security'));
  doors.register(createGradedDoor('sector-door-b', { x: tileCoordinate(4), y: tileCoordinate(2) }, 'left', 'closed', 'grade.high-security'));
  doors.register(createGradedDoor('sector-door-c', { x: tileCoordinate(4), y: tileCoordinate(3) }, 'left', 'locked', 'grade.high-security'));
  const sectors = new SecuritySectorRegistry(doors);
  sectors.register({ id: 'sector-a', gradeId: 'grade.high-security', doorIds: ['sector-door-a', 'sector-door-b', 'sector-door-c'], postTile: { x: tileCoordinate(5), y: tileCoordinate(1) } });
  return { doors, sectors };
}

describe('createGradedDoor: door requirements come from the security grade catalog', () => {
  it('applies the grade\'s clearance and permission to the door, not hand-picked values', () => {
    const door = createGradedDoor('d1', { x: tileCoordinate(0), y: tileCoordinate(0) }, 'left', 'open', 'grade.high-security');
    expect(door.requiredSecurityClearance).toBe(5);
    expect(door.requiredPermission).toBe('security-wing');
  });

  it('a grade with no requiredPermission produces a door with none', () => {
    const door = createGradedDoor('d2', { x: tileCoordinate(0), y: tileCoordinate(0) }, 'left', 'open', 'grade.general');
    expect(door.requiredSecurityClearance).toBe(0);
    expect(door.requiredPermission).toBeUndefined();
  });

  it('throws for an unknown grade id', () => {
    expect(() => createGradedDoor('d3', { x: tileCoordinate(0), y: tileCoordinate(0) }, 'left', 'open', 'grade.nonexistent')).toThrow(/Unknown security grade id/);
  });
});

describe('SecuritySectorRegistry: control-state cascade to governed doors', () => {
  it('registering a sector captures each governed door\'s current state as the \'normal\' baseline', () => {
    const { sectors } = buildRegistry();
    expect(sectors.getControlState('sector-a')).toBe('normal');
  });

  it('rejects a sector referencing an unregistered door', () => {
    const doors = new DoorRegistry();
    const sectors = new SecuritySectorRegistry(doors);
    expect(() => sectors.register({ id: 'bad', gradeId: 'grade.general', doorIds: ['missing'], postTile: { x: tileCoordinate(0), y: tileCoordinate(0) } })).toThrow(/unknown door id/);
  });

  it('lockdown locks every governed door regardless of its prior state', () => {
    const { doors, sectors } = buildRegistry();
    sectors.setControlState('sector-a', 'lockdown');
    expect(doors.getById('sector-door-a')?.state).toBe('locked');
    expect(doors.getById('sector-door-b')?.state).toBe('locked');
    expect(sectors.getControlState('sector-a')).toBe('lockdown');
  });

  it('restricted closes doors whose baseline was not locked, and leaves a baseline-locked door locked, regardless of what a prior lockdown left it at', () => {
    const { doors, sectors } = buildRegistry();
    sectors.setControlState('sector-a', 'lockdown');
    sectors.setControlState('sector-a', 'restricted');
    // sector-door-a/b started 'open'/'closed' (not locked) -> restricted closes both.
    expect(doors.getById('sector-door-a')?.state).toBe('closed');
    expect(doors.getById('sector-door-b')?.state).toBe('closed');
    // sector-door-c started 'locked' (e.g. a vault) -> restricted leaves it locked, not relaxed to closed.
    expect(doors.getById('sector-door-c')?.state).toBe('locked');
  });

  it('restricted produces the identical result whether or not lockdown ran first -- order-independent, computed from baseline', () => {
    const { doors: doorsA, sectors: sectorsA } = buildRegistry();
    sectorsA.setControlState('sector-a', 'restricted');

    const { doors: doorsB, sectors: sectorsB } = buildRegistry();
    sectorsB.setControlState('sector-a', 'lockdown');
    sectorsB.setControlState('sector-a', 'restricted');

    for (const doorId of ['sector-door-a', 'sector-door-b', 'sector-door-c']) {
      expect(doorsB.getById(doorId)?.state).toBe(doorsA.getById(doorId)?.state);
    }
  });

  it('normal restores each door to its state at sector registration time, not a fixed default', () => {
    const { doors, sectors } = buildRegistry();
    // sector-door-a started 'open', sector-door-b started 'closed'.
    sectors.setControlState('sector-a', 'lockdown');
    sectors.setControlState('sector-a', 'normal');
    expect(doors.getById('sector-door-a')?.state).toBe('open');
    expect(doors.getById('sector-door-b')?.state).toBe('closed');
  });

  it('a lockdown actually denies a normally-eligible RouteContext at the door, except with emergencyOverride', () => {
    const { doors, sectors } = buildRegistry();
    sectors.setControlState('sector-a', 'lockdown');
    const guard: RouteContext = { role: 'staff', securityClearance: 10, permissions: ['security-wing'] };
    const door = doors.getById('sector-door-a')!;
    expect(checkDoorAccess(door, guard)).toEqual({ allowed: false, reason: 'locked' });
    expect(checkDoorAccess(door, { ...guard, emergencyOverride: true })).toEqual({ allowed: true });
  });

  it('snapshot/restore round-trips control state and reapplies the cascade onto freshly re-registered doors', () => {
    const { sectors } = buildRegistry();
    sectors.setControlState('sector-a', 'restricted');
    const snapshot = sectors.getSnapshot();

    const restoredDoors = new DoorRegistry();
    restoredDoors.register(createGradedDoor('sector-door-a', { x: tileCoordinate(4), y: tileCoordinate(1) }, 'left', 'open', 'grade.high-security'));
    restoredDoors.register(createGradedDoor('sector-door-b', { x: tileCoordinate(4), y: tileCoordinate(2) }, 'left', 'closed', 'grade.high-security'));
    const restoredSectors = new SecuritySectorRegistry(restoredDoors);
    restoredSectors.register({ id: 'sector-a', gradeId: 'grade.high-security', doorIds: ['sector-door-a', 'sector-door-b'], postTile: { x: tileCoordinate(5), y: tileCoordinate(1) } });
    restoredSectors.loadSnapshot(snapshot);

    expect(restoredSectors.getControlState('sector-a')).toBe('restricted');
    expect(restoredDoors.getById('sector-door-a')?.state).toBe('closed'); // was 'open' baseline -> restricted forces 'closed'
  });
});
