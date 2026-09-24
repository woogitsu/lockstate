import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { pathsMentioning, type Hit } from '../helpers/entity-graph-walk';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What mechanism keeps the dismissal list complete?**
 *
 * The same question [ADR 0026](../../docs/adr/0026-entity-id-lifetime.md)
 * question 2 asks about release, asked about the staff roster's first departure
 * path (issue #533). `tests/unit/prisoner-release-completeness.test.ts` answers
 * it for prisoners and states why a type cannot: *"a store added to the session
 * and never added to that type is exactly what a type cannot see."*
 * `StaffDismissalSurfaces` has the same limitation and this is the same answer,
 * pointed at the other `EntityStore`.
 *
 * It does not read `src/simulation/staff/dismissal.ts` at all. It walks the
 * **real session's object graph**, finds every container in it that mentions
 * one living staff member's `EntityId`, dismisses them, and requires that
 * nothing mentions them afterwards. A store added to the session and forgotten
 * in the dismissal path fails here by naming its own path.
 *
 * ## Why the target's id is forced to a large number
 *
 * A fresh roster hands out `EntityId` 0, then 1 -- and a walk looking for the
 * number 0 in a session's object graph finds every zeroed counter, every empty
 * tally and every tick stamp in it. The setup below recycles index 0 seven
 * times first, so the staff member under test is issued generation 7 at index 0:
 * `(7 << 20) | 0`, or 7,340,032. The prisoner gate uses the same number for the
 * same reason, and the two do not collide because staff and prisoners are
 * separate stores -- which is itself the reason `ActorIdentityRegistry` is keyed
 * by `(kind, entityId)` and not by id alone.
 *
 * **The recycling is only possible because of the change under test.** Before
 * it, no staff index had ever been freed, so this fixture could not have been
 * written.
 *
 * ## What this gate structurally cannot see, stated rather than implied
 *
 * Three stores key staff by the **stringified** id and are therefore invisible
 * to a walk looking for a number: `ContrabandRegistry` (`ContrabandHolder.id`),
 * `InformantRegistry` and `IntelligenceLedger`. `release.ts` records the same
 * hole for prisoners in as many words. The last `describe` in this file covers
 * contraband by name, and reports the finding about the other two rather than
 * hiding it: **neither has a producer anywhere in `src/`** -- `recruit` and
 * `report` are called only from tests -- so no session can leak into them
 * today, and neither `releasePrisoner` nor `dismissStaff` clears them. That is
 * a real gap for whichever change gives them a producer first, and it is a gap
 * that predates this one.
 */

const SEED = 0x533c;
const ORIGIN = { x: 16, y: 16 } as const;
const CELL = { x: 4, y: 6, width: 2, height: 3 } as const;
const GUARD = 'staff-role.guard';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * The one family of hit a dismissal must **not** clear, stated as a rule rather
 * than as a list of paths, exactly as the prisoner gate states it.
 *
 * `IncidentLog` is a record of what happened. A riot that guard 7,340,032
 * responded to happened, and it goes on having happened after they are sacked;
 * rewriting the record on their departure would falsify the log. That retention
 * is safe because the log is only ever read by id and a recycled index gets a
 * new generation -- and since ADR 0026 question 1's answer (#169) a slot dying
 * at its last generation is retired rather than recycled, so an old id can
 * never start matching a later occupant at any recycle count.
 */
const HISTORICAL_FRAGMENTS = ['incidents.records', 'incidents.openRiotCountByParticipant'] as const;

function dismissalRelevant(hits: readonly Hit[]): readonly Hit[] {
  return hits.filter((hit) => !HISTORICAL_FRAGMENTS.some((fragment) => hit.includes(fragment)));
}

/**
 * A prison with one occupant and one guard who has been given everything a
 * staff member in this codebase can hold: a name, a deployment claim with a
 * sector and a post, an unresolved navigation request, a piece of contraband and
 * a place in an incident record.
 */
function prisonWithOneFullyLoadedGuard(): { runtime: SimulationRuntime; entityId: number } {
  const runtime = createNewSimulationRuntime(SEED);
  wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
  submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL }));
  const cell = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')[0]!;
  runtime.prisoners.roomInstances.updateDerived(cell.instanceId, {
    residentCapacity: 1, concurrentUseCapacity: 1,
    concurrentUseCapacityByCapability: [['sleep-surface', 1]], objectCapabilities: ['sleep-surface'],
  });
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, ...ORIGIN }));
  expect(runtime.refusals.count, 'the occupant this fixture needs must actually be admitted').toBe(0);

  // Seven throwaway occupants of index 0, so the eighth is issued generation 7
  // and a distinctive id. Dismissed through the real service rather than
  // `entityStore.destroy`, so the setup leaves the session clean -- the target's
  // own dismissal is what is under test.
  for (let i = 0; i < 7; i += 1) {
    const throwaway = runtime.securityGuards.hire(GUARD, { x: tileCoordinate(ORIGIN.x), y: tileCoordinate(ORIGIN.y) });
    expect(runtime.staffDismissal.dismiss(throwaway).kind).toBe('dismissed');
  }

  // Hired far from the post, so `DeploymentSystem` files a real route request
  // and the guard is caught mid-journey with it unanswered -- the state a
  // dismissal has to unpick rather than the state it is easy to test.
  submit(runtime, 'hire', packCommand({ type: 'HireStaff', staffRoleId: GUARD, x: 0, y: 0 }));
  const entityId = runtime.securityGuards.entityStore.getIdByIndex(0);
  expect(entityId, 'the target id must be large enough not to collide with a counter').toBe((7 << 20) | 0);

  let travelling = false;
  for (let i = 0; i < 4_000 && !travelling; i += 1) {
    runtime.kernel.step();
    const pending = runtime.securityGuards.getPathRequestId(entityId);
    travelling = pending !== undefined && runtime.navigation.getResult(pending) === undefined;
  }
  expect(travelling, 'the fixture must catch the guard mid-journey, with a route nothing has answered yet').toBe(true);

  runtime.contraband.introduce(
    'item-staff-1',
    'contraband.phone',
    { kind: 'staff', id: String(entityId) },
    { sourceType: 'staff', sourceId: 'gate', introducedAtTick: runtime.kernel.tick },
  );
  runtime.incidents.open(
    { id: 'incident.1', type: 'riot', sectorId: 'security-sector.prison', participantIds: [entityId], severity: 2, causeFactors: [] },
    runtime.kernel.tick,
  );

  return { runtime, entityId };
}

