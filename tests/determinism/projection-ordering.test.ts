import { describe, expect, it } from 'vitest';
import { RoomInstanceRegistry, type RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * Projections must be a function of *state*, never of the order that state
 * happened to be registered in.
 *
 * `RoomInstanceRegistry` keeps occupants in a `Set`, and `occupantsOf` used to
 * return them in insertion order — a property of this session's history, not
 * of the prison. `room-projection.ts` sorts them canonically before
 * projecting, which is correct; nothing asserted it. Removing that sort passed
 * the entire 811-test suite, because the existing round-trip scenario's rooms
 * hold at most one occupant, so their order is trivially stable and the
 * reversal assertion never reaches the field.
 *
 * The accessor sorts now too (`room-occupant-ordering.test.ts`), which does
 * **not** make this file redundant and is why the projection's own sort was
 * kept. What is asserted here is that *this layer's output* is canonical
 * whatever it is handed; what is asserted there is that the registry hands out
 * state rather than history. Collapsing the two would make the projection's
 * order depend on a decision taken in another module, and the next person to
 * revisit that decision would have no test telling them the HUD cares.
 *
 * That is the shape of the four defects `docs/DETERMINISM.md` records: an
 * ordering that is right today, defended by nothing, one refactor from
 * quietly becoming wrong. Under ADR 0009 it is not cosmetic — replay
 * verification compares state hashes, so a projection that varies with
 * registration order makes a restored session disagree with a continuous one.
 */
const ROOM: RoomInstance = {
  instanceId: 'room.cell#1',
  roomCatalogId: 'room.cell',
  anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
  residentCapacity: 8, concurrentUseCapacity: 8,
  objectCapabilities: [],
};

/** Deliberately not ascending, so a "sorted" result cannot coincide with either insertion order. */
const OCCUPANTS: readonly EntityId[] = [4_194_311, 17, 2_097_155, 3, 1_048_579];

function registryWithOccupants(order: readonly EntityId[]): RoomInstanceRegistry {
  const registry = new RoomInstanceRegistry();
  registry.register(ROOM);
  for (const entityId of order) registry.assign(ROOM.instanceId, entityId);
  return registry;
}

describe('projections do not leak registration order', () => {
  it('projects the same room occupants whichever order they were assigned in', () => {
    const forward = projectRoomDetail({ roomInstances: registryWithOccupants(OCCUPANTS) }, ROOM.instanceId);
    const reversed = projectRoomDetail(
      { roomInstances: registryWithOccupants([...OCCUPANTS].reverse()) },
      ROOM.instanceId,
    );

    expect(forward).toBeDefined();
    expect(reversed).toBeDefined();
    expect(reversed?.occupantEntityIds).toEqual(forward?.occupantEntityIds);
  });

  it('projects occupants in ascending id order, not in either insertion order', () => {
    const projected = projectRoomDetail(
      { roomInstances: registryWithOccupants(OCCUPANTS) },
      ROOM.instanceId,
    );

    // Asserting the canonical order itself, not merely that two runs agree:
    // two runs would also agree if the projection always returned insertion
    // order and both were built the same way.
    expect(projected?.occupantEntityIds).toEqual([...OCCUPANTS].sort((left, right) => left - right));
  });

  it('the fixture would actually detect a leak -- insertion order differs from canonical order', () => {
    // Guards the guard. If OCCUPANTS were ever edited into ascending order,
    // both tests above would pass against an unsorted projection and this file
    // would silently stop testing anything.
    const ascending = [...OCCUPANTS].sort((left, right) => left - right);
    expect(OCCUPANTS).not.toEqual(ascending);
    expect([...OCCUPANTS].reverse()).not.toEqual(ascending);
  });
});
