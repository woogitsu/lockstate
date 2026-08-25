import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_IDS, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';

/**
 * [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * phase 2: **the cell stops being visibly incomplete.**
 *
 * Phase 1 measured a prisoner into a bed
 * (`tests/integration/object-placement-loop.test.ts`) and said what it still
 * could not do: "the cell reports its toilet requirement unmet, because nothing
 * places one yet". `room.cell` requires `object.bed` *and* `object.toilet`
 * (`src/content/room-catalog.ts`), so a cell with only a bed reads
 * `'missing-capability'` on a requirement the catalogue itself declares. This
 * file measures that reading before and after a toilet is placed, on the same
 * real path: real commands, the real kernel, the real construction system, the
 * real decoder.
 *
 * ## What phase 2 turned out to be, measured rather than asserted
 *
 * **One row in `BUILDABLE_REGISTRY`, and no new mechanism at all** -- which is
 * exactly what that phase promised ("ships `object.toilet` as a second
 * buildable, and nothing structural") and is worth recording as a confirmation
 * rather than a disappointment: `PlaceObject` validates a footprint without
 * naming an object id, `RoomCapacityResolver` sums `footprint.width` over
 * whatever is standing in the rectangle and unions the capabilities, and the
 * label comes off `object.toilet`'s own `nameKey`. Every assertion below except
 * the requirement statuses would have passed against phase 1's code the moment
 * a second row existed. That is what a correctly factored phase 1 looks like
 * from the outside, and the tests are written to fail if any of it stops being
 * generic (see the red-proof list in the pull request).
 *
 * **And the needs loop does not move**, which is the honest half. `action.sleep`,
 * `action.eat-in-cell` and `action.use-toilet` all resolve through
 * `own-accommodation`, which re-checks neither the capacity nor the capability
 * gate -- so `action.use-toilet` was already reachable in a cell containing
 * nothing but a bed, and this file measures the two prisons' need levels as
 * *equal* at every tick rather than claiming the toilet unlocked anything. ADR
 * 0028's own §Context predicted precisely that ("that single completed intake
 * buys `action.sleep`, `action.use-toilet` and `action.eat-in-cell`
 * immediately") and its phase 2 section says so outright; the measurement is
 * here because a milestone whose behavioural change is zero should be provable
 * as such.
 */

const SEED = 0x0b1ec7;
const CELL = 'room.cell';
const PRISON_ID = 'furnished-cell-prison';

/** `room.cell`'s authored minimum, and the smallest rectangle zoning accepts for one -- the same rectangle phase 1 measures. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** Inside `CELL_RECT`, so the bed's 1x2 footprint lies wholly in the cell. */
const BED_TILE = { x: 4, y: 6 } as const;
/**
 * Also inside `CELL_RECT`, and deliberately *not* (4,7): that tile is the bed's
 * second footprint tile, and a toilet aimed at it is a refusal rather than a
 * placement (see below).
 */
const TOILET_TILE = { x: 5, y: 6 } as const;
/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/** What one press of the Intake panel's control asks for, copied from `ADMISSION_REQUEST` in `src/main.ts`. */
const ADMISSION = { sentenceLengthTicks: 10_000, priorIncidents: 0 };

const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison with one zoned cell and one bed order: the state phase 1 shipped.
 *
 * Both materials are bought up front, and the brick is bought even by the
 * bed-only prison. That is what makes the two prisons comparable further down:
 * the money spent, the delivery timings and the procurement stream are the same
 * in both, so a difference in a need level could only come from the placement.
 */
function prisonWithBedOrdered(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  return runtime;
}

/** The same prison with the toilet ordered as well: phase 2's whole gesture. */
function prisonWithBedAndToiletOrdered(): SimulationRuntime {
  const runtime = prisonWithBedOrdered();
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', ...TOILET_TILE }));
  return runtime;
}

/** The catalogue requirement statuses a room reads, keyed by object id. `projectRoomDetail` is the only thing that answers this. */
function objectRequirementStatuses(runtime: SimulationRuntime): Record<string, string> {
  const detail = projectRoomDetail(runtime.prisoners, cellInstanceId);
  const statuses: Record<string, string> = {};
  for (const requirement of detail?.requirements ?? []) {
    if (requirement.objectId === undefined) continue;
    statuses[requirement.objectId] = requirement.status;
  }
  return statuses;
}

