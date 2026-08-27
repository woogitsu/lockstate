import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { PositionComponent } from '../../src/simulation/prisoners/components';
import { DEFAULT_SECURITY_SECTOR_ID } from '../../src/simulation/security/default-sector';
import {
  countSectorOccupants,
  resolveSectorOccupants,
  sectorCoversTile,
} from '../../src/simulation/security/sector-occupancy';
import type { SecuritySectorDefinition } from '../../src/simulation/security/sector';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * **What a sector's occupants are**
 * ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md) decision 1,
 * answering [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * open question 1).
 *
 * ## Why the world here is two chunks and not one
 *
 * A session owns exactly one chunk, so a fixture built from
 * `createNewSimulationRuntime` cannot tell "every prisoner" from "every
 * prisoner on owned land" — every tile a prisoner can stand on is owned, and
 * the ownership half of the rule would be untested by construction. This world
 * owns chunk (0,0) and deliberately does not own chunk (1,0), so a prisoner at
 * x = 40 is somewhere the rule has to exclude.
 *
 * That state is not reachable through any command today (`world.setOwned` has
 * one call site and nothing moves a prisoner off owned ground), which is
 * exactly why it belongs in a unit test rather than in an integration one.
 */

const OWNED_CHUNK = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
const POST = { x: tileCoordinate(16), y: tileCoordinate(16) };

const DEFAULT_SECTOR: SecuritySectorDefinition = {
  id: DEFAULT_SECURITY_SECTOR_ID,
  gradeId: 'grade.general',
  doorIds: [],
  postTile: POST,
};

/** A sector somebody else registered. Same post tile, so only the id can be what changes the answer. */
const REGISTERED_SECTOR: SecuritySectorDefinition = {
  id: 'sector-a',
  gradeId: 'grade.general',
  doorIds: [],
  postTile: POST,
};

function world(): SparseWorld {
  const built = new SparseWorld(32);
  built.setOwned(OWNED_CHUNK, true);
  return built;
}

/**
 * A population at stated tiles, returned with the entity ids the store handed
 * out so an assertion never has to guess at the packing.
 */
function populationAt(tiles: readonly (readonly [number, number])[]): {
  readonly prisoners: { readonly entityStore: EntityStore; readonly position: PositionComponent };
  readonly ids: readonly number[];
} {
  const entityStore = new EntityStore(64);
  const position = new PositionComponent(64);
  const ids: number[] = [];
  for (const [x, y] of tiles) {
    const id = entityStore.spawn();
    const index = entityStore.getIndex(id);
    position.tileX[index] = x;
    position.tileY[index] = y;
    ids.push(id);
  }
  return { prisoners: { entityStore, position }, ids };
}

describe('the derived sector is the prison, so its occupants are everyone standing in it', () => {
  it('counts a prisoner in a cell across the prison, not only one standing on the post tile', () => {
    // The defect this rule replaces, stated as a case: (4, 6) is the anchor
    // tile of the cell every integration fixture zones, and `ActionSystem`
    // teleports an arrival there. Under the post-tile rule the prison's only
    // housed prisoner was not an occupant of the only sector there is.
    const { prisoners, ids } = populationAt([
      [4, 6],
      [16, 16],
    ]);

    expect(resolveSectorOccupants(DEFAULT_SECTOR, world(), prisoners)).toEqual([ids[0], ids[1]]);
  });

  it('excludes a prisoner standing on land the prison does not own', () => {
    const { prisoners, ids } = populationAt([
      [16, 16],
      [40, 16], // chunk (1, 0): a real tile, and not this prison's
    ]);

    expect(resolveSectorOccupants(DEFAULT_SECTOR, world(), prisoners)).toEqual([ids[0]]);
    expect(sectorCoversTile(DEFAULT_SECTOR, world(), 40, 16)).toBe(false);
  });

  it('leaves a sector nobody derived on the post-tile rule it already had', () => {
    // Not a shortcut: `SecuritySectorDefinition` records no extent, so the only
    // sector whose area is known without being drawn is the one ADR 0036
    // derives from owned land. Inventing an area for a registered sector would
    // be deciding a containment rule for sectors that do not exist yet.
    const { prisoners, ids } = populationAt([
      [4, 6],
      [16, 16],
    ]);

    expect(resolveSectorOccupants(REGISTERED_SECTOR, world(), prisoners)).toEqual([ids[1]]);
  });

  it('skips a dead index rather than reading the tile its previous occupant left behind', () => {
    const { prisoners, ids } = populationAt([
      [4, 6],
      [5, 6],
      [6, 6],
    ]);
    prisoners.entityStore.destroy(ids[1]!);

    // `PositionComponent` is not cleared on destroy, so tile (5, 6) is still in
    // the array; liveness is what decides, and this is the assertion that says
    // so rather than a comment claiming it.
    expect(prisoners.position.tileX[prisoners.entityStore.getIndex(ids[0]!) + 1]).toBe(5);
    expect(resolveSectorOccupants(DEFAULT_SECTOR, world(), prisoners)).toEqual([ids[0], ids[2]]);
  });

  it('answers in ascending entity id whatever order the indices were filled in', () => {
    const built = new EntityStore(64);
    const position = new PositionComponent(64);
    // Spawn four, free the middle two, spawn two more: `EntityStore` recycles
    // indices, so the later ids land at lower indices than earlier ones and an
    // index-order walk would answer out of id order.
    const first = [built.spawn(), built.spawn(), built.spawn(), built.spawn()];
    built.destroy(first[1]!);
    built.destroy(first[2]!);
    const recycled = [built.spawn(), built.spawn()];
    for (const id of [...first.filter((_, index) => index !== 1 && index !== 2), ...recycled]) {
      const index = built.getIndex(id);
      position.tileX[index] = 4;
      position.tileY[index] = 6;
    }

    const answer = resolveSectorOccupants(DEFAULT_SECTOR, world(), { entityStore: built, position });
    expect([...answer]).toEqual([...answer].sort((left, right) => left - right));
    expect(answer).toHaveLength(4);
    // The recycled ids really are out of index order, so the sort above is load-bearing.
    expect(built.getIndex(recycled[0]!)).toBeLessThan(built.getIndex(first[3]!));
    expect(recycled[0]!).toBeGreaterThan(first[3]!);
  });
});

describe('the count and the list are one rule read two ways', () => {
  it('agrees with the list for every sector shape the session uses', () => {
    // Not a tautology check: the two are separate walks in
    // `sector-occupancy.ts` (the count exists so `DeploymentSystem` does not
    // allocate a list of up to 5,000 ids ten times a second), and this is what
    // stops one of them from drifting.
    const { prisoners, ids } = populationAt([
      [4, 6],
      [16, 16],
      [40, 16],
      [4, 6],
    ]);
    // A dead index inside the walk, so the two functions have to agree about
    // liveness and not only about geometry.
    prisoners.entityStore.destroy(ids[3]!);

    for (const sector of [DEFAULT_SECTOR, REGISTERED_SECTOR]) {
      expect(countSectorOccupants(sector, world(), prisoners)).toBe(resolveSectorOccupants(sector, world(), prisoners).length);
    }
    expect(countSectorOccupants(DEFAULT_SECTOR, world(), prisoners)).toBe(2);
    expect(countSectorOccupants(REGISTERED_SECTOR, world(), prisoners)).toBe(1);
  });
});
