import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { DoorRegistry, MINIMUM_DOOR_COST_MULTIPLIER, type DoorDefinition } from '../../src/simulation/navigation/door';
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

  /**
   * The precondition `boundedLocalSearch` cannot check for itself.
   *
   * Its Manhattan heuristic charges one step per remaining tile and its
   * closed set is never reopened, so a door cheaper than a plain step makes
   * the heuristic overestimate and the route it returns is no longer the
   * cheapest one inside its own bound -- with no failure to observe, just a
   * longer path. `docs/NAVIGATION.md`'s "Known correctness caveat" promises
   * optimality *within* the regions the portal search chose, so this is the
   * guard that keeps that sentence true;
   * `tests/unit/navigation-local-search-admissibility.test.ts` measures what
   * it buys and what its absence costs.
   *
   * `NaN` is here because it is the case a bare `< 1` comparison lets
   * through -- `NaN < 1` is `false` -- and a `NaN` door cost makes every
   * route across it cost `NaN`.
   */
  it('rejects a costMultiplier below a plain step, or one that is not a finite number', () => {
    const doors = new DoorRegistry();
    for (const costMultiplier of [MINIMUM_DOOR_COST_MULTIPLIER - Number.EPSILON, 0.99, 0.75, 0.25, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => doors.register(makeDoor({ costMultiplier })), `costMultiplier ${costMultiplier}`).toThrow(RangeError);
    }
    // Refused before anything is written: the registry is untouched, so the
    // edge and the id are both still free.
    expect(doors.all()).toEqual([]);
    expect(doors.structuralRevision).toBe(0);
    expect(doors.accessRevision).toBe(0);

    for (const costMultiplier of [MINIMUM_DOOR_COST_MULTIPLIER, 1.5, 2, 10]) {
      const registry = new DoorRegistry();
      registry.register(makeDoor({ costMultiplier }));
      expect(registry.getById('door-1')?.costMultiplier).toBe(costMultiplier);
    }
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

  it('unregister takes the door off both lookup paths and out of all()', () => {
    const doors = new DoorRegistry();
    doors.register(makeDoor());
    doors.register(makeDoor({ id: 'door-2', position: { x: tileCoordinate(9), y: tileCoordinate(9) } }));

    expect(doors.unregister('door-1')).toBe(true);

    expect(doors.getById('door-1')).toBeUndefined();
    expect(doors.getByEdge({ x: tileCoordinate(4), y: tileCoordinate(1) }, 'left')).toBeUndefined();
    expect(doors.all().map((door) => door.id)).toEqual(['door-2']);
  });

  it('unregister bumps both revisions, because a removal changes the region graph exactly as an addition does', () => {
    // The contract this widened. It said "bumped only when a door is *added*"
    // until doors became buildable, and `docs/NAVIGATION.md` named that sentence
    // as a precondition for wiring door placement: a completed order is
    // cancellable, so a built door has to be removable, and
    // `isNavigationGraphStale` compares exactly this counter.
    const doors = new DoorRegistry();
    doors.register(makeDoor());
    const structuralBefore = doors.structuralRevision;
    const accessBefore = doors.accessRevision;

    doors.unregister('door-1');

    expect(doors.structuralRevision).toBe(structuralBefore + 1);
    expect(doors.accessRevision).toBe(accessBefore + 1);
  });

  it('unregister answers false for an unknown id instead of throwing, unlike setState', () => {
    // Deliberate asymmetry: `setState` on a door that is not there is a caller
    // bug, while removing a door that is not there is the outcome the caller
    // asked for -- and the production caller runs inside a scheduled system
    // update, where a throw faults the worker.
    const doors = new DoorRegistry();
    const structuralBefore = doors.structuralRevision;

    expect(doors.unregister('missing')).toBe(false);

    expect(doors.structuralRevision).toBe(structuralBefore);
    expect(doors.accessRevision).toBe(0);
  });

  it('leaves nothing behind, so an edge can hold a fresh door with the same id afterwards', () => {
    // What makes `constructedDoorIdFor` safe to mint twice: rebuilding a door on
    // the same edge is the same door in the same place, and it must not inherit
    // a removed one's access version -- which is what a retained entry would
    // give it.
    const doors = new DoorRegistry();
    doors.register(makeDoor({ state: 'locked' }));
    doors.setState('door-1', 'open');
    expect(doors.getAccessVersion('door-1')).toBe(1);

    doors.unregister('door-1');
    doors.register(makeDoor({ state: 'closed' }));

    expect(doors.getById('door-1')?.state).toBe('closed');
    expect(doors.getAccessVersion('door-1')).toBe(0);
  });
});
