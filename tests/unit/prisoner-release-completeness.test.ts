import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What mechanism keeps the release list complete?**
 *
 * That is [ADR 0026](../../docs/adr/0026-entity-id-lifetime.md) question 2's
 * actual question -- not *"should release drop these"*, which it answers with
 * "obviously it should" -- and it asks it because a hand-written list is the
 * failure mode issue #111 already produced once: thirteen component arrays
 * initialised in one place and forgotten in the other, silently correct until
 * an index was recycled. ADR 0050 answers it with this file.
 *
 * `PrisonerReleaseSurfaces` (`src/simulation/prisoners/release.ts`) makes the
 * list *visible*. It cannot make it *complete*: a store added to the session
 * and never added to that type is exactly what a type cannot see. So the gate
 * is executable and works the other way round -- it does not read the release
 * path at all. It walks the **real session's object graph**, finds every
 * container in it that mentions one living prisoner's `EntityId`, releases that
 * prisoner, and requires that nothing mentions them afterwards.
 *
 * A nineteenth store therefore fails here whether or not anybody remembered
 * `release.ts`, and it fails by *naming its own path* in the assertion.
 *
 * ## Why the target prisoner's id is forced to a large number
 *
 * A fresh prison hands out `EntityId` 0, then 1, then 2 -- and a walk looking
 * for the number 0 in a session's object graph finds every zeroed counter,
 * every empty tally and every tick stamp in it. The setup below therefore
 * recycles index 0 seven times first, so the prisoner under test is issued
 * generation 7 at index 0: `(7 << 20) | 0`, or 7,340,032. Nothing else in a
 * session of this size holds that number by coincidence, and the assertions
 * below prove the search finds real hits rather than nothing at all.
 */

const SEED = 441;
const ARRIVAL = { x: 16, y: 16 };
const CELL = { x: 4, y: 6, width: 2, height: 3 } as const;

/** How many containers in a session hold a *matching-value* hit we deliberately keep. See `HISTORICAL_PATHS`. */
type Hit = string;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function step(runtime: SimulationRuntime, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) runtime.kernel.step();
}

/**
 * Every path in `root`'s object graph at which `target` appears, as a `Map`
 * key, a `Set` member, an array element or a numeric property.
 *
 * Deliberately blunt. It descends into plain objects, arrays, `Map`s and
 * `Set`s, and it does **not** know what any of them are for -- which is the
 * only way it can notice a store nobody told it about. Typed arrays are the one
 * family it skips, and they are skipped because they are index-keyed rather
 * than id-keyed: `PrisonerRecordComponent`'s six arrays are reset when an index
 * is *allocated* (the #111 fix) and deliberately not on release, so a residual
 * value in a freed slot is the documented behaviour rather than a leak. They
 * also cannot hold an `EntityId` above `0xffff` in a `Uint8Array` at all.
 */
function pathsMentioning(root: object, target: number): readonly Hit[] {
  const hits: Hit[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 10 || node === null || typeof node !== 'object') return;
    if (ArrayBuffer.isView(node)) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (node instanceof Map) {
      for (const [key, value] of node) {
        if (key === target) hits.push(`${path}{key ${String(key)}}`);
        if (value === target) hits.push(`${path}{value at ${String(key)}}`);
        walk(value, `${path}.get(${String(key)})`, depth + 1);
      }
      return;
    }

    if (node instanceof Set) {
      for (const member of node) {
        if (member === target) hits.push(`${path}{member}`);
        else walk(member, `${path}<member>`, depth + 1);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((element, index) => {
        if (element === target) hits.push(`${path}[${index}]`);
        else walk(element, `${path}[${index}]`, depth + 1);
      });
      return;
    }

    // Sorted rather than in insertion order, so the path a store is reported
    // at is a function of the graph and not of construction order: the first
    // route to a shared object wins, and `seen` blocks the rest.
    for (const [key, value] of Object.entries(node).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (typeof value === 'function') continue;
      if (value === target) hits.push(`${path}.${key}`);
      else walk(value, `${path}.${key}`, depth + 1);
    }
  };

  walk(root, '', 0);
  return hits.sort();
}

