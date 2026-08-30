/**
 * DRIVES PRODUCTION CODE, NOT A MODEL OF IT.
 *
 * ADR 0059's cost table, turned from four milliseconds into counted work.
 *
 * `docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md` prices the
 * whole actor-publication path at 500 and 5,000 actors -- `LocomotionStore.advance`
 * per tick, `encodeRenderActorsKeyframe` per publication, and the main thread's
 * `decodeRenderActorsPayload` plus `actorsFromDelta` -- and concludes that the
 * receiver's half is **0.67 ms per publication at 5,000 actors, ten times a
 * second**. Until this scenario existed, none of the four had a standing gate:
 * #410 converted the navigation family and left the actor family, which landed
 * afterwards.
 *
 * ## Why the metric is calls and bytes, not milliseconds
 *
 * Every number in ADR 0059's table is a duration, and a duration cannot gate
 * anything here. `docs/BENCHMARKING.md`'s CI policy refuses a wall-clock
 * threshold on a shared runner, and the result contract is stricter still:
 * `scripts/verify-benchmark-result.mjs` deep-equals a scenario's `metrics`
 * against a fresh run, so a timing could not even be *recorded* there without
 * making every result mismatch. Measured on this container while two other
 * agents were working, `navigation.production.single-request-budget`'s mean
 * moved 7.004 -> 8.586 ms across three runs of an unchanged tree -- 23% -- while
 * its checksum and every counted metric came back byte-identical.
 *
 * So this scenario bounds what makes those milliseconds what they are:
 *
 * - **Bytes per actor.** The main thread's whole cost is linear in the record
 *   size, and `renderActorsByteLength` is production arithmetic. 20 bytes an
 *   actor is what makes ADR 0059's 5,000-actor keyframe 100,016 bytes; a sixth
 *   word would make it 120,016 and make every row of that table wrong.
 * - **Walks of the population.** `render-actors-keyframe.ts`'s "Two passes,
 *   deliberately" is a cost decision -- one liveness read per allocated slot in
 *   the sizing pass, one in the writing pass, because growing a buffer would
 *   allocate and copy. `isIndexAliveCallsPerSlot` is that decision, made
 *   mechanical. A third pass is a 50% cost increase that no ceiling on bytes
 *   and no checksum can see.
 * - **Reads per live actor.** `locomotionReadCallsPerLiveActor` pins the
 *   encoder's other per-actor cost at exactly one.
 * - **Edge re-validations per crossing.** ADR 0077 added a predicate that
 *   `LocomotionStore.advance` asks before every tile crossing, and its cost
 *   claim is that this is *once per crossing and not once per tick* -- one call
 *   every second tick per walker at `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`, and
 *   none at all for the standing population. `canCrossCalls` and
 *   `canCrossCallsPerWalkerPerPublication` are that sentence made mechanical.
 *   A predicate moved out of the crossing branch and into the per-tick loop
 *   would double it and move no other metric here.
 * - **Outcome counts.** `renderActorCount` and `decodedRecordCount` are pinned
 *   with `equals` for `docs/BENCHMARKING.md`'s reason: a change that broke the
 *   workload would lower every count, and a ceiling would call that an
 *   improvement.
 *
 * ## One iteration is one render-delta publication
 *
 * `RENDER_DELTA_PUBLISH_INTERVAL_MS` is 100 and the clock's step is 50 ms, both
 * read out of production rather than copied, so a publication covers exactly
 * two ticks. An iteration therefore does what the worker does between two
 * `simulation/delta` messages: begin the walks, advance them one tick at a
 * time, encode one keyframe, and then do the main thread's half of the same
 * publication. At `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` a tile takes two ticks,
 * so every walker crosses exactly one tile per iteration and `writeTileCalls`
 * is exactly the walking count -- an equality, not a measurement with headroom.
 *
 * ## What ADR 0059 claims that this now measures
 *
 * > *"this decision makes that fix worth less than it looked: a walking actor
 * > changes its position every tick, so the changed set at any moment is every
 * > actor in transit rather than the handful of arrivals ADR 0040 priced it
 * > against. At the fractions above it would still save roughly two thirds of
 * > the send."*
 *
 * `changedOnlyByteShare` is that sentence as a number: `renderActorsByteLength`
 * over the actors whose position moved this publication, against the same
 * production function over the whole live population. It is reported rather
 * than bounded, because the changed-only encoding it prices does not exist yet
 * -- ADR 0040 named it and did not build it -- and a bound on a hypothetical is
 * a bound on the fixture's walking fraction.
 *
 * ## What this scenario does *not* cover
 *
 * - **No `postMessage` and no structured clone.** ADR 0059's own open question
 *   1 asks for a real transfer measurement; this is in-process, exactly as its
 *   table is.
 * - **No changed-only encoding**, because there is none: the payload's only
 *   flag is `RENDER_ACTORS_KEYFRAME_FLAG` and every publication is a full
 *   keyframe. `removedCount` is therefore always zero here.
 * - **Nothing above locomotion.** No `NavigationSystem`, no `ActionSystem`, no
 *   kernel. Routes are handed to `beginWalk` directly, so this measures what a
 *   publication costs and not what producing one route costs -- that is the
 *   `navigation.production.*` family's subject.
 * - **What ADR 0077's predicate *decides*, only how often it is asked.** The
 *   grid here has no `SparseWorld`, no `DoorRegistry` and no walls, so
 *   `canCross` is open ground and answers yes to everything;
 *   `isEdgeTraversable` and `edgeStanding` are `tests/unit/` and
 *   `tests/integration/wall-built-mid-walk.test.ts`'s subject, not this file's.
 *   The one thing this scenario is entitled to say about ADR 0077 is the call
 *   count, which is why that is the only thing it bounds.
 * - **Constant-factor regressions inside a per-actor step are invisible.**
 *   An `actorsFromDelta` that allocated a second object per actor would cost
 *   real milliseconds and move no count here. Counted work bounds *how many
 *   times* production touches an actor and *how many bytes* it spends on one;
 *   it cannot bound what happens between two of those touches. Nothing in this
 *   repository can, on a shared runner, and pretending otherwise is what
 *   `docs/BENCHMARKING.md`'s wall-clock policy refuses.
 * - **The kernel step is read from `FixedStepClock`'s class default**, which is
 *   50 and agrees with the literal `state-machine.ts:208` passes -- but that
 *   literal is not exported, so a session re-tuned there and not in the class
 *   default would leave this scenario measuring the old cadence.
 *
 * ## What this scenario's `samplesMs` over-counts
 *
 * Nothing gates on it, but somebody will read it, so: an iteration restores the
 * position arrays from a template and calls `beginWalk` once per walker, both
 * to put the fixture back where the previous iteration found it. A real
 * publication does neither -- a prison starts a handful of walks per
 * reconsideration cycle, not 1,667 every 100 ms -- and `beginWalk` validates
 * every leg of the route it is handed. Routes are kept to the shortest that
 * outlives a publication (two legs) to make that overhead as small as it can
 * be, but it is still there, and it is one more reason the counted metrics
 * rather than the timings are this scenario's subject. ADR 0059's own table is
 * the place to look for a per-step figure, with the caveat its 2026-08-28
 * amendment records about reproducing it.
 */
