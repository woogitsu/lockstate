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

/**
 * `redefine`'s three answers to the baseline question ADR 0036 decision 4
 * point 2 deferred — *"what happens to a baseline it never captured and to a
 * door whose baseline it now holds for a sector that no longer governs it"* —
 * pinned here rather than only in the restore-path integration case, because
 * they are properties of this class and the restore path is only its first
 * caller. Issue #838: `gradeId` and `doorIds` reach `redefine` at all because
 * the payload's copy of them was otherwise discarded on every restore.
 */
describe('SecuritySectorRegistry.redefine: a moved perimeter and the baselines it moves with it', () => {
  it('adopts a baseline for a door no sector held, and that baseline is what normal restores it to', () => {
    const { doors, sectors } = buildRegistry();
    doors.register(createGradedDoor('sector-door-d', { x: tileCoordinate(4), y: tileCoordinate(4) }, 'left', 'open', 'grade.high-security'));
    expect(sectors.getBaselineDoorStates().map(([id]) => id)).not.toContain('sector-door-d');

    sectors.redefine('sector-a', { doorIds: ['sector-door-a', 'sector-door-b', 'sector-door-c', 'sector-door-d'] });

    expect(sectors.getBaselineDoorStates()).toContainEqual(['sector-door-d', 'open']);
    sectors.setControlState('sector-a', 'lockdown');
    expect(doors.getById('sector-door-d')?.state).toBe('locked');
    sectors.setControlState('sector-a', 'normal');
    expect(doors.getById('sector-door-d')?.state).toBe('open');
  });

  it('never re-captures a baseline it already holds, so a redefine under lockdown cannot make the lockdown permanent', () => {
    const { doors, sectors } = buildRegistry();
    sectors.setControlState('sector-a', 'lockdown');
    expect(doors.getById('sector-door-a')?.state).toBe('locked');

    // The perimeter is restated in full, exactly as the restore loop restates
    // it, while every door sits at a control-state consequence rather than at
    // its baseline. Re-capturing here would adopt 'locked' as the baseline and
    // the prison could never be unlocked again.
    sectors.redefine('sector-a', { doorIds: ['sector-door-a', 'sector-door-b', 'sector-door-c'], postTile: { x: tileCoordinate(9), y: tileCoordinate(9) } });

    expect(sectors.getBaselineDoorStates()).toEqual([
      ['sector-door-a', 'open'],
      ['sector-door-b', 'closed'],
      ['sector-door-c', 'locked'],
    ]);
    sectors.setControlState('sector-a', 'normal');
    expect(doors.getById('sector-door-a')?.state).toBe('open');
    expect(sectors.getControlState('sector-a')).toBe('normal');
    expect(sectors.requireDefinition('sector-a').postTile).toEqual({ x: 9, y: 9 });
  });

  it('drops the baseline of a door it stops governing, and keeps one another sector still governs', () => {
    const { doors, sectors } = buildRegistry();
    sectors.register({ id: 'sector-b', gradeId: 'grade.general', doorIds: ['sector-door-c'], postTile: { x: tileCoordinate(7), y: tileCoordinate(7) } });

    sectors.redefine('sector-a', { doorIds: ['sector-door-a'] });

    // `sector-door-b` is nobody's now: `getBaselineDoorStates` promises every
    // *governed* door's baseline, and `captureSessionSystems` reads it to
    // decide whether a door is saved at its baseline or at its live state.
    expect(sectors.getBaselineDoorStates()).toEqual([
      ['sector-door-a', 'open'],
      ['sector-door-c', 'locked'],
    ]);
    // And the door itself is untouched by losing its sector.
    expect(doors.getById('sector-door-b')?.state).toBe('closed');
    // A lockdown of what is left reaches exactly what is left.
    sectors.setControlState('sector-a', 'lockdown');
    expect(doors.getById('sector-door-a')?.state).toBe('locked');
    expect(doors.getById('sector-door-b')?.state).toBe('closed');
  });

  it('rejects a perimeter naming a door that is not registered, with register\'s own message and no half-applied change', () => {
    const { sectors } = buildRegistry();

    expect(() => sectors.redefine('sector-a', { gradeId: 'grade.general', doorIds: ['sector-door-a', 'missing'] })).toThrow(/unknown door id/);

    // Validation runs before any mutation: the grade did not move either.
    expect(sectors.requireDefinition('sector-a')).toEqual({
      id: 'sector-a',
      gradeId: 'grade.high-security',
      doorIds: ['sector-door-a', 'sector-door-b', 'sector-door-c'],
      postTile: { x: 5, y: 1 },
    });
    expect(sectors.getBaselineDoorStates().map(([id]) => id)).toEqual(['sector-door-a', 'sector-door-b', 'sector-door-c']);
  });

  it('throws for an unknown sector id, like every other id-addressed method here', () => {
    const { sectors } = buildRegistry();
    expect(() => sectors.redefine('sector-nobody', { gradeId: 'grade.general' })).toThrow(/Unknown security sector id/);
  });
});