/**
 * The one family of hit a release must **not** clear, stated as a rule rather
 * than as a list of paths so it survives the log growing a second index.
 *
 * `IncidentLog` is a record of what happened, not a store keyed by who is in
 * the prison. A riot in which prisoner 7,340,032 took part happened, and it
 * goes on having happened after they leave; rewriting the participant list on
 * their departure would falsify the log, break `buildDisciplinaryIndex`'s
 * clean-conduct arithmetic for everybody else in that incident, and make
 * `ClassificationReviewSystem`'s evidence depend on who is still resident.
 *
 * That retention is safe **because the log is only ever read by id**: a
 * recycled index gets a new generation, so a later occupant's id misses. It
 * stops being safe at the 4,096th recycle of one index, which is ADR 0026
 * question 1 -- open, escalated by ADR 0050, and not answered by anything here.
 *
 * **The log grew its second id-keyed container on
 * [ADR 0057](../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md), and
 * the paragraph above anticipated it in those words.** `openRiotCountByParticipant`
 * is a derived index over exactly the participant lists this rule already
 * exempts -- `IncidentLog.open` writes it, `transition` to a terminal state
 * clears it, and `loadSnapshot` rebuilds it, so it holds nothing the records do
 * not. It differs from the records in one way worth stating rather than
 * glossing: it is **not** permanent. A prisoner released while a riot naming
 * them is still open stays in it until that riot resolves or lapses, which
 * `responseDeadlineTicks` bounds at 600 ticks past the riot's start. Dropping
 * them on release would be worse than keeping them, because it would make the
 * index disagree with the records it is derived from -- and the disagreement,
 * not the entry, is what a later reader would trip on.
 */
const HISTORICAL_FRAGMENTS = ['incidents.records', 'incidents.openRiotCountByParticipant'] as const;

function releaseRelevant(hits: readonly Hit[]): readonly Hit[] {
  return hits.filter((hit) => !HISTORICAL_FRAGMENTS.some((fragment) => hit.includes(fragment)));
}

/**
 * A prison with one furnished cell, and a prisoner in it who has been given
 * everything a prisoner in this codebase can hold.
 *
 * The gang membership and the labour-pool registration have no producer in
 * `src/` yet (`GangRegistry.addMember` is written only by `loadSnapshot`;
 * `JobWorkerPool.register` only by test scenarios), and they are set by hand
 * here for exactly that reason: a store with no producer today is still a store
 * a release has to drop, and it is the one most likely to be forgotten.
 */
function prisonWithOneFullyLoadedPrisoner(): {
  runtime: SimulationRuntime;
  entityId: number;
  cellId: string;
  /** The route this prisoner is walking when the fixture hands them over. Captured because it is the one thing the graph walk below cannot see -- see the last `describe` in this file. */
  pathRequestId: string;
} {
  const runtime = createNewSimulationRuntime(SEED);
  wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
  submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL }));
  for (const instance of runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')) {
    runtime.prisoners.roomInstances.updateDerived(instance.instanceId, {
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
      objectCapabilities: ['sleep-surface'],
    });
  }

  // Seven throwaway occupants of index 0, so the eighth is issued generation 7
  // and a distinctive id. `releasePrisoner` is used rather than
  // `entityStore.destroy` so the setup leaves the session clean; the target's
  // own release is what is under test, and no throwaway shares its id.
  for (let i = 0; i < 7; i += 1) {
    const throwaway = runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, ARRIVAL);
    expect(runtime.prisoners.releasePrisoner(throwaway)).toBe(true);
  }

  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, ...ARRIVAL }));
  const entityId = runtime.prisoners.entityStore.getIdByIndex(0);
  expect(entityId, 'the target id must be large enough not to collide with a counter').toBe((7 << 20) | 0);

  // Stepped to the exact tick at which this prisoner holds the most a prisoner
  // in this codebase can hold: housed, named, and part-way through a journey to
  // their cell with the route still unanswered. A fixed tick count would land
  // wherever it landed; this lands on the state the release has to unpick.
  let pathRequestId: string | undefined;
  for (let i = 0; i < 4_000 && pathRequestId === undefined; i += 1) {
    runtime.kernel.step();
    const pending = runtime.prisoners.coldState.getPathRequestId(entityId);
    if (pending !== undefined && runtime.navigation.getResult(pending) === undefined) pathRequestId = pending;
  }
  expect(pathRequestId, 'the fixture must catch the prisoner mid-journey, with a route nothing has answered yet').toBeDefined();

  const cellId = runtime.prisoners.coldState.getAccommodation(entityId);
  expect(cellId, 'the fixture is only meaningful if the prisoner was actually housed').toBeDefined();

  runtime.gangs.register({ id: 'gang.test', territorySectorIds: [] });
  runtime.gangs.addMember('gang.test', entityId);
  runtime.jobWorkers.register(entityId);
  runtime.incidents.open(
    { id: 'incident.1', type: 'riot', sectorId: 'sector.default', participantIds: [entityId], severity: 2, causeFactors: [] },
    runtime.kernel.tick,
  );

  return { runtime, entityId, cellId: cellId!, pathRequestId: pathRequestId! };
}

