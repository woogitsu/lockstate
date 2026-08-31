import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { canonicalJson } from '../../src/simulation/determinism/canonical';
import { NEED_IDS, NEED_MAX } from '../../src/simulation/prisoners/needs';
import { classificationGroupIndex, intakeStageIndex } from '../../src/simulation/prisoners/components';
import {
  BOUNDED_VALUE_SEGMENTS,
  projectContraband,
  projectIncidentDetail,
  projectIncidents,
  projectPrisonerDetail,
  projectPrisonerPopulationCounts,
  projectPrisonerRoster,
  projectRoomDetail,
  projectRoomList,
  projectSecurity,
  projectStaff,
  projectStatusStrip,
  toBoundedValue,
} from '../../src/simulation/presentation';
import type { RoomDetailViewModel, RoomListViewModel } from '../../src/simulation/presentation/room-projection';
import { placedObjectAt } from '../../src/simulation/objects';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import type { AccommodationPolicy } from '../../src/simulation/prisoners/intake-system';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { hashFullRuntime, toJsonValue } from '../helpers/determinism-state';

/**
 * Every projection is exercised against a *real* session -- the same rich
 * `buildDeterminismScenario` runtime the determinism suite uses, driven
 * through the real `Kernel` -- rather than a hand-written fixture of the
 * shape each view model is hoped to have. A projection asserted against a
 * fixture proves only that the fixture and the assertion agree.
 */

const TICKS = 260;

function runScenario(options: { readonly reverseIncidentalRegistrationOrder?: boolean } = {}): SimulationRuntime {
  const runtime = buildDeterminismScenario(SCENARIO_SEED, options);
  submitScenarioCommands(runtime);
  for (let tick = 0; tick < TICKS; tick += 1) runtime.kernel.step();
  return runtime;
}

/** Every projection in this directory, taken together, as one comparable value. */
function projectEverything(runtime: SimulationRuntime): unknown {
  const tick = runtime.kernel.tick;
  return {
    statusStrip: projectStatusStrip({
      tick,
      clockControl: { mode: 'running', speed: 2 },
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      staff: runtime.securityGuards,
      incidents: runtime.incidents,
      searchSystem: runtime.searchSystem,
    }),
    roster: projectPrisonerRoster(runtime.prisoners, { limit: 50 }),
    rooms: projectRoomList(runtime.prisoners, { limit: 50 }),
    staff: projectStaff(
      { staff: runtime.securityGuards, deployment: runtime.deploymentSystem, patrol: runtime.patrolSystem },
      tick,
    ),
    security: projectSecurity(
      {
        sectors: runtime.securitySectors,
        doors: runtime.navigation.doors,
        staff: runtime.securityGuards,
        deployment: runtime.deploymentSystem,
        patrol: runtime.patrolSystem,
        incidents: runtime.incidents,
      },
      tick,
    ),
    contraband: projectContraband({
      searchSystem: runtime.searchSystem,
      confiscations: runtime.confiscations,
      intelligence: runtime.intelligence,
      informants: runtime.informants,
      searchPolicies: runtime.searchPolicies,
    }),
    incidents: projectIncidents({ incidents: runtime.incidents, trigger: runtime.incidentTriggerSystem, response: runtime.incidentResponseSystem }, tick),
  };
}

describe('bounded value contract', () => {
  it('projects an empty value as an empty bar and a full value as a full bar', () => {
    expect(toBoundedValue(0, NEED_MAX)).toEqual({ permille: 0, filled: 0, segments: BOUNDED_VALUE_SEGMENTS });
    expect(toBoundedValue(NEED_MAX, NEED_MAX)).toEqual({ permille: 1_000, filled: BOUNDED_VALUE_SEGMENTS, segments: BOUNDED_VALUE_SEGMENTS });
  });

  it('never shows a full bar for a value below its maximum', () => {
    // 254/255 is 99.6 %. Rounding to segments would render a completely
    // full need bar for a prisoner who is not, in fact, sated -- the class
    // of lie a player acts on.
    const almostFull = toBoundedValue(NEED_MAX - 1, NEED_MAX);
    expect(almostFull.permille).toBe(996);
    expect(almostFull.filled).toBe(BOUNDED_VALUE_SEGMENTS - 1);
  });

  it('exposes no raw value or raw maximum, so no HUD can hard-code the storage width', () => {
    expect(Object.keys(toBoundedValue(128, NEED_MAX)).sort()).toEqual(['filled', 'permille', 'segments']);
  });

  it('clamps out-of-range input rather than throwing in front of a player', () => {
    expect(toBoundedValue(-5, 10).permille).toBe(0);
    expect(toBoundedValue(50, 10).permille).toBe(1_000);
  });

  it('rejects input that means the caller passed the wrong field', () => {
    expect(() => toBoundedValue(Number.NaN, 10)).toThrow(RangeError);
    expect(() => toBoundedValue(1, 0)).toThrow(RangeError);
  });
});

describe('projections read authoritative state without touching it', () => {
  it('leaves the runtime state hash unchanged', () => {
    const runtime = runScenario();
    const before = hashFullRuntime(runtime);
    projectEverything(runtime);
    expect(hashFullRuntime(runtime)).toBe(before);
  });

  it('does not hand out a reference into live simulation state', () => {
    const runtime = runScenario();
    const rooms = projectRoomList(runtime.prisoners);
    const row = rooms.rooms.rows[0];
    expect(row).toBeDefined();
    const instance = runtime.prisoners.roomInstances.getById(row!.instanceId)!;
    expect(row!.objectCapabilities).not.toBe(instance.objectCapabilities);
    expect(row!.anchorTile).not.toBe(instance.anchorTile);
  });
});

describe('projections are deterministic', () => {
  it('produces identical view models when every incidental registration order is reversed', () => {
    // Rooms, doors, sectors, schedules, containers, jobs, contraband and
    // gangs are all registered in reverse here. If any projection iterated a
    // `Map`/`Set` instead of a canonical key, these two would differ.
    const asBuilt = runScenario();
    const reversed = runScenario({ reverseIncidentalRegistrationOrder: true });
    expect(canonicalJson(toJsonValue(projectEverything(reversed)))).toBe(
      canonicalJson(toJsonValue(projectEverything(asBuilt))),
    );
  });

  it('produces identical view models for two identical runs', () => {
    expect(canonicalJson(toJsonValue(projectEverything(runScenario())))).toBe(
      canonicalJson(toJsonValue(projectEverything(runScenario()))),
    );
  });
});

describe('localization boundary (ADR 0011)', () => {
  it('carries message keys and stable ids, never a translated string', () => {
    const runtime = runScenario();
    const translations = new Set(defaultLocaleEnCatalog.values());
    const offenders: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        if (translations.has(value)) offenders.push(`${path} = ${JSON.stringify(value)}`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };

    walk(projectEverything(runtime), '$');
    expect(offenders).toEqual([]);
  });

  it('projects the content catalog nameKey for every entity that has one', () => {
    const runtime = runScenario();
    const rooms = projectRoomList(runtime.prisoners);
    expect(rooms.rooms.rows.map((row) => row.roomNameKey)).toContain('room.cell.name');

    const staff = projectStaff({ staff: runtime.securityGuards }, runtime.kernel.tick);
    expect(staff.roster.rows[0]?.staffRoleNameKey).toBe('staff-role.guard.name');

    const security = projectSecurity({ sectors: runtime.securitySectors }, runtime.kernel.tick);
    expect(security.sectors[0]?.gradeNameKey).toBe('grade.general.name');
  });
});

