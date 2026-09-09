import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { CROSS_GANG_ASSAULT_GRUDGE_WEIGHT, DEFAULT_GANG_IDS } from '../../src/simulation/incidents/default-gangs';
import { resolveRetaliationRisk } from '../../src/simulation/incidents/gangs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { DEFAULT_SECURITY_SECTOR_ID } from '../../src/simulation/security/default-sector';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Does a prison a player can build actually produce a gang retaliation, and
 * does the whole chain the owner ruled on run end to end?**
 * ([ADR 0103](../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md),
 * accepted 2026-09-08; issue #979.)
 *
 * The chain, and every link of it was missing in `src/` before ADR 0103 --
 * issue #979's table is the census: two gangs exist and claim the watched
 * sector; `high-risk` arrivals join one; an assault between members of
 * different gangs reaches its terminal, adjudicated state; a directional
 * grudge is written; `resolveRetaliationRisk` stops returning the `0` it
 * returned for every prison; and `IncidentTriggerSystem` opens the
 * `'gang-retaliation'` that was the one member of `IncidentType` with no
 * producer.
 *
 * **No incident is hand-placed, no gang is hand-registered and no grudge is
 * hand-written.** Everything below arises from real
 * `AdmitPrisoner`/`HireStaff`/`ZoneRoom`/`PlaceObject` commands run through
 * the real kernel for real ticks, exactly as
 * `tests/integration/assault-sanction-loop.test.ts` and
 * `tests/integration/incident-trigger-reachability.test.ts` do.
 *
 * ## Why this fixture and not ADR 0103's Fixture A
 *
 * ADR 0103's measurement names `assault-sanction-loop.test.ts`'s prison, and
 * that prison **cannot** produce a grudge -- which is a finding rather than a
 * reason to swap fixtures, and the measurement's item 1 says so in advance:
 * *"If they do not, this fixture cannot produce a grudge and the run must say
 * so rather than being replaced."* Measured on that fixture with this change
 * in place: entities 2 and 7 are `riskTier` 1 at intake, are raised to 2 by
 * `ClassificationEarlyWarningSystem` after the first assault, and first reach
 * tier 3 at the review on tick **47,999** -- so decision 6's intake-time rule
 * assigns nobody, and its whole assault ladder (13,650 / 22,800 / 31,950 /
 * 41,500, `[2, 7]`, instigator 2) is unchanged tick for tick by this work.
 * That is ADR 0103's **Open Question 5**, which is open.
 *
 * This fixture is that prison with one command field changed --
 * `priorIncidents: 2` instead of `0` -- which is what makes `classifyPrisoner`
 * able to score the `>= 3` high-risk floor at the gate: `1` for a sentence
 * over `LONG_SENTENCE_THRESHOLD_TICKS`, plus `min(2, priorIncidents)`, plus a
 * screening draw of `-1 | 0 | +1`. It is a prison a player can build, because
 * `priorIncidents` is a field of the `AdmitPrisoner` command.
 */

const SEED = 0x5a17;
const ARRIVAL = { x: 16, y: 16 } as const;
/** `priorIncidents: 2` is the one field that differs from `assault-sanction-loop.test.ts`'s admission, and it is what puts arrivals in reach of the high-risk floor at intake. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 2 } as const;

function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}
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

function eventTypes(runtime: SimulationRuntime): readonly string[] {
  return runtime.events.getSnapshot().records.map((record) => record.type);
}

describe('a prison a player can build seeds gangs, forms a grudge from a real assault, and retaliates', () => {
  /**
   * Every figure asserted here was read off a real run of this exact fixture
   * and written out, never computed from the code under test -- the discipline
   * `incident-trigger-reachability.test.ts` uses for its own tick counts.
   */
  it('seeds two gangs claiming the watched sector and assigns the high-risk arrivals, splitting them across both', () => {
    const runtime = buildPrison();

    // Decision 1, asserted before a single prisoner has been classified: the
    // seeding is a property of session creation, not of anything that happens
    // in play.
    expect(runtime.gangs.all()).toEqual([
      { id: 'gang.alpha', territorySectorIds: [DEFAULT_SECURITY_SECTOR_ID] },
      { id: 'gang.beta', territorySectorIds: [DEFAULT_SECURITY_SECTOR_ID] },
    ]);
    expect(runtime.gangs.gangsClaiming(DEFAULT_SECURITY_SECTOR_ID)).toEqual(['gang.alpha', 'gang.beta']);
    expect(runtime.gangs.allGrudges()).toEqual([]);

    stepTo(runtime, 3_000);

    // Measured: six of the eight arrivals classify `high-risk` at intake and
    // are split on entity id parity; entity 1 draws `-1` on the screening
    // variance and stays `general-population`, and entity 6 opened an escape
    // attempt at tick 1,050 that nobody contained, so they are gone.
    expect(runtime.gangs.membersOf('gang.alpha')).toEqual([0, 2, 4]);
    expect(runtime.gangs.membersOf('gang.beta')).toEqual([3, 5, 7]);
    expect(runtime.gangs.getGangOf(1)).toBeUndefined();
  });

  it('writes one directional grudge from the adjudicated cross-gang assault, and the second one clears the threshold', () => {
    const runtime = buildPrison();

    // Measured: the first assault in this fixture opens at tick 3,950 naming
    // participants [2, 7] and instigator 2, and lapses at 4,560 -- the one
    // hire is elsewhere, which is the majority case ADR 0103 Context 13 point
    // 2 prices. A lapse is a terminal transition, so it adjudicates.
    stepTo(runtime, 3_960);
    const opened = runtime.incidents.all().filter((incident) => incident.type === 'assault');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ startedAtTick: 3_950, participantIds: [2, 7], instigatorId: 2, state: 'active' });

    // Nothing yet: the grudge is written at the terminal transition, not when
    // the assault opens (decision 2, and the alternative the ruling's word
    // "adjudicated" closes).
    expect(runtime.gangs.allGrudges()).toEqual([]);

    stepTo(runtime, 4_570);
    expect(runtime.incidents.get(opened[0]!.id)!.state).toBe('lapsed');

    // Entity 2 is the instigator and is in `gang.alpha`; entity 7 is the other
    // participant and is in `gang.beta`. Decision 2.1's direction: the
    // offended gang is the victim's, the offending gang is the instigator's.
    // ADR 0103's Open Question 2 records that the owner's ruling does not
    // settle this and that two other answers are defensible.
    expect(runtime.gangs.allGrudges()).toEqual([['gang.beta', 'gang.alpha', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT]]);

    // The line ADR 0103 Context 1 calls the decisive one --
    // `if (grudge === 0) return 0;` -- no longer answers 0 for this prison.
    // 0.2 * 1.5 on contested ground, still under the trigger's 0.6.
    expect(resolveRetaliationRisk(runtime.gangs, 'gang.beta', 'gang.alpha', DEFAULT_SECURITY_SECTOR_ID)).toBeCloseTo(0.3, 10);
    expect(runtime.incidents.all().some((incident) => incident.type === 'gang-retaliation')).toBe(false);

    // Measured: the second assault opens at 6,350 and lapses at 6,960, the
    // same pair and the same instigator. Two in the *same* direction is what
    // decision 2.5 says weight 0.2 buys, and the arithmetic is why: 0.4 * 1.5
    // is exactly the 0.6 threshold.
    stepTo(runtime, 6_970);
    expect(runtime.gangs.getGrudge('gang.beta', 'gang.alpha')).toBeCloseTo(0.4, 10);
    expect(resolveRetaliationRisk(runtime.gangs, 'gang.beta', 'gang.alpha', DEFAULT_SECURITY_SECTOR_ID)).toBeCloseTo(0.6, 10);
  });

  it('opens the gang retaliation the trigger has never had a producer for, with a participant list that is not empty', () => {
    const runtime = buildPrison();
    stepTo(runtime, 7_010);

    const retaliations = runtime.incidents.all().filter((incident) => incident.type === 'gang-retaliation');
    expect(retaliations).toHaveLength(1);
    const retaliation = retaliations[0]!;

    // Measured: tick 7,000 -- the first sampling point after the second
    // assault reached its terminal state at 6,960. `intervalTicks` is 50.
    expect(retaliation.startedAtTick).toBe(7_000);

    // ADR 0103 Context 5's arithmetic, met by a run: `round(risk * 10)` at the
    // threshold is 6, and 6 is `lockdownSeverityThreshold`. There is no mild
    // gang retaliation.
    expect(retaliation.severity).toBe(6);

    // Decision 4: both gangs' members, and the list is not empty. This is the
    // assertion that makes the existing sentence
    // `'Two gangs are settling a score.'` true of this incident.
    expect(retaliation.participantIds).toEqual([0, 2, 3, 4, 5, 7]);
    expect(retaliation.participantIds.length).toBeGreaterThan(0);
    expect(retaliation.instigatorId).toBeUndefined(); // only an assault names one

    expect(retaliation.causeFactors).toEqual([
      { kind: 'gang-grudge', value: 0.4 },
      { kind: 'retaliation-risk', value: 0.6000000000000001 },
    ]);

    // Acted on, not retained: the ledger is empty again, which is what makes
    // the sentence's "settling a score" a discharge rather than a standing
    // grievance.
    expect(runtime.gangs.getGrudge('gang.beta', 'gang.alpha')).toBe(0);
    expect(runtime.gangs.allGrudges()).toEqual([]);

    expect(runtime.incidentTriggerSystem.getMetrics().retaliationsTriggered).toBe(1);
  });

  /**
   * **What this fixture makes reachable for the first time, quoted so a review
   * can see it.** `'hud.alert.event.incidents.gang-retaliation-opened'` --
   * *"Two gangs are settling a score."* -- has existed in
   * `src/content/default-locale-en.ts` since issue #28's registry, and until
   * ADR 0103 no session a player could start opened the incident that says it
   * (`src/ui/simulation-events.ts` says so about itself). No string is
   * authored, edited or added by this work; what changes is that this one can
   * now arrive.
   */
  it('says it on the alerts channel, after the assault it came from', () => {
    const runtime = buildPrison();
    stepTo(runtime, 7_010);

    const types = eventTypes(runtime);
    expect(types).toContain('incidents.gang-retaliation-opened');

    // Reading A, end to end and expected to be vacuous: ADR 0103's
    // measurement item 8 asks for it anyway, because Decision 2.3 rests on the
    // inference that `openIncident` announces unconditionally. The assault the
    // grudge came from is on the channel, and it is on it *before* the
    // retaliation.
    const assaultAt = types.indexOf('incidents.assault-opened');
    const retaliationAt = types.indexOf('incidents.gang-retaliation-opened');
    expect(assaultAt).toBeGreaterThanOrEqual(0);
    expect(retaliationAt).toBeGreaterThan(assaultAt);
  });

  /**
   * ADR 0103's measurement item 4: *"Whether `IncidentResponseSystem` mounted
   * a response to it, and therefore whether the prison-wide lockdown in Cost
   * above actually fired at one guard -- the arithmetic says it will not, and a
   * run is what settles it."*
   */
  it('lapses at one guard rather than locking the prison down, which is what the arithmetic predicted', () => {
    const runtime = buildPrison();
    stepTo(runtime, 7_010);
    const retaliation = runtime.incidents.all().find((incident) => incident.type === 'gang-retaliation')!;

    // `respondersPerSeverityPoint` is 0.5, so severity 6 demands
    // `ceil(6 * 0.5)` = 3 unassigned guards. This prison hired one, and it is
    // posted. So the response is never mounted, the lockdown line inside
    // `mountResponse` is never reached, and the incident runs out its
    // `responseDeadlineTicks` of 600.
    stepTo(runtime, 7_620);
    expect(runtime.incidents.get(retaliation.id)!.state).toBe('lapsed');
    expect(runtime.securitySectors.getControlState(DEFAULT_SECURITY_SECTOR_ID)).toBe('normal');
  });

  /**
   * ADR 0103 Context 8 says the registry's whole state is already in the save
   * envelope and expects the round trip to be free. It is checked rather than
   * inherited, because the seeding is *derived* state re-applied after the
   * payload (`restoreSessionSystems` step 8b) and a derivation that ran in the
   * wrong order would silently double or drop a definition.
   */
  it('carries gangs, members and a live grudge through a real save and load without a schema move', () => {
    const runtime = buildPrison();
    stepTo(runtime, 4_570);
    expect(runtime.gangs.allGrudges()).toEqual([['gang.beta', 'gang.alpha', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT]]);

    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'gang-grudge-prison',
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
    // No field was added to the `.strict()` definition schema, so the version
    // does not move and there is no migration.
    expect(envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    expect(restored.gangs.all()).toEqual(runtime.gangs.all());
    expect(DEFAULT_GANG_IDS.map((gangId) => restored.gangs.membersOf(gangId))).toEqual([
      [0, 2, 4],
      [3, 5, 7],
    ]);
    expect(restored.gangs.allGrudges()).toEqual([['gang.beta', 'gang.alpha', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT]]);

    // And it keeps behaving: ticked forward from the save, the restored prison
    // reaches the same retaliation the continuous session did.
    stepTo(restored, 7_010);
    const retaliation = restored.incidents.all().find((incident) => incident.type === 'gang-retaliation');
    expect(retaliation).toMatchObject({ startedAtTick: 7_000, severity: 6, participantIds: [0, 2, 3, 4, 5, 7] });
  });

  /**
   * A save written before ADR 0103 carries `gangs: { definitions: [], ... }`,
   * because nothing in `src/` had ever registered one --
   * `GangRegistry.loadSnapshot` clears every definition before replaying the
   * payload's, so without step 8b of `restoreSessionSystems` such a save
   * restores a prison whose `'gang-retaliation'` producer can never fire
   * again. Absence is honoured with the derived value (ADR 0038 §1).
   */
  it('gives a save that carries no gangs the two derived ones back, rather than a prison with none', () => {
    const runtime = buildPrison();
    stepTo(runtime, 2_000);

    const bundle = captureSessionSnapshot(runtime);
    const simulation = bundle.simulation as unknown as { readonly incidents: { gangs: unknown } };
    // Exactly what a pre-ADR-0103 save holds in this section.
    simulation.incidents.gangs = { definitions: [], members: [], reputation: [], grudges: [] };

    const restored = restoreSimulationRuntime(bundle, SEED).runtime;

    expect(restored.gangs.all()).toEqual([
      { id: 'gang.alpha', territorySectorIds: [DEFAULT_SECURITY_SECTOR_ID] },
      { id: 'gang.beta', territorySectorIds: [DEFAULT_SECURITY_SECTOR_ID] },
    ]);
    // The membership such a save does not carry is genuinely gone -- it is
    // assigned at intake and those arrivals are already through it. Nothing is
    // fabricated for one, which is the same answer step 8 gives for a
    // pre-ADR-0036 schedule.
    expect(DEFAULT_GANG_IDS.map((gangId) => restored.gangs.membersOf(gangId))).toEqual([[], []]);
  });
});
