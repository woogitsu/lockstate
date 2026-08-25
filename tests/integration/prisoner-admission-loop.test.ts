import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { intakeStageFromIndex } from '../../src/simulation/prisoners/components';
import { NEED_IDS, NEED_MAX_SCALED, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * Issue #261 step 4: **an `AdmitPrisoner` command puts a prisoner in the
 * prison, and the status strip's `Prisoners` count moves.**
 *
 * `Prisoners` was one of the numbers on the status strip that no session could
 * move -- `treasuryMinorUnits` was the only one that could, until #311's
 * prisoner-day income line, which needs a prisoner and so needs this. It is a
 * real projection over live prisoner entities and nothing in `src/` created
 * one, because `PrisonerOperationsRuntime.admitPrisoner` had no caller
 * anywhere in the application -- three links were missing and none of them
 * was in the simulation: no member of `simulationCommandSchema`, no branch of
 * `createSessionCommandHandler`, and no `HudIntent`, control or `onIntent`
 * case.
 *
 * Everything below goes through the real kernel, the real decoder, the real
 * session command router and the real save envelope, in the shape
 * `room-zoning-loop.test.ts` established for step 3. Nothing calls
 * `admitPrisoner` or `RoomInstanceRegistry.register` by hand except the one
 * test whose subject *is* the unguarded path: a test that did would prove the
 * pipeline works and say nothing about whether a command can reach it.
 *
 * ## The one thing these tests are most for
 *
 * An admission into a prison with **no** accommodation room is refused rather
 * than carried out, and that is the load-bearing decision of the change
 * rather than a detail of it. `IntakeSystem` marks such an arrival `'failed'`,
 * and `'failed'` is *terminal*: no branch of `IntakeSystem.update` matches
 * that stage, `ActionSystem` gates on `'completed'`, and nothing in `src/`
 * releases a prisoner (#31). "is refusing something unrecoverable" below
 * measures that terminality directly -- registering a matching room afterwards
 * does not rescue the record -- which is why the boundary refuses instead of
 * manufacturing one.
 *
 * The refusal is not the same thing as a *wait*. A zoned cell with no bed in
 * it derives `residentCapacity: 0`, so `findAvailableResidence` returns nothing
 * and the arrival stays at `accommodation-assignment` and is retried for as
 * long as it takes. "waits rather than failing" pins that difference, because
 * collapsing the two would either refuse every admission for ever or
 * manufacture the broken record this change exists to avoid.
 *
 * That wait used to be permanent scaffolding and is now an in-between state: ADR
 * 0028 phase 1 lets the player place a bed, which makes the same find succeed on
 * the next scheduled intake tick with no change to the stage machine.
 * `tests/integration/object-placement-loop.test.ts` drives the far side of it;
 * what this file still pins is the near side, which is unchanged.
 *
 * **Both sides of that line are reachable from the shipped application**, which
 * they were not when this was written: the Rooms tab (#312) gave `ZoneRoom` a
 * producer, so a player who has zoned a cell is admitted into the wait and a
 * player who has zoned nothing -- or only a canteen -- is refused. Every test
 * below reaches a room the same way a player does, through the `ZoneRoom`
 * command, so this file measures the shipped route rather than a hand-built
 * registry -- the one exception being "is refusing something unrecoverable",
 * whose whole subject is what the unguarded entry point and a hand-registered
 * room do, and which therefore has to bypass both.
 */

const SEED = 11;
const CELL = 'room.cell';
const CANTEEN = 'room.canteen';
const PRISON_ID = 'admission-round-trip-prison';

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/** What one press of the Intake panel's control asks for, copied from `ADMISSION_REQUEST` in `src/main.ts`. */
const ADMISSION = { sentenceLengthTicks: 10_000, priorIncidents: 0 };

/** Dispatches one command through the kernel, at the sequence the kernel is expecting. */
function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function admit(runtime: SimulationRuntime, id: string): void {
  submit(runtime, id, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
}

/**
 * `room.cell`'s authored minimum size, and the smallest rectangle the zoning
 * service will accept for one.
 *
 * A dimension, not a magic pair: since #312 `RoomZoningService` evaluates the
 * authored `minimum-size` requirement, so a rectangle is refused
 * `zone.below-minimum-size` rather than quietly accepted, and each room type
 * has its own floor. Measured: `room.cell` is 2x3 and `room.canteen` is 6x6.
 */
const CELL_MINIMUM = { width: 2, height: 3 } as const;
/** `room.canteen`'s, which is why the canteen below is not zoned at the cell's size. */
const CANTEEN_MINIMUM = { width: 6, height: 6 } as const;

function zoneCell(runtime: SimulationRuntime, id: string, roomId: string = CELL): void {
  const size = roomId === CANTEEN ? CANTEEN_MINIMUM : CELL_MINIMUM;
  submit(runtime, id, packCommand({ type: 'ZoneRoom', roomId, x: 4, y: 6, ...size }));
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * Queues the zone and the admission to *both* execute at tick 0, then runs
 * that one tick.
 *
 * `Kernel.step` applies every command due at the tick before it runs any
 * system, so this makes the prisoner exist for the whole of tick 0 and
 * therefore for `NeedsDecaySystem`'s run at it (`phaseTicks: 0`). That is
 * what makes the need figures below a function of the decay rates and the
 * tick count alone, rather than of how many ticks the test happened to spend
 * setting the prison up -- and it is the same thing a player does, since a
 * new session starts paused and both presses land before the clock runs.
 */
function zoneAndAdmitAtTickZero(runtime: SimulationRuntime): void {
  runtime.kernel.submitCommand(
    'cmd-zone',
    runtime.kernel.expectedSequence,
    0,
    packCommand({ type: 'ZoneRoom', roomId: CELL, x: 4, y: 6, width: 2, height: 3 }),
  );
  runtime.kernel.submitCommand(
    'cmd-admit',
    runtime.kernel.expectedSequence,
    0,
    packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }),
  );
  runtime.kernel.step();
}

/** The one live prisoner's component index, asserted to exist so a silent zero cannot pass for a reading. */
function onlyPrisonerIndex(runtime: SimulationRuntime): number {
  expect(runtime.prisoners.entityStore.maxActiveIndex, 'exactly one prisoner must be live').toBe(0);
  expect(runtime.prisoners.entityStore.isIndexAlive(0)).toBe(true);
  return 0;
}

function stageOf(runtime: SimulationRuntime, index: number): string {
  return intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!);
}

/** Stored units, not whole levels: `NeedsComponent.get` rounds, so a real sub-level step can read as no step at all. */
function scaledNeeds(runtime: SimulationRuntime, index: number): Record<string, number> {
  return Object.fromEntries(NEED_IDS.map((needId) => [needId, runtime.prisoners.needs.getScaled(index, needId)]));
}

function wholeNeeds(runtime: SimulationRuntime, index: number): Record<string, number> {
  return Object.fromEntries(NEED_IDS.map((needId) => [needId, runtime.prisoners.needs.get(index, needId)]));
}

/** The full save path a session controller takes, including the storage round trip that destroys object identity. */
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
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
}

describe('admitting a prisoner through the real command path (#261 step 4)', () => {
  it('moves the Prisoners count off zero, which nothing in the application could do before', () => {
    const runtime = createNewSimulationRuntime(SEED);
    zoneCell(runtime, 'cmd-zone');

    // Both halves stated: a fresh prison holds nobody, and the count that
    // reports it is the one the worker actually publishes to the strip.
    expect(runtime.prisoners.entityStore.maxActiveIndex).toBe(-1);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).prisoners).toBe(0);

    admit(runtime, 'cmd-admit');

    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.prisoners, 'the command must have admitted a prisoner').toBe(1);
    // And it is *in intake* rather than merely counted: `prisonersInIntake`
    // excludes both `'completed'` and `'failed'`, so a non-zero reading here
    // is a positive statement that the arrival is neither finished nor broken.
    expect(counts.prisonersInIntake).toBe(1);
    expect(runtime.refusals.count, 'an accepted admission must record no refusal').toBe(0);
    expect(runtime.refusals.last).toBeUndefined();

    // The arrival really is at the tile the command named. The renderer reads
    // this through the save bundle (`actors-from-snapshot.ts`), so a prisoner
    // at a default 0,0 would be drawn in the corner of the world.
    const index = onlyPrisonerIndex(runtime);
    expect([runtime.prisoners.position.tileX[index], runtime.prisoners.position.tileY[index]]).toEqual([
      ARRIVAL.x,
      ARRIVAL.y,
    ]);
  });

  it('refuses an admission into a prison with nowhere to put anybody, exactly once, and creates nobody', () => {
    const runtime = createNewSimulationRuntime(SEED);
    admit(runtime, 'cmd-admit');

    // No prisoner, and no half-made one: the entity store never allocated.
    expect(runtime.prisoners.entityStore.maxActiveIndex).toBe(-1);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).prisoners).toBe(0);

    // Exactly one player-visible message. `RefusalLog.count` is the ordinal of
    // the last refusal, so this asserts "not zero and not two" in one reading:
    // a silent refusal leaves it at 0, and a double-reporting handler takes it
    // to 2.
    expect(runtime.refusals.count).toBe(1);
    expect(runtime.refusals.last).toMatchObject({ sequence: 1, reason: 'admit.no-accommodation' });

    // A second press is a second message and still nobody, rather than the
    // first message being replayed or the counter sticking.
    admit(runtime, 'cmd-admit-again');
    expect(runtime.refusals.count).toBe(2);
    expect(runtime.refusals.last?.reason).toBe('admit.no-accommodation');
    expect(projectStatusCounts(runtime, runtime.kernel.tick).prisoners).toBe(0);
  });

  it('refuses rather than admitting into a prison whose only room is not an accommodation target', () => {
    // The condition the simulation applies is narrower than the room count
    // `src/main.ts` checks against, and this is the gap between them: a zoned
    // canteen is a room instance, so `counts.rooms` is 1 and the main thread
    // submits -- and the arrival would still be marked terminally `'failed'`,
    // because `DEFAULT_ACCOMMODATION_POLICY` targets `room.cell` and
    // `room.solitary-cell` and nothing else. Refusing here is what keeps the
    // two checks to exactly one message between them rather than to none.
    const runtime = createNewSimulationRuntime(SEED);
    zoneCell(runtime, 'cmd-zone-canteen', CANTEEN);
    // The designation itself was accepted, asserted before the admission so a
    // canteen refused for its own reasons -- `room.canteen`'s authored
    // 6x6 minimum, which #312 made the zoning service evaluate -- cannot pass
    // for the admission refusal this test is about.
    expect(runtime.refusals.count, 'the canteen must actually be zoned').toBe(0);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(1);

    admit(runtime, 'cmd-admit');

    expect(projectStatusCounts(runtime, runtime.kernel.tick).prisoners).toBe(0);
    expect(runtime.refusals.count).toBe(1);
    expect(runtime.refusals.last?.reason).toBe('admit.no-accommodation');
  });

  it('is refusing something unrecoverable: an arrival that fails accommodation never recovers, even once a room exists', () => {
    // The measurement the refusal is built on, taken against the unguarded
    // entry point so that it states a fact about `IntakeSystem` rather than
    // about the guard. If this ever stops being true -- if a `'failed'`
    // arrival becomes retryable -- then refusing at the boundary is no longer
    // the honest answer and this test is where that will be noticed.
    const runtime = createNewSimulationRuntime(SEED);
    const entityId = runtime.prisoners.admitPrisoner(ADMISSION, ARRIVAL);
    const index = runtime.prisoners.entityStore.getIndex(entityId);

    stepTo(runtime, 40);
    expect(stageOf(runtime, index)).toBe('failed');
    expect(runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 0, failedCount: 1 });

    // A cell arrives, registered by hand with a capacity and a bed capability
    // rather than furnished through the real route, because the subject here is
    // the *terminality* of `'failed'` and not the placement path. Four hundred
    // further ticks run.
    runtime.prisoners.roomInstances.register({
      instanceId: 'room-cell-1',
      roomCatalogId: CELL,
      anchorTile: { x: tileCoordinate(10), y: tileCoordinate(10) },
      residentCapacity: 4, concurrentUseCapacity: 4,
      objectCapabilities: ['sleep-surface'],
    });
    stepTo(runtime, 440);

    expect(stageOf(runtime, index), 'a failed arrival is terminal; that is why the command boundary refuses').toBe(
      'failed',
    );
    expect(runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 0, failedCount: 1 });
    // And the status strip counts that unrecoverable record as a prisoner
    // while reporting nobody in intake -- the misreading the refusal avoids.
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.prisoners).toBe(1);
    expect(counts.prisonersInIntake).toBe(0);
  });

  it('waits rather than failing when the room exists but holds nobody, which is what a zoned cell is today', () => {
    // The other side of the line the guard draws. A zoned cell contains
    // nothing, so it derives `residentCapacity: 0` and
    // `findAvailableResidence` refuses it: the arrival stays where it is and is
    // retried, a state the simulation counts. This must not be refused -- it is
    // the state that becomes a completed intake the moment a bed is placed in
    // that cell, which is what ADR 0028 phase 1 made reachable.
    const runtime = createNewSimulationRuntime(SEED);
    zoneCell(runtime, 'cmd-zone');
    admit(runtime, 'cmd-admit');
    const index = onlyPrisonerIndex(runtime);

    stepTo(runtime, 60);

    expect(stageOf(runtime, index)).toBe('accommodation-assignment');
    const metrics = runtime.prisoners.intakeSystem.getMetrics();
    expect(metrics.failedCount, 'a zoned room turns a terminal failure into a wait').toBe(0);
    expect(metrics.completedCount).toBe(0);
    expect(metrics.accommodationBacklogTicks).toBeGreaterThan(0);
  });

  it('decays every one of the six needs after admission, with no room, no route and no completed intake', () => {
    const runtime = createNewSimulationRuntime(SEED);
    zoneAndAdmitAtTickZero(runtime);
    const index = onlyPrisonerIndex(runtime);

    // Stored units *and* whole levels, and the first reading is the trap.
    // `NeedsComponent.get` rounds, and every rate in `NEED_DECAY_PER_TICK` is
    // far below one level per tick, so after the first decay interval five of
    // the six needs have genuinely moved and still read 255 -- exactly the
    // shape of the defect #259 described and #276 fixed. A test that pinned
    // only the rounded level would report those five as motionless and would
    // have passed against the pre-fix code. One decay interval has run: tick
    // 0's, which the prisoner was present for.
    expect(runtime.kernel.tick).toBe(1);
    expect(scaledNeeds(runtime, index)).toEqual({
      hunger: NEED_MAX_SCALED - 100,
      sleep: NEED_MAX_SCALED - 60,
      hygiene: NEED_MAX_SCALED - 40,
      bladder: NEED_MAX_SCALED - 160,
      safety: NEED_MAX_SCALED - 20,
      recreation: NEED_MAX_SCALED - 30,
    });
    expect(wholeNeeds(runtime, index)).toEqual({
      hunger: 255,
      sleep: 255,
      hygiene: 255,
      bladder: 254,
      safety: 255,
      recreation: 255,
    });

    stepTo(runtime, 200);
    expect(scaledNeeds(runtime, index)).toEqual({
      hunger: NEED_MAX_SCALED - 2_000,
      sleep: NEED_MAX_SCALED - 1_200,
      hygiene: NEED_MAX_SCALED - 800,
      bladder: NEED_MAX_SCALED - 3_200,
      safety: NEED_MAX_SCALED - 400,
      recreation: NEED_MAX_SCALED - 600,
    });
    expect(wholeNeeds(runtime, index)).toEqual({
      hunger: 245,
      sleep: 249,
      hygiene: 251,
      bladder: 239,
      safety: 253,
      recreation: 252,
    });

    // One in-game day: 2,400 ticks at the 50ms fixed step. Every need is
    // strictly below where it started, and none has hit the floor, so the
    // reading is decay rather than a clamp.
    stepTo(runtime, 2_400);
    expect(wholeNeeds(runtime, index)).toEqual({
      hunger: 135,
      sleep: 183,
      hygiene: 207,
      bladder: 63,
      safety: 231,
      recreation: 219,
    });
    for (const needId of NEED_IDS) {
      expect(runtime.prisoners.needs.getScaled(index, needId), `${needId} did not move`).toBeLessThan(NEED_MAX_SCALED);
      expect(runtime.prisoners.needs.getScaled(index, needId), `${needId} bottomed out`).toBeGreaterThan(0);
    }

    // The decay is exactly linear in ticks, which is what makes the figures
    // above a property of the rates rather than of the ten-tick cadence.
    expect(runtime.prisoners.needs.getScaled(index, 'hunger')).toBe(NEED_MAX_SCALED - 0.05 * NEED_SCALE * 2_400);

    // Stated so the reading above is not mistaken for a working prisoner: the
    // needs move while the prisoner does nothing at all, because intake never
    // completes and `ActionSystem` gates on `'completed'`.
    expect(stageOf(runtime, index)).toBe('accommodation-assignment');
  });

  it('produces an identical prisoner from an identical seed, and a different one from a different seed', () => {
    const run = (seed: number) => {
      const runtime = createNewSimulationRuntime(seed);
      zoneCell(runtime, 'cmd-zone');
      admit(runtime, 'cmd-admit');
      stepTo(runtime, 40);
      const index = onlyPrisonerIndex(runtime);
      const entityId = runtime.prisoners.entityStore.getIdByIndex(index);
      return {
        name: runtime.actorIdentity.getName('prisoner', entityId),
        riskTier: runtime.prisoners.records.riskTier[index],
        classificationGroupIndex: runtime.prisoners.records.classificationGroupIndex[index],
        sentenceEndTick: runtime.prisoners.records.sentenceEndTick[index],
        needs: scaledNeeds(runtime, index),
      };
    };

    const first = run(SEED);
    const second = run(SEED);
    expect(second).toEqual(first);
    // Both halves of the identity really were drawn, rather than left at a
    // slot default: a name exists and it came from `identity.actor-name`.
    expect(first.name).toBeDefined();

    // And the streams are genuinely feeding it: a different master seed is a
    // different prisoner. Without this the equality above would pass just as
    // well for a hard-coded arrival.
    const other = run(SEED + 1);
    expect(other.name).not.toEqual(first.name);
  });

  it('round-trips an admitted prisoner through save and load, needs and name included', () => {
    const runtime = createNewSimulationRuntime(SEED);
    zoneCell(runtime, 'cmd-zone');
    admit(runtime, 'cmd-admit');
    stepTo(runtime, 200);

    const index = onlyPrisonerIndex(runtime);
    const entityId = runtime.prisoners.entityStore.getIdByIndex(index);
    const before = {
      counts: projectStatusCounts(runtime, runtime.kernel.tick).prisoners,
      stage: stageOf(runtime, index),
      needs: scaledNeeds(runtime, index),
      name: runtime.actorIdentity.getName('prisoner', entityId),
      tile: [runtime.prisoners.position.tileX[index], runtime.prisoners.position.tileY[index]],
    };
    expect(before.counts).toBe(1);

    const restored = saveAndLoad(runtime);
    const restoredIndex = onlyPrisonerIndex(restored);

    // No save-version bump was needed for any of this, and that is a fact
    // about the format rather than a hope: prisoner components, entity
    // liveness and the identity registry have been carried since #70, and a
    // queued command's payload is `jsonValueSchema` -- generic JSON -- so a
    // seventh command type needs no schema change to survive in the kernel's
    // queue.
    expect({
      counts: projectStatusCounts(restored, restored.kernel.tick).prisoners,
      stage: stageOf(restored, restoredIndex),
      needs: scaledNeeds(restored, restoredIndex),
      name: restored.actorIdentity.getName('prisoner', restored.prisoners.entityStore.getIdByIndex(restoredIndex)),
      tile: [restored.prisoners.position.tileX[restoredIndex], restored.prisoners.position.tileY[restoredIndex]],
    }).toEqual(before);

    // And the restored session keeps decaying, rather than restoring a
    // prisoner the systems no longer iterate.
    stepTo(restored, 400);
    expect(restored.prisoners.needs.getScaled(restoredIndex, 'hunger')).toBeLessThan(before.needs['hunger']!);
  });

  it('carries a queued AdmitPrisoner across a save, and admits when the restored session dispatches it', () => {
    // The half of the protocol that has no other coverage: a command the
    // player issued against a paused clock is part of the kernel's queue and
    // therefore part of the save. If `commandJson` dropped a field or the
    // envelope rejected the payload, this is where a prisoner would go
    // missing -- silently, since nothing would have been refused either.
    const runtime = createNewSimulationRuntime(SEED);
    zoneCell(runtime, 'cmd-zone');
    runtime.kernel.submitCommand(
      'cmd-admit-queued',
      runtime.kernel.expectedSequence,
      runtime.kernel.tick + 50,
      packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }),
    );
    expect(projectStatusCounts(runtime, runtime.kernel.tick).prisoners).toBe(0);

    const restored = saveAndLoad(runtime);
    expect(projectStatusCounts(restored, restored.kernel.tick).prisoners, 'the command must not have run yet').toBe(0);

    stepTo(restored, 60);
    expect(projectStatusCounts(restored, restored.kernel.tick).prisoners).toBe(1);
    expect(restored.refusals.count).toBe(0);
  });
});