describe('status strip', () => {
  it('counts real population, staff, rooms, incidents and contraband finds', () => {
    const runtime = runScenario();
    const strip = projectStatusStrip({
      tick: runtime.kernel.tick,
      clockControl: { mode: 'running', speed: 4 },
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      staff: runtime.securityGuards,
      incidents: runtime.incidents,
      searchSystem: runtime.searchSystem,
    });

    expect(strip.counts.prisoners).toBe(4);
    expect(strip.counts.staff).toBe(5);
    // Four cells, one solitary-free yard and one canteen were registered.
    expect(strip.counts.rooms).toBe(6);
    expect(strip.counts.activeIncidents).toBe(runtime.incidents.openIncidents().length);
    expect(strip.counts.contrabandDiscovered).toBe(runtime.searchSystem.getMetrics().itemsDiscovered);
    expect(strip.counts.roomOccupants).toBeGreaterThan(0);
  });

  /**
   * Issue #506 finding 2: a bare count cannot say which kind of incident is
   * open. Driven through `IncidentLog`'s own `open` -- the real producer
   * `runtime.incidents` is, and the same shortcut
   * `tests/integration/incident-consequence-loop.test.ts`'s `lapsedRiot`
   * already takes for the same reason its own comment gives (a trigger needs
   * a watched sector and a risk sample over threshold, neither of which this
   * is measuring) -- rather than a hand-built `StatusStripIncidentSource`
   * that would only prove this projection agrees with a view model this test
   * itself invented (#375).
   */
  it('names the open incident kind when every open incident agrees, and only then', () => {
    // A fresh runtime rather than `runScenario()`'s driven determinism
    // scenario: that scenario runs a real prison for `TICKS` ticks and
    // already opens its own incidents along the way (measured: it does), so
    // asserting "nothing open" against it would be asserting a fact about
    // this scenario's seed rather than about the projection. `new-session.ts`
    // is still the real `IncidentLog` production code depends on -- it is
    // simply not yet stepped, the same starting point
    // `tests/integration/incident-consequence-loop.test.ts`'s `housedPrisoner`
    // uses for the identical reason.
    const runtime = createNewSimulationRuntime(SCENARIO_SEED);
    const strip = (): ReturnType<typeof projectStatusStrip> =>
      projectStatusStrip({
        tick: runtime.kernel.tick,
        prisoners: runtime.prisoners,
        rooms: runtime.prisoners,
        staff: runtime.securityGuards,
        incidents: runtime.incidents,
        searchSystem: runtime.searchSystem,
      });

    // Nothing open yet: no single kind to report.
    expect(strip().counts.activeIncidents).toBe(0);
    expect(strip().counts.activeIncidentType).toBeUndefined();

    runtime.incidents.open(
      { id: 'incident-type-test-1', type: 'assault', sectorId: 'sector.wing-a', participantIds: [], severity: 3, causeFactors: [] },
      runtime.kernel.tick,
    );
    const oneOpen = strip();
    expect(oneOpen.counts.activeIncidents).toBe(1);
    expect(oneOpen.counts.activeIncidentType).toBe('assault');

    // A second sector, a different kind (ADR 0061 decision 6: one open
    // incident per *sector*, so this is a shape one derived sector can never
    // produce, but the projection must still answer it honestly rather than
    // pick one of the two).
    runtime.incidents.open(
      { id: 'incident-type-test-2', type: 'riot', sectorId: 'sector.wing-b', participantIds: [], severity: 6, causeFactors: [] },
      runtime.kernel.tick,
    );
    const twoOpenMixed = strip();
    expect(twoOpenMixed.counts.activeIncidents).toBe(2);
    expect(twoOpenMixed.counts.activeIncidentType).toBeUndefined();

    // Ending the riot leaves one open incident of one kind again. `'lapsed'`
    // rather than `'resolved'`, because `'active' -> 'resolved'` is not a
    // legal transition (`isLegalIncidentTransition`) -- an incident is
    // notified and responded to before it can be contained; lapsing is the
    // other terminal state and reachable straight from `'active'`.
    runtime.incidents.transition('incident-type-test-2', 'lapsed', runtime.kernel.tick, {
      injuredEntityIds: [],
      propertyDamage: 0,
      escaped: false,
    });
    const backToOne = strip();
    expect(backToOne.counts.activeIncidents).toBe(1);
    expect(backToOne.counts.activeIncidentType).toBe('assault');
  });

  /**
   * A prison built to tell `roomCapacity` and `accommodationCapacity` apart.
   *
   * Not `buildDeterminismScenario`: every capacity-bearing room in that one is
   * a `room.cell`, so the two figures agree there and a fixture in which they
   * agree cannot fail if the scoping is dropped. This is still a real session
   * -- `createNewSimulationRuntime`, real `PlacedObject`s, the real
   * `RoomCapacityResolver` -- built so the two figures must differ.
   *
   * Five sleep surfaces stand in it and they are authored here, one line each:
   * a bed in each of two cells, a bed in a solitary cell, and two medical beds
   * in an infirmary. The canteen's dining table and bench are the objects the
   * comment this change deleted blamed for the whole problem; they carry no
   * `'sleep-surface'` and are here to show they cost nothing.
   *
   * So `roomCapacity` is 5 and `accommodationCapacity` is 3, and both are
   * written out below rather than summed from the fixture -- a total derived
   * the way the projection derives it would hold for any scoping rule at all.
   */
  const ACCOMMODATION_TILE = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

  function buildAccommodationPrison(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SCENARIO_SEED);

    for (const instance of [
      { instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: ACCOMMODATION_TILE(2, 2), width: 2, height: 3 },
      { instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: ACCOMMODATION_TILE(5, 2), width: 2, height: 3 },
      { instanceId: 'solitary-1', roomCatalogId: 'room.solitary-cell', anchorTile: ACCOMMODATION_TILE(8, 2), width: 2, height: 2 },
      { instanceId: 'infirmary-1', roomCatalogId: 'room.infirmary', anchorTile: ACCOMMODATION_TILE(2, 8), width: 4, height: 4 },
      { instanceId: 'canteen-1', roomCatalogId: 'room.canteen', anchorTile: ACCOMMODATION_TILE(8, 8), width: 6, height: 6 },
    ]) {
      runtime.prisoners.roomInstances.register({
        ...instance,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        objectCapabilities: [],
      });
    }

    for (const object of [
      placedObjectAt('object.bed', ACCOMMODATION_TILE(2, 2), 0),
      placedObjectAt('object.bed', ACCOMMODATION_TILE(5, 2), 0),
      placedObjectAt('object.bed', ACCOMMODATION_TILE(8, 2), 0),
      placedObjectAt('object.medical-bed', ACCOMMODATION_TILE(2, 8), 0),
      placedObjectAt('object.medical-bed', ACCOMMODATION_TILE(4, 8), 0),
      placedObjectAt('object.dining-table', ACCOMMODATION_TILE(8, 8), 0),
      placedObjectAt('object.bench', ACCOMMODATION_TILE(8, 11), 0),
    ]) {
      if (!runtime.placedObjects.place(object)) {
        throw new Error(`the fixture's ${object.objectId} at (${object.anchorTile.x}, ${object.anchorTile.y}) must be placeable`);
      }
    }
    runtime.roomCapacity.resolveAll();

    return runtime;
  }

  it('does not count an infirmary\'s medical beds as somewhere to live', () => {
    const runtime = buildAccommodationPrison();
    const strip = projectStatusStrip({ tick: 0, prisoners: runtime.prisoners, rooms: runtime.prisoners });

    // Five sleep surfaces are registered, so the room total reads five --
    // `object.medical-bed` declares `'sleep-surface'` exactly as `object.bed`
    // does, which is correct and is why `src/simulation/construction/definition.ts`
    // says an infirmary "derives a residency it has no intake route to use".
    expect(strip.counts.roomCapacity).toBe(5);
    // Three of them are somewhere `IntakeSystem` would put an arrival: the two
    // cells and the solitary cell. The infirmary's two are not, and this is
    // the whole difference between the published denominator and the total.
    expect(strip.counts.accommodationCapacity).toBe(3);
  });

  it('counts a solitary cell, because the accommodation policy does', () => {
    // The obvious wrong denominator is "sum over `room.cell`", which reads 2
    // here. `DEFAULT_ACCOMMODATION_POLICY` lists `room.solitary-cell` for both
    // classification groups, so a prison of solitary cells houses people and
    // its beds are places (`IntakeSystem.resolveExistingTarget`).
    const runtime = buildAccommodationPrison();
    const strip = projectStatusStrip({ tick: 0, prisoners: runtime.prisoners, rooms: runtime.prisoners });

    expect(strip.counts.accommodationCapacity).toBe(3);

    const cellsOnly: AccommodationPolicy = {
      resolveTargets: () => [{ roomCatalogId: 'room.cell', requiredObjectCapability: 'sleep-surface' }],
    };
    const scoped = projectStatusStrip({
      tick: 0,
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      accommodationPolicy: cellsOnly,
    });

    // Two, from the same prison. The room ids are read out of the policy and
    // are not written into the projection (`AGENTS.md` boundary 6): a rule that
    // hard-coded them would answer 3 to both of these.
    expect(scoped.counts.accommodationCapacity).toBe(2);
  });

  /**
   * Puts `count` arrivals into `accommodation-assignment` in `group`, without
   * running intake.
   *
   * The classification a prisoner receives is a `prisoners.classification` draw
   * made two stages after the admission, and the panel's own admission scores
   * `general-population` with certainty (`IntakeSystem.hasAccommodationTarget`
   * measured 2,000 of 2,000 seeds), so a *high-risk* arrival cannot be arranged
   * by pressing Admit. What is being measured here is the projection's
   * arithmetic over a state the stage machine can be in, and
   * `tests/integration/over-admission-signal.test.ts` is what establishes that
   * the ordinary state is reachable by playing.
   */
  function waitAtAccommodationAssignment(runtime: SimulationRuntime, group: string, count: number): void {
    for (let arrival = 0; arrival < count; arrival += 1) {
      const entityId = runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 10_000, priorIncidents: 0 }, { x: 16, y: 16 });
      const index = runtime.prisoners.entityStore.getIndex(entityId);
      runtime.prisoners.records.intakeStage[index] = intakeStageIndex('accommodation-assignment');
      runtime.prisoners.records.classificationGroupIndex[index] = classificationGroupIndex(group);
    }
  }

  describe('who the prison has no bed for (issue #549)', () => {
    it('counts nobody as bedless while the prison still has a free place for them', () => {
      // Two ordinary cell beds, two arrivals holding out for one. Both are at
      // Cell Assignment, which is the figure a naive warning would read -- and
      // both have somewhere to go.
      const runtime = buildAccommodationPrison();
      waitAtAccommodationAssignment(runtime, 'general-population', 2);

      const counts = projectPrisonerPopulationCounts(runtime.prisoners);
      expect(counts.byIntakeStage.find((entry) => entry.intakeStage === 'accommodation-assignment')?.count).toBe(2);
      expect(counts.waitingWithoutPlace).toBe(0);
    });

    it('counts the arrivals past the last free bed, and only those', () => {
      const runtime = buildAccommodationPrison();
      waitAtAccommodationAssignment(runtime, 'general-population', 5);

      // Two beds these arrivals may be housed in -- `room.cell` is
      // `general-population`'s first target and the prison holds instances of it,
      // so the solitary cell's bed is never reached and the infirmary's two never
      // were places at all. Five waiting, three with nowhere.
      expect(projectPrisonerPopulationCounts(runtime.prisoners).waitingWithoutPlace).toBe(3);
    });

    it('subtracts the occupants, so a bed somebody is already in is not a free place', () => {
      const runtime = buildAccommodationPrison();
      waitAtAccommodationAssignment(runtime, 'general-population', 2);
      // With both cell beds empty this prison houses both of them -- the case
      // above. One resident housed by hand takes one bed, and the same two
      // arrivals are now one short. A count built from capacity alone reads 0.
      const resident = runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 10_000, priorIncidents: 0 }, { x: 16, y: 16 });
      expect(runtime.prisoners.roomInstances.assign('cell-1', resident)).toBe(true);

      expect(projectPrisonerPopulationCounts(runtime.prisoners).waitingWithoutPlace).toBe(1);
    });

    it('does not house a high-risk arrival in an ordinary cell it is not held for', () => {
      // The case a single prison-wide total of free places gets wrong, and it is
      // wrong in the direction that matters: it would report nobody waiting while
      // somebody genuinely has nowhere to go.
      //
      // `DEFAULT_ACCOMMODATION_POLICY` sends a high-risk arrival to
      // `room.solitary-cell` and falls back to `room.cell` only for a prison
      // holding *no* solitary cell at all -- a full one is waited on, never
      // fallen back from (`IntakeSystem.resolveExistingTarget`). This prison
      // holds one solitary cell with one bed, so a second high-risk arrival has
      // nowhere, however many ordinary cells stand empty beside it.
      const runtime = buildAccommodationPrison();
      waitAtAccommodationAssignment(runtime, 'high-risk', 2);

      const counts = projectPrisonerPopulationCounts(runtime.prisoners);
      expect(counts.byIntakeStage.find((entry) => entry.intakeStage === 'accommodation-assignment')?.count).toBe(2);
      // Two free ordinary cells stand right there, and they are not this
      // arrival's to take.
      expect(counts.waitingWithoutPlace).toBe(1);
    });

    it('leaves an arrival with no room type at all to the terminal stage rather than counting them twice', () => {
      // A prison with nowhere for anybody: the arrivals here reach `'failed'` on
      // the next intake tick and `byIntakeStage` reports them there. Counting
      // them as bedless as well would put one person into two sentences that mean
      // opposite things -- "a bed would fix this" and "nothing will".
      const runtime = createNewSimulationRuntime(SCENARIO_SEED);
      waitAtAccommodationAssignment(runtime, 'general-population', 3);

      expect(projectPrisonerPopulationCounts(runtime.prisoners).waitingWithoutPlace).toBe(0);
    });

    it('scopes the free places to the policy, never to a room id of its own', () => {
      // The same reading `accommodationCapacity` is held to (`AGENTS.md` boundary
      // 6): which room types house a resident is content, and a projection may
      // not name one in a condition of its own.
      //
      // Two prisons out of one. Under the shipped policy these three arrivals are
      // held for the two ordinary cell beds and one is left over; under a policy
      // that houses everybody in solitary they are held for that room's single
      // bed and two are. A rule with `room.cell` written into it answers 1 to
      // both.
      const runtime = buildAccommodationPrison();
      waitAtAccommodationAssignment(runtime, 'general-population', 3);
      const solitaryOnly: AccommodationPolicy = {
        resolveTargets: () => [{ roomCatalogId: 'room.solitary-cell', requiredObjectCapability: 'sleep-surface' }],
      };

      expect(projectPrisonerPopulationCounts(runtime.prisoners).waitingWithoutPlace).toBe(1);
      expect(
        projectPrisonerPopulationCounts({ ...runtime.prisoners, accommodationPolicy: solitaryOnly }).waitingWithoutPlace,
      ).toBe(2);
    });
  });

  it('reports no accommodation for a prison with no room source at all', () => {
    // Not a guess and not a default: a runtime with no room registry has no
    // beds, exactly as `stateIncomeAccruedTodayMinorUnits` reports 0 for one.
    const runtime = buildAccommodationPrison();
    const strip = projectStatusStrip({ tick: 0, prisoners: runtime.prisoners });

    expect(strip.counts.accommodationCapacity).toBe(0);
    expect(strip.counts.roomCapacity).toBe(0);
  });

  it('reports the clock as day number plus position within the in-game day', () => {
    const runtime = runScenario();
    const strip = projectStatusStrip({ tick: runtime.kernel.tick, clockControl: { mode: 'running', speed: 2 }, prisoners: runtime.prisoners });

    expect(strip.clock.tick).toBe(TICKS);
    expect(strip.clock.dayNumber).toBe(1);
    expect(strip.clock.tickOfDay).toBe(TICKS % DAY_LENGTH_TICKS);
    expect(strip.clock.dayLengthTicks).toBe(DAY_LENGTH_TICKS);
    expect(strip.clock.speed).toBe(2);
    expect(strip.clock.paused).toBe(false);
    expect(strip.clock.speedKnown).toBe(true);
  });

  it('reports paused, and reports an unknown speed rather than guessing one', () => {
    const runtime = runScenario();
    const paused = projectStatusStrip({ tick: runtime.kernel.tick, clockControl: { mode: 'paused' }, prisoners: runtime.prisoners });
    expect(paused.clock).toMatchObject({ paused: true, speed: 0, speedKnown: true });

    const unknown = projectStatusStrip({ tick: runtime.kernel.tick, prisoners: runtime.prisoners });
    expect(unknown.clock).toMatchObject({ paused: false, speed: 0, speedKnown: false });
  });

  it('reports the active regime block for both classification groups', () => {
    const runtime = runScenario();
    const strip = projectStatusStrip({ tick: runtime.kernel.tick, prisoners: runtime.prisoners });

    expect(strip.regime.map((entry) => entry.classificationGroupId)).toEqual(['general-population', 'high-risk']);
    // Tick 260 falls in general population's 0-400 sleep block.
    expect(strip.regime[0]).toMatchObject({ blockStartTickOfDay: 0, blockEndTickOfDay: 400, allowedCategories: ['sleep'] });
  });
});

