import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { stateIncomeForPrisonerDay, stateIncomeForPrisonerDayAt, unmetNeedCount } from '../../src/simulation/economy/income';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Does an assault's instigator actually get sent to solitary, does that
 * cost the prison what ADR 0064 says it should, does the term end, and does
 * it survive a reload?** (Issue #80, ADR 00XX -- number not yet assigned.)
 *
 * Every figure below was read off a real run of this exact fixture and
 * written out, never computed from the code under test -- the same
 * discipline `tests/integration/incident-trigger-reachability.test.ts` uses
 * for its own tick counts. This file reuses that file's "beds only, one
 * guard" shape (`tests/integration/incident-trigger-reachability.test.ts`'s
 * `BED_ONLY` case, `guards: 1`), which is already established to produce
 * assaults reliably in a staffed prison -- ADR 0061's whole subject -- and
 * adds exactly one room this issue's mechanism needs: a single
 * `room.solitary-cell` for the sanction to relocate into.
 *
 * No incident is hand-placed and no sanction is asserted from a fabricated
 * record: every incident and every sanction below arises from real
 * `AdmitPrisoner`/`HireStaff`/`ZoneRoom`/`PlaceObject` commands run through
 * the real kernel for real ticks.
 */

const SEED = 0x5a17;
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
/** `LONG_SENTENCE_THRESHOLD_TICKS` and 0 priors score exactly 1 before screening variance, which clamps to riskTier 0-2 and never reaches the `>= 3` high-risk floor -- every arrival here is deterministically `general-population`. */