import { buildActorPopulation } from '../fixtures/actor-population.mjs';
import { loadActorPublicationModules } from '../production-modules.mjs';

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

function mixHash(hash, value) {
  return Math.imul(hash ^ (value >>> 0), 0x517cc1b7) >>> 0;
}

/**
 * One publication cycle over a live population: advance the walks, encode the
 * keyframe, then decode it and build the renderer's actor list.
 */
async function runPublication(seed, population) {
  const modules = await loadActorPublicationModules();
  const fixture = buildActorPopulation(modules, population);
  const {
    source,
    locomotion,
    position,
    templateTileX,
    templateTileY,
    walkerKeys,
    walkerRoutes,
  } = fixture;

  const kernelStepMilliseconds = new modules.FixedStepClock().stepMilliseconds;
  const ticksPerWallSecond = 1_000 / kernelStepMilliseconds;
  const ticksPerPublication = modules.RENDER_DELTA_PUBLISH_INTERVAL_MS / kernelStepMilliseconds;

  // Positions are the one piece of fixture state a publication mutates
  // (`writeTile` is how `LocomotionStore` hands a whole-tile move to the
  // population that owns it), so they are restored from the template rather
  // than left to drift -- otherwise iteration two would checksum differently
  // from iteration one and the harness would call the scenario nondeterministic
  // when it is only cumulative.
  position.tileX.set(templateTileX);
  position.tileY.set(templateTileY);
  fixture.resetCounters();

  let canCrossCalls = 0;
  let writeTileCalls = 0;
  let arrivedCount = 0;
  let arrivedKeySum = 0;
  // Open ground: this scenario's grid has no world, no doors and no walls, so
  // the honest answer to every edge is yes. It counts, because since ADR 0077
  // this predicate is a real per-crossing cost of a publication and counting
  // work is what this scenario is for -- see `canCrossCalls` below.
  const canCross = () => {
    canCrossCalls += 1;
    return true;
  };
  const writeTile = (key, tile) => {
    writeTileCalls += 1;
    position.tileX[key] = tile.x;
    position.tileY[key] = tile.y;
  };
  const onArrived = (keys) => {
    arrivedCount += keys.length;
    for (const key of keys) arrivedKeySum = mixHash(arrivedKeySum, key);
  };

  for (let index = 0; index < walkerKeys.length; index += 1) {
    locomotion.beginWalk(walkerKeys[index], walkerRoutes[index]);
  }
  for (let tick = 0; tick < ticksPerPublication; tick += 1) {
    locomotion.advance(1, canCross, writeTile, onArrived);
  }

  const walkersInTransit = locomotion.walkingCount;
  const buffer = modules.encodeRenderActorsKeyframe(source, ticksPerWallSecond);
  const payload = modules.decodeRenderActorsPayload(buffer);
  const actors = modules.actorsFromDelta(payload);

  let stateHash = seed >>> 0;
  for (const actor of actors) {
    stateHash = mixHash(stateHash, actor.id);
    stateHash = mixHash(stateHash, Math.round(actor.tileX * modules.RENDER_ACTORS_SUBTILE_UNITS));
    stateHash = mixHash(stateHash, Math.round(actor.tileY * modules.RENDER_ACTORS_SUBTILE_UNITS));
    stateHash = mixHash(stateHash, Math.round(actor.deltaX * modules.RENDER_ACTORS_SUBTILE_UNITS));
    stateHash = mixHash(stateHash, Math.round(actor.deltaY * modules.RENDER_ACTORS_SUBTILE_UNITS));
    stateHash = mixHash(stateHash, actor.facing === undefined ? 0xff : actor.facing.length);
  }
  stateHash = mixHash(stateHash, arrivedKeySum);
  stateHash = mixHash(stateHash, buffer.byteLength);

  // The changed set at the moment of publication: everybody still in transit,
  // plus everybody who finished a leg into an arrival during these ticks. Both
  // moved, so a changed-only encoding would have to carry both.
  const changedActorCount = walkersInTransit + arrivedCount;

  return {
    checksum: `0x${stateHash.toString(16).padStart(8, '0')}`,
    metrics: {
      source: 'production',
      population,
      allocatedSlots: fixture.allocatedSlots,
      liveActorCount: fixture.liveActorCount,
      walkingCount: fixture.walkingCount,
      kernelStepMilliseconds,
      renderDeltaPublishIntervalMs: modules.RENDER_DELTA_PUBLISH_INTERVAL_MS,
      ticksPerPublication,
      // Worker, per tick (ADR 0059 row 1, plus ADR 0077's per-crossing predicate).
      writeTileCalls,
      canCrossCalls,
      canCrossCallsPerWalkerPerPublication: canCrossCalls / fixture.walkingCount,
      arrivedCount,
      walkersInTransit,
      // Worker, per publication (ADR 0059 row 2).
      isIndexAliveCalls: fixture.counters.isIndexAlive,
      isIndexAliveCallsPerSlot: fixture.counters.isIndexAlive / fixture.allocatedSlots,
      getIdByIndexCalls: fixture.counters.getIdByIndex,
      locomotionReadCalls: fixture.counters.locomotionRead,
      locomotionReadCallsPerLiveActor: fixture.counters.locomotionRead / fixture.liveActorCount,
      payloadByteLength: buffer.byteLength,
      payloadBytesPerActor: round4(buffer.byteLength / fixture.liveActorCount),
      // Main thread, per publication (ADR 0059 rows 3 and 4).
      decodedRecordCount: payload.recordCount,
      decodedRemovedCount: payload.removed.length,
      decodedLayoutVersion: payload.layoutVersion,
      decodedKeyframeFlag: payload.keyframe ? 1 : 0,
      renderActorCount: actors.length,
      // ADR 0059's claim about ADR 0040's unbuilt changed-only encoding.
      changedActorCount,
      changedOnlyByteShare: round4(
        modules.renderActorsByteLength(changedActorCount, 0) / modules.renderActorsByteLength(fixture.liveActorCount, 0),
      ),
    },
  };
}

