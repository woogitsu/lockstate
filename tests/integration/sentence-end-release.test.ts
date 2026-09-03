import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { projectPrisonerDetail, projectPrisonerPopulationCounts, projectPrisonerRoster } from '../../src/simulation/presentation/prisoner-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, workerToMainMessageSchema, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
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
function twoCellPrison(seed: number = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
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

function admit(runtime: SimulationRuntime, id: string, sentenceLengthTicks = SENTENCE, priorIncidents = 0): number {
  submit(runtime, id, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks, priorIncidents, ...ARRIVAL }));
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

  /**
   * **And whatever they were concealing goes with them**
   * ([ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
   * decision 1).
   *
   * `ContrabandHolder.id` is a *string*, so this is the one store on
   * `PrisonerReleaseSurfaces` that `tests/unit/prisoner-release-completeness.test.ts`
   * cannot see: that gate walks the session's object graph for the numeric
   * `EntityId`, and `"prisoner:7340032"` is not that number. Left behind, the
   * item would sit concealed at a holder key naming a destroyed entity for the
   * rest of the session, and everything that totals what the prison is holding
   * would keep counting it.
   *
   * ## Why this sweeps seeds instead of admitting one prisoner
   *
   * Whether an arrival is carrying is a draw on `contraband.introduction`, and
   * the first version of this case admitted one prisoner and returned early
   * when the draw missed. It passed, and it **proved nothing** -- measured: the
   * early return was taken. That is issue #375's shape exactly, arrived at
   * while trying to avoid it.
   *
   * So the prison is built from a sweep of seeds until one produces a carrier,
   * and the sweep having found one is itself asserted. Nothing is hand-placed:
   * every seed builds the same prison through the same commands, and the item
   * is read out of the registry the intake path put it in.
   */
  it('takes the contraband they were concealing out of the prison with them', () => {
    let carrier: { runtime: SimulationRuntime; entityId: number; seedsTried: number } | undefined;
    for (let seed = SEED; seed < SEED + 12 && carrier === undefined; seed += 1) {
      const runtime = twoCellPrison(seed);
      // `priorIncidents: 2` against a sentence over the long threshold puts the
      // arrival in the top classification band, where the introduction chance is
      // highest -- the same lever a player pulls by agreeing to take somebody.
      const entityId = admit(runtime, 'admit-first', SENTENCE, 2);
      housedIn(runtime, entityId);
      if (runtime.contraband.byHolder('prisoner', String(entityId)).length > 0) {
        carrier = { runtime, entityId, seedsTried: seed - SEED + 1 };
      }
    }

    expect(carrier, 'no seed in the sweep admitted anybody carrying anything, so this case cannot run').toBeDefined();
    const { runtime, entityId } = carrier!;

    const carried = runtime.contraband.byHolder('prisoner', String(entityId));
    expect(carried.length).toBeGreaterThan(0);
    expect(carried.every((item) => item.state === 'concealed')).toBe(true);

    const endTick = runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(entityId)]!;
    stepTo(runtime, endTick + 20);

    expect(runtime.prisoners.entityStore.isAlive(entityId)).toBe(false);
    expect(runtime.contraband.byHolder('prisoner', String(entityId))).toEqual([]);
    for (const item of carried) {
      const after = runtime.contraband.get(item.id)!;
      expect(after.state).toBe('departed');
      // The record stays and stays traceable -- a departure is not a deletion.
      expect(after.provenance).toEqual(item.provenance);
    }
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

/**
 * Issue #506: the Regime panel's roster-empty sentence -- "Nobody has been
 * admitted yet" then, "No prisoners yet. Build a cell with a bed to take
 * somebody in." since the owner's ruling of 2026-09-03, and false of this
 * prison under either wording -- read `roster.total === 0` as its only
 * condition, so a
 * prison whose entire population served its sentence and left (exactly what
 * the test above produces; `ADMISSION_REQUEST` in `src/main.ts` used to make
 * that routine for a whole batch admitted together, ADR 0050 "What this does
 * not decide", and since #535 decision 5 sentences are drawn per prisoner so
 * a batch leaves over a spread rather than at once) triggered the same sentence
 * as a prison nobody had ever touched. `projectPrisonerRoster`'s
 * `everAdmitted` (`admittedCount > 0`, `prisoner-operations-runtime.ts`) is
 * the fact that tells the two apart.
 *
 * Driven through the real `AdmitPrisoner` command and the real
 * `PrisonerDischargeSystem` cadence -- not by constructing a roster reply
 * with `total: 0` by hand, which would prove only that a fixture and an
 * assertion agree (#375).
 */
describe('the roster projection tells "never admitted" from "fully discharged" (#506)', () => {
  it('reads `everAdmitted: false` before any admission and `true` once a real admission and a real discharge empty the roster again', () => {
    const runtime = twoCellPrison();

    // The state every new game starts in: nobody has been admitted, ever.
    expect(projectPrisonerRoster(runtime.prisoners, { limit: 50 })).toMatchObject({ total: 0, everAdmitted: false });

    const first = admit(runtime, 'admit-first', SENTENCE);
    const second = admit(runtime, 'admit-second', SENTENCE);
    housedIn(runtime, first);
    housedIn(runtime, second);
    expect(population(runtime)).toBe(2);

    const indexOf = (entityId: number): number => runtime.prisoners.entityStore.getIndex(entityId);
    const endTick = Math.max(
      runtime.prisoners.records.sentenceEndTick[indexOf(first)]!,
      runtime.prisoners.records.sentenceEndTick[indexOf(second)]!,
    );
    expect(endTick).toBeGreaterThan(0);

    stepTo(runtime, endTick + 20);

    expect(runtime.prisoners.entityStore.isAlive(first)).toBe(false);
    expect(runtime.prisoners.entityStore.isAlive(second)).toBe(false);
    expect(population(runtime)).toBe(0);

    // The false state issue #506 measured in live play: everybody who was
    // admitted has since left, and `total: 0` alone cannot say that -- only
    // `everAdmitted` can.
    expect(projectPrisonerRoster(runtime.prisoners, { limit: 50 })).toMatchObject({ total: 0, everAdmitted: true });
  });
});

describe('a sentence that ends says so (#507)', () => {
  /**
   * The question this asks is the player's, not the code's: **when a
   * prisoner's sentence ended, was I told?**
   *
   * It is deliberately not an assertion that `SimulationEventLog.count` moved.
   * That would pass for an implementation that recorded an event nothing could
   * ever publish, and "the count went up" is not what a player finds out. So
   * this walks the whole route a sentence takes to reach a screen -- real
   * session, real kernel, real discharge, the real `simulation/event` envelope
   * the worker posts, the real translator `src/main.ts` calls, and the real
   * bundled English catalog -- and asserts on the finished sentence.
   *
   * Before this change every step of that route existed except the first and
   * the last: `PrisonerDischargeSystem` released the prisoner and told nobody,
   * `simulation/event` had no producer, and `HudSeverity`'s `'info'` had no
   * assignment anywhere in `src/`. Measured in a played prison, the population
   * count went 1 -> 0 with nothing on screen.
   */
  it('tells the player, in words, that somebody has been released', () => {
    const runtime = twoCellPrison();
    const prisoner = admit(runtime, 'admit-for-notice');
    housedIn(runtime, prisoner);
    const endTick = runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(prisoner)]!;

    // Nothing has been said yet, and that is the state this test exists to see
    // change. Asserted before the discharge rather than after, so a channel
    // that announced a release on every tick could not pass.
    expect(runtime.events.since(0), 'a prison that has released nobody has nothing to say about a release').toEqual([]);

    stepTo(runtime, endTick + 20);
    expect(runtime.prisoners.entityStore.isAlive(prisoner), 'the sentence must actually have ended for this test to mean anything').toBe(false);
    expect(population(runtime), 'and the count the player sees must have fallen').toBe(0);

    // What the worker would post. Built through the protocol schema rather than
    // hand-shaped, so a payload the real boundary would reject cannot pass here.
    const recorded = runtime.events.since(0);
    expect(recorded.length, 'exactly one thing happened, so the prison says one thing').toBe(1);
    const message = workerToMainMessageSchema.parse({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: '00000000-0000-4000-8000-000000000507',
      kind: 'simulation/event',
      payload: { tick: runtime.kernel.tick, event: recorded[0]! },
    }) as WorkerToMainMessage;

    const notice = hudEventNoticeFromWorkerMessage(message);
    expect(notice, 'the band must be given something to say').not.toBe('none');
    expect(notice).toBeDefined();
    if (notice === undefined || notice === 'none') throw new Error('unreachable');

    // The severity is the point of issue #507. A discharge is not a warning:
    // nothing went wrong, and until this change `'info'` was a member of
    // `HudSeverity` that nothing in `src/` ever assigned.
    expect(notice.severity, 'a served sentence is good news, and the channel must be able to say so').toBe('info');

    // And the finished sentence, resolved against the catalog that actually
    // ships. A message key is just a string: a typo type-checks, passes every
    // schema, and reaches a player as its own dotted self.
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentence = localizer.format(notice.labelKey, notice.labelParameters);
    expect(sentence, 'the player must not be shown a raw message key').not.toContain('hud.alert.event');
    expect(sentence, 'and the sentence must name how many people left').toContain('1');
    expect(sentence.length, 'an empty band is the defect this closes, not the fix').toBeGreaterThan(0);

    // The log, beside the notice. Both surfaces, because the band is what the
    // player is told and the list is what they can look back at.
    const rows = hudEventAlertsFromWorkerMessage(message, []);
    expect(rows?.map((row) => row.severity)).toEqual(['info']);
    expect(localizer.format(rows![0]!.labelKey, rows![0]!.labelParameters)).toBe(sentence);
  });

  /**
   * The aggregation rule, against a real cohort.
   *
   * `ADMISSION_REQUEST` in `src/main.ts` asks for the same
   * `sentenceLengthTicks` every time, which ADR 0050 flagged, so prisoners
   * admitted together leave together -- the ordinary case rather than a corner
   * one. A row per prisoner would put a burst of identical sentences on the
   * channel exactly when the prison is busiest.
   *
   * The fixture does not supply the thing it measures: both prisoners are
   * admitted through the real `AdmitPrisoner` command and the tick they leave
   * on is the kernel's, not this test's.
   */
  it('says it once for a cohort that leaves together, and says how many', () => {
    const runtime = twoCellPrison();
    const first = admit(runtime, 'cohort-first');
    const second = admit(runtime, 'cohort-second');
    housedIn(runtime, first);
    housedIn(runtime, second);
    const endTick = Math.max(
      runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(first)]!,
      runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(second)]!,
    );

    stepTo(runtime, endTick + 20);
    expect(population(runtime), 'both sentences must have ended for this test to mean anything').toBe(0);

    const recorded = runtime.events.since(0);
    expect(recorded.length, 'two prisoners leaving on one tick is one occurrence, not two').toBe(1);
    expect(recorded[0]).toMatchObject({ type: 'prisoners.discharged', count: 2 });

    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const message = workerToMainMessageSchema.parse({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: '00000000-0000-4000-8000-000000000508',
      kind: 'simulation/event',
      payload: { tick: runtime.kernel.tick, event: recorded[0]! },
    }) as WorkerToMainMessage;
    const notice = hudEventNoticeFromWorkerMessage(message);
    if (notice === undefined || notice === 'none') throw new Error('the band must be given something to say');
    // The number the player reads is the cohort's size, not "1" repeated.
    expect(localizer.format(notice.labelKey, notice.labelParameters)).toContain('2');
  });

  /**
   * A restored prison gets its log back, and still announces nothing.
   *
   * **This test asserted the opposite until the owner's decision of 2026-09-01
   * on [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)**
   * -- the log survives a reload -- and the sentence it was written for is kept
   * rather than deleted, because half of it is still exactly what is asserted
   * below:
   *
   * > A restored prison does not re-announce a release the player has already
   * > read.
   * >
   * > This is the persistence decision, asserted rather than described: the
   * > event log is not snapshotted, so a save carries no event history and a
   * > load announces nothing. The *conditions* behind events do persist --
   * > arrears are in the save (ADR 0049) -- which is what makes this a
   * > formatting decision the save never has to see rather than a fact the
   * > player loses.
   *
   * What the owner changed is the *first* clause: the save does carry the log
   * now, because the log is the surface a player scrolls back through and they
   * asked to keep it. What is unchanged is the second: a load still announces
   * nothing, because the record is replayed with `restored: true` and the
   * events band ignores those. Both halves are asserted here, which is the
   * whole reason this test is re-pinned rather than replaced -- the property it
   * was protecting is the one that could have been lost by accident.
   */
  it('gets a release back across a save without re-announcing it', () => {
    const runtime = twoCellPrison();
    const prisoner = admit(runtime, 'admit-before-save');
    housedIn(runtime, prisoner);
    const endTick = runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(prisoner)]!;
    stepTo(runtime, endTick + 20);
    const announced = runtime.events.since(0);
    expect(announced.length, 'the release must have been announced before the save').toBe(1);

    const restored = saveAndLoad(runtime);
    const carried = restored.events.since(0);
    expect(carried, 'the log the player was reading comes back exactly as it was').toEqual(announced);

    // And the band is still silent about it. The worker marks a replayed
    // record on the wire (`SimulationWorkerStateMachine` sets `restored` from
    // the log's count at restore, pinned end to end in
    // `tests/contract/worker-snapshot-roundtrip.test.ts`); this is the other
    // half of that contract, read by the translator the HUD actually uses.
    const replay = workerToMainMessageSchema.parse({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: '00000000-0000-4000-8000-000000000084',
      kind: 'simulation/event',
      payload: { tick: restored.kernel.tick, event: carried[0]!, restored: true },
    }) as WorkerToMainMessage;
    expect(
      hudEventNoticeFromWorkerMessage(replay),
      'a loaded prison must not announce a release that happened before the save -- the player has already read it, and the tick it names is not the one they are looking at',
    ).toBeUndefined();
    // The log, though, is rebuilt: that is the decision.
    expect(hudEventAlertsFromWorkerMessage(replay, [])?.map((row) => row.labelKey)).toEqual([
      'hud.alert.event.prisoners.discharged',
    ]);
  });
});