describe('prisoner roster and detail', () => {
  /**
   * **The name of this case read "in ascending entity id" until 2026-08-31.**
   * Issue #703's fourth ruling made the roster's order highest risk tier first,
   * ties on ascending entity index, so the whole-list order is asserted against
   * that pair now. The *paging* half is unchanged and is the half this case was
   * always mostly about.
   */
  it('lists every live prisoner by descending tier then ascending id, and pages without changing the order', () => {
    const runtime = runScenario();
    const all = projectPrisonerRoster(runtime.prisoners);
    expect(all.total).toBe(4);
    expect(all.rows).toHaveLength(4);

    // The order the projection promises, written out independently of it: the
    // rows sorted by `(-riskTier, entityId)` must be the rows as they arrived.
    const key = (row: { readonly riskTier?: number; readonly entityId: number }): readonly [number, number] => [
      -(row.riskTier ?? -1),
      row.entityId,
    ];
    const expectedOrder = [...all.rows].sort((left, right) => {
      const [leftTier, leftId] = key(left);
      const [rightTier, rightId] = key(right);
      return leftTier === rightTier ? leftId - rightId : leftTier - rightTier;
    });
    expect(all.rows.map((row) => row.entityId)).toEqual(expectedOrder.map((row) => row.entityId));

    // Non-vacuity: this scenario really does hold more than one tier, so the
    // check above is not satisfied by a single-tier population in which any
    // ascending-id order would pass.
    expect(new Set(all.rows.map((row) => row.riskTier)).size).toBeGreaterThan(1);

    const windowed = projectPrisonerRoster(runtime.prisoners, { offset: 2, limit: 1 });
    expect(windowed).toMatchObject({ total: 4, offset: 2, limit: 1 });
    expect(windowed.rows).toEqual([all.rows[2]]);

    const pastEnd = projectPrisonerRoster(runtime.prisoners, { offset: 99, limit: 10 });
    expect(pastEnd.total).toBe(4);
    expect(pastEnd.rows).toEqual([]);
  });

  it('projects only the classification values that exist, and only once classification has run', () => {
    const runtime = runScenario();
    for (const row of projectPrisonerRoster(runtime.prisoners).rows) {
      expect(row.classified).toBe(true);
      expect(['general-population', 'high-risk']).toContain(row.classificationGroupId);
      expect(row.riskTier).toBeGreaterThanOrEqual(0);
      expect(row.riskTier).toBeLessThanOrEqual(3);
    }

    // A prisoner admitted this instant has not been classified yet, so the
    // projection must not report a default-decoded 'general-population'.
    const fresh = buildDeterminismScenario(SCENARIO_SEED);
    const row = projectPrisonerRoster(fresh.prisoners).rows[0];
    expect(row).toMatchObject({ intakeStage: 'queued', classified: false });
    expect(row).not.toHaveProperty('classificationGroupId');
    expect(row).not.toHaveProperty('riskTier');
  });

  it('projects exactly the six needs that exist, in canonical order, as bounded values', () => {
    const runtime = runScenario();
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    const detail = projectPrisonerDetail(runtime.prisoners, entityId)!;

    expect(detail.needs.map((need) => need.needId)).toEqual([...NEED_IDS]);
    for (const need of detail.needs) {
      expect(need.level.segments).toBe(BOUNDED_VALUE_SEGMENTS);
      expect(need.level.permille).toBeGreaterThanOrEqual(0);
      expect(need.level.permille).toBeLessThanOrEqual(1_000);
      expect(need.level.filled).toBeLessThanOrEqual(BOUNDED_VALUE_SEGMENTS);
    }
  });

  it('reports the lowest need with a deterministic tie-break', () => {
    const runtime = runScenario();
    const row = projectPrisonerRoster(runtime.prisoners).rows[0]!;
    const detail = projectPrisonerDetail(runtime.prisoners, row.entityId)!;
    const lowest = Math.min(...detail.needs.map((need) => need.level.permille));
    expect(row.lowestNeed.level.permille).toBe(lowest);
    // Ties resolve to the earlier NEED_IDS entry, never to iteration luck.
    const expected = detail.needs.find((need) => need.level.permille === lowest)!;
    expect(row.lowestNeed.needId).toBe(expected.needId);
  });

  it('projects action, location and accommodation from real state', () => {
    const runtime = runScenario();
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    const detail = projectPrisonerDetail(runtime.prisoners, entityId)!;
    const index = runtime.prisoners.entityStore.getIndex(entityId);

    expect(detail.location.tile).toEqual({
      x: runtime.prisoners.position.tileX[index],
      y: runtime.prisoners.position.tileY[index],
    });
    expect(detail.accommodation?.instanceId).toBe(runtime.prisoners.coldState.getAccommodation(entityId));
    expect(detail.accommodation?.roomNameKey).toBe('room.cell.name');
    expect(['idle', 'travelling', 'performing']).toContain(detail.currentAction?.phase ?? 'idle');
  });

  it('projects gang membership only when a gang registry is supplied', () => {
    const runtime = runScenario();
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    runtime.gangs.addMember('gang-a', entityId);
    runtime.gangs.adjustReputation('gang-a', 3);

    expect(projectPrisonerRoster(runtime.prisoners).rows[0]).not.toHaveProperty('gangId');
    expect(projectPrisonerRoster(runtime.prisoners, {}, { gangs: runtime.gangs }).rows[0]?.gangId).toBe('gang-a');
    expect(projectPrisonerDetail(runtime.prisoners, entityId, { gangs: runtime.gangs })?.gang).toEqual({
      gangId: 'gang-a',
      reputation: runtime.gangs.getReputation('gang-a'),
    });
  });

  it('returns undefined for an entity id that was never spawned', () => {
    const runtime = runScenario();
    expect(projectPrisonerDetail(runtime.prisoners, 999_999)).toBeUndefined();
  });

  it('counts the population without building a single row', () => {
    const runtime = runScenario();
    const counts = projectPrisonerPopulationCounts(runtime.prisoners);
    expect(counts.total).toBe(4);
    expect(counts.byIntakeStage.map((entry) => entry.intakeStage)).toEqual([
      'queued',
      'reception',
      'classification',
      'accommodation-assignment',
      'completed',
      'failed',
    ]);
    expect(counts.byClassificationGroupId.map((entry) => entry.classificationGroupId)).toEqual([
      'general-population',
      'high-risk',
    ]);
    expect(counts.byIntakeStage.reduce((sum, entry) => sum + entry.count, 0)).toBe(counts.total);
  });
});