/**
 * Counted-work bounds and outcome pins for one publication.
 *
 * Every literal below was measured on this tree and written down by hand; none
 * is computed from the run it gates, which is the defect #410 was filed about.
 * A count here has no run-to-run variance at all, so several of these are
 * `equals` rather than ceilings with headroom: `writeTileCalls` is the walking
 * count because two ticks at `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` is exactly
 * one tile, and `isIndexAliveCallsPerSlot` is two because the encoder makes
 * exactly two passes. Where a number is an exact consequence of a documented
 * decision, a ceiling with headroom would be strictly weaker and would say
 * something the code does not.
 *
 * `walkersInTransit` is pinned for the same reason `arrivedCount` is, and for
 * a reason this scenario paid for: on 2026-08-29 the `verify` job caught
 * `arrivedCount` at `0` because this file still called `advance` with ADR
 * 0077's parameter list missing, so every walker was refused its first edge.
 * `walkersInTransit`, `changedActorCount` and `changedOnlyByteShare` all went
 * to zero with it and none of the three was bounded, while `writeTileCalls`
 * stayed at exactly `167` *by coincidence* -- the misplaced `writeTile` was
 * being invoked in the predicate's slot, once per walker, which is the same
 * count one crossing per walker produces. A count can be right for the wrong
 * reason; the arithmetic that makes it right is what the neighbouring pins are
 * for.
 *
 * `kernelStepMilliseconds`, `renderDeltaPublishIntervalMs` and
 * `ticksPerPublication` are bounded for the reason
 * `navigation.production.single-request-budget` bounds `workBudgetPerTick`:
 * they are the denominators of everything above them, and a denominator nobody
 * bounds can move and leave the scenario green while inverting its meaning.
 */
