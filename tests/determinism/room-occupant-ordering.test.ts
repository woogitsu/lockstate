import { describe, expect, it } from 'vitest';
import { RoomInstanceRegistry, type RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * `RoomInstanceRegistry.occupantsOf` must be a function of *state*, never of
 * the history that produced the state.
 *
 * It used to be the other way round, and said so: the accessor returned its
 * backing `Set` unsorted and its own comment declared "insertion order,
 * deliberately -- every consumer must sort", closing with the admission that
 * "nothing will remind" the next caller. Two things made that a defect rather
 * than a documented contract.
 *
 * 1. **The order is not even stable within one prison.** Live, it is `assign`
 *    order. After a save/load it is ascending entity id, because `loadSnapshot`
 *    refills from `getSnapshot`, which sorts. So the identical prison answers
 *    this accessor differently on the two sides of a save, and under ADR 0009
 *    a projection or rating that folds occupants in that order makes a restored
 *    session's state hash disagree with a continuous one's -- a refused replay,
 *    reported nowhere near the accessor.
 * 2. **No static gate can catch a consumer that forgets.**
 *    `canonical-iteration-contract.test.ts` scans text, and
 *    `tests/helpers/canonical-iteration.ts` names `occupantsOf`'s
 *    `[...(this.occupants.get(id) ?? [])]` as the one shape it cannot judge:
 *    whether that lookup yields a `Set` or an array is known to `tsc` and not
 *    to a regex.
 *
 * `projection-ordering.test.ts` is the neighbouring guard and does not cover
 * this: it asserts that `room-projection.ts` sorts what it *gets*, which
 * passed both before and after this change. This file asserts the accessor
 * itself, which is what removes the requirement on every future caller.
 *
 * Demonstrated break, measured rather than asserted: restoring `occupantsOf`
 * to `[...(this.occupants.get(instanceId) ?? [])]` fails five of the six cases
 * below -- the sixth is the fixture self-check, which must stay green either
 * way -- and, across the other 2,261 tests in the suite, exactly one further
 * assertion: this registry's own unit test, which asserted the unsorted order
 * as intended behaviour until this change. `projection-ordering.test.ts` and
 * `snapshot-restore-fidelity.test.ts` are both green with the defect present.
 * A defect that only one file can see is the shape this file exists to widen.
 */
const ROOM: RoomInstance = {
  instanceId: 'room.cell#dorm',
  roomCatalogId: 'room.cell',
  anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
  residentCapacity: 8,
  concurrentUseCapacity: 8,
  objectCapabilities: [],
};

/**
 * Deliberately neither ascending nor descending, and deliberately spanning
 * entity ids whose generation/index halves differ, so a "sorted" result cannot
 * coincide with either insertion order and a comparator that accidentally
 * compared as strings would answer differently from one that compares as
 * numbers (`'1048579' < '17'`).
 */
const OCCUPANTS: readonly EntityId[] = [4_194_311, 17, 2_097_155, 3, 1_048_579];

const ASCENDING: readonly EntityId[] = [...OCCUPANTS].sort((left, right) => left - right);

function registryWithOccupants(order: readonly EntityId[]): RoomInstanceRegistry {
  const registry = new RoomInstanceRegistry();
  registry.register(ROOM);
  for (const entityId of order) registry.assign(ROOM.instanceId, entityId);
  return registry;
}

describe('occupantsOf is a function of state, not of assignment history', () => {
  it('the fixture would actually detect a leak -- no insertion order used here is already canonical', () => {
    // Guards the guard, the same way `projection-ordering.test.ts` does. If
    // OCCUPANTS were ever edited into ascending order, every assertion below
    // would pass against an unsorted accessor and this file would silently
    // stop testing anything.
    expect(OCCUPANTS).not.toEqual(ASCENDING);
    expect([...OCCUPANTS].reverse()).not.toEqual(ASCENDING);
  });

  it('answers identically for two different assignment histories of the same occupant set', () => {
    // The premise of the whole file: two prisons in the same *state*, reached
    // by different histories. Nothing downstream may be able to tell them
    // apart.
    const forward = registryWithOccupants(OCCUPANTS);
    const reversed = registryWithOccupants([...OCCUPANTS].reverse());

    expect(reversed.occupantsOf(ROOM.instanceId)).toEqual(forward.occupantsOf(ROOM.instanceId));
  });

  it('answers in ascending entity id, not in either assignment order', () => {
    // Asserting the canonical order itself and not merely that two runs agree:
    // two runs would also agree if the accessor always returned insertion
    // order and both were built the same way.
    expect(registryWithOccupants(OCCUPANTS).occupantsOf(ROOM.instanceId)).toEqual(ASCENDING);
    expect(registryWithOccupants([...OCCUPANTS].reverse()).occupantsOf(ROOM.instanceId)).toEqual(ASCENDING);
  });

  it('answers identically live and after a snapshot round trip', () => {
    // The divergence the old comment described in its own words, as a test.
    // `getSnapshot` sorts ascending entity id and `loadSnapshot` refills in
    // that order, so before the accessor sorted, these two lists were the
    // assignment order and the ascending order of the same prison.
    const live = registryWithOccupants(OCCUPANTS);

    const restored = new RoomInstanceRegistry();
    restored.register(ROOM);
    restored.loadSnapshot(live.getSnapshot());

    expect(restored.occupantsOf(ROOM.instanceId)).toEqual(live.occupantsOf(ROOM.instanceId));
    expect(restored.occupantsOf(ROOM.instanceId)).toEqual(ASCENDING);
  });

  it('stays canonical after a release re-fills a freed place out of order', () => {
    // `Set` insertion order is not merely assignment order -- it is
    // assignment order *with deletions removed*, so a room that has churned
    // can hand back an order no single assignment sequence would produce.
    // Releasing the lowest id and re-assigning it puts it last in the `Set`.
    const registry = registryWithOccupants(OCCUPANTS);
    const lowest = ASCENDING[0]!;
    registry.release(ROOM.instanceId, lowest);
    registry.assign(ROOM.instanceId, lowest);

    expect(registry.occupantsOf(ROOM.instanceId)).toEqual(ASCENDING);
  });

  it('is not merely a copy of the backing set -- mutating the answer cannot reach the registry', () => {
    // The sort is applied to a fresh array. If a future refactor ever sorted
    // the backing `Set`'s own array in place, or returned it, this would fail
    // rather than corrupt occupancy silently.
    const registry = registryWithOccupants(OCCUPANTS);
    const answer = registry.occupantsOf(ROOM.instanceId) as EntityId[];
    answer.push(999_999);

    expect(registry.occupantsOf(ROOM.instanceId)).toEqual(ASCENDING);
    expect(registry.occupancyOf(ROOM.instanceId)).toBe(OCCUPANTS.length);
  });
});