describe('room list and detail', () => {
  it('lists registered instances in ascending instance id with real occupancy', () => {
    const runtime = runScenario();
    const list = projectRoomList(runtime.prisoners);
    expect(list.rooms.rows.map((row) => row.instanceId)).toEqual([
      'canteen-1',
      'cell-1',
      'cell-2',
      'cell-3',
      'cell-4',
      'yard-1',
    ]);

    const cell = list.rooms.rows.find((row) => row.instanceId === 'cell-1')!;
    expect(cell.occupancy.current).toBe(runtime.prisoners.roomInstances.occupancyOf('cell-1'));
    expect(cell.occupancy.capacity).toBe(1);
    expect(cell.occupancy.free).toBe(1 - cell.occupancy.current);
    expect(cell.occupancy.utilization?.segments).toBe(BOUNDED_VALUE_SEGMENTS);
  });

  it('reports object requirements as capability-checked and everything else as not evaluated', () => {
    const runtime = runScenario();
    const detail = projectRoomDetail(runtime.prisoners, 'cell-1')!;

    // room.cell requires a bed ('sleep-surface') and a toilet ('sanitation');
    // the fixture registers both capabilities on the instance.
    const objectRequirements = detail.requirements.filter((requirement) => requirement.type === 'object');
    expect(objectRequirements.map((requirement) => requirement.objectId)).toEqual(['object.bed', 'object.toilet']);
    expect(objectRequirements.every((requirement) => requirement.status === 'satisfied-by-capability')).toBe(true);
    expect(objectRequirements[0]?.objectNameKey).toBe('object.bed.name');

    // Enclosure and size are not derivable: a RoomInstance carries an anchor
    // tile and nothing else, and since #123 item 2 deleted the mocked
    // RoomSystem.validateRoom, nothing else evaluates them either.
    for (const requirement of detail.requirements) {
      if (requirement.type === 'object') continue;
      expect(requirement.status).toBe('not-evaluated');
    }
    expect(detail.requirementSummary).toMatchObject({ objectRequirements: 2, satisfiedByCapability: 2, missingCapability: 0 });
  });

  it('flags a missing required-object capability', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    runtime.prisoners.roomInstances.register({
      instanceId: 'cell-bare',
      roomCatalogId: 'room.cell',
      anchorTile: { x: 12, y: 12 } as never,
      residentCapacity: 1, concurrentUseCapacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
    const detail = projectRoomDetail(runtime.prisoners, 'cell-bare')!;
    const toilet = detail.requirements.find((requirement) => requirement.objectId === 'object.toilet')!;
    expect(toilet.status).toBe('missing-capability');
    expect(detail.requirementSummary).toMatchObject({ satisfiedByCapability: 1, missingCapability: 1 });
  });

  it('sorts occupants by entity id rather than by Set insertion order', () => {
    const runtime = runScenario();
    const detail = projectRoomDetail(runtime.prisoners, 'cell-1')!;
    expect([...detail.occupantEntityIds].sort((left, right) => left - right)).toEqual(detail.occupantEntityIds);
  });

  it('attaches a security grade only when the caller supplies a room-to-sector mapping', () => {
    const runtime = runScenario();
    expect(projectRoomDetail(runtime.prisoners, 'cell-1')!.security).toBeUndefined();

    const withSector = projectRoomDetail(runtime.prisoners, 'cell-1', {
      sectors: runtime.securitySectors,
      sectorIdByRoomInstanceId: new Map([['cell-1', 'sector-a']]),
    })!;
    expect(withSector.security).toMatchObject({
      sectorId: 'sector-a',
      gradeId: 'grade.general',
      gradeNameKey: 'grade.general.name',
      minSecurityClearance: 0,
    });
  });

  it('returns undefined for an unregistered instance id', () => {
    const runtime = runScenario();
    expect(projectRoomDetail(runtime.prisoners, 'no-such-room')).toBeUndefined();
  });
});

/**
 * Issue #528: the authored `minQuantity` on an `object` requirement, which
 * `requirementStatus` never read.
 *
 * `room.canteen` asks for two dining tables and four benches
 * (`src/content/room-catalog.ts`), and one of each read the room finished --
 * not cosmetically, because the concurrent-use ceiling is footprint-derived, so
 * a canteen the panel called finished seated three diners rather than six.
 *
 * ## Every fixture below is a real session
 *
 * `createNewSimulationRuntime`, real `PlacedObject` rows through
 * `PlacedObjectRegistry.place`, and the real `RoomCapacityResolver` writing the
 * derived fields -- the same shape `buildAccommodationPrison` above uses, and
 * for the same reason: an instance whose `objectCapabilities` are typed into the
 * fixture proves only that the fixture and the assertion agree. The rooms are
 * registered directly rather than zoned, because `ZoneRoom` needs a walled,
 * enclosed rectangle and what is under test is the projection rather than the
 * zoning gate; `tests/integration/furnished-prison-loop.test.ts` is the same
 * assertion off real `ZoneRoom` and `PlaceObject` commands.
 *
 * ## Every expected count is a literal read off the catalogues
 *
 * `room.canteen` -> 2 dining tables and 4 benches. `room.classroom` -> 1
 * bookshelf and 4 chairs. `room.reception` -> 1 desk and 2 chairs.
 * `room.security-office` -> 1 security console. Written out here rather than
 * read from `defaultRoomContentRegistry`, so a requirement edited to `1` would
 * fail these instead of moving with them.
 */
describe('room requirement quantities (#528)', () => {
  const TILE = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

  interface FurnishedRoom {
    readonly instanceId: string;
    readonly roomCatalogId: string;
    readonly anchorTile: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly height: number;
    /** `[objectId, anchor]`, anchors chosen so no two footprints overlap. */
    readonly objects: readonly (readonly [string, { readonly x: number; readonly y: number }])[];
  }

  function furnish(rooms: readonly FurnishedRoom[]): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SCENARIO_SEED);
    for (const room of rooms) {
      runtime.prisoners.roomInstances.register({
        instanceId: room.instanceId,
        roomCatalogId: room.roomCatalogId,
        anchorTile: room.anchorTile as never,
        width: room.width,
        height: room.height,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        objectCapabilities: [],
      });
      for (const [objectId, anchor] of room.objects) {
        if (!runtime.placedObjects.place(placedObjectAt(objectId, anchor as never, 0))) {
          throw new Error(`the fixture's ${objectId} at (${anchor.x}, ${anchor.y}) must be placeable`);
        }
      }
    }
    runtime.roomCapacity.resolveAll();
    return runtime;
  }

  /** The requirement statuses one room reads, keyed by the object id each names. */
  function statuses(runtime: SimulationRuntime, instanceId: string): Record<string, string> {
    const detail = projectRoomDetail(runtime.prisoners, instanceId, { placedObjects: runtime.placedObjects })!;
    const byObjectId: Record<string, string> = {};
    for (const requirement of detail.requirements) {
      if (requirement.objectId === undefined) continue;
      byObjectId[requirement.objectId] = requirement.status;
    }
    return byObjectId;
  }

  /** One dining table and one bench: the exact prison issue #528 was played in. */
  const SHORT_CANTEEN: FurnishedRoom = {
    instanceId: 'canteen-short',
    roomCatalogId: 'room.canteen',
    anchorTile: TILE(8, 8),
    width: 6,
    height: 6,
    objects: [
      ['object.dining-table', TILE(8, 8)],
      ['object.bench', TILE(8, 11)],
    ],
  };

  /** The same room with the authored two tables and four benches standing in it. */
  const FULL_CANTEEN: FurnishedRoom = {
    instanceId: 'canteen-full',
    roomCatalogId: 'room.canteen',
    anchorTile: TILE(20, 8),
    width: 6,
    height: 6,
    objects: [
      ['object.dining-table', TILE(20, 8)],
      ['object.dining-table', TILE(23, 8)],
      ['object.bench', TILE(20, 11)],
      ['object.bench', TILE(22, 11)],
      ['object.bench', TILE(20, 12)],
      ['object.bench', TILE(22, 12)],
    ],
  };

  it('reads a canteen short of its authored quantities as unfinished', () => {
    const runtime = furnish([SHORT_CANTEEN]);

    // One of each, against an authored two and four.
    expect(statuses(runtime, 'canteen-short')).toEqual({
      'object.dining-table': 'missing-capability',
      'object.bench': 'missing-capability',
    });
    expect(projectRoomDetail(runtime.prisoners, 'canteen-short', { placedObjects: runtime.placedObjects })!.requirementSummary)
      .toEqual({ total: 4, objectRequirements: 2, satisfiedByCapability: 0, missingCapability: 2, notEvaluated: 2 });

    // And the list projection agrees, which is the number the Rooms panel reads
    // (`unfinishedRoomIds` filters on `missingCapability > 0`).
    const row = projectRoomList(runtime.prisoners, {}, { placedObjects: runtime.placedObjects })
      .rooms.rows.find((candidate) => candidate.instanceId === 'canteen-short')!;
    expect(row.requirementSummary.missingCapability).toBe(2);
  });

  it('reads the same canteen finished once the authored two and four stand in it', () => {
    const runtime = furnish([FULL_CANTEEN]);
    expect(statuses(runtime, 'canteen-full')).toEqual({
      'object.dining-table': 'satisfied-by-capability',
      'object.bench': 'satisfied-by-capability',
    });
  });

  it('counts only the objects inside the room\'s own rectangle', () => {
    // Both canteens in one prison. The short one is one table and one bench
    // short-of-quantity while six more of the same objects stand 12 tiles away,
    // so a count that forgot the rectangle would call it finished.
    const runtime = furnish([SHORT_CANTEEN, FULL_CANTEEN]);
    expect(statuses(runtime, 'canteen-short')).toEqual({
      'object.dining-table': 'missing-capability',
      'object.bench': 'missing-capability',
    });
    expect(statuses(runtime, 'canteen-full')).toEqual({
      'object.dining-table': 'satisfied-by-capability',
      'object.bench': 'satisfied-by-capability',
    });
  });

  /**
   * Substitution: an object satisfies a requirement when its own capabilities
   * cover the required object's. That rule is not new here -- it is what
   * `src/simulation/construction/definition.ts` states about the buildable rows
   * and calls "the containment rule doing its job" -- and #528 is about the
   * *count*, so these pin that counting did not quietly change the rule.
   */
  it('counts an object whose capabilities cover the required one\'s, in both directions', () => {
    const runtime = furnish([
      // Four benches, no chair. `object.bench` is `['seating', 'recreation']`
      // and `object.chair` is `['seating']`, so each bench covers a chair.
      {
        instanceId: 'classroom-benches',
        roomCatalogId: 'room.classroom',
        anchorTile: TILE(2, 2),
        width: 6,
        height: 5,
        objects: [
          ['object.bookshelf', TILE(2, 2)],
          ['object.bench', TILE(2, 3)],
          ['object.bench', TILE(4, 3)],
          ['object.bench', TILE(2, 4)],
          ['object.bench', TILE(4, 4)],
        ],
      },
      // One bench where four chairs are asked for: covered, and not enough.
      {
        instanceId: 'classroom-one-bench',
        roomCatalogId: 'room.classroom',
        anchorTile: TILE(10, 2),
        width: 6,
        height: 5,
        objects: [
          ['object.bookshelf', TILE(10, 2)],
          ['object.bench', TILE(10, 3)],
        ],
      },
      // A security console covers a desk (`['surveillance', 'workstation']`
      // over `['workstation']`)...
      {
        instanceId: 'reception-console',
        roomCatalogId: 'room.reception',
        anchorTile: TILE(2, 10),
        width: 6,
        height: 5,
        objects: [
          ['object.security-console', TILE(2, 10)],
          ['object.chair', TILE(2, 11)],
          ['object.chair', TILE(3, 11)],
        ],
      },
      // ...and a desk does not cover a security console, for want of
      // `'surveillance'`. Two desks, so this cannot pass on quantity either.
      {
        instanceId: 'security-office-desks',
        roomCatalogId: 'room.security-office',
        anchorTile: TILE(10, 10),
        width: 6,
        height: 5,
        objects: [
          ['object.desk', TILE(10, 10)],
          ['object.desk', TILE(12, 10)],
        ],
      },
    ]);

    expect(statuses(runtime, 'classroom-benches')).toEqual({
      'object.bookshelf': 'satisfied-by-capability',
      'object.chair': 'satisfied-by-capability',
    });
    expect(statuses(runtime, 'classroom-one-bench')).toEqual({
      'object.bookshelf': 'satisfied-by-capability',
      'object.chair': 'missing-capability',
    });
    expect(statuses(runtime, 'reception-console')).toEqual({
      'object.desk': 'satisfied-by-capability',
      'object.chair': 'satisfied-by-capability',
    });
    expect(statuses(runtime, 'security-office-desks')).toEqual({
      'object.security-console': 'missing-capability',
    });
  });

  /**
   * The documented fallback, and the reason the fix is not a regression for a
   * save that predates room bounds: with nothing to count, the projection
   * answers from the instance's capability list exactly as it did before #528.
   * Both halves are asserted, because "the fallback exists" and "the fallback is
   * the weaker answer" are different claims.
   */
  it('falls back to the capability list when it is handed nothing to count', () => {
    const runtime = furnish([SHORT_CANTEEN]);

    // No `placedObjects` option: the same short canteen reads finished, which is
    // precisely the pre-#528 answer and precisely why the worker supplies it.
    const withoutObjects = projectRoomDetail(runtime.prisoners, 'canteen-short')!;
    expect(withoutObjects.requirements.filter((requirement) => requirement.type === 'object').map((requirement) => requirement.status))
      .toEqual(['satisfied-by-capability', 'satisfied-by-capability']);

    // And an instance with no recorded rectangle -- a V4 save's shape -- takes
    // the same path even when the objects are supplied, because nothing can be
    // attributed to a room whose rectangle is unknown.
    runtime.prisoners.roomInstances.register({
      instanceId: 'canteen-boundless',
      roomCatalogId: 'room.canteen',
      anchorTile: TILE(8, 8) as never,
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: ['dining', 'recreation', 'seating'],
    });
    expect(statuses(runtime, 'canteen-boundless')).toEqual({
      'object.dining-table': 'satisfied-by-capability',
      'object.bench': 'satisfied-by-capability',
    });
  });

  it('is what the worker actually asks for, so a real session counts', () => {
    // The wiring and not the rule: `projection-catalog.ts` must hand the
    // registry over, or every session a player runs takes the fallback above and
    // #528 is unfixed on screen while every test here passes.
    const runtime = furnish([SHORT_CANTEEN]);

    const detail = PROJECTION_CATALOG['hud/room-detail'].project(runtime, 0, {
      target: { kind: 'id', id: 'canteen-short' },
    }).view as unknown as RoomDetailViewModel | undefined;
    expect(detail?.requirementSummary.missingCapability).toBe(2);

    const list = PROJECTION_CATALOG['hud/room-list'].project(runtime, 0, {}).view as unknown as RoomListViewModel;
    expect(list.rooms.rows.find((row) => row.instanceId === 'canteen-short')?.requirementSummary.missingCapability).toBe(2);
  });
});