describe('what a dismissed staff member must be dropped from', () => {
  it('leaves no trace of a dismissed staff member anywhere in the session graph', () => {
    const { runtime, entityId } = prisonWithOneFullyLoadedGuard();

    const before = pathsMentioning(runtime, entityId);
    // The search has to find something, or "nothing afterwards" proves nothing
    // -- and it has to find each store *by structure*, so a container that
    // silently stopped holding the guard fails here rather than making the
    // dismissal look complete.
    const holds = (fragment: string): number => before.filter((path) => path.includes(fragment)).length;
    expect({ paths: before, actorIdentity: holds('actorIdentity.byKind') }).toMatchObject({ actorIdentity: 1 });
    // `.deploymentSystem.guards.records`, not `.securityGuards.records`: the
    // walk sorts keys and reports the *first* route to a shared object, and
    // `deploymentSystem` sorts before `securityGuards`. That is a property of
    // the graph rather than of construction order, which is what makes it worth
    // pinning by name.
    expect({ paths: before, roster: holds('guards.records') }).toMatchObject({ roster: 1 });
    expect({ paths: before, history: holds('incidents.records') }).toMatchObject({ history: 1 });
    expect({ paths: before, dismissalRelevant: dismissalRelevant(before).length }).toMatchObject({ dismissalRelevant: 2 });

    expect(runtime.staffDismissal.dismiss(entityId, runtime.kernel.tick).kind).toBe('dismissed');

    const after = pathsMentioning(runtime, entityId);
    // A store added to the session and not to the dismissal path names itself
    // here. Two things it can be: something new, or something this file's author
    // decided was history and a later author did not.
    expect(dismissalRelevant(after)).toEqual([]);

    // The incident log keeps its record, deliberately -- see HISTORICAL_FRAGMENTS.
    expect(after.filter((path) => path.includes('incidents.records'))).toHaveLength(1);
  });

  it('cancels the route the walk cannot see, because a navigation request is keyed by a string', () => {
    const { runtime, entityId } = prisonWithOneFullyLoadedGuard();
    const requestId = runtime.securityGuards.getPathRequestId(entityId);
    expect(requestId).toBeDefined();

    // The one leak the gate above is structurally blind to on the *deployment*
    // side: `security.deploy.<id>.<n>` is a string, so a request left queued
    // would not appear in any numeric hit. Before this change
    // `NavigationSystem.cancelRequest` had exactly one caller in all of `src/`
    // and it was the prisoner release path, so no guard's route had ever been
    // cancelled by anything at all.
    expect(runtime.staffDismissal.dismiss(entityId, runtime.kernel.tick).kind).toBe('dismissed');
    expect(runtime.navigation.cancelRequest(requestId!)).toBe(false);
    expect(runtime.navigation.getResult(requestId!)).toBeUndefined();
  });

  it('takes a dismissed staff member`s contraband with them, which is the other string-keyed store', () => {
    const { runtime, entityId } = prisonWithOneFullyLoadedGuard();
    expect(runtime.contraband.byHolder('staff', String(entityId))).toHaveLength(1);

    expect(runtime.staffDismissal.dismiss(entityId, runtime.kernel.tick).kind).toBe('dismissed');

    expect(runtime.contraband.byHolder('staff', String(entityId))).toHaveLength(0);
  });
});
