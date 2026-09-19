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

/**
 * A registry that hands out occupants in the order they were assigned (#416).
 *
 * The three cases above cannot see the projection's own sort, and the file's
 * comment says why without noticing the consequence: `occupantsOf` **already
 * sorts**, so every one of them feeds `projectRoomDetail` an ascending list
 * and asserts that an ascending list came back. Deleting
 * `.sort(compareEntityIds)` from `room-projection.ts` left 238 files / 2,696
 * tests green when measured at `54418b6` (v0.0.121) -- the exact defect this file was
 * written to prevent, surviving inside the file written to prevent it. It is
 * `docs/TESTING.md`'s first form: the fixture supplied both sides of the
 * comparison, because the "input" was produced by a sort of its own.
 *
 * So the input has to come from somewhere that does not sort. This subclass is
 * that somewhere: it overrides the one accessor the projection reads and
 * answers with its own record of the assignment order, which is exactly the
 * `Set`-insertion order `occupantsOf` used to leak. Everything else the
 * projection asks the registry for -- `getById`, `allByRoomCatalogId`,
 * `occupancyOf` -- is the real implementation, so this is a registry in a
 * state the module once really had rather than a stub of one.
 *
 * It is not a mirror: the expected value below is a written-out ascending
 * literal, and this class never sorts anything.
 */
class InsertionOrderRoomInstanceRegistry extends RoomInstanceRegistry {
  private readonly assignmentOrder = new Map<string, EntityId[]>();

  public override assign(instanceId: string, entityId: EntityId): boolean {
    const assigned = super.assign(instanceId, entityId);
    if (assigned) {
      const order = this.assignmentOrder.get(instanceId) ?? [];
      order.push(entityId);
      this.assignmentOrder.set(instanceId, order);
    }
    return assigned;
  }

  public override occupantsOf(instanceId: string): readonly EntityId[] {
    return [...(this.assignmentOrder.get(instanceId) ?? [])];
  }
}

function unsortedRegistryWithOccupants(order: readonly EntityId[]): InsertionOrderRoomInstanceRegistry {
  const registry = new InsertionOrderRoomInstanceRegistry();
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

  it('sorts what an unsorted source hands it, which is what this layer contracts to do', () => {
    // The case the three above could not be: a source that really does return
    // registration order. If `projectRoomDetail` stops sorting, this is the
    // order it publishes.
    const registry = unsortedRegistryWithOccupants(OCCUPANTS);

    // Non-vacuity first, and it is load-bearing rather than decorative: if the
    // subclass ever started sorting -- or if the projection were handed the
    // stock registry by mistake -- the assertion below would hold for an
    // unsorted projection and this case would silently stop testing anything.
    expect(registry.occupantsOf(ROOM.instanceId), 'the source must not pre-sort').toEqual(OCCUPANTS);

    const projected = projectRoomDetail({ roomInstances: registry }, ROOM.instanceId);

    // A written-out literal, not `[...OCCUPANTS].sort(...)`: an expected value
    // computed by a sort is an expected value some sort produced, and the
    // subject here is whether the projection performs one.
    expect(projected?.occupantEntityIds).toEqual([3, 17, 1_048_579, 2_097_155, 4_194_311]);
  });

  it('publishes the same order whichever order an unsorted source hands it', () => {
    // The order-independence claim, now on a source that can actually vary.
    // Against the stock registry both sides were sorted before the projection
    // saw them, so this held for a projection that did nothing at all.
    const forward = projectRoomDetail({ roomInstances: unsortedRegistryWithOccupants(OCCUPANTS) }, ROOM.instanceId);
    const reversed = projectRoomDetail(
      { roomInstances: unsortedRegistryWithOccupants([...OCCUPANTS].reverse()) },
      ROOM.instanceId,
    );

    expect(forward?.occupantEntityIds).toEqual([3, 17, 1_048_579, 2_097_155, 4_194_311]);
    expect(reversed?.occupantEntityIds).toEqual(forward?.occupantEntityIds);
  });

  it('the fixture would actually detect a leak -- insertion order differs from canonical order', () => {
    // Guards the guard. If OCCUPANTS were ever edited into ascending order,
    // both tests above would pass against an unsorted projection and this file
    // would silently stop testing anything.
    const ascending = [...OCCUPANTS].sort((left, right) => left - right);
    expect(OCCUPANTS).not.toEqual(ascending);
    expect([...OCCUPANTS].reverse()).not.toEqual(ascending);
    // And the literal the two unsorted-source cases assert against really is
    // `OCCUPANTS` in ascending order, so editing the fixture without editing
    // the literal fails here rather than weakening them into a comparison
    // against some other list.
    expect(ascending).toEqual([3, 17, 1_048_579, 2_097_155, 4_194_311]);
  });
});
