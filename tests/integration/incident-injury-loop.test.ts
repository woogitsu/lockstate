import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { INFIRMARY_TREATMENT_ACTION_ID } from '../../src/simulation/prisoners/injury';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Does an incident actually leave somebody injured, does the infirmary
 * actually take them, does the flag actually clear, and does all of it survive
 * a reload?** (Issue #589, the owner's ruling of 2026-09-17.)
 *
 * Every figure below was read off a real run of this exact fixture and written
 * out, never computed from the code under test -- the discipline
 * `tests/integration/assault-sanction-loop.test.ts` and
 * `tests/integration/incident-trigger-reachability.test.ts` already use. No
 * incident is hand-placed and no flag is set by hand: every injury below
 * arises from real `AdmitPrisoner`/`ZoneRoom`/`PlaceObject` commands run
 * through the real kernel for real ticks, and every clearing is a real course
 * of `action.infirmary-treatment` performed on a real medical bed.
 *
 * ## The fixture, and the one thing it deliberately does not have
 *
 * Eight walled cells with a bed apiece, one walled `room.infirmary` with a
 * `object.medical-bed` and a `object.medicine-cabinet`, eight prisoners --
 * and **no guards at all**. That is what makes it produce the thing under
 * test: `IncidentResponseSystem.lapse` is the only transition that writes a
 * non-empty `injuredEntityIds`, a prison with nobody to dispatch lapses
 * everything, and `docs/research/2026-09-04-does-anyone-answer-an-incident.md`
 * measured exactly that shape (19 of 19 lapsed, 114 prisoner-injuries) before
 * any of this existed.
 */

const SEED = 0x5a17;
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
/** Clear of the cell row, and at `room.infirmary`'s authored 4x4 minimum. */
const INFIRMARY = { x: 1, y: 10, width: 4, height: 4 } as const;

const TREATMENT_ACTION_INDEX = DEFAULT_ACTIONS.findIndex((action) => action.id === INFIRMARY_TREATMENT_ACTION_ID);

function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** The one instance this fixture's infirmary registers -- `room.<catalogId>:<anchorX>:<anchorY>`, read off a real run. */
const INFIRMARY_INSTANCE_ID = 'room.infirmary:1:10';

/**
 * `cabinet: false` leaves the infirmary holding only its bed -- the slower of
 * `treatmentTicksFor`'s two branches, which is reachable because
 * `findAvailableForUse` gates on the capability and the ceiling and never on
 * whether a room's authored requirements are satisfied. `infirmary: false`
 * leaves it out entirely, which is the prison the promotion must not fire in.
 */
function buildPrison(options: { readonly cabinet?: boolean; readonly infirmary?: boolean } = {}): SimulationRuntime {
  const cabinet = options.cabinet ?? true;
  const infirmary = options.infirmary ?? true;
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: 8 }, (_unused, index) => cellRect(index));

  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: cells.length + 2 }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  if (infirmary) wallRoomPerimeter(runtime.world, INFIRMARY, { doors: runtime.navigation.doors });

  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  if (infirmary) submit(runtime, 'zone-infirmary', packCommand({ type: 'ZoneRoom', roomId: 'room.infirmary', ...INFIRMARY }));

  cells.forEach((rect, index) => {
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
  });
  if (infirmary) submit(runtime, 'medical-bed', packCommand({ type: 'PlaceObject', orderId: 'medical-bed', definitionId: 'medical-bed-wooden', x: INFIRMARY.x, y: INFIRMARY.y }));
  if (infirmary && cabinet) {
    submit(runtime, 'cabinet', packCommand({ type: 'PlaceObject', orderId: 'cabinet', definitionId: 'medicine-cabinet-wooden', x: INFIRMARY.x + 2, y: INFIRMARY.y }));
  }

  stepTo(runtime, 1_000);
  for (let index = 0; index < 8; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  // A refused command would make every figure below a measurement of a
  // different prison, so it is checked rather than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

function injuredIndices(runtime: SimulationRuntime): readonly number[] {
  return [...runtime.prisoners.records.injured].flatMap((value, index) => (value === 1 ? [index] : []));
}

/** Runs the real kernel until at least one prisoner carries the flag, or gives up. */
function stepUntilSomebodyIsInjured(runtime: SimulationRuntime, maxTick: number): number {
  while (runtime.kernel.tick < maxTick) {
    runtime.kernel.step();
    if (injuredIndices(runtime).length > 0) return runtime.kernel.tick;
  }
  throw new Error(`Nobody was injured by tick ${String(maxTick)} -- the fixture stopped producing what this file measures.`);
}

/** Runs until `index` is performing or travelling for `action.infirmary-treatment`, and answers the tick. */
function stepUntilTreatmentSelected(runtime: SimulationRuntime, index: number, maxTick: number): number {
  while (runtime.kernel.tick < maxTick) {
    runtime.kernel.step();
    if (runtime.prisoners.currentAction.actionIndex[index] === TREATMENT_ACTION_INDEX) return runtime.kernel.tick;
  }
  throw new Error(`Prisoner at index ${String(index)} never chose treatment by tick ${String(maxTick)}.`);
}

function stepUntilClear(runtime: SimulationRuntime, index: number, maxTick: number): number {
  while (runtime.kernel.tick < maxTick) {
    runtime.kernel.step();
    if (runtime.prisoners.records.injured[index] === 0) return runtime.kernel.tick;
  }
  throw new Error(`Prisoner at index ${String(index)} was still injured at tick ${String(maxTick)}.`);
}

describe('an incident injures somebody, the infirmary treats them, and the flag clears', () => {
  it('sets the flag from the lapse, walks them to a medical bed, and clears it when the course completes', () => {
    const runtime = buildPrison();

    /*
     * Measured, on this exact fixture: `incident.assault.1` opens at tick
     * **1,800**, nobody is dispatched because nobody was hired, and it
     * **lapses at 2,410** naming participants **[2, 7]**. The flag is on both
     * of them on the very next tick the response system runs -- 2,411 -- not
     * on `ActionSystem`'s next cycle: `markInjured` is called straight out of
     * `lapse`, exactly as `imposeSolitarySanction` is.
     */
    const injuredAtTick = stepUntilSomebodyIsInjured(runtime, 80_000);
    expect(injuredAtTick).toBe(2_411);

    const lapsed = runtime.incidents.all().filter((incident) => incident.state === 'lapsed');
    expect(lapsed.length, 'the flag must come from a lapsed incident, not from nowhere').toBe(1);
    const first = lapsed[0]!;
    expect(first.type).toBe('assault');
    expect(first.startedAtTick).toBe(1_800);
    expect(first.timeline.at(-1)).toEqual({ state: 'lapsed', atTick: 2_410 });
    expect(first.outcome!.injuredEntityIds).toEqual([2, 7]);

    // Exactly the ids the record names, and nobody else: the port walks
    // `outcome.injuredEntityIds` and writes that list and no other.
    expect(injuredIndices(runtime)).toEqual([2, 7]);
    expect(runtime.prisoners.isInjured(2)).toBe(true);
    expect(runtime.prisoners.isInjured(7)).toBe(true);

    /*
     * The prisoner really goes. An `actionIndex` equal to the treatment
     * entry's position means `beginNextAction` chose it, `resolveTargetInstance`
     * answered a real `room.infirmary` instance and `claimUseIfNeeded` took its
     * `medical-treatment` claim -- measured at tick **4,201**, which is the
     * first `hygiene` block of the next day after the injury (the flag is set
     * during a `work` block, and `action.infirmary-treatment` is category
     * `hygiene`, so the promotion waits for a block that allows it).
     */
    const selectedAtTick = stepUntilTreatmentSelected(runtime, 2, injuredAtTick + 6_000);
    expect(selectedAtTick).toBe(4_201);
    const targetInstanceId = runtime.prisoners.coldState.getActionTarget(2)!;
    expect(runtime.prisoners.roomInstances.getById(targetInstanceId)!.roomCatalogId).toBe('room.infirmary');

    /*
     * And it clears. **5,501**, which is 1,300 ticks after the action was
     * chosen: the 1,200-tick course a stocked infirmary gives (2,400 halved by
     * the `medical-supply` cabinet) plus the walk from the cell row and the
     * 20-tick reconsideration granularity every action already has.
     */
    const clearedAtTick = stepUntilClear(runtime, 2, selectedAtTick + 6_000);
    expect(clearedAtTick).toBe(5_501);
    expect(runtime.prisoners.isInjured(2)).toBe(false);

    /*
     * **And prisoner 7 is still injured, which is the mechanic rather than a
     * gap.** `room.infirmary` at its authored minimum requires one
     * `object.medical-bed`, whose `footprint.width` is 1, so the derived
     * `medical-treatment` ceiling is **1** and the room treats one prisoner at
     * a time. A prison that riots faster than it can buy beds has a queue,
     * which is the cost #589's own sources state hardest.
     */
    expect(injuredIndices(runtime)).toEqual([7]);
    expect(runtime.prisoners.roomInstances.getById(targetInstanceId)!.concurrentUseCapacityByCapability).toEqual([
      ['medical-supply', 1],
      ['medical-treatment', 1],
      ['sleep-surface', 1],
    ]);
  });

  /**
   * **The medicine cabinet's only reader, measured rather than argued.**
   * The same fixture with the `object.medicine-cabinet` order left out is the
   * slower branch of `treatmentTicksFor`, and it is reachable in a real
   * session because `findAvailableForUse` gates on the capability and the
   * ceiling and never on whether the room's authored requirements are
   * satisfied.
   */
  it('takes twice as long in an infirmary with a bed and no medicine cabinet', () => {
    const bare = buildPrison({ cabinet: false });
    expect(stepUntilSomebodyIsInjured(bare, 80_000)).toBe(2_411);
    const selectedAtTick = stepUntilTreatmentSelected(bare, 2, 8_411);
    // Identical to the stocked prison's: the cabinet changes the course, not
    // the injury or the routing.
    expect(selectedAtTick).toBe(4_201);
    expect(bare.prisoners.roomInstances.getById(INFIRMARY_INSTANCE_ID)!.objectCapabilities).toEqual([
      'medical-treatment',
      'sleep-surface',
    ]);

    const clearedAtTick = stepUntilClear(bare, 2, selectedAtTick + 8_000);
    expect(clearedAtTick).toBe(6_701);
    // 2,500 against the stocked prison's 1,300 -- a difference of exactly
    // 1,200, which is the half of `TREATMENT_TICKS` the cabinet buys. The
    // shared 100 ticks either side is the walk and the reconsideration
    // granularity, and it cancels because both runs are the same fixture.
    expect(clearedAtTick - selectedAtTick).toBe(2_500);
  });

  /**
   * **A prison with no infirmary does not deadlock, does not heal, and does
   * not say anything untrue** -- the corpus's own "nothing deadlocks"
   * condition, met by the promotion simply not firing rather than by an
   * authored passive-recovery timer nobody ruled on.
   */
  it('leaves the flag set, and nobody performing treatment, when there is no infirmary to go to', () => {
    const runtime = buildPrison({ cabinet: true, infirmary: false });
    expect(stepUntilSomebodyIsInjured(runtime, 80_000)).toBe(2_411);
    expect(injuredIndices(runtime)).toEqual([2, 7]);

    /*
     * A full day and a half of play later -- past the point the stocked prison
     * had healed one prisoner and begun the second -- **nobody has been
     * treated**, and the injured list has only grown, because nothing clears
     * the flag and the incidents keep lapsing. Measured: all eight of them.
     *
     * **Nobody is performing or travelling for the action either**, which is
     * what makes the one player-visible string this change adds true. A roster
     * cell reads `action.infirmary-treatment`'s label only for a prisoner whose
     * `actionIndex` names it, and no prisoner's does -- the promotion is gated
     * on `prisonProvides`, which is false here. The prison never says anybody
     * is being treated, and never says anybody is waiting to be, because no
     * string is attached to the flag at all.
     */
    stepTo(runtime, 8_000);
    expect(injuredIndices(runtime)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...runtime.prisoners.currentAction.actionIndex].filter((index) => index === TREATMENT_ACTION_INDEX)).toEqual([]);
    expect(runtime.prisoners.roomInstances.hasPlaceForUse('room.infirmary', 'medical-treatment')).toBe(false);
  });

  /**
   * **The flag is state, and state must survive a reload (ADR 0038).** Saved
   * mid-injury through the real save envelope -- Zod validation and checksum --
   * rather than by comparing a snapshot to itself, and restored into a fresh
   * runtime that never saw the incident.
   *
   * **`migrated: false` and `SAVE_SCHEMA_VERSION` unchanged are load-bearing
   * assertions, not decoration.** The owner's ruling authorised a version bump
   * for this field and it is deliberately not spent: `docs/PERSISTENCE.md`'s
   * "Adding an optional field without a version bump" and ADR 0038 decision 1
   * both say an optional field whose absence has exactly one meaning does not
   * take one, and `save-schema.ts` records the reasoning beside the field.
   */
  it('carries the flag through a real save and load, and the restored prison finishes the treatment', () => {
    const runtime = buildPrison();
    stepUntilSomebodyIsInjured(runtime, 80_000);
    const selectedAtTick = stepUntilTreatmentSelected(runtime, 2, 8_411);
    // Saved part-way through the course, so the restore has something to
    // finish rather than something to start.
    stepTo(runtime, selectedAtTick + 400);
    expect(injuredIndices(runtime)).toEqual([2, 7]);

    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'incident-injury-prison',
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
    expect(envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(SAVE_SCHEMA_VERSION).toBe(6);

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
    expect(injuredIndices(restored)).toEqual([2, 7]);
    expect(restored.prisoners.isInjured(2)).toBe(true);
    expect(restored.prisoners.isInjured(7)).toBe(true);

    /*
     * **And it keeps behaving, to the tick.** The restored session clears the
     * flag at **5,501** -- the same absolute tick the continuous session
     * above does, with the save taken 400 ticks into the course. A restore is
     * not a restart: the prisoner was `'performing'` when the save was taken,
     * `PrisonerOperationsRuntime.loadSnapshot` drops only *travellers* to
     * `'idle'`, and the one treatment clock is
     * `CurrentActionComponent.phaseStartedAtTick`, which the payload already
     * carried before this change. So the course resumes where it stood and the
     * restored future equals the continuous one, which is the property
     * `docs/DETERMINISM.md` asks of a save and the reason the flag needed no
     * progress counter beside it.
     */
    const restoredCleared = stepUntilClear(restored, 2, restored.kernel.tick + 6_000);
    expect(restored.prisoners.isInjured(2)).toBe(false);
    expect(restoredCleared).toBe(5_501);
  });

  /**
   * **A save written before the field existed restores as "nobody has ever
   * been hurt"**, which is the one meaning `docs/PERSISTENCE.md` requires an
   * absent optional field to have before it may skip a version bump. Produced
   * by deleting the key from a real envelope rather than by hand-writing a
   * payload, so the rest of the save is exactly what this build writes.
   */
  it('restores a payload with no injured array as a prison in which nobody has been hurt', () => {
    const runtime = buildPrison();
    stepUntilSomebodyIsInjured(runtime, 80_000);
    expect(injuredIndices(runtime)).toEqual([2, 7]);

    const bundle = captureSessionSnapshot(runtime);
    const withoutField = JSON.parse(JSON.stringify(bundle)) as { simulation?: { prisoners?: { components?: Record<string, unknown> } } };
    expect(withoutField.simulation!.prisoners!.components!.injured, 'this build must write the field for its removal to prove anything').toBeDefined();
    delete withoutField.simulation!.prisoners!.components!.injured;

    const restored = restoreSimulationRuntime(withoutField as unknown as SessionSnapshotBundle, SEED).runtime;
    expect(injuredIndices(restored)).toEqual([]);
    expect(restored.prisoners.isInjured(2)).toBe(false);
  });
});