const SMOKE_BOUNDS = Object.freeze({
  population: { equals: 500 },
  allocatedSlots: { equals: 550 },
  liveActorCount: { equals: 500 },
  walkingCount: { equals: 167 },
  kernelStepMilliseconds: { equals: 50 },
  renderDeltaPublishIntervalMs: { equals: 100 },
  ticksPerPublication: { equals: 2 },
  writeTileCalls: { equals: 167 },
  canCrossCalls: { equals: 167 },
  canCrossCallsPerWalkerPerPublication: { equals: 1 },
  arrivedCount: { equals: 21 },
  walkersInTransit: { equals: 146 },
  isIndexAliveCalls: { equals: 1_100 },
  isIndexAliveCallsPerSlot: { equals: 2 },
  getIdByIndexCalls: { equals: 500 },
  locomotionReadCalls: { equals: 500 },
  locomotionReadCallsPerLiveActor: { equals: 1 },
  payloadByteLength: { equals: 10_016 },
  payloadBytesPerActor: { max: 20.032 },
  decodedRecordCount: { equals: 500 },
  decodedRemovedCount: { equals: 0 },
  decodedLayoutVersion: { equals: 2 },
  decodedKeyframeFlag: { equals: 1 },
  renderActorCount: { equals: 500 },
});

const FULL_BOUNDS = Object.freeze({
  population: { equals: 5_000 },
  allocatedSlots: { equals: 5_500 },
  liveActorCount: { equals: 5_000 },
  walkingCount: { equals: 1_667 },
  kernelStepMilliseconds: { equals: 50 },
  renderDeltaPublishIntervalMs: { equals: 100 },
  ticksPerPublication: { equals: 2 },
  writeTileCalls: { equals: 1_667 },
  canCrossCalls: { equals: 1_667 },
  canCrossCallsPerWalkerPerPublication: { equals: 1 },
  arrivedCount: { equals: 209 },
  walkersInTransit: { equals: 1_458 },
  isIndexAliveCalls: { equals: 11_000 },
  isIndexAliveCallsPerSlot: { equals: 2 },
  getIdByIndexCalls: { equals: 5_000 },
  locomotionReadCalls: { equals: 5_000 },
  locomotionReadCallsPerLiveActor: { equals: 1 },
  payloadByteLength: { equals: 100_016 },
  payloadBytesPerActor: { max: 20.0032 },
  decodedRecordCount: { equals: 5_000 },
  decodedRemovedCount: { equals: 0 },
  decodedLayoutVersion: { equals: 2 },
  decodedKeyframeFlag: { equals: 1 },
  renderActorCount: { equals: 5_000 },
});

export const actorRenderPublicationScenario = Object.freeze({
  id: 'actors.production.render-publication',
  version: 1,
  description:
    'One real render-delta publication over a live population: LocomotionStore.advance for the ticks a publication covers, then encodeRenderActorsKeyframe, decodeRenderActorsPayload and actorsFromDelta over the real EntityStore and PositionComponent. Primary metrics are how many times production walks the population and how many bytes it spends per actor -- the counted work behind ADR 0059’s millisecond table -- not elapsed time.',
  seed: 0x57414c4b, // 'WALK'
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 500,
      metricBounds: SMOKE_BOUNDS,
    }),
    full: Object.freeze({
      warmupIterations: 2,
      measuredIterations: 5,
      operationsPerIteration: 5_000,
      metricBounds: FULL_BOUNDS,
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runPublication(seed, operationsPerIteration);
  },
});