describe('what a released prisoner must be dropped from (ADR 0026 question 2)', () => {
  it('leaves no trace of a released prisoner anywhere in the session graph', () => {
    const { runtime, entityId } = prisonWithOneFullyLoadedPrisoner();

    const before = pathsMentioning(runtime, entityId);
    // The search has to find something, or "nothing afterwards" proves nothing
    // -- and it has to find each store *by structure*, so a container that
    // silently stopped holding the prisoner fails here rather than making the
    // release look complete. Six stores and six owners: the name registry, both
    // gang indexes, the cold state, the room registry and the labour pool.
    const holds = (fragment: string): number => before.filter((path) => path.includes(fragment)).length;
    expect({ paths: before, actorIdentity: holds('actorIdentity.byKind') }).toMatchObject({ actorIdentity: 1 });
    expect({ paths: before, gangIdByMember: holds('gangs.gangIdByMember') }).toMatchObject({ gangIdByMember: 1 });
    expect({ paths: before, memberIdsByGang: holds('gangs.memberIdsByGang') }).toMatchObject({ memberIdsByGang: 1 });
    expect({ paths: before, accommodation: holds('coldState.accommodationInstanceId') }).toMatchObject({ accommodation: 1 });
    expect({ paths: before, actionTarget: holds('coldState.currentActionTargetInstanceId') }).toMatchObject({ actionTarget: 1 });
    expect({ paths: before, pathRequest: holds('coldState.currentActionPathRequestId') }).toMatchObject({ pathRequest: 1 });
    expect({ paths: before, occupants: holds('roomInstances.occupants') }).toMatchObject({ occupants: 1 });
    expect({ paths: before, jobWorkers: holds('jobWorkers.workers') }).toMatchObject({ jobWorkers: 1 });
    expect({ paths: before, history: holds('incidents.records') }).toMatchObject({ history: 1 });
    // The derived index the riot regime reads, asserted by name for the reason
    // every other line here is: a container that silently stopped holding the
    // prisoner must fail here rather than make the release look complete.
    expect({ paths: before, riotIndex: holds('incidents.openRiotCountByParticipant') }).toMatchObject({ riotIndex: 1 });
    expect({ paths: before, releaseRelevant: releaseRelevant(before).length }).toMatchObject({ releaseRelevant: 8 });

    expect(runtime.prisoners.releasePrisoner(entityId)).toBe(true);

    const after = pathsMentioning(runtime, entityId);
    // A store added to the session and not to the release path names itself
    // here. Two things it can be: something new, or something this file's
    // author decided was history and a later author did not.
    expect(releaseRelevant(after)).toEqual([]);

    // The incident log keeps its record, deliberately. Asserted rather than
    // merely permitted, so deleting the participant list would also fail.
    expect(runtime.incidents.all()[0]?.participantIds).toEqual([entityId]);

    // The component bit, which the walk above cannot see: `ComponentBitset`
    // stores a `Uint32Array` of masks and the walk skips typed arrays, because
    // a mask holds a bit pattern rather than an `EntityId`.
    //
    // Reached past `private` deliberately. TypeScript's `private` is erased, so
    // `bitset` is an ordinary own property of the runtime at run time, and the
    // alternative is widening a public surface for one assertion. Without this,
    // dropping `bitset.clear(index)` from the release survives the entire suite:
    // `EntityQuery.execute` gates on `isIndexAlive` before it consults the
    // bitset, and `admitPrisoner` re-adds the bit anyway, so a stale bit is
    // unobservable through any behaviour today -- and would become a live
    // defect the first time a second component id exists or a query stops
    // asking about liveness first.
    const bitset = (runtime.prisoners as unknown as { readonly bitset: { readonly masks: readonly Uint32Array[] } }).bitset;
    expect(bitset.masks.map((mask) => mask[0])).toEqual(bitset.masks.map(() => 0));
  });

  it('answers false and changes nothing for an id that is not a living prisoner', () => {
    const { runtime, entityId } = prisonWithOneFullyLoadedPrisoner();
    expect(runtime.prisoners.releasePrisoner(entityId)).toBe(true);

    const settled = pathsMentioning(runtime, entityId);
    expect(runtime.prisoners.releasePrisoner(entityId), 'a second release must be a no-op, not a second teardown').toBe(false);
    expect(pathsMentioning(runtime, entityId)).toEqual(settled);
  });

  it('does not touch the prisoner who now occupies the released index', () => {
    const { runtime, entityId, cellId } = prisonWithOneFullyLoadedPrisoner();
    expect(runtime.prisoners.releasePrisoner(entityId)).toBe(true);

    const successor = runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, ARRIVAL);
    expect(runtime.prisoners.entityStore.getIndex(successor), 'the freed index must be the one reused').toBe(0);
    step(runtime, 600);

    // The successor got the bed back, and got it as their own rather than
    // inheriting the previous occupant's record.
    expect(runtime.prisoners.coldState.getAccommodation(successor)).toBe(cellId);
    expect(runtime.prisoners.roomInstances.occupantsOf(cellId)).toEqual([successor]);
    expect(runtime.actorIdentity.getName('prisoner', entityId)).toBeUndefined();
    expect(runtime.actorIdentity.getName('prisoner', successor)).toBeDefined();
    expect(runtime.gangs.getGangOf(successor)).toBeUndefined();

    // Releasing the *stale* id must not tear the successor down.
    expect(runtime.prisoners.releasePrisoner(entityId)).toBe(false);
    expect(runtime.prisoners.entityStore.isAlive(successor)).toBe(true);
    expect(runtime.prisoners.roomInstances.occupantsOf(cellId)).toEqual([successor]);
  });
});

