import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import {
  CLASSIFICATION_GROUP_IDS,
  PrisonerColdState,
  PrisonerRecordComponent,
  classificationGroupIndex,
  intakeStageFromIndex,
  intakeStageIndex,
} from '../../src/simulation/prisoners/components';
import { DEFAULT_ACCOMMODATION_POLICY, IntakeSystem } from '../../src/simulation/prisoners/intake-system';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';
import { wallRoomPerimeter } from '../helpers/room-walls';

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
      roomInstances.register({ instanceId: 'shared-b', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(1), y: tileCoordinate(0) }, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
      roomInstances.register({ instanceId: 'shared-a', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) }, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
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

    it('houses nobody through the shipped session path while the cell is unfurnished, because capacity comes from the objects standing in it', () => {
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
       * Which makes this a statement about the consequence three systems
       * later, and not a restatement of `rooms-zoning.test.ts`'s `capacity: 0`
       * pin -- that pin is about one registration.
       *
       * ## This case was written as a tripwire, and it could not fire
       *
       * The sentence that used to end here read: *"The day capacity is derived
       * from placed objects (ADR 0028), this case fails, and the failure is the
       * notice that ADR 0027's stated precondition has expired and #79 is now
       * reachable for real."*
       *
       * **That day came, and this case did not fail.** ADR 0028 is Accepted and
       * its phase 1 shipped; capacity is derived from placed objects today
       * (`RoomCapacityResolver`, `src/simulation/objects/room-capacity.ts`).
       * The notice never arrived, because the trigger was not expressible in
       * this fixture: it zones an *empty* rectangle, and an empty rectangle
       * holds nobody under both designs -- before ADR 0028 because no room had
       * capacity, after it because there is nothing standing in this one. The
       * assertions below were never the ones that would move.
       *
       * The lesson, for whoever writes the next tripwire: **a tripwire has to
       * exercise the input the change is about.** A test that pins the value
       * `0` cannot tell "0 because the mechanism is absent" from "0 because the
       * mechanism ran and this input sums to nothing", and only the first of
       * those was supposed to be permanent. What would have fired is a case
       * zoning a rectangle with a bed in it -- and that case now exists, at
       * integration level, asserting the opposite outcome in literals:
       * `tests/integration/object-placement-loop.test.ts` pins
       * `residentCapacity: 1` and `objectCapabilities: ['sleep-surface']` for a
       * furnished cell, houses an admitted prisoner in it, and measures the
       * state income the occupied place earns as `+300` over one in-game day.
       *
       * So what this case still guards is narrower than its old title claimed
       * and is permanently true: an **unfurnished** zoned cell accommodates
       * nobody, and the arrival waits rather than failing. Occupant-aware
       * allocation (#79) *is* now reachable in a shipped session -- which is
       * why the other cases in this describe, which register their instances
       * by hand, are a convenience rather than the only available route.
       */
      const runtime = createNewSimulationRuntime(7);
      // Walled first: `zone` refuses an `enclosed` room whose perimeter is
      // open, and both of these author that requirement. The subject here is
      // what a zoned room *holds*, so the walls are setup rather than the
      // thing under test.
      wallRoomPerimeter(runtime.world, { x: 2, y: 2, width: 3, height: 3 });
      wallRoomPerimeter(runtime.world, { x: 8, y: 2, width: 3, height: 3 });
      const cell = runtime.roomZoning.zone({ roomCatalogId: 'room.cell', x: 2, y: 2, width: 3, height: 3 }, 0);
      const solitary = runtime.roomZoning.zone({ roomCatalogId: 'room.solitary-cell', x: 8, y: 2, width: 3, height: 3 }, 0);
      if (cell.kind !== 'zoned' || solitary.kind !== 'zoned') {
        throw new Error('both rooms must be accepted for this test to mean anything');
      }

      // Zoning worked. It is what a zoned room *holds* that is the problem.
      expect(cell.instance.residentCapacity).toBe(0);
      expect(cell.instance.concurrentUseCapacity).toBe(0);
      expect(cell.instance.objectCapabilities).toEqual([]);
      expect(solitary.instance.residentCapacity).toBe(0);
      expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(1);

      // So both queries the allocator has come back empty, with or without
      // the capability filter.
      expect(runtime.prisoners.roomInstances.findAvailableResidence('room.cell')).toBeUndefined();
      expect(runtime.prisoners.roomInstances.findAvailableResidence('room.cell', 'sleep-surface')).toBeUndefined();
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
      expect(prison.roomInstances.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('shared-a');

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
      /*
       * `RoomInstanceRegistry.release` is never called for a destroyed
       * prisoner (#31), so an occupant set can name an entity that no longer
       * exists, and `EntityStore.getIndex` masks without checking. Reading
       * that id's record would return whoever now holds the recycled index.
       *
       * **Somebody else has to be holding it, and that is what this case used
       * to be missing.** It destroyed the resident and admitted the arrival
       * immediately, so `EntityStore.spawn` handed the arrival the freed index
       * itself (`freeIndices` is LIFO) and `sharingViewsOf` read the arrival's
       * *own* `riskTier` back out of the dead id -- a distance of 0, a rating
       * of 0, and `shared-a` winning either way. Measured on the shipped
       * fixture: `deadIndex 0, arrivalIndex 0, sameSlot true`, and deleting
       * `if (!this.store.isAlive(occupant)) continue;` left this file 18/18
       * green. The comment claiming "it would rate 3" was describing an
       * outcome the fixture could not produce.
       *
       * So the freed slot is filled first, by a tier-3 entity that is not in
       * any cell. Now the dead id aliases *that* record: with the liveness
       * filter `shared-a` rates 0 and wins the tie on instance id; without it,
       * `shared-a` rates 3 and the arrival is sent to `shared-b`, which is
       * what the case always claimed to be testing.
       */
      const prison = sharedCellPrison();
      const dead = prison.seatResident('shared-a', 3);
      prison.store.destroy(dead);
      expect(prison.roomInstances.occupantsOf('shared-a')).toEqual([dead]);

      // Whoever the store hands the freed index to next. Housed nowhere, so
      // the only way it can reach the rating is through the stale id.
      const squatter = prison.store.spawn();
      prison.records.riskTier[prison.store.getIndex(squatter)] = 3;

      const arrival = prison.admit(LOW_RISK);
      const kernel = makeKernel();
      kernel.registerSystem(prison.intakeSystem);
      for (let i = 0; i < 20; i += 1) kernel.step();

      // The three facts that make the assertion below mean what it says. The
      // last one is the guard: without it this case can silently return to
      // comparing the arrival with itself, which is how it passed for as long
      // as it did.
      expect(prison.store.isAlive(dead)).toBe(false);
      expect(prison.store.getIndex(dead), 'the dead id now aliases the squatter').toBe(prison.store.getIndex(squatter));
      expect(prison.store.getIndex(dead), 'the arrival must not be the one holding the recycled slot').not.toBe(prison.store.getIndex(arrival));

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
    // contract, and it is ADR 0026's question 3 -- left open by that ADR,
    // which is Accepted as the framing and not as an answer -- rather than
    // settled here. Whichever is taken changes an assertion below.
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

  it('DEFECT (#169 item 3): a re-intake shifts the classification stream, so later arrivals are classified differently', () => {
    // **The determinism half of the case above, and the reason this question
    // is not merely bookkeeping.** ADR 0026 states it in prose -- the second
    // run reaches the `classification` stage and draws from
    // `prisoners.classification`, "so a re-intake shifts the stream every
    // later arrival's classification is read from", and "a re-intake path
    // that could be replayed a different number of times would therefore be
    // a determinism defect, not merely a bookkeeping one". Nothing measured
    // it. This does.
    //
    // Determinism is the property most of this suite exists to protect: the
    // same seed and the same command sequence must produce the same state.
    // A re-intake is an extra draw on a shared named stream, so it moves
    // every subsequent consumer of that stream -- which means the defect is
    // not confined to the prisoner who was re-submitted.
    //
    // ## Why this is asserted as a difference rather than against literals
    //
    // The expected value of a classification draw cannot be written down
    // without re-implementing `classifyPrisoner` and the RNG, and a literal
    // copied out of a previous run of the code under test would be this
    // repository's dominant test defect -- a fixture supplying both sides of
    // its own comparison. So the baseline comes from a source independent of
    // the behaviour being tested: **a second identical session**. Two runs
    // that differ in nothing must agree, and two runs that differ only by one
    // extra `submitIntake` call must -- today -- disagree.
    //
    // That pair is what makes each half non-vacuous. The equality would fail
    // if the draw were nondeterministic for any other reason; the inequality
    // would fail if classification collapsed to a constant, which is the way
    // a broken draw would otherwise look like a fix.
    //
    // Measured when this was written, for the record rather than as an
    // assertion: the three later arrivals' risk tiers are `[2, 2, 0]` without
    // the re-intake and `[2, 0, 2]` with it -- the same three prisoners,
    // admitted in the same order with identical inputs, classified
    // differently because an unrelated entity went through intake twice.
    //
    // Whichever of ADR 0026 question 3's three shapes is taken changes this
    // case: refusing the re-intake removes the second draw, cleaning up
    // first has to answer for the stream explicitly, and moving re-intake to
    // its own entry point makes this call unreachable. None is taken here.
    function runSession(reIntake: boolean): readonly number[] {
      const fixture = buildPrisonerScenarioFixture({ cellCount: 8, capacity: 20 });
      const kernel = makeKernel();
      fixture.prisoners.registerOn(kernel);

      const first = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 0 }, fixture.originTile);
      for (let i = 0; i < 25; i += 1) kernel.step();

      if (reIntake) {
        fixture.prisoners.intakeSystem.submitIntake(first, { sentenceLengthTicks: 1_000, priorIncidents: 0 });
        for (let i = 0; i < 25; i += 1) kernel.step();
      }

      // Three later arrivals, identical inputs, admitted in a fixed order.
      const later = [0, 1, 2].map(() =>
        fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 500, priorIncidents: 1 }, fixture.originTile));
      for (let i = 0; i < 30; i += 1) kernel.step();

      return later.map((entityId) => fixture.prisoners.records.riskTier[fixture.prisoners.entityStore.getIndex(entityId)]!);
    }

    const control = runSession(false);
    const controlRepeated = runSession(false);
    const withReIntake = runSession(true);

    // The independent baseline: same seed, same commands, same state.
    expect(controlRepeated).toEqual(control);
    expect(control).toHaveLength(3);

    // DEFECT: one extra `submitIntake` for an unrelated, already-housed
    // prisoner, and these three are classified differently.
    expect(withReIntake).not.toEqual(control);
  });
  /**
   * The property the whole admission guard exists to provide, asserted over
   * every prison shape rather than over the one a panel happens to produce.
   *
   * **If `hasAccommodationTarget()` is true, no classification outcome can
   * reach `'failed'`.** That stage is terminal -- no branch of `update` matches
   * it, `ActionSystem` gates on `'completed'`, and nothing in `src/` releases a
   * prisoner (#31) -- so an admission the boundary allows and the stage machine
   * then strands is a permanent, inert, undeletable record that the status
   * strip still counts as a prisoner. The guard's only job is to make that
   * combination impossible, and before this it did not: it answered about
   * *some* classification group while the stage asked about *the* group the
   * `prisoners.classification` draw returned two stages later, so the two could
   * and did disagree about the same prison.
   *
   * Both directions of that disagreement were reachable and both are covered
   * below by construction, because the sweep does not care which group is
   * "the special one":
   *
   * - `room.solitary-cell` zoned and no `room.cell`: the guard passed on
   *   high-risk's behalf, and every arrival the Intake panel produces is
   *   `general-population` -- not merely usually, but provably, since the
   *   panel's figures score 0 and one `nextInt(3)` cannot lift a 0 past tier 1
   *   (`prisoners-classification.test.ts`). Measured before the fix: 2,000 of
   *   2,000 seeds terminal, no refusal recorded.
   * - `room.cell` zoned and no `room.solitary-cell`: the case ADR 0028
   *   recorded. Unreachable from the panel, reachable from any wider
   *   `AdmitPrisoner` -- the schema permits `priorIncidents` up to 255, and a
   *   queued command is persisted in the save envelope as an unvalidated
   *   `jsonValue` and re-dispatched verbatim on restore. Measured before the
   *   fix: 191 of 300 seeds terminal.
   *
   * This is written as an exhaustive sweep and not as two cases on purpose. It
   * enumerates every subset of the accommodation room types crossed with every
   * classification group, drives the real `IntakeSystem` for each, and asserts
   * the implication in both directions -- so it fails if a third room type
   * enters the policy without a fallback, if a third classification group is
   * added, or if either side of the guard/stage pair is ever edited without the
   * other. It does not encode which subsets pass; it derives that from the
   * guard and then checks the outcome against it.
   */
  describe('the guard and the stage cannot disagree about a prison', () => {
    /** Every room type `DEFAULT_ACCOMMODATION_POLICY` can name, so the sweep covers the policy rather than a guess about it. */
    const ACCOMMODATION_ROOM_IDS = ['room.cell', 'room.solitary-cell'] as const;

    /**
     * A prison holding one registered instance of each named room type, with a
     * bed's worth of derived capacity so a reached instance is actually
     * assignable.
     *
     * `residentCapacity: 1` and `'sleep-surface'` are what object placement
     * derives from a placed bed (ADR 0028 decision 2); they are set directly
     * here because the subject is the stage machine's target *resolution*, and
     * a registry-wide capacity of 0 would make every case wait for a bed and
     * hide the distinction being measured. The waiting case has its own test
     * above.
     */
    function prisonHolding(roomCatalogIds: readonly string[]) {
      const capacity = 8;
      const store = new EntityStore(capacity);
      const bitset = new ComponentBitset(capacity);
      const query = new EntityQuery(store, bitset);
      query.mask.require(0);
      const records = new PrisonerRecordComponent(capacity);
      const coldState = new PrisonerColdState();
      const roomInstances = new RoomInstanceRegistry();
      for (const roomCatalogId of roomCatalogIds) {
        roomInstances.register({
          instanceId: `${roomCatalogId}-1`,
          roomCatalogId,
          anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
          width: 2,
          height: 2,
          residentCapacity: 1,
          concurrentUseCapacity: 1,
          objectCapabilities: ['sleep-surface'],
        });
      }
      const intakeSystem = new IntakeSystem(store, query, records, coldState, roomInstances);
      return { store, bitset, records, coldState, roomInstances, intakeSystem };
    }

    /**
     * Runs one arrival all the way through intake and forces its
     * classification group, so the sweep covers every group instead of
     * whichever one the seed's draw happens to produce.
     *
     * The group is written onto the record *after* the classification stage has
     * run and before the accommodation stage does. That is the only honest way
     * to reach a specific group here: the draw is `IntakeSystem`'s own and
     * must not be moved or duplicated to satisfy a test, and the stage under
     * test reads `classificationGroupIndex` and nothing else. The classifier's
     * own mapping from input to group is covered exhaustively by
     * `prisoners-classification.test.ts`; what this needs is the stage's
     * behaviour given a group.
     */
    function admitAs(prison: ReturnType<typeof prisonHolding>, classificationGroupId: string): string {
      const kernel = makeKernel();
      kernel.registerSystem(prison.intakeSystem);
      const entityId = prison.store.spawn();
      const index = prison.store.getIndex(entityId);
      prison.bitset.add(index, 0);
      prison.intakeSystem.submitIntake(entityId, { sentenceLengthTicks: 1_000, priorIncidents: 0 });

      // Ticks 0, 5 and 10 carry the arrival 'queued' -> 'reception' ->
      // 'classification' -> 'accommodation-assignment'.
      for (let tick = 0; tick < 11; tick += 1) kernel.step();
      expect(prison.records.intakeStage[index], 'the arrival must be waiting on accommodation before its group is set').toBe(
        intakeStageIndex('accommodation-assignment'),
      );
      prison.records.classificationGroupIndex[index] = classificationGroupIndex(classificationGroupId);

      // And enough further firings that a retryable wait is distinguishable
      // from a terminal stage rather than merely slower to arrive.
      for (let tick = 0; tick < 100; tick += 1) kernel.step();
      return intakeStageFromIndex(prison.records.intakeStage[index]!);
    }

    /** Every subset of the accommodation room types, empty set included. */
    const subsets: readonly (readonly string[])[] = Array.from(
      { length: 1 << ACCOMMODATION_ROOM_IDS.length },
      (_, mask) => ACCOMMODATION_ROOM_IDS.filter((_room, bit) => (mask & (1 << bit)) !== 0),
    );

    it('never lets a guarded admission reach the terminal stage, for any group in any prison', () => {
      const observed: string[] = [];
      for (const rooms of subsets) {
        const guardAnswer = prisonHolding(rooms).intakeSystem.hasAccommodationTarget();
        for (const classificationGroupId of CLASSIFICATION_GROUP_IDS) {
          const stage = admitAs(prisonHolding(rooms), classificationGroupId);
          observed.push(`[${rooms.join(',')}] ${classificationGroupId} guard=${String(guardAnswer)} -> ${stage}`);

          if (guardAnswer) {
            // The implication itself. `'completed'` or a retryable wait are
            // both fine -- #306 keeps those distinct from each other and only
            // the terminal stage is the trap.
            expect(stage, `a guarded admission must never be stranded: [${rooms.join(',')}] as ${classificationGroupId}`).not.toBe('failed');
          } else {
            // The converse, so the guard cannot buy the implication by
            // refusing everything: a prison it rejects is one where this group
            // really has nowhere to go.
            expect(stage, `an unguarded prison must be the structurally impossible one: [${rooms.join(',')}]`).toBe('failed');
          }
        }
      }

      // The shape of the sweep, pinned so a silently empty or halved
      // enumeration cannot pass as a proof about every prison.
      expect(observed).toEqual([
        '[] general-population guard=false -> failed',
        '[] high-risk guard=false -> failed',
        '[room.cell] general-population guard=true -> completed',
        '[room.cell] high-risk guard=true -> completed',
        '[room.solitary-cell] general-population guard=true -> completed',
        '[room.solitary-cell] high-risk guard=true -> completed',
        '[room.cell,room.solitary-cell] general-population guard=true -> completed',
        '[room.cell,room.solitary-cell] high-risk guard=true -> completed',
      ]);
    });

    it('houses each group in its own preferred room type whenever the prison holds one', () => {
      // The fallback must not become the *ordinary* path: a prison with both
      // types has to keep sending high-risk to solitary and everyone else to an
      // ordinary cell, or the fix would have quietly replaced the policy rather
      // than extended it.
      for (const classificationGroupId of CLASSIFICATION_GROUP_IDS) {
        const prison = prisonHolding(ACCOMMODATION_ROOM_IDS);
        const stage = admitAs(prison, classificationGroupId);
        expect(stage).toBe('completed');
        const expected = classificationGroupId === 'high-risk' ? 'room.solitary-cell-1' : 'room.cell-1';
        expect(prison.roomInstances.instancesOccupiedBy(prison.store.getIdByIndex(0)!)).toEqual([expected]);
      }
    });

    /**
     * The policy names room ids as string literals, and content owns those
     * strings -- so this is a content-to-code coupling with nothing holding it
     * together, which is the third route by which the terminal stage was
     * reachable and the only one that needs no code change at all.
     *
     * A content edit that renamed or dropped `room.cell` would leave the policy
     * pointing at a room type no zoning gesture can ever produce. Since the
     * guard now demands a target for *every* group, the failure mode that edit
     * produces is "no admission is ever accepted" rather than "every arrival is
     * stranded" -- which is a far better way to fail, and is a property of the
     * fix rather than of content. It is still a broken game, and it should be a
     * red test rather than something a player discovers, which is what this is.
     *
     * `defaultRoomContentRegistry` rather than a hand-written list of the two
     * ids: a list here would be the same unheld coupling one layer further out.
     */
    it('names only room types the room catalogue actually defines', () => {
      const catalogued = new Set([...defaultRoomContentRegistry.all()].map((definition) => definition.id));
      for (const classificationGroupId of CLASSIFICATION_GROUP_IDS) {
        const targets = DEFAULT_ACCOMMODATION_POLICY.resolveTargets(classificationGroupId);
        expect(targets.length, `every group needs a fallback, or the guard refuses prisons it should admit: ${classificationGroupId}`).toBeGreaterThan(1);
        for (const target of targets) {
          expect(catalogued, `${classificationGroupId} is sent to ${target.roomCatalogId}, which content does not define`).toContain(target.roomCatalogId);
        }
      }
    });

    it('falls back only for a room type the prison holds no instance of, never for one that is merely full', () => {
      // The line #306 drew, and the one thing this fix must not blur. A
      // preferred room that exists but has no free place is a *wait* -- the
      // arrival keeps that target, `accommodationBacklogTicks` counts, and a
      // freed place or a placed bed completes it. Falling back here instead
      // would move a high-risk prisoner into general population over one
      // tick's congestion and would erase the retryable/terminal distinction.
      const prison = prisonHolding(ACCOMMODATION_ROOM_IDS);

      // Fill the only solitary cell, so high-risk's preferred target exists
      // and is full while its fallback stands empty.
      const resident = prison.store.spawn();
      prison.roomInstances.assign('room.solitary-cell-1', resident);
      expect(prison.roomInstances.occupancyOf('room.solitary-cell-1')).toBe(1);

      const stage = admitAs(prison, 'high-risk');
      expect(stage, 'a full preferred room is a wait, not a fallback and not a failure').toBe('accommodation-assignment');
      expect(prison.roomInstances.occupancyOf('room.cell-1'), 'the empty ordinary cell must not have been taken').toBe(0);
      expect(prison.intakeSystem.getMetrics().failedCount).toBe(0);
      expect(prison.intakeSystem.getMetrics().accommodationBacklogTicks, 'the wait must be counted as unmet demand').toBeGreaterThan(0);
    });
  });
});