describe('a toilet placed in a cell satisfies the requirement a bed alone cannot', () => {
  it('reads missing on both requirements while the cell is empty, and on the toilet while only the bed stands', () => {
    const runtime = prisonWithBedOrdered();

    // Zoned and empty: the catalogue declares two `object` requirements and
    // neither is met. Nothing has been built yet -- the orders are waiting for
    // their delivery -- so this is the reading a player gets between zoning and
    // furnishing.
    expect(objectRequirementStatuses(runtime)).toEqual({
      'object.bed': 'missing-capability',
      'object.toilet': 'missing-capability',
    });

    stepTo(runtime, 200);

    // **The state phase 1 shipped, stated as a measurement rather than as a
    // regret.** The bed exists and works; the cell is still not what the
    // catalogue says a cell is.
    expect(runtime.placedObjects.size).toBe(1);
    expect(objectRequirementStatuses(runtime)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'missing-capability',
    });
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)?.requirementSummary).toEqual({
      total: 4,
      objectRequirements: 2,
      satisfiedByCapability: 1,
      missingCapability: 1,
      // `enclosed` and `minimum-size` are evaluated at zoning time and not
      // recorded on the instance, so the projection still answers
      // `'not-evaluated'` for both (`docs/HUD_PROJECTIONS.md` gap 13).
      notEvaluated: 2,
    });
  });

  it('reads satisfied on both once the toilet is built, which is the whole of phase 2', () => {
    const runtime = prisonWithBedAndToiletOrdered();
    expect(runtime.refusals.count, 'neither placement may be refused').toBe(0);

    stepTo(runtime, 200);

    expect(runtime.placedObjects.size).toBe(2);
    expect(runtime.placedObjects.objectAt(TOILET_TILE as never)).toMatchObject({
      // Derived from the anchor tile and nothing else, exactly as the bed's is.
      placedObjectId: 'object:5:6',
      objectId: 'object.toilet',
      orientation: 0,
    });
    expect(objectRequirementStatuses(runtime)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'satisfied-by-capability',
    });
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)?.requirementSummary).toMatchObject({
      objectRequirements: 2,
      satisfiedByCapability: 2,
      missingCapability: 0,
    });
  });

  it('unions the two capabilities in code-unit order, off the real command path', () => {
    const runtime = prisonWithBedAndToiletOrdered();
    stepTo(runtime, 200);

    // The bed is ordered *first* and finishes first, so first-seen order would
    // be `['sleep-surface', 'sanitation']`. A union has no order, so one is
    // chosen -- ascending by code unit, never `localeCompare`
    // (`docs/DETERMINISM.md`). `tests/unit/objects-room-capacity.test.ts`
    // asserts this over a hand-built object list; what is new here is that the
    // list came from two construction orders finishing in tick order.
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.objectCapabilities).toEqual([
      'sanitation',
      'sleep-surface',
    ]);
    // And the projection re-sorts what it is handed, so the HUD's copy is
    // sorted whatever the instance holds.
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)?.objectCapabilities).toEqual([
      'sanitation',
      'sleep-surface',
    ]);
  });

  it('sums concurrent use over both objects and residency over the bed alone', () => {
    const runtime = prisonWithBedAndToiletOrdered();
    stepTo(runtime, 200);

    // Two objects of footprint width 1 each, so concurrent use is 2. Only one
    // of them declares `'sleep-surface'`, so residency stays 1. **Nothing
    // authored either number**: both are read off footprints
    // `src/content/object-catalog.ts` has shipped since it existed, and the
    // resolver was not touched by this phase.
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 2,
    });
    // The bed-only prison is the control: the toilet is the entire difference
    // between 1 and 2.
    const bedOnly = prisonWithBedOrdered();
    stepTo(bedOnly, 200);
    expect(bedOnly.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 1,
    });
  });
});

describe('a toilet is refused for the reasons any object is refused', () => {
  it('refuses the bed s second footprint tile, which no object plane could tell apart from its anchor', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);

    // (4,7) is the bed's *second* tile, not its anchor. The tile index covers
    // every tile of every footprint, which is what makes this a refusal rather
    // than a toilet standing inside a bed.
    submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 4, y: 7 }));

    expect(runtime.refusals.last?.reason).toBe('place-object.tile-occupied');
    expect(runtime.construction.getOrder('toilet-1'), 'a refused placement mints no order').toBeUndefined();
    expect(runtime.placedObjects.size).toBe(1);
    expect(objectRequirementStatuses(runtime)['object.toilet']).toBe('missing-capability');
  });

  it('refuses a tile in no room, so a brick is never spent on an object nothing reads', () => {
    const runtime = prisonWithBedOrdered();
    // Owned land, inside the materialised chunk, and outside every zoned
    // rectangle. Capacity is derived per room instance, so a toilet here would
    // change nothing observable.
    submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 20, y: 20 }));

    expect(runtime.refusals.last?.reason).toBe('place-object.outside-room');
    expect(runtime.construction.getOrder('toilet-1')).toBeUndefined();
    stepTo(runtime, 200);
    expect(runtime.placedObjects.size).toBe(1);
  });
});