/**
 * The one store the reflection walk above **cannot** see, and why it needs its
 * own test rather than a wider walk.
 *
 * `NavigationSystem` keys its request queue and its resolved-result map by a
 * *string* -- `prisoner.${entityId}.${sequence}` -- so a search for the number
 * 7,340,032 does not find it, and a search for the substring would find every
 * request id ever issued to that slot including ones already collected. The
 * queue is nonetheless a place a departing prisoner leaves something behind:
 * a request nobody will ever collect, and (once the pathfinder resolves it) a
 * `ResolvedPathRequest` in a `Map` with no remover.
 */
describe('a prisoner released while walking somewhere', () => {
  it('takes their pending path request with them', () => {
    const { runtime, entityId, pathRequestId } = prisonWithOneFullyLoadedPrisoner();

    const pendingBefore = runtime.navigation.pendingCount();
    expect(pendingBefore).toBeGreaterThan(0);

    expect(runtime.prisoners.releasePrisoner(entityId)).toBe(true);

    expect(runtime.navigation.pendingCount()).toBe(pendingBefore - 1);
    // And it is not merely off the queue: nothing can collect a result for it
    // afterwards either, so the result map cannot grow an entry with no owner.
    runtime.kernel.step();
    expect(runtime.navigation.getResult(pathRequestId)).toBeUndefined();
  });
});

/**
 * The concurrent-use claim (ADR 0029), which needs a prison with somewhere to
 * go: every action a cell-only prison can offer targets `own-accommodation`,
 * and `ActionSystem.claimUseIfNeeded` deliberately takes no claim for those, so
 * the fixture above never produces one.
 */
describe('a prisoner released while using a room', () => {
  it('gives the seat back', () => {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL }));
    const canteen = { x: 10, y: 10, width: 6, height: 6 } as const;
    wallRoomPerimeter(runtime.world, canteen, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...canteen }));

    for (const instance of runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')) {
      runtime.prisoners.roomInstances.updateDerived(instance.instanceId, { residentCapacity: 1, concurrentUseCapacity: 1, concurrentUseCapacityByCapability: [['sleep-surface', 1]], objectCapabilities: ['sleep-surface'] });
    }
    const [canteenInstance] = runtime.prisoners.roomInstances.allByRoomCatalogId('room.canteen');
    expect(canteenInstance).toBeDefined();
    runtime.prisoners.roomInstances.updateDerived(canteenInstance!.instanceId, { residentCapacity: 0, concurrentUseCapacity: 4, concurrentUseCapacityByCapability: [['dining', 4]], objectCapabilities: ['dining'] });

    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, ...ARRIVAL }));
    const entityId = runtime.prisoners.entityStore.getIdByIndex(0);

    // Step until this prisoner is the one holding a seat in the canteen. Named
    // on the claim rather than on a total, so a claim taken by somebody else
    // could not satisfy it -- there is nobody else, and the assertion says so
    // rather than relying on it.
    let claimed = false;
    for (let i = 0; i < 6_000 && !claimed; i += 1) {
      runtime.kernel.step();
      claimed = runtime.prisoners.roomInstances.claimCountOf(canteenInstance!.instanceId) === 1;
    }
    expect(claimed, 'the fixture must catch the prisoner eating for this test to mean anything').toBe(true);
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(1);

    expect(runtime.prisoners.releasePrisoner(entityId)).toBe(true);

    expect(runtime.prisoners.roomInstances.claimCountOf(canteenInstance!.instanceId)).toBe(0);
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(0);
    expect(pathsMentioning(runtime, entityId).filter((path) => path.includes('useClaims'))).toEqual([]);
  });
});
