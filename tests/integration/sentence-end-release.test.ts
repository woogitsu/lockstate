import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { projectPrisonerDetail, projectPrisonerPopulationCounts, projectPrisonerRoster } from '../../src/simulation/presentation/prisoner-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { carriedScopeState, hashFullRuntime, toJsonValue } from '../helpers/determinism-state';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #441, end to end: **a prisoner whose sentence has ended leaves the
 * prison, and the bed they were in houses somebody else.**
 *
 * Everything here goes through the real kernel, the real `ZoneRoom` and
 * `AdmitPrisoner` commands and the real save envelope, in the shape
 * `prisoner-admission-loop.test.ts` established -- because the claim being
 * made is about a prison a player can build, not about a system in isolation.
 * `tests/unit/prisoners-discharge-system.test.ts` covers the comparison and its
 * guards; `tests/unit/prisoner-release-completeness.test.ts` covers what the
 * departure drops.
 *
 * Every assertion below names a prisoner and a room instance. Issue #441 asks
 * for that in as many words -- *"asserted on **that named prisoner's** absence
 * and on their bed being re-allocatable, not on a population count"* -- and the
 * population count is checked as well, because it is the number the player
 * actually sees.
 */

const SEED = 441;
const PRISON_ID = 'sentence-end-prison';
const ARRIVAL = { x: 16, y: 16 };
const SENTENCE = 3_000;

/** Two cells, so "the freed bed was reused" cannot be satisfied by the prison only ever having had one place. */
const CELLS = [
  { x: 4, y: 6, width: 2, height: 3 },
  { x: 8, y: 6, width: 2, height: 3 },
] as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * A prison with two furnished cells.
 *
 * `updateDerived` rather than a `PlaceObject` order, because what makes a cell
 * habitable is ADR 0028's derived capacity and this file's subject is what
 * happens at the *other* end of a sentence. `object-placement-loop.test.ts`
 * drives the long way round.
 */
function twoCellPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  CELLS.forEach((rectangle, index) => {
    wallRoomPerimeter(runtime.world, rectangle, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${index}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rectangle }));
  });
  const instances = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell');
  expect(instances.length, 'both cells must have been zoned for this fixture to mean anything').toBe(2);
  for (const instance of instances) {
    runtime.prisoners.roomInstances.updateDerived(instance.instanceId, {
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
      objectCapabilities: ['sleep-surface'],
    });
  }
  return runtime;
}

function admit(runtime: SimulationRuntime, id: string, sentenceLengthTicks = SENTENCE): number {
  submit(runtime, id, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks, priorIncidents: 0, ...ARRIVAL }));
  const entityId = runtime.prisoners.entityStore.getIdByIndex(runtime.prisoners.entityStore.maxActiveIndex);
  expect(runtime.prisoners.entityStore.isAlive(entityId)).toBe(true);
  return entityId;
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Steps until the named prisoner holds a cell, and answers which one. */
function housedIn(runtime: SimulationRuntime, entityId: number): string {
  for (let i = 0; i < 400; i += 1) {
    const instanceId = runtime.prisoners.coldState.getAccommodation(entityId);
    if (instanceId !== undefined) return instanceId;
    runtime.kernel.step();
  }
  throw new Error(`prisoner ${entityId} was never housed, so this test proves nothing`);
}

function population(runtime: SimulationRuntime): number {
  return projectPrisonerPopulationCounts(runtime.prisoners).total;
}

function saveAndLoad(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });

  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded, 'a prison that has released somebody must still be a legal save').toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
}

