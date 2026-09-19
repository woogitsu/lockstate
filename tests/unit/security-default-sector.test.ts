import { describe, expect, it } from 'vitest';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import {
  applyDefaultSecuritySector,
  constantDeploymentSchedule,
  deriveDefaultSecuritySector,
  deriveDefaultSecuritySectorPostTile,
  DEFAULT_SECURITY_SECTOR_ID,
  SecuritySectorRegistry,
  type DefaultSecuritySectorWorld,
  type DeploymentSchedule,
} from '../../src/simulation/security';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * The derivation rule behind issue #396's fix
 * ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)).
 *
 * Every expected value here is **written out**, never read back from the module
 * under test. `security-sector.prison`, `grade.general`, `(16, 16)`, one guard,
 * 2,400 ticks: each of those is a decision ADR 0036 makes, and a fixture that
 * imported the constant would still pass if the decision were changed to
 * something absurd — which is the class of fixture issue #375 found six of in a
 * day. If a number here has to move, a reviewer has to see it move.
 */

/** A world shape with nothing behind it, so the derivation's inputs can be stated exactly. */
function world(tileChunkSize: number, owned: readonly (readonly [number, number])[]): DefaultSecuritySectorWorld {
  return {
    tileChunkSize,
    // Deliberately **unsorted** as handed in: the rule is that the derivation
    // sorts, not that its caller happens to.
    ownedChunkPositions: () => owned.map(([x, y]) => ({ x: chunkCoordinate(x), y: chunkCoordinate(y) })),
  };
}

describe('the default sector post tile', () => {
  it('is the middle of the origin chunk for a new session, which is also where a hire stands and an arrival lands', () => {
    // A new session owns exactly chunk (0,0) of a 32-tile world, so this is
    // (16, 16) -- the same tile `NEW_PRISON_ORIGIN_TILE` in `src/main.ts` holds.
    // The coincidence is what makes a hire posted without a route request and an
    // unhoused arrival an occupant of the sector, so it is asserted rather than
    // noted.
    expect(deriveDefaultSecuritySectorPostTile(world(32, [[0, 0]]))).toEqual({ x: 16, y: 16 });
  });

  it('takes the first owned chunk in canonical (y, x) order, not the first one it was handed', () => {
    // (y=0, x=1) sorts before (y=1, x=0), so the post tile is in the chunk to
    // the *right* of the origin rather than the one below it -- 1*32+16 = 48.
    expect(deriveDefaultSecuritySectorPostTile(world(32, [[0, 1], [1, 0]]))).toEqual({ x: 48, y: 16 });
    // The same two chunks in the other order answer the same, which is the
    // property a `Set`'s insertion order would not have.
    expect(deriveDefaultSecuritySectorPostTile(world(32, [[1, 0], [0, 1]]))).toEqual({ x: 48, y: 16 });
  });

  it('handles negative chunk coordinates by the same comparison, so a world that grew north-west still answers stably', () => {
    // (y=-1, x=0) sorts before (y=0, x=-1) and before (y=0, x=0).
    expect(deriveDefaultSecuritySectorPostTile(world(32, [[0, 0], [-1, 0], [0, -1]]))).toEqual({ x: 16, y: -16 });
  });

  it('falls back to the origin chunk when the world owns nothing, because "no sector" is where #396 starts', () => {
    expect(deriveDefaultSecuritySectorPostTile(world(32, []))).toEqual({ x: 16, y: 16 });
  });

  it('scales with the chunk size rather than hard-coding 16', () => {
    expect(deriveDefaultSecuritySectorPostTile(world(16, [[0, 0]]))).toEqual({ x: 8, y: 8 });
    expect(deriveDefaultSecuritySectorPostTile(world(64, [[2, 0]]))).toEqual({ x: 160, y: 32 });
  });

  it('reads a real SparseWorld, and reads it the same way twice', () => {
    // The structural type is only useful if the class actually satisfies it, and
    // only safe if `ownedChunkPositions` is stable -- `setOwned` is called in
    // whatever order a session, a scenario or `fromSnapshot` happens to use.
    const real = new SparseWorld(32);
    for (const [x, y] of [[1, 1], [0, 0], [1, 0]] as const) {
      real.load({ x: chunkCoordinate(x), y: chunkCoordinate(y) });
      real.setOwned({ x: chunkCoordinate(x), y: chunkCoordinate(y) }, true);
    }
    expect(real.ownedChunkPositions()).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(deriveDefaultSecuritySectorPostTile(real)).toEqual({ x: 16, y: 16 });

    // And through a save round trip, which is the case that decides whether a
    // restored session derives what a live one did.
    const reloaded = SparseWorld.fromSnapshot(JSON.parse(JSON.stringify(real.snapshot())) as unknown);
    expect(deriveDefaultSecuritySectorPostTile(reloaded)).toEqual(deriveDefaultSecuritySectorPostTile(real));
  });
});

