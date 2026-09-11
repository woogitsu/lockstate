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

  it('writes both directions at half weight from the adjudicated cross-gang assault -- ADR 0103 open question 2, answered 2026-09-10', () => {
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
    // participant and is in `gang.beta`. Before 2026-09-10 this wrote one
    // directional entry ('gang.beta'->'gang.alpha') at the full per-assault
    // weight. The owner's ruling on Open Question 2 declines to pick an
    // offender: BOTH directions are written, each at half the weight --
    // `allGrudges()` is sorted by key, so 'gang.alpha->gang.beta' sorts first.
    expect(runtime.gangs.allGrudges()).toEqual([
      ['gang.alpha', 'gang.beta', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2],
      ['gang.beta', 'gang.alpha', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2],
    ]);

    // The line ADR 0103 Context 1 calls the decisive one --
    // `if (grudge === 0) return 0;` -- no longer answers 0 for this prison, in
    // EITHER direction. Half of the ruled 0.4 weight is 0.2 a key, and
    // 0.2 * 1.5 is 0.3 on contested ground, under the trigger's 0.6.
    // **This read 0.15 while the weight was still 0.2**, which is the reading
    // that made a retaliation need four assaults instead of two.
    expect(resolveRetaliationRisk(runtime.gangs, 'gang.beta', 'gang.alpha', DEFAULT_SECURITY_SECTOR_ID)).toBeCloseTo(0.3, 10);
    expect(resolveRetaliationRisk(runtime.gangs, 'gang.alpha', 'gang.beta', DEFAULT_SECURITY_SECTOR_ID)).toBeCloseTo(0.3, 10);
    expect(runtime.incidents.all().some((incident) => incident.type === 'gang-retaliation')).toBe(false);

    // Measured: the second assault opens at 6,350 and lapses at 6,960, the
    // same pair and the same instigator. At the ruled weight this is 0.4 each
    // way -- `0.4 * 1.5` is exactly the 0.6 threshold, in BOTH directions at
    // once, and the retaliation opens at the next sampling point.
    //
    // **This block asserted 0.2 each way and no retaliation while the weight
    // was 0.2**, because halving without raising the weight put a retaliation
    // two assaults further out than it had ever been. Kept so a reader can
    // see which reading moved: what the halving changed is WHICH keys are
    // credited, and what the weight ruling restored is HOW FAST a key fills.
    stepTo(runtime, 6_970);
    expect(runtime.gangs.getGrudge('gang.beta', 'gang.alpha')).toBeCloseTo(0.4, 10);
    expect(runtime.gangs.getGrudge('gang.alpha', 'gang.beta')).toBeCloseTo(0.4, 10);
    expect(resolveRetaliationRisk(runtime.gangs, 'gang.beta', 'gang.alpha', DEFAULT_SECURITY_SECTOR_ID)).toBeCloseTo(0.6, 10);
  });

  it('opens the gang retaliation the trigger has never had a producer for, after the SECOND cross-gang assault', () => {
    const runtime = buildPrison();
    // **THIS CASE READ "after the FOURTH cross-gang assault -- not the second,
    // since 2026-09-10" AND STEPPED TO 11,810, AND THAT WAS RIGHT FOR ONE
    // DAY.** Two rulings landed on consecutive days and the second undid the
    // first's side effect. Open question 2's answer (2026-09-10) halved every
    // write, which at a weight of 0.2 left 0.1 a key and pushed this fixture's
    // first retaliation from tick 7,000 to tick 11,800 -- four assaults where
    // two had been enough, because the threshold is on ONE key's grudge. That
    // consequence was measured here rather than predicted, put to the owner,
    // and on 2026-09-11 they ruled the weight to 0.4. A key accrues 0.2 an
    // assault again.
    //
    // Measured on this tree at the ruled weight: assaults open at 3,950 and
    // 6,350, and the retaliation opens at **7,000** -- the same tick it opened
    // at before either ruling. `intervalTicks` is 50.
    stepTo(runtime, 7_010);

    const retaliations = runtime.incidents.all().filter((incident) => incident.type === 'gang-retaliation');
    expect(retaliations).toHaveLength(1);
    const retaliation = retaliations[0]!;

    expect(retaliation.startedAtTick).toBe(7_000);

    // ADR 0103 Context 5's arithmetic, met by a run: `round(risk * 10)` at the
    // threshold is 6, and 6 is `lockdownSeverityThreshold`. There is no mild
    // gang retaliation -- unaffected by the weight change, since the
    // threshold arithmetic in `resolveRetaliationRisk` was not touched.
    expect(retaliation.severity).toBe(6);

    // Decision 4: both gangs' members, and the list is not empty. This is the
    // assertion that makes the existing sentence
    // `'Two gangs are settling a score.'` true of this incident.
    expect(retaliation.participantIds).toEqual([0, 2, 3, 4, 5, 7]);
    expect(retaliation.participantIds.length).toBeGreaterThan(0);
    expect(retaliation.instigatorId).toBeUndefined(); // only an assault names one

    // `gangsClaiming` sorts ['gang.alpha', 'gang.beta']; `allGrudges` sorts by
    // key, so 'gang.alpha->gang.beta' is tried first and is the one that
    // fires here -- the REVERSE of the one direction the pre-ruling code
    // would ever have written for this same fixture (entity 2's gang,
    // 'gang.alpha', is the one instigating every assault, so it was always
    // "offending" before; it fires here as "offended" instead, which is
    // exactly the point of not picking a side).
    expect(retaliation.causeFactors).toEqual([
      { kind: 'gang-grudge', value: 0.4 },
      { kind: 'retaliation-risk', value: 0.6000000000000001 },
    ]);

    // Acted on, not retained, for the direction that fired -- but the OTHER
    // direction is untouched at 0.4 and is still eligible. This is the
    // emergent, previously-impossible shape the ADR Status flagged as
    // unmeasured, and at the ruled weight it is not a second retaliation but
    // two more -- see the next test.
    expect(runtime.gangs.getGrudge('gang.alpha', 'gang.beta')).toBe(0);
    expect(runtime.gangs.getGrudge('gang.beta', 'gang.alpha')).toBeCloseTo(0.4, 10);
    expect(runtime.gangs.allGrudges()).toEqual([['gang.beta', 'gang.alpha', 0.4]]);

    expect(runtime.incidentTriggerSystem.getMetrics().retaliationsTriggered).toBe(1);
  });

  it('opens a SECOND and a THIRD gang-retaliation off the same four assaults, and the third is severity 10 -- the doubled-ledger cost measured', () => {
    const runtime = buildPrison();
    // **THIS CASE ASSERTED TWO RETALIATIONS AND IT NOW MEASURES THREE.** It
    // was written on 2026-09-10, when open question 2's halving met a weight
    // of 0.2; the owner ruled the weight to 0.4 on 2026-09-11, so a key
    // accrues 0.2 an assault and this fixture's four assaults buy more than
    // they did under either earlier arrangement. The old figures are kept
    // beside the new ones rather than deleted.
    //
    // Measured on this tree at the ruled weight, walking the same four
    // assaults (3,950 / 6,350 / 8,750 / 11,150):
    //
    //   tick  7,000  -- 'gang.alpha->gang.beta' at 0.4, risk 0.6, severity 6
    //   tick 11,800  -- 'gang.alpha->gang.beta' again at 0.4, severity 6
    //   tick 16,600  -- 'gang.beta->gang.alpha' at **0.8**, risk clamped to
    //                   1, **severity 10**
    //
    // `allGrudges()` sorts by key, so 'gang.alpha->gang.beta' is sampled
    // first and is discharged twice while the reverse key keeps accruing --
    // which is how one direction reaches 0.8 and produces a retaliation half
    // again as severe as any this fixture produced before. **Nobody
    // predicted the severity-10 one**; it is recorded here because the owner
    // was told a retaliation could fire twice where it fired once, and the
    // measured answer is three times with one of them worse.
    stepTo(runtime, 16_610);

    const retaliations = runtime.incidents.all().filter((incident) => incident.type === 'gang-retaliation');
    expect(retaliations).toHaveLength(3); // was 2 while the weight was 0.2

    expect(retaliations[1]!.startedAtTick).toBe(11_800);
    expect(retaliations[1]!.severity).toBe(6);
    expect(retaliations[1]!.participantIds).toEqual([0, 2, 3, 4, 5, 7]);
    expect(retaliations[1]!.causeFactors).toEqual([
      { kind: 'gang-grudge', value: 0.4 },
      { kind: 'retaliation-risk', value: 0.6000000000000001 },
    ]);

    const third = retaliations[2]!;
    expect(third.startedAtTick).toBe(16_600);
    // `round(risk * 10)` with the risk clamped at 1 -- the only severity-10
    // retaliation this fixture has ever produced.
    expect(third.severity).toBe(10);
    expect(third.participantIds).toEqual([0, 2, 3, 4, 5, 7]);
    expect(third.causeFactors).toEqual([
      { kind: 'gang-grudge', value: 0.8 },
      { kind: 'retaliation-risk', value: 1 },
    ]);

    // Both directions are now discharged.
    expect(runtime.gangs.allGrudges()).toEqual([]);
    expect(runtime.incidentTriggerSystem.getMetrics().retaliationsTriggered).toBe(3);

    // **The cadence measurement ADR 0103 Status required before this could
    // ship, now across all three arrangements of the same fixture and the
    // same four assaults.** Pre-2026-09-10, one-directional at weight 0.2:
    // retaliations at 7,000 and 11,800, one per two assaults, one direction
    // only. Both-directions-at-half-weight with the weight still 0.2:
    // 11,800 and 16,600 -- the same count, clustered, after a longer wait.
    // Both directions at the ruled weight 0.4: 7,000, 11,800 and 16,600.
    // The ledger-entry count doubles under all three: four assaults write
    // four entries before the halving and eight after, because `addGrudge`
    // is called twice per adjudicated assault.
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
    stepTo(runtime, 11_810); // measured retaliation tick since 2026-09-10; was 7,010

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
    stepTo(runtime, 11_810); // measured retaliation tick since 2026-09-10; was 7,010
    const retaliation = runtime.incidents.all().find((incident) => incident.type === 'gang-retaliation')!;

    // `respondersPerSeverityPoint` is 0.5, so severity 6 demands
    // `ceil(6 * 0.5)` = 3 unassigned guards. This prison hired one, and it is
    // posted. So the response is never mounted, the lockdown line inside
    // `mountResponse` is never reached, and the incident runs out its
    // `responseDeadlineTicks` of 600.
    stepTo(runtime, 12_420); // was 7,620
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
    // Both directions, half weight each, since 2026-09-10 -- was a single
    // entry at the full weight.
    expect(runtime.gangs.allGrudges()).toEqual([
      ['gang.alpha', 'gang.beta', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2],
      ['gang.beta', 'gang.alpha', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2],
    ]);

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
    expect(restored.gangs.allGrudges()).toEqual([
      ['gang.alpha', 'gang.beta', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2],
      ['gang.beta', 'gang.alpha', CROSS_GANG_ASSAULT_GRUDGE_WEIGHT / 2],
    ]);

    // And it keeps behaving: ticked forward from the save, the restored
    // prison reaches the same retaliation the continuous session did, at the
    // same tick. **This stepped to 11,810 while the weight was 0.2** -- the
    // save point is unchanged and so is assault timing; what moved is how
    // many assaults a key needs, and the 2026-09-11 weight ruling put that
    // back to two.
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