describe('staff', () => {
  it('projects real roles, assignments and coverage', () => {
    const runtime = runScenario();
    const staff = projectStaff(
      { staff: runtime.securityGuards, deployment: runtime.deploymentSystem, patrol: runtime.patrolSystem },
      runtime.kernel.tick,
    );

    expect(staff.roster.total).toBe(5);
    expect(staff.roster.rows.every((row) => row.staffRoleId === 'staff-role.guard')).toBe(true);
    expect(staff.roster.rows[0]).toMatchObject({ department: 'security', baseSecurityClearance: 5 });
    expect(staff.roster.rows[0]?.permissions).toEqual(['security-wing']);

    // Every catalog role appears, so a HUD row never appears and vanishes.
    expect(staff.countsByRoleId).toHaveLength(8);
    expect(staff.countsByRoleId.find((entry) => entry.staffRoleId === 'staff-role.guard')?.count).toBe(5);
    expect(staff.countsByRoleId.find((entry) => entry.staffRoleId === 'staff-role.nurse')?.count).toBe(0);

    expect(staff.countsByDeploymentPhase.map((entry) => entry.deploymentPhase)).toEqual([
      'unassigned',
      'travelling',
      'on-post',
      'on-search',
    ]);
    expect(staff.countsByDeploymentPhase.reduce((sum, entry) => sum + entry.count, 0)).toBe(5);

    // Three sectors: the scenario's two, plus the derived default every session
    // carries (ADR 0036), which asks for one guard exactly as those two do.
    expect(staff.coverage.map((entry) => entry.sectorId)).toEqual(['sector-a', 'sector-b', 'security-sector.prison']);
    for (const entry of staff.coverage) {
      expect(entry.required).toBe(1);
      expect(entry.shortage).toBe(Math.max(0, entry.required - entry.assigned));
    }
    expect(staff.patrolMetrics).toEqual(runtime.patrolSystem.getMetrics());
    expect(staff.deploymentMetrics).toEqual(runtime.deploymentSystem.getMetrics());
  });

  it('works with no deployment or patrol system wired', () => {
    const runtime = runScenario();
    const staff = projectStaff({ staff: runtime.securityGuards }, runtime.kernel.tick);
    expect(staff.coverage).toEqual([]);
    expect(staff.patrolMetrics).toBeUndefined();
    expect(staff.totals.hired).toBe(5);
  });
});

