import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { PrisonerColdState, PrisonerRecordComponent, classificationGroupIndex, intakeStageIndex } from '../../src/simulation/prisoners/components';
import { IntakeSystem } from '../../src/simulation/prisoners/intake-system';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

function makeKernel() {
  return new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
}

describe('IntakeSystem: deterministic stage-by-stage pipeline', () => {
  it('advances one stage per scheduled tick: queued -> reception -> classification -> accommodation-assignment -> completed', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 0 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);

    expect(fixture.prisoners.records.intakeStage[index]).toBe(0); // 'queued'

    // IntakeSystem fires every 5 ticks starting at tick 0: each batch of 5
    // `kernel.step()` calls processes exactly one firing (at ticks 0, 5, 10, 15).
    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(1); // 'reception'

    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(2); // 'classification'

    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(3); // 'accommodation-assignment'

    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(4); // 'completed'
    expect(fixture.prisoners.coldState.getAccommodation(entityId)).toBeDefined();
    expect(fixture.prisoners.intakeSystem.getMetrics().completedCount).toBe(1);
  });

  it('routes the arrival to the room type its own classification group resolves to, not merely to some free room', () => {
    // The pipeline test above ends on `toBeDefined()`, which asks only that
    // *an* accommodation was written. That is exactly the assertion an
    // intake which never read `classificationGroupIndex` -- and handed
    // `DEFAULT_ACCOMMODATION_POLICY` a hard-coded 'general-population' --
    // would still satisfy, because a general-population cell is free and
    // gets assigned. So the identity of the instance is asserted here.
    //
    // The fixture makes that identity readable: it registers a trailing
    // slice of the cell block's cell tiles -- `Math.floor(40%)` of them, at
    // least one -- as `room.solitary-cell` instances named
    // `solitary-cell-<n>`, and every earlier tile as a `room.cell` instance
    // named `cell-<n>`. So the instance id alone says which room-catalog id
    // the policy was asked for, and `DEFAULT_ACCOMMODATION_POLICY` maps
    // 'high-risk' to `room.solitary-cell` and every other group to
    // `room.cell`.
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    // `classifyPrisoner` scores a sentence at or over 200_000 ticks as +1
    // and adds `min(2, max(0, priorIncidents))`, then shifts the total by
    // one screening draw in {-1, 0, +1} and clamps to 0..3; 'high-risk' is
    // riskTier 3. The first arrival therefore scores the maximum 3 and lands
    // high-risk unless the draw is -1 -- which under this file's fixed seed
    // it is not, and the group assertions below are what make that visible
    // rather than assumed. The second scores 0, so no draw can lift it out
    // of general-population.
    const highRisk = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 250_000, priorIncidents: 4 }, fixture.originTile);
    const generalPopulation = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 0 }, fixture.originTile);

    // Four firings (ticks 0, 5, 10, 15) carry both arrivals from 'queued' to
    // 'completed'; `update` advances every prisoner entity on each firing,
    // so two arrivals take no longer than one.
    for (let i = 0; i < 20; i += 1) kernel.step();

    const highRiskIndex = fixture.prisoners.entityStore.getIndex(highRisk);
    const generalPopulationIndex = fixture.prisoners.entityStore.getIndex(generalPopulation);

    expect(fixture.prisoners.records.classificationGroupIndex[highRiskIndex]).toBe(classificationGroupIndex('high-risk'));
    expect(fixture.prisoners.records.classificationGroupIndex[generalPopulationIndex]).toBe(classificationGroupIndex('general-population'));
    expect(fixture.prisoners.records.intakeStage[highRiskIndex]).toBe(intakeStageIndex('completed'));
    expect(fixture.prisoners.records.intakeStage[generalPopulationIndex]).toBe(intakeStageIndex('completed'));

    // `findAvailable` takes the first free instance in ascending instance-id
    // order, so in a prison that starts empty, with one arrival per group,
    // each takes its own group's lowest instance id.
    expect(fixture.prisoners.coldState.getAccommodation(highRisk)).toBe('solitary-cell-0');
    expect(fixture.prisoners.coldState.getAccommodation(generalPopulation)).toBe('cell-0');

    // The ids above are only shorthand for the room type as long as the
    // registry agrees, so ask it directly too.
    expect(fixture.prisoners.roomInstances.getById('solitary-cell-0')?.roomCatalogId).toBe('room.solitary-cell');
    expect(fixture.prisoners.roomInstances.getById('cell-0')?.roomCatalogId).toBe('room.cell');
  });

  it('classification assigns a risk tier and sets sentenceEndTick from the submitted sentence length', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 5_000, priorIncidents: 2 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);

    for (let i = 0; i < 100; i += 1) kernel.step();

    expect(fixture.prisoners.records.riskTier[index]).toBeGreaterThanOrEqual(0);
    expect(fixture.prisoners.records.sentenceEndTick[index]).toBeGreaterThan(5_000); // classification happened at some tick > 0
  });

  it('leaves accommodation-assignment as a retry-able backlog, not a hard failure, once every cell is occupied', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 2, capacity: 10 }); // only 2 general-population... minus the 10% solitary reservation, effectively fewer
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const generalCapacity = fixture.generalCellTiles.length;
    const entityIds = Array.from({ length: generalCapacity + 1 }, () =>
      fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 100, priorIncidents: 0 }, fixture.originTile),
    );

    for (let i = 0; i < 200; i += 1) kernel.step();

    const stages = entityIds.map((id) => fixture.prisoners.records.intakeStage[fixture.prisoners.entityStore.getIndex(id)]);
    const completed = stages.filter((s) => s === 4).length;
    const waiting = stages.filter((s) => s === 3).length;

    expect(completed).toBe(generalCapacity); // exactly as many as there are cells
    expect(waiting).toBe(1); // the overflow prisoner waits, is not marked 'failed'
    expect(fixture.prisoners.intakeSystem.getMetrics().accommodationBacklogTicks).toBeGreaterThan(0);
    expect(fixture.prisoners.intakeSystem.getMetrics().failedCount).toBe(0);
  });

  it('marks intake as structurally failed when no instance of the required room type exists at all (not merely full)', () => {
    const capacity = 10;
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);
    const records = new PrisonerRecordComponent(capacity);
    const coldState = new PrisonerColdState();
    const roomInstances = new RoomInstanceRegistry(); // deliberately empty -- no 'room.cell' instance registered at all
    const intakeSystem = new IntakeSystem(store, query, records, coldState, roomInstances);

    const kernel = makeKernel();
    kernel.registerSystem(intakeSystem);

    const entityId = store.spawn();
    bitset.add(store.getIndex(entityId), 0);
    intakeSystem.submitIntake(entityId, { sentenceLengthTicks: 100, priorIncidents: 0 });

    for (let i = 0; i < 20; i += 1) kernel.step();

    const index = store.getIndex(entityId);
    expect(records.intakeStage[index]).toBe(5); // 'failed'
    expect(intakeSystem.getMetrics().failedCount).toBe(1);
    expect(intakeSystem.getMetrics().accommodationBacklogTicks).toBe(0); // structural failure, not backlog
  });

  describe('shared cells: allocation consults who is already in the room (#79)', () => {
    /**
     * A two-cell prison whose cells actually hold two people each.
     *
     * Built here rather than through `buildPrisonerScenarioFixture` because
     * every cell that fixture registers is `capacity: 1`, and the live
     * registrar is worse: `RoomZoningService.zone` registers every instance
     * with `capacity: 0` and no object capabilities, so
     * `occupancyOf >= capacity` is `0 >= 0` and neither `findAvailable` nor
     * `findBestAvailable` can succeed through the shipped path at all.
     * Co-occupancy is only reachable by registering it, which is what this
     * does -- and the case immediately below is the executable statement of
     * that precondition, so it does not have to be taken on trust from a
     * comment.
     */
    function sharedCellPrison() {
      const capacity = 8;
      const store = new EntityStore(capacity);
      const bitset = new ComponentBitset(capacity);
      const query = new EntityQuery(store, bitset);
      query.mask.require(0);
      const records = new PrisonerRecordComponent(capacity);
      const coldState = new PrisonerColdState();
      const roomInstances = new RoomInstanceRegistry();
      // Registered in reverse id order on purpose: `allByRoomCatalogId`
      // sorts, so registration order must not reach the outcome.
      roomInstances.register({ instanceId: 'shared-b', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(1), y: tileCoordinate(0) }, capacity: 2, objectCapabilities: ['sleep-surface'] });
      roomInstances.register({ instanceId: 'shared-a', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) }, capacity: 2, objectCapabilities: ['sleep-surface'] });
      const intakeSystem = new IntakeSystem(store, query, records, coldState, roomInstances);

      /** Puts a prisoner of a chosen risk tier into a cell, the way a completed intake would have. */
      const seatResident = (instanceId: string, riskTier: number) => {
        const entityId = store.spawn();
        const index = store.getIndex(entityId);
        records.riskTier[index] = riskTier;
        records.intakeStage[index] = intakeStageIndex('completed');
        roomInstances.assign(instanceId, entityId);
        coldState.setAccommodation(entityId, instanceId);
        return entityId;
      };

      const admit = (input: { sentenceLengthTicks: number; priorIncidents: number }) => {
        const entityId = store.spawn();
        bitset.add(store.getIndex(entityId), 0);
        intakeSystem.submitIntake(entityId, input);
        return entityId;
      };

      return { store, records, coldState, roomInstances, intakeSystem, seatResident, admit };
    }

    const LOW_RISK = { sentenceLengthTicks: 100, priorIncidents: 0 };

    it('houses nobody at all through the shipped session path, because a zoned room has no capacity', () => {
      /*
       * The precondition every case below is built around, end to end
       * through the real session rather than asserted in prose.
       *
       * This became testable with #312 and complete with #261 step 4. Before
       * the Rooms tab, `ZoneRoom` had no producer, so no room instance could be
       * created by anything except the restore path and there was no live
       * prison to observe -- the reason the original version of this suite
       * could only state the precondition in a comment. A player can now zone
       * and un-zone rooms, and since the Intake panel a player can admit into
       * them, so both halves of the shipped path exist; what has *not* changed
       * is what those instances can hold.
       *
       * Measured here, not assumed: both cells zone successfully through
       * `RoomZoningService` (the Rooms tab's only consumer), both register
       * with `capacity: 0` and no object capabilities, and the arrival that
       * follows is therefore never housed. `room.solitary-cell` is zoned
       * alongside `room.cell` so the outcome does not depend on which
       * classification group the RNG puts the arrival in: both targets
       * exist, so the stage stays retryable rather than going to `'failed'`
       * for a structurally absent room type, and the backlog counter is the
       * one that moves.
       *
       * Which makes this a tripwire and not a restatement of
       * `rooms-zoning.test.ts`'s `capacity: 0` pin. That pin is about one
       * registration; this is about the consequence three systems later --
       * occupant-aware allocation (#79) cannot be exercised in a shipped
       * session, so every other case in this describe registers its
       * instances by hand. The day capacity is derived from placed objects
       * (ADR 0028), this case fails, and the failure is the notice that
       * ADR 0027's stated precondition has expired and #79 is now reachable
       * for real.
       */
      const runtime = createNewSimulationRuntime(7);
      const cell = runtime.roomZoning.zone({ roomCatalogId: 'room.cell', x: 2, y: 2, width: 3, height: 3 }, 0);
      const solitary = runtime.roomZoning.zone({ roomCatalogId: 'room.solitary-cell', x: 8, y: 2, width: 3, height: 3 }, 0);
      if (cell.kind !== 'zoned' || solitary.kind !== 'zoned') {
        throw new Error('both rooms must be accepted for this test to mean anything');
      }

      // Zoning worked. It is what a zoned room *holds* that is the problem.
      expect(cell.instance.capacity).toBe(0);
      expect(cell.instance.objectCapabilities).toEqual([]);
      expect(solitary.instance.capacity).toBe(0);
      expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(1);

      // So both queries the allocator has come back empty, with or without
      // the capability filter.
      expect(runtime.prisoners.roomInstances.findAvailable('room.cell')).toBeUndefined();
      expect(runtime.prisoners.roomInstances.findAvailable('room.cell', 'sleep-surface')).toBeUndefined();
      expect(
        runtime.prisoners.roomInstances.findBestAvailable('room.cell', () => 0, 'sleep-surface'),
      ).toBeUndefined();

      // Through the `AdmitPrisoner` command rather than `admitPrisoner`
      // directly, so "the shipped session path" in this test's name is the
      // whole route a player takes: #261 step 4 gave the command a producer,
      // and the boundary guard it added answers this prison's state rather
      // than refusing it -- an instance of an accommodation target exists, so
      // the admission is accepted and lands in the wait this case is about.
      runtime.kernel.submitCommand(
        'cmd-admit',
        runtime.kernel.expectedSequence,
        runtime.kernel.tick,
        packCommand({ type: 'AdmitPrisoner', ...LOW_RISK, x: 0, y: 0 }),
      );
      runtime.kernel.step();
      expect(runtime.refusals.count, 'a prison with a zoned cell must not refuse the admission').toBe(0);
      const arrival = runtime.prisoners.entityStore.getIdByIndex(0);
      for (let i = 0; i < 60; i += 1) runtime.kernel.step();

      const metrics = runtime.prisoners.intakeSystem.getMetrics();
      expect(runtime.prisoners.coldState.getAccommodation(arrival)).toBeUndefined();
      expect(metrics.completedCount).toBe(0);
      expect(metrics.failedCount).toBe(0);
      // Waiting, not failing: the room type exists, so retrying is correct
      // and the unmet demand is visible rather than swallowed.
      expect(metrics.accommodationBacklogTicks).toBeGreaterThan(0);
      expect(runtime.prisoners.roomInstances.occupancyOf(cell.instance.instanceId)).toBe(0);
      // And the registry refuses to be talked into it directly.
      expect(runtime.prisoners.roomInstances.assign(cell.instance.instanceId, arrival)).toBe(false);
    });

    it('routes a low-risk arrival away from the cell holding a maximum-security prisoner, even though that cell sorts first and has a free bed', () => {
      const prison = sharedCellPrison();
      prison.seatResident('shared-a', 3);

      // What the blind query still answers, so the difference is asserted
      // rather than described: 'shared-a' sorts first and has a free bed, and
      // an occupancy count is the only question it asks.
      expect(prison.roomInstances.findAvailable('room.cell', 'sleep-surface')?.instanceId).toBe('shared-a');

      const arrival = prison.admit(LOW_RISK);
      const kernel = makeKernel();
      kernel.registerSystem(prison.intakeSystem);
      for (let i = 0; i < 20; i += 1) kernel.step();

      const index = prison.store.getIndex(arrival);
      expect(prison.records.intakeStage[index]).toBe(intakeStageIndex('completed'));
      // `LOW_RISK` scores 0 and the screening draw is in {-1, 0, +1} clamped
      // to 0..3, so the arrival is tier 0 or 1 whatever the seed does -- a
      // distance of at least 2 from the tier-3 resident, and 0 from the
      // empty cell.
      expect(prison.records.riskTier[index]).toBeLessThanOrEqual(1);
      expect(prison.coldState.getAccommodation(arrival)).toBe('shared-b');
    });

    it('pairs like with like: the same arrival takes the cell whose occupant is closest in classification', () => {
      const prison = sharedCellPrison();
      prison.seatResident('shared-a', 3);
      prison.seatResident('shared-b', 0);

      const arrival = prison.admit(LOW_RISK);
      const kernel = makeKernel();
      kernel.registerSystem(prison.intakeSystem);
      for (let i = 0; i < 20; i += 1) kernel.step();

      expect(prison.coldState.getAccommodation(arrival)).toBe('shared-b');
    });

    it('is advisory, not a refusal: a poor pairing is still taken when it is the only bed left', () => {
      // Overriding and forbidding are ADR 0027's questions. Until one is
      // answered, allocation ranks and never refuses -- so a full prison
      // behaves exactly as it did, and this pins that no silent hard block
      // was introduced along the way.
      const prison = sharedCellPrison();
      prison.seatResident('shared-a', 3);
      prison.seatResident('shared-b', 3);
      prison.seatResident('shared-b', 3);

      const arrival = prison.admit(LOW_RISK);
      const kernel = makeKernel();
      kernel.registerSystem(prison.intakeSystem);
      for (let i = 0; i < 20; i += 1) kernel.step();

      expect(prison.records.intakeStage[prison.store.getIndex(arrival)]).toBe(intakeStageIndex('completed'));
      expect(prison.coldState.getAccommodation(arrival)).toBe('shared-a');
      expect(prison.intakeSystem.getMetrics().failedCount).toBe(0);
    });

    it('ignores an occupant that is no longer alive rather than reading a recycled slot', () => {
      // `RoomInstanceRegistry.release` is never called for a destroyed
      // prisoner (#31), so an occupant set can name an entity that no longer
      // exists, and `EntityStore.getIndex` masks without checking. Reading
      // that id's record would return whoever now holds the recycled index.
      // With the liveness filter the dead tier-3 resident contributes
      // nothing, so 'shared-a' rates 0 and wins the tie on instance id;
      // without it, it would rate 3 and the arrival would be sent to
      // 'shared-b'.
      const prison = sharedCellPrison();
      const dead = prison.seatResident('shared-a', 3);
      prison.store.destroy(dead);
      expect(prison.roomInstances.occupantsOf('shared-a')).toEqual([dead]);

      const arrival = prison.admit(LOW_RISK);
      const kernel = makeKernel();
      kernel.registerSystem(prison.intakeSystem);
      for (let i = 0; i < 20; i += 1) kernel.step();

      expect(prison.coldState.getAccommodation(arrival)).toBe('shared-a');
    });

    it('is deterministic: the same scenario twice, and reversed assignment order, place every arrival identically', () => {
      const placements = (reverseSeating: boolean) => {
        const prison = sharedCellPrison();
        const seats: readonly [string, number][] = reverseSeating
          ? [['shared-b', 0], ['shared-a', 3]]
          : [['shared-a', 3], ['shared-b', 0]];
        for (const [instanceId, riskTier] of seats) prison.seatResident(instanceId, riskTier);

        const arrivals = [prison.admit(LOW_RISK), prison.admit(LOW_RISK)];
        const kernel = makeKernel();
        kernel.registerSystem(prison.intakeSystem);
        for (let i = 0; i < 40; i += 1) kernel.step();
        return arrivals.map((id) => prison.coldState.getAccommodation(id));
      };

      expect(placements(false)).toEqual(placements(false));
      expect(placements(true)).toEqual(placements(false));
    });
  });

  it('starts an intake at "queued" whatever stage the slot already held', () => {
    // `submitIntake`'s own intake-stage write is the one reset-shaped write
    // the admission path had before #111's per-slot component reset landed,
    // and deleting it still survives the rest of the suite: `admitPrisoner`
    // resets the slot before calling here, and a never-occupied slot already
    // reads 'queued', so no admission can observe the write. `IntakeSystem`
    // is public on `PrisonerOperationsRuntime`, and this write is what makes
    // a caller that is *not* `admitPrisoner` start at the beginning of the
    // pipeline rather than wherever the slot was left. Nothing in `src/` is
    // such a caller today.
    const capacity = 4;
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);
    const records = new PrisonerRecordComponent(capacity);
    const intakeSystem = new IntakeSystem(store, query, records, new PrisonerColdState(), new RoomInstanceRegistry());

    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex('completed');

    intakeSystem.submitIntake(entityId, { sentenceLengthTicks: 100, priorIncidents: 0 });

    expect(records.intakeStage[index]).toBe(intakeStageIndex('queued'));
  });

  it('DEFECT (#169 item 3): re-submitting an already-housed prisoner leaves them occupying two cells', () => {
    // **This pins a defect, not an intention.** The test above records that
    // `submitIntake`'s stage write is what lets a caller which is *not*
    // `admitPrisoner` restart the pipeline, and that nothing in `src/` is
    // such a caller. #169 asks the question that leaves open: may
    // `submitIntake` be called for a prisoner who is already admitted?
    //
    // The method is `public`, takes an `EntityId`, and does exactly three
    // writes (`IntakeSystem.submitIntake`): sentence length, prior incidents,
    // and the stage. It checks nothing -- not liveness, not the stage it is
    // overwriting, not whether the prisoner already has a cell. So the
    // answer today is "yes, and here is what that does", which is what this
    // case shows: the pipeline runs a second time and `assign` puts the same
    // prisoner in a second room instance while the first still holds them.
    //
    // The first occupancy is then unreachable. `coldState.getAccommodation`
    // points only at the newer cell, and `RoomInstanceRegistry.release` has
    // no caller anywhere in `src/` (#31), so that bed is occupied by someone
    // who does not live there for the rest of the session -- a capacity leak
    // that no later intake can recover.
    //
    // Whether the fix is to guard `submitIntake`, to release the existing
    // accommodation first, or to make the method private and give re-intake
    // its own entry point is a design decision about the intake pipeline's
    // contract, and it is stated at Proposed in ADR 0026 rather than settled
    // here. Whichever is taken changes an assertion below.
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 0 }, fixture.originTile);
    for (let i = 0; i < 20; i += 1) kernel.step();

    const firstCell = fixture.prisoners.coldState.getAccommodation(entityId);
    expect(firstCell).toBeDefined();
    expect(fixture.prisoners.roomInstances.instancesOccupiedBy(entityId)).toEqual([firstCell]);
    expect(fixture.prisoners.intakeSystem.getMetrics().completedCount).toBe(1);

    // A second intake for the same, already-housed prisoner. Nothing refuses.
    fixture.prisoners.intakeSystem.submitIntake(entityId, { sentenceLengthTicks: 250_000, priorIncidents: 4 });
    expect(fixture.prisoners.records.intakeStage[fixture.prisoners.entityStore.getIndex(entityId)]).toBe(intakeStageIndex('queued'));

    for (let i = 0; i < 20; i += 1) kernel.step();

    const secondCell = fixture.prisoners.coldState.getAccommodation(entityId);
    expect(secondCell).toBeDefined();
    expect(secondCell).not.toBe(firstCell);

    // DEFECT: one prisoner, two beds. The registry is the authority on
    // occupancy and it says both.
    expect(fixture.prisoners.roomInstances.instancesOccupiedBy(entityId)).toEqual([firstCell, secondCell].sort());
    expect(fixture.prisoners.roomInstances.occupancyOf(firstCell!)).toBe(1);
    // DEFECT: and the metric counts one prisoner as two completed intakes.
    expect(fixture.prisoners.intakeSystem.getMetrics().completedCount).toBe(2);
  });
});