describe('the default sector definition', () => {
  it('governs no doors, walks no patrol route, and carries the unclassified grade', () => {
    expect(deriveDefaultSecuritySector(world(32, [[0, 0]]))).toEqual({
      id: 'security-sector.prison',
      gradeId: 'grade.general',
      doorIds: [],
      postTile: { x: 16, y: 16 },
    });
  });

  it('registers with a lockdown that cascades onto nothing, which is the honest cost of a sector nobody drew', () => {
    const doors = new DoorRegistry();
    doors.register({ id: 'door-1', position: { x: tileCoordinate(2), y: tileCoordinate(1) }, side: 'left', state: 'open', requiredSecurityClearance: 0, costMultiplier: 1 });
    const sectors = new SecuritySectorRegistry(doors);
    sectors.register(deriveDefaultSecuritySector(world(32, [[0, 0]])));

    sectors.setControlState('security-sector.prison', 'lockdown');

    // The control state really moves -- it is in the save payload and in the
    // security projection -- and the door really does not, because this sector
    // governs none. Both halves matter: a reader who assumes a lockdown seals
    // something would be wrong, and one who assumes nothing changed would miss
    // the state a save carries.
    expect(sectors.getControlState('security-sector.prison')).toBe('lockdown');
    expect(doors.getById('door-1')?.state).toBe('open');
  });
});

describe('applying the default sector', () => {
  function targets(): {
    readonly sectors: SecuritySectorRegistry;
    readonly schedules: DeploymentSchedule[];
    readonly watchedSectorIds: string[];
    readonly world: DefaultSecuritySectorWorld;
  } {
    return { sectors: new SecuritySectorRegistry(new DoorRegistry()), schedules: [], watchedSectorIds: [], world: world(32, [[0, 0]]) };
  }

  it('fills all three collections, because a sector alone leaves the tier as inert as none', () => {
    const t = targets();
    applyDefaultSecuritySector(t);

    expect(t.sectors.all().map((sector) => sector.id)).toEqual(['security-sector.prison']);
    expect(t.schedules).toEqual([
      { sectorId: 'security-sector.prison', blocks: [{ startTickOfDay: 0, endTickOfDay: 2_400, requiredGuardCount: 1 }] },
    ]);
    expect(t.watchedSectorIds).toEqual(['security-sector.prison']);
  });

  it('is idempotent, because it is called twice on every restored session', () => {
    const t = targets();
    applyDefaultSecuritySector(t);
    // `SecuritySectorRegistry.register` throws on a duplicate id, and a second
    // schedule or watch entry would double the sector's demand and sample it
    // twice -- so this call has to be a no-op rather than merely not crashing.
    expect(() => applyDefaultSecuritySector(t)).not.toThrow();

    expect(t.sectors.all()).toHaveLength(1);
    expect(t.schedules).toHaveLength(1);
    expect(t.watchedSectorIds).toEqual(['security-sector.prison']);
  });

  it('leaves a schedule that is already there alone, so a payload can say "zero guards" and be believed', () => {
    const t = targets();
    t.schedules.push(constantDeploymentSchedule(DEFAULT_SECURITY_SECTOR_ID, 0));
    applyDefaultSecuritySector(t);

    // This is the property `restoreSessionSystems` depends on: it re-applies the
    // derivation *after* the payload, so anything the payload carried has to
    // win. Without it a restored session could not hold a requirement that
    // differed from the derived one.
    expect(t.schedules).toEqual([
      { sectorId: 'security-sector.prison', blocks: [{ startTickOfDay: 0, endTickOfDay: 2_400, requiredGuardCount: 0 }] },
    ]);
  });

  it('leaves a sector already registered under the id alone, and answers with the registered one', () => {
    const t = targets();
    const authored = { id: DEFAULT_SECURITY_SECTOR_ID, gradeId: 'grade.high-security', doorIds: [], postTile: { x: tileCoordinate(3), y: tileCoordinate(4) } } as const;
    t.sectors.register(authored);

    expect(applyDefaultSecuritySector(t)).toEqual(authored);
    expect(t.sectors.all()).toEqual([authored]);
  });

  it('adds nothing to a watch list that already names the sector', () => {
    const t = targets();
    t.watchedSectorIds.push('sector-a', DEFAULT_SECURITY_SECTOR_ID, 'sector-z');
    applyDefaultSecuritySector(t);
    expect(t.watchedSectorIds).toEqual(['sector-a', 'security-sector.prison', 'sector-z']);
  });
});