describe('security', () => {
  it('projects sectors, their doors, patrol routes and staffing', () => {
    const runtime = runScenario();
    const security = projectSecurity(
      {
        sectors: runtime.securitySectors,
        doors: runtime.navigation.doors,
        staff: runtime.securityGuards,
        deployment: runtime.deploymentSystem,
        patrol: runtime.patrolSystem,
        incidents: runtime.incidents,
      },
      runtime.kernel.tick,
    );

    // The scenario's two, plus the derived default every session carries
    // (ADR 0036). It has no doors and no patrol route, which is what the
    // assertions on `security.sectors[2]` below say.
    expect(security.sectors.map((sector) => sector.sectorId)).toEqual(['sector-a', 'sector-b', 'security-sector.prison']);
    const sectorA = security.sectors[0]!;
    expect(sectorA.controlState).toBe(runtime.securitySectors.getControlState('sector-a'));
    expect(sectorA.doors.map((door) => door.doorId)).toEqual(['door-1']);
    expect(sectorA.doors[0]).toMatchObject({ state: 'open', requiredSecurityClearance: 0 });
    expect(sectorA.patrol).toMatchObject({ hasRoute: true, waypointCount: 2, expectedLoopTicks: 40 });
    expect(security.sectors[1]?.patrol.hasRoute).toBe(false);
    expect(security.sectors[2]).toMatchObject({ sectorId: 'security-sector.prison', gradeId: 'grade.general', controlState: 'normal' });
    expect(security.sectors[2]?.doors).toEqual([]);
    expect(security.sectors[2]?.patrol.hasRoute).toBe(false);

    expect(sectorA.staffing.assigned).toBe(
      staffAssignedTo(runtime, 'sector-a'),
    );
    expect([...sectorA.staffing.guardEntityIds].sort((left, right) => left - right)).toEqual(sectorA.staffing.guardEntityIds);
  });

  it('projects the real access policy vocabulary and no invented grades', () => {
    const runtime = runScenario();
    const security = projectSecurity({ sectors: runtime.securitySectors }, runtime.kernel.tick);

    expect(security.accessPolicy.prisonerClassifications.map((entry) => entry.classificationGroupId)).toEqual([
      'general-population',
      'high-risk',
    ]);
    expect(security.accessPolicy.grades.map((grade) => grade.gradeId)).toEqual([
      'grade.administrative',
      'grade.general',
      'grade.high-security',
      'grade.medical',
      'grade.staff-only',
    ]);
    expect(security.accessPolicy.staffRoles).toHaveLength(8);
  });

  it('reflects a real lockdown cascade rather than a parallel flag', () => {
    const runtime = runScenario();
    runtime.securitySectors.setControlState('sector-a', 'lockdown');
    const security = projectSecurity(
      { sectors: runtime.securitySectors, doors: runtime.navigation.doors },
      runtime.kernel.tick,
    );
    expect(security.sectors[0]?.controlState).toBe('lockdown');
    expect(security.sectors[0]?.doors[0]?.state).toBe('locked');
    expect(security.totals.sectorsUnderLockdown).toBe(1);
  });
});