function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}
/** One solitary cell, clear of the cell row -- the one room this mechanism needs that `BED_ONLY` does not build. */
const SOLITARY = { x: 1, y: 10, width: 2, height: 2 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function buildPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: 8 }, (_unused, index) => cellRect(index));

  // One plank per bed (eight cells plus the solitary cell); one brick for the
  // solitary cell's toilet. `BED_ONLY` in the reachability suite has no
  // toilets at all; this fixture needs exactly one, in the solitary cell,
  // because `room.solitary-cell` requires one (`room-catalog.ts`).
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: cells.length + 1 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 1 }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  wallRoomPerimeter(runtime.world, SOLITARY, { doors: runtime.navigation.doors });

  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  submit(runtime, 'zone-solitary', packCommand({ type: 'ZoneRoom', roomId: 'room.solitary-cell', ...SOLITARY }));

  cells.forEach((rect, index) => {
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
  });
  submit(runtime, 'solitary-bed', packCommand({ type: 'PlaceObject', orderId: 'solitary-bed', definitionId: 'bed-wooden', x: SOLITARY.x, y: SOLITARY.y }));
  submit(runtime, 'solitary-wc', packCommand({ type: 'PlaceObject', orderId: 'solitary-wc', definitionId: 'toilet-brick', x: SOLITARY.x + 1, y: SOLITARY.y }));

  stepTo(runtime, 1_000);
  submit(runtime, 'hire0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  for (let index = 0; index < 8; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  // A refused command would make every figure below a measurement of a
  // different prison, so it is checked rather than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

/** Runs the real kernel until a terminal `'assault'` carrying an `instigatorId` exists, or gives up. */
function stepUntilAdjudicatedAssault(runtime: SimulationRuntime, maxTick: number): { readonly incidentId: string; readonly instigatorId: number } {
  while (runtime.kernel.tick < maxTick) {
    runtime.kernel.step();
    const found = runtime.incidents
      .all()
      .find((incident) => incident.type === 'assault' && incident.instigatorId !== undefined && (incident.state === 'resolved' || incident.state === 'lapsed'));
    if (found !== undefined) return { incidentId: found.id, instigatorId: found.instigatorId! };
  }
  throw new Error(`No terminal, adjudicated assault by tick ${String(maxTick)} -- the fixture stopped producing what this file measures.`);
}

function unmetAndIncomeOf(runtime: SimulationRuntime, entityId: number): { readonly unmet: number; readonly income: number } {
  const index = runtime.prisoners.entityStore.getIndex(entityId);
  const unmet = unmetNeedCount(runtime.prisoners.needs, index);
  return { unmet, income: stateIncomeForPrisonerDay(unmet) };
}

function accommodationCatalogIdOf(runtime: SimulationRuntime, entityId: number): string | undefined {
  const instanceId = runtime.prisoners.coldState.getAccommodation(entityId);
  return instanceId === undefined ? undefined : runtime.prisoners.roomInstances.getById(instanceId)?.roomCatalogId;
}

describe('an assault sanctions its instigator, not both participants, and follows through on it', () => {
  it('names one instigator of the pair, sanctions only them, relocates them, moves the count the state grant is priced from, and releases them on schedule', () => {
    const runtime = buildPrison();

    // Measured: the first terminal, adjudicated assault in this exact fixture
    // opens at tick 13,650 and lapses (no guard responds in time -- the one
    // hire is elsewhere) at tick 14,260, naming participants [2, 7] and
    // instigator 2.
    //
    // **13,200 / 13,810 until issue #588**, and 450 ticks *later* rather than
    // earlier, which is worth reading because every riot fixture in this suite
    // moved the other way. An assault comes from ADR 0061's per-prisoner
    // flashpoint sampler, not from the sector score, and its candidate
    // ordering is over the whole flashpoint vector -- so a `safety` deficit
    // that now grows five times faster reorders which prisoner is hottest at
    // which sample, and this pair's turn comes round one 450-tick stretch
    // later. The participants and the instigator are unchanged, which is what
    // this case is actually about.
    const { incidentId, instigatorId } = stepUntilAdjudicatedAssault(runtime, 60_000);
    const incident = runtime.incidents.get(incidentId)!;
    expect(incident.type).toBe('assault');
    expect(incident.participantIds).toEqual([2, 7]);
    expect(incident.state).toBe('lapsed');
    expect(incident.startedAtTick).toBe(13_650);
    expect(incident.timeline.at(-1)).toEqual({ state: 'lapsed', atTick: 14_260 });
    // The instigator is one of the two participants -- the sanction is not
    // charging a third party -- and the *other* participant is named nowhere
    // as an instigator: this is decision 1's asymmetry, read off the record
    // rather than asserted about the mechanism in the abstract.
    expect(incident.participantIds).toContain(instigatorId);
    const target = incident.participantIds.find((id) => id !== instigatorId)!;
    expect(instigatorId).toBe(2);
    expect(target).toBe(7);

    // The sanction is *recorded* the same tick the incident closes, before
    // this system has had a single scheduled update: `imposeSolitarySanction`
    // is called directly out of `IncidentResponseSystem`'s own transition, not
    // discovered on `SanctionSystem`'s next cycle. `isServingSolitarySanction`
    // is not yet true -- it means *physically confined*, and relocation has
    // not run yet -- so the recorded field is what this instant asserts.
    const index = runtime.prisoners.entityStore.getIndex(instigatorId);
    const endTick = runtime.prisoners.records.solitarySanctionEndTick[index]!;
    // `max(0, 14_260 or 14_261) + solitaryTermTicks (3 * 2_400 = 7_200)`.
    // The observed tick at the moment of the check runs one past the
    // timeline's own `14_260` (the kernel's tick counter has already moved on
    // to the next scheduled tick by the time `stepUntilAdjudicatedAssault`
    // reads it back), so the end tick this file measured is 21,460. It was
    // 21,010 while the assault opened at 13,200 -- the derivation is unchanged
    // and only its input moved.
    expect(endTick).toBe(21_460);
    expect(runtime.prisoners.records.solitarySanctionEndTick[runtime.prisoners.entityStore.getIndex(target)]).toBe(0);

    // Physically relocated within a handful of ticks -- the solitary cell
    // this fixture built starts empty, so there is no backlog to wait out --
    // and only now does `isServingSolitarySanction` read true: confinement is
    // physical, not a paperwork flag (see that method's own doc comment).
    stepTo(runtime, runtime.kernel.tick + 10);
    expect(accommodationCatalogIdOf(runtime, instigatorId)).toBe('room.solitary-cell');
    expect(runtime.prisoners.isServingSolitarySanction(instigatorId)).toBe(true);
    // The target keeps their own ordinary cell -- nothing about this incident
    // moved them.
    expect(accommodationCatalogIdOf(runtime, target)).toBe('room.cell');
    expect(runtime.prisoners.isServingSolitarySanction(target)).toBe(false);

    // **What it costs the state's grant (ADR 0064), measured on this
    // prisoner's own figures rather than asserted in the abstract.** Before
    // the assault this prisoner was an ordinarily-served general-population
    // resident: sampled at tick 10,000 (before the assault, same session,
    // same seed) their six needs cleared the unmet line and the state paid
    // the full 300. Once the solitary regime has had most of a day to bite --
    // sampled 500 ticks before the term ends -- `hygiene` and `recreation`
    // have both fallen to (or below) `STATE_INCOME_UNMET_NEED_LEVEL`, and the
    // state's grant for this one place is down by 80 (two unmet needs at 40
    // each), from 300 to 220. Nothing here changed `DEFAULT_SECTOR_RISK_POLICY`
    // or any figure `income.ts` declares; this is `HIGH_RISK_REGIME`
    // restricting the day, read back through the same functions
    // `StateIncomeSystem` calls at every day boundary.
    //
    // **The 220 is suspended, 2026-09-03, and the measurement is not.** The
    // owner set the withheld rate to `0` for now (their ruling is in
    // `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`), so this place now
    // pays the flat 300 with two needs unmet. The paragraph above is left as it
    // stands, because the fact it measured is `unmet: 2` -- what
    // `HIGH_RISK_REGIME` does to this prisoner's day -- and that is unchanged.
    // Both figures are asserted below: what the game pays today, and what the
    // same two unmet needs cost at ADR 0064's own rate, so the sentence "down
    // by 80, from 300 to 220" stays checkable rather than becoming prose
    // nothing runs.
    stepTo(runtime, endTick - 500);
    expect(accommodationCatalogIdOf(runtime, instigatorId)).toBe('room.solitary-cell');
    expect(unmetAndIncomeOf(runtime, instigatorId)).toEqual({ unmet: 2, income: 300 });
    expect(stateIncomeForPrisonerDayAt(40, 2)).toBe(220);

    // The term ends and this prisoner is moved back to an ordinary cell --
    // measured one tick after `endTick`, `SanctionSystem`'s own schedule
    // granularity.
    stepTo(runtime, endTick + 5);
    expect(runtime.prisoners.isServingSolitarySanction(instigatorId)).toBe(false);
    expect(accommodationCatalogIdOf(runtime, instigatorId)).toBe('room.cell');
  });

  /**
   * **The emergent loop this mechanism was not designed to produce, and does
   * anyway.** Solitary confinement degrades exactly the needs
   * `STATE_INCOME_UNMET_NEED_LEVEL` and `scoreAssaultPressure`'s
   * `needDeficit` both read, so a released prisoner whose `hygiene` and
   * `recreation` have not yet recovered is, for a while, the same kind of
   * flashpoint that earned them the first sanction. Measured on this exact
   * fixture and seed: entity 2 -- the same instigator -- is named the
   * instigator of a *second* assault at tick 22,800 (22,350 until issue #588),
   * roughly half an in-game day after their first release, and it extends their sanction rather than
   * starting a fresh one (`Math.max(existingEnd, tick) + solitaryTermTicks`).
   * This is not asserted as a defect; it is asserted because a reader of this
   * mechanism should not have to discover it by running the game, and because
   * it is exactly the shape of feedback loop ADR 0061 decision 4 already
   * named for the escape-attempt producer -- a consequence manufacturing the
   * conditions for its own recurrence.
   */
  it('can re-sanction its own instigator: a second assault while needs have not yet recovered extends the term', () => {
    const runtime = buildPrison();
    const { instigatorId } = stepUntilAdjudicatedAssault(runtime, 60_000);
    const index = runtime.prisoners.entityStore.getIndex(instigatorId);
    const firstEndTick = runtime.prisoners.records.solitarySanctionEndTick[index]!;

    stepTo(runtime, firstEndTick + 3_500);

    const secondAssault = runtime.incidents
      .all()
      .find((incident) => incident.type === 'assault' && incident.id !== 'incident.assault.1' && incident.instigatorId === instigatorId);
    expect(secondAssault, 'the same prisoner is named instigator a second time in this fixture').toBeDefined();
    // 22,350 until issue #588, for the reason the first assault's own tick
    // gives: the flashpoint ordering moved, not the sanction rule.
    expect(secondAssault!.startedAtTick).toBe(22_800);
    // `22_960 + 7_200`, the extension rather than a fresh term. 30,160 while
    // the second assault opened at 22,350; the rule is unchanged.
    expect(runtime.prisoners.records.solitarySanctionEndTick[index]).toBe(30_610);
    expect(runtime.prisoners.isServingSolitarySanction(instigatorId)).toBe(true);
    expect(accommodationCatalogIdOf(runtime, instigatorId)).toBe('room.solitary-cell');
  });

  /**
   * **The sanction is state, and state must survive a reload (ADR 0038).**
   * Saved mid-sanction, through the real save envelope (Zod validation and
   * checksum) rather than by comparing a snapshot to itself, and restored
   * into a fresh runtime that never saw the assault. The restored session
   * still knows the sanction, still enforces the regime restriction, and
   * still releases it at the same tick a continuous session would.
   */
  it('carries a live sanction through a real save and load, and still lifts it on schedule', () => {
    const runtime = buildPrison();
    const { instigatorId } = stepUntilAdjudicatedAssault(runtime, 60_000);
    const index = runtime.prisoners.entityStore.getIndex(instigatorId);
    stepTo(runtime, runtime.kernel.tick + 10); // let the physical relocation happen before the save
    const endTick = runtime.prisoners.records.solitarySanctionEndTick[index]!;
    expect(accommodationCatalogIdOf(runtime, instigatorId)).toBe('room.solitary-cell');

    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'assault-sanction-prison',
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

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    // The restored runtime agrees with the live one about the sanction's own
    // state, not merely about the tick.
    const restoredIndex = restored.prisoners.entityStore.getIndex(instigatorId);
    expect(restored.prisoners.records.solitarySanctionEndTick[restoredIndex]).toBe(endTick);
    expect(restored.prisoners.isServingSolitarySanction(instigatorId)).toBe(true);
    expect(accommodationCatalogIdOf(restored, instigatorId)).toBe('room.solitary-cell');

    // And it keeps behaving: ticked forward past the same end tick, it lifts
    // the sanction and moves the prisoner back, exactly as the continuous
    // session did.
    stepTo(restored, endTick + 5);
    expect(restored.prisoners.isServingSolitarySanction(instigatorId)).toBe(false);
    expect(accommodationCatalogIdOf(restored, instigatorId)).toBe('room.cell');
  });
});