describe('what the toilet does and does not change in the running prison', () => {
  it('houses the prisoner and leaves every need level exactly where the bed-only prison leaves it', () => {
    const furnished = prisonWithBedAndToiletOrdered();
    const bedOnly = prisonWithBedOrdered();
    for (const runtime of [furnished, bedOnly]) {
      stepTo(runtime, 200);
      submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
      expect(runtime.refusals.count, 'a prison with a bed must not refuse the admission').toBe(0);
      stepTo(runtime, 4_800);
    }

    const arrivalIndex = (runtime: SimulationRuntime): number =>
      runtime.prisoners.entityStore.getIndex(runtime.prisoners.entityStore.getIdByIndex(0));
    const needLevel = (runtime: SimulationRuntime, need: (typeof NEED_IDS)[number]): number =>
      runtime.prisoners.needs.levels[need][arrivalIndex(runtime)]! / NEED_SCALE;
    const needsOf = (runtime: SimulationRuntime): Record<string, number> =>
      Object.fromEntries(NEED_IDS.map((need) => [need, needLevel(runtime, need)]));

    // Both prisons house their arrival and both pay for the occupied place.
    for (const runtime of [furnished, bedOnly]) {
      expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
      expect(runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });
      // 25,000 less one plank at 65 and one brick at 40, plus two days of state
      // income at 300 a day for one occupied place.
      expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 65 - 40 + 600);
    }

    // **The measurement that keeps this phase honest.** `action.use-toilet`
    // resolves through `own-accommodation`, which re-checks neither the
    // capacity nor the capability gate, so it was already reachable in a cell
    // containing nothing but a bed -- and the bladder need therefore follows
    // the same curve in both prisons. Phase 2 changes what the cell *reports*,
    // not what the prisoner *does*.
    expect(needsOf(furnished)).toEqual(needsOf(bedOnly));
    // Not a vacuous comparison: the loop really ran and the needs moved a long
    // way. Measured at tick 4,800 in both prisons: hunger 25.0 of 255, sleep
    // 254.7, hygiene 163.0, bladder 212.6 -- so the two needs the cell can
    // serve are high, hunger is nearly exhausted because `action.eat-in-cell`
    // gains 3 a tick against a canteen's 4, and hygiene has no route at all
    // until phase 4 places a shower head.
    expect(needLevel(furnished, 'hunger')).toBeLessThan(100);
    expect(needLevel(furnished, 'sleep')).toBeGreaterThan(250);
  });

  it('makes none of the five room-gated actions reachable, and would not even if it were a bed', () => {
    const furnished = prisonWithBedAndToiletOrdered();
    stepTo(furnished, 200);

    const roomGated = DEFAULT_ACTIONS.filter((action) => action.target.kind === 'room-catalog-id');
    expect(roomGated.map((action) => action.id)).toEqual([
      'action.eat-meal',
      'action.shower',
      'action.yard-recreation',
      'action.common-room-recreation',
      'action.classroom-education',
    ]);
    for (const action of roomGated) {
      if (action.target.kind !== 'room-catalog-id') continue;
      expect(
        furnished.prisoners.roomInstances.findAvailableForUse(action.target.roomCatalogId, action.requiredObjectCapability),
        `${action.id} names a room type this prison has not zoned`,
      ).toBeUndefined();
    }

    /*
     * And the reason is worth pinning, because "a toilet unblocks nothing" is
     * only half true and the other half is not phase 2's.
     *
     * Three of the five -- yard, common-room and classroom recreation -- declare
     * **no** `requiredObjectCapability`, so `findAvailableForUse` gates on
     * `concurrentUseCapacity` alone, and that figure sums `footprint.width`
     * over *every* object regardless of capability (ADR 0028 decision 2). So one
     * toilet in a zoned common room makes `action.common-room-recreation`
     * reachable -- and so does one bed, identically. The capacity route has been
     * capability-blind since phase 1; the toilet is not what opened it, and
     * nothing here should be read as claiming otherwise.
     */
    for (const definitionId of ['toilet-brick', 'bed-wooden'] as const) {
      const runtime = createNewSimulationRuntime(SEED);
      submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
      submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
      submit(runtime, 'zone-common', packCommand({ type: 'ZoneRoom', roomId: 'room.common-room', x: 10, y: 10, width: 5, height: 5 }));
      submit(runtime, 'place', packCommand({ type: 'PlaceObject', orderId: 'o-1', definitionId, x: 11, y: 11 }));
      stepTo(runtime, 200);

      expect(runtime.placedObjects.size, `${definitionId} must have been built`).toBe(1);
      expect(
        runtime.prisoners.roomInstances.findAvailableForUse('room.common-room', undefined)?.instanceId,
        `${definitionId} gives the common room a concurrent-use capacity of 1`,
      ).toBe('room.common-room:10:10');
      // The one action of the five that names a capability a toilet could ever
      // supply is still out of reach: `action.shower` wants `'hygiene'`, which
      // is the sink's and the shower head's, and both are phase 4's.
      expect(runtime.prisoners.roomInstances.findAvailableForUse('room.shower-room', 'hygiene')).toBeUndefined();
    }
  });

  it('produces byte-identical state for the same command order', () => {
    const left = prisonWithBedAndToiletOrdered();
    const right = prisonWithBedAndToiletOrdered();
    for (const runtime of [left, right]) {
      stepTo(runtime, 200);
      submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
      stepTo(runtime, 600);
    }

    // The whole session through the encoder a save uses, not just the objects.
    // Placement uses no RNG, so two placements must leave every named stream
    // where one would.
    expect(JSON.stringify(captureSessionSnapshot(right))).toBe(JSON.stringify(captureSessionSnapshot(left)));
  });

  it('emits the objects section in tile order rather than in the order the orders finished', () => {
    /*
     * The toilet is ordered first *and* finishes first -- `allOrders()` is
     * sorted by order id, and `a-toilet` precedes `b-bed` -- while its anchor
     * tile sorts *after* the bed's. So registry insertion order and payload
     * order genuinely disagree here, which is what makes this an assertion
     * about the key rather than a coincidence of the fixture.
     *
     * The key is `(anchorTile.y, anchorTile.x)` and deliberately **not**
     * `placedObjectId`: the id is a string over two decimal integers, so
     * code-unit order would put `object:10:6` before `object:9:6`.
     * `computeSaveChecksum` hashes array order, so a walk that put insertion
     * history into the save would make the checksum a function of the order the
     * player happened to build in.
     */
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
    submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'a-toilet', definitionId: 'toilet-brick', x: 5, y: 6 }));
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'b-bed', definitionId: 'bed-wooden', x: 4, y: 6 }));
    stepTo(runtime, 200);

    expect(runtime.placedObjects.size).toBe(2);
    expect(captureSessionSnapshot(runtime).simulation?.objects?.placedObjects.map((object) => object.placedObjectId)).toEqual([
      'object:4:6',
      'object:5:6',
    ]);
  });

  it('carries both objects through a V5 save and derives the same capacity again on load', () => {
    const runtime = prisonWithBedAndToiletOrdered();
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 240);

    const bundle = captureSessionSnapshot(runtime);
    // Two rows, ascending by `(anchorTile.y, anchorTile.x)` -- not by
    // `placedObjectId`, which is a string over two decimal integers and would
    // put `object:10:6` before `object:9:6`. `computeSaveChecksum` hashes array
    // order, so the key is part of the format rather than a detail.
    expect(bundle.simulation?.objects?.placedObjects).toEqual([
      { placedObjectId: 'object:4:6', objectId: 'object.bed', anchorTile: { x: 4, y: 6 }, orientation: 0 },
      { placedObjectId: 'object:5:6', objectId: 'object.toilet', anchorTile: { x: 5, y: 6 }, orientation: 0 },
    ]);
    // And no capacity anywhere in the room-instance row: it is a function of
    // those two rows and is recomputed on load.
    expect(bundle.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: cellInstanceId, roomCatalogId: CELL, anchorTile: { x: 4, y: 6 }, width: 2, height: 3 },
    ]);

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
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    expect(restored.placedObjects.getSnapshot()).toEqual(runtime.placedObjects.getSnapshot());
    expect(restored.prisoners.roomInstances.getById(cellInstanceId)).toEqual(
      runtime.prisoners.roomInstances.getById(cellInstanceId),
    );
    // The requirement verdict survives the round trip because the capability
    // list that decides it is derived from the restored objects rather than
    // read out of the save.
    expect(objectRequirementStatuses(restored)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'satisfied-by-capability',
    });
    expect(restored.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
  });
});