function staffAssignedTo(runtime: SimulationRuntime, sectorId: string): number {
  let count = 0;
  for (const guardId of runtime.securityGuards.allGuardIds()) {
    if (runtime.securityGuards.getSectorId(guardId) === sectorId && runtime.securityGuards.getDeploymentPhase(guardId) !== 'unassigned') count += 1;
  }
  return count;
}

describe('contraband', () => {
  it('projects search orders, policy and metrics from the real search system', () => {
    const runtime = runScenario();
    const contraband = projectContraband({
      searchSystem: runtime.searchSystem,
      confiscations: runtime.confiscations,
      intelligence: runtime.intelligence,
      informants: runtime.informants,
      searchPolicies: runtime.searchPolicies,
    });

    // All four since #552: a session ships one policy per scope, and the
    // scenario replaces the `'cell'` one rather than appending a second (which
    // `findPolicy` would never have reached). The permille below is still the
    // scenario's own 0.5 and not a default -- `default-search-policies.ts`
    // authors 0.7 for `'cell'` -- so this case still distinguishes the policy
    // the fixture chose from the one the session ships.
    expect(contraband.policies.map((policy) => policy.scope)).toEqual(['cell', 'delivery', 'person', 'sector']);
    expect(contraband.policies[0]?.baseDetectionProbability.permille).toBe(500);
    expect(contraband.metrics).toMatchObject(runtime.searchSystem.getMetrics());
    for (const order of contraband.searchOrders) {
      expect(['queued', 'travelling', 'searching']).toContain(order.state);
      expect(order.targetCount).toBeGreaterThan(0);
    }
  });

  it('projects discovered evidence and suspicion, never the concealed ground truth', () => {
    const runtime = runScenario();
    const contraband = projectContraband({
      searchSystem: runtime.searchSystem,
      confiscations: runtime.confiscations,
      intelligence: runtime.intelligence,
      searchPolicies: runtime.searchPolicies,
    });

    expect(contraband.discovered.total).toBe(runtime.confiscations.all().length);
    for (const found of contraband.discovered.rows) {
      expect(runtime.contraband.get(found.itemId)?.state).toBe('confiscated');
      expect(found.categoryNameKey).toMatch(/^contraband\./);
    }

    // Every still-concealed item must be absent from the projection.
    const projectedIds = new Set(contraband.discovered.rows.map((row) => row.itemId));
    for (const item of runtime.contraband.all()) {
      if (item.state === 'concealed') expect(projectedIds.has(item.id)).toBe(false);
    }

    expect(contraband.intelligence.map((record) => record.recordId)).toEqual(
      runtime.intelligence.all().map((record) => record.id),
    );
    for (const record of contraband.intelligence) {
      expect(record.confidence.permille).toBeGreaterThan(0);
      expect(record.confidence.permille).toBeLessThanOrEqual(1_000);
    }

    expect(contraband.discoveredByCategoryId).toHaveLength(5);
    expect(contraband.discoveredByCategoryId.reduce((sum, entry) => sum + entry.count, 0)).toBe(contraband.discovered.total);
  });
});