describe('a sentence that ends (#441)', () => {
  it('takes the named prisoner out of the prison and gives their bed to the next arrival', () => {
    const runtime = twoCellPrison();
    const first = admit(runtime, 'admit-first');
    const firstCell = housedIn(runtime, first);
    const name = runtime.actorIdentity.getName('prisoner', first);
    expect(name, 'a housed prisoner has been through reception and has a name').toBeDefined();

    const endTick = runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(first)]!;
    expect(endTick).toBeGreaterThan(0);
    expect(runtime.prisoners.roomInstances.occupantsOf(firstCell)).toEqual([first]);
    expect(projectPrisonerDetail(runtime.prisoners, first)?.sentence.endTick).toBe(endTick);

    stepTo(runtime, endTick + 20);

    // Named, not counted: this prisoner is gone, their cell is empty, their
    // name has been given back, and the HUD can no longer project them.
    expect(runtime.prisoners.entityStore.isAlive(first)).toBe(false);
    expect(runtime.prisoners.roomInstances.occupantsOf(firstCell)).toEqual([]);
    expect(runtime.prisoners.roomInstances.occupancyOf(firstCell)).toBe(0);
    expect(runtime.prisoners.coldState.getAccommodation(first)).toBeUndefined();
    expect(runtime.actorIdentity.getName('prisoner', first)).toBeUndefined();
    expect(projectPrisonerDetail(runtime.prisoners, first)).toBeUndefined();
    expect(projectPrisonerRoster(runtime.prisoners, { limit: 50 }).rows.map((row) => row.entityId)).not.toContain(first);
    expect(population(runtime)).toBe(0);

    // And the bed is genuinely re-allocatable, which is the half a population
    // count cannot show: a later arrival is housed in that same instance.
    const second = admit(runtime, 'admit-second');
    expect(second).not.toBe(first);
    expect(housedIn(runtime, second)).toBe(firstCell);
    expect(runtime.prisoners.roomInstances.occupantsOf(firstCell)).toEqual([second]);
    expect(population(runtime)).toBe(1);
  });

  it('recycles the freed entity index without the new occupant inheriting anything', () => {
    const runtime = twoCellPrison();
    const first = admit(runtime, 'admit-first');
    const firstIndex = runtime.prisoners.entityStore.getIndex(first);
    housedIn(runtime, first);
    const endTick = runtime.prisoners.records.sentenceEndTick[firstIndex]!;
    stepTo(runtime, endTick + 20);

    const second = admit(runtime, 'admit-second');
    // The whole point of ADR 0026's framing: the index comes back, the id does
    // not. `EntityStore.destroy` bumps the generation, so a handle to the
    // departed prisoner still names nobody.
    expect(runtime.prisoners.entityStore.getIndex(second)).toBe(firstIndex);
    expect(second).not.toBe(first);
    expect(runtime.prisoners.entityStore.isAlive(first)).toBe(false);
    expect(runtime.prisoners.entityStore.isAlive(second)).toBe(true);

    housedIn(runtime, second);
    const detail = projectPrisonerDetail(runtime.prisoners, second)!;
    expect(detail.entityId).toBe(second);
    // A recycled slot's sentence is this prisoner's, not the last occupant's.
    expect(detail.sentence.endTick).toBeGreaterThan(endTick);
  });

  it('survives a save taken after the release, with no schema change', () => {
    const runtime = twoCellPrison();
    const first = admit(runtime, 'admit-first');
    const firstCell = housedIn(runtime, first);
    const endTick = runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(first)]!;
    stepTo(runtime, endTick + 20);
    expect(runtime.prisoners.entityStore.isAlive(first)).toBe(false);

    // `SAVE_SCHEMA_VERSION` is untouched by this change and `decodeSaveEnvelope`
    // reports `migrated: false` above, so the claim "release costs no save
    // format" is measured here rather than asserted in a document.
    const restored = saveAndLoad(runtime);

    expect(restored.prisoners.entityStore.isAlive(first)).toBe(false);
    expect(restored.prisoners.roomInstances.occupantsOf(firstCell)).toEqual([]);
    expect(restored.actorIdentity.getName('prisoner', first)).toBeUndefined();
    expect(population(restored)).toBe(0);

    // The freed index is free on the far side too: a restored session hands it
    // back rather than growing the store, which is what proves the free list
    // and the generation counters crossed the save intact.
    const afterRestore = restored.prisoners.admitPrisoner({ sentenceLengthTicks: SENTENCE, priorIncidents: 0 }, ARRIVAL);
    expect(restored.prisoners.entityStore.getIndex(afterRestore)).toBe(runtime.prisoners.entityStore.getIndex(first));
    expect(afterRestore).not.toBe(first);
  });

  it('produces the same state on both sides of a save taken across the release', () => {
    const build = (): SimulationRuntime => {
      const runtime = twoCellPrison();
      admit(runtime, 'admit-first');
      housedIn(runtime, runtime.prisoners.entityStore.getIdByIndex(0));
      return runtime;
    };

    const continuous = build();
    const endTick = continuous.prisoners.records.sentenceEndTick[0]!;
    // Saved *before* the release and stepped past it on the restored side, so
    // the release itself happens on both arms and has to agree.
    const mirrored = saveAndLoad(build());
    expect(mirrored.kernel.tick).toBe(continuous.kernel.tick);

    stepTo(continuous, endTick + 200);
    stepTo(mirrored, endTick + 200);

    expect(continuous.prisoners.entityStore.isAlive(continuous.prisoners.entityStore.getIdByIndex(0))).toBe(false);
    // `carriedScopeState`, which is what a save actually carries, and the
    // comparator `snapshot-restore-fidelity.test.ts` already uses for exactly
    // this boundary. `hashFullRuntime` additionally folds in unpersisted
    // counters -- `IntakeMetrics.accommodationBacklogTicks`, the navigation
    // cache metrics -- which a restored session restarts at zero by design, so
    // it is the wrong instrument here and would fail on a run with no release
    // in it at all.
    expect(carriedScopeState(mirrored)).toEqual(carriedScopeState(continuous));
    // And the persisted prisoner state itself, which `carriedScopeState` does
    // not reach: the component arrays, the cold state and the room occupancy
    // that a release rewrites.
    expect(toJsonValue(mirrored.prisoners.getSnapshot())).toEqual(toJsonValue(continuous.prisoners.getSnapshot()));
  });

  it('is deterministic: two sessions from one seed release the same prisoners at the same ticks', () => {
    const run = (): { hash: string; log: string[] } => {
      const runtime = twoCellPrison();
      const log: string[] = [];
      let admissions = 0;
      let previous = 0;
      for (let tick = 0; tick < 30_000; tick += 1) {
        if (tick % 1_200 === 0) {
          admit(runtime, `admit-${admissions}`, SENTENCE);
          admissions += 1;
          continue;
        }
        runtime.kernel.step();
        const live = population(runtime);
        if (live !== previous) {
          log.push(`${runtime.kernel.tick}:${live}`);
          previous = live;
        }
      }
      return { hash: hashFullRuntime(runtime), log };
    };

    const left = run();
    const right = run();
    expect(left.log).toEqual(right.log);
    expect(left.hash).toBe(right.hash);

    // The population must actually have gone *down* somewhere in that log, or
    // two identical monotonic runs would satisfy the comparison above.
    const levels = left.log.map((entry) => Number(entry.split(':')[1]));
    expect(levels.some((level, index) => index > 0 && level < levels[index - 1]!), `population log: ${left.log.join(' ')}`).toBe(true);
  });
});