describe('incidents', () => {
  function withIncidents(runtime: SimulationRuntime): SimulationRuntime {
    // Opened and transitioned through the real IncidentLog lifecycle, not
    // hand-assembled records: an illegal transition would throw here.
    runtime.incidents.open(
      {
        id: 'incident.riot.probe',
        type: 'riot',
        sectorId: 'sector-a',
        participantIds: [7, 3, 11],
        severity: 8,
        causeFactors: [{ kind: 'sustained-sector-risk', value: 0.82 }],
      },
      runtime.kernel.tick,
    );
    runtime.incidents.open(
      {
        id: 'incident.assault.probe',
        type: 'assault',
        sectorId: 'sector-b',
        participantIds: [2],
        severity: 3,
        causeFactors: [{ kind: 'needs-pressure', value: 0.4 }],
      },
      runtime.kernel.tick,
    );
    runtime.incidents.transition('incident.assault.probe', 'notified', runtime.kernel.tick + 1);
    runtime.incidents.transition('incident.assault.probe', 'responding', runtime.kernel.tick + 2);
    runtime.incidents.transition('incident.assault.probe', 'resolved', runtime.kernel.tick + 3, {
      injuredEntityIds: [2],
      propertyDamage: 1,
      escaped: false,
    });
    return runtime;
  }

  it('projects an incident the simulation triggered on its own', () => {
    // The scenario's gang grudge fires a real `gang-retaliation` through
    // `IncidentTriggerSystem` within this tick budget -- so the panel is
    // proven against an incident the simulation produced, not only against
    // ones a test opened.
    const runtime = runScenario();
    const incidents = projectIncidents({ incidents: runtime.incidents }, runtime.kernel.tick);
    const triggered = incidents.active.find((incident) => incident.type === 'gang-retaliation');
    expect(triggered).toBeDefined();
    expect(triggered!.incidentId).toBe('incident.gang-retaliation.1');
    expect(triggered!.sectorId).toBe('sector-a');
    expect(triggered!.severity).toBeGreaterThan(0);
    expect(runtime.incidentTriggerSystem.getMetrics().retaliationsTriggered).toBeGreaterThan(0);
  });

  it('separates active from terminal incidents and summarises outcomes', () => {
    const runtime = withIncidents(runScenario());
    const incidents = projectIncidents({ incidents: runtime.incidents, response: runtime.incidentResponseSystem }, runtime.kernel.tick + 10);

    expect(incidents.active.map((incident) => incident.incidentId)).toEqual([
      'incident.gang-retaliation.1',
      'incident.riot.probe',
    ]);
    expect(incidents.resolved.rows.map((incident) => incident.incidentId)).toEqual(['incident.assault.probe']);
    expect(incidents.summary).toMatchObject({ total: 3, stillOpen: 2, resolved: 1, lapsed: 0, totalInjured: 1, escapes: 0 });
    expect(incidents.countsByState.map((entry) => entry.state)).toEqual(['active', 'notified', 'responding', 'resolved', 'lapsed']);
    expect(incidents.countsByType.reduce((sum, entry) => sum + entry.count, 0)).toBe(3);

    const riot = incidents.active.find((incident) => incident.incidentId === 'incident.riot.probe')!;
    expect(riot).toMatchObject({ type: 'riot', sectorId: 'sector-a', severity: 8, participantCount: 3, terminal: false });
    expect(riot.severityBar).toEqual(toBoundedValue(8, 10));
    expect(riot.ageTicks).toBe(10);
    // A literal, not `runtime.incidentResponseSystem.requiredResponderCount(8)`
    // (#416). Asking the production code what it thinks the answer is and then
    // asserting the projection agrees holds for every implementation of the
    // rule, including a wrong one -- the projection reads that exact method, so
    // the two sides were one side. `respondersPerSeverityPoint` is 0.5 and the
    // requirement rounds up, so a severity-8 riot needs four; the rule itself
    // is pinned in `tests/unit/incident-response.test.ts`, and what belongs
    // here is that the projection publishes it rather than something else.
    expect(riot.requiredResponders).toBe(4);
  });

  it('never exposes the hidden cause factors that produced an incident', () => {
    const runtime = withIncidents(runScenario());
    const projected = JSON.stringify({
      list: projectIncidents({ incidents: runtime.incidents }, runtime.kernel.tick),
      detail: projectIncidentDetail({ incidents: runtime.incidents }, 'incident.riot.probe', runtime.kernel.tick),
    });
    expect(projected).not.toContain('causeFactors');
    expect(projected).not.toContain('sustained-sector-risk');
    expect(projected).not.toContain('0.82');
  });

  it('projects the detail view with a sorted participant list and a chronological timeline', () => {
    const runtime = withIncidents(runScenario());
    const detail = projectIncidentDetail({ incidents: runtime.incidents }, 'incident.assault.probe', runtime.kernel.tick + 5)!;

    expect(detail.participantEntityIds).toEqual([2]);
    expect(detail.timeline.map((entry) => entry.state)).toEqual(['active', 'notified', 'responding', 'resolved']);
    expect(detail.timeline.map((entry) => entry.atTick)).toEqual([TICKS, TICKS + 1, TICKS + 2, TICKS + 3]);
    expect(detail.outcome).toMatchObject({ injuredCount: 1, propertyDamage: 1, escaped: false });
    expect(detail.injuredEntityIds).toEqual([2]);
  });

  it('returns undefined for an unknown incident id', () => {
    const runtime = runScenario();
    expect(projectIncidentDetail({ incidents: runtime.incidents }, 'incident.nope', runtime.kernel.tick)).toBeUndefined();
  });
});
