// Self-contained mirror of #22's navigation work-budget/queue/flow-field
// design (src/simulation/navigation/{path-request-queue,flow-field,router}.ts),
// following this repository's established benchmark convention (see
// kernel-throughput.mjs, entity-soa.mjs): a hand-rolled, dependency-free
// re-implementation of the same *shape* of algorithm for throughput
// evidence, not an import of the production module graph. Correctness of
// the real algorithm is proven separately by
// tests/unit/navigation-path-request-queue.test.ts,
// tests/unit/navigation-flow-field.test.ts and
// tests/unit/navigation-system.test.ts, which exercise the actual
// TypeScript implementation.
//
// The synthetic layout is the same star-shaped cell-block+canteen shape as
// tests/helpers/navigation-fixture.ts's `buildCellBlockFixture`: each cell
// reaches the canteen through exactly one permission/clearance-gated door,
// cell-to-cell routes cross the canteen as a two-hop path. Door
// clearance/permission/state cycle by index with the identical formulas the
// real fixture uses, so the *reachability shape* (roughly 1-in-5 needing a
// permission, 1-in-7 starting closed) matches.

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function xoshiro128(s0, s1, s2, s3) {
  let a = s0 >>> 0;
  let b = s1 >>> 0;
  let c = s2 >>> 0;
  let d = s3 >>> 0;

  return function next() {
    const result = (rotateLeft(Math.imul(b, 5) >>> 0, 7) * 9) >>> 0;
    const t = (b << 9) >>> 0;

    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;

    c = (c ^ t) >>> 0;
    d = rotateLeft(d, 11);

    return result;
  };
}

const CANTEEN = 0;
const WORK_BUDGET_PER_TICK = 400;
const AGING_INTERVAL_TICKS = 15;
const FLOW_FIELD_ACTIVATION_THRESHOLD = 6;
const MAX_TICKS = 20_000;

function buildCellBlockGraph(cellCount) {
  const doorsByCellId = new Map();
  for (let i = 1; i <= cellCount; i += 1) {
    const idx = i - 1;
    doorsByCellId.set(i, {
      clearance: idx % 4,
      permission: idx % 5 === 0 ? 'medical' : null,
      state: idx % 7 === 0 ? 'closed' : 'open',
      corridorDistance: 2 + ((idx * 37) % 40),
    });
  }
  // Mirrors region-dijkstra.ts's cost of a full portal-graph pass scaling with graph size.
  const regionGraphExpansionCost = Math.max(4, Math.ceil(cellCount / 4));
  return { doorsByCellId, regionGraphExpansionCost };
}

function doorTraversalCost(door) {
  if (door.state === 'open') return 1;
  if (door.state === 'closed') return 1.5;
  return 2;
}

function checkAccess(door, context) {
  if (door.state === 'locked' && !context.emergencyOverride) return { allowed: false, reason: 'locked' };
  if (context.securityClearance < door.clearance) return { allowed: false, reason: 'insufficient-clearance' };
  if (door.permission !== null && !context.permissions.includes(door.permission)) return { allowed: false, reason: 'missing-permission' };
  return { allowed: true };
}

function resolveLeg(graph, cellId, context, chargeRegionGraphCost) {
  const door = graph.doorsByCellId.get(cellId);
  let expansions = chargeRegionGraphCost ? graph.regionGraphExpansionCost : 1;
  const access = checkAccess(door, context);
  if (!access.allowed) return { ok: false, reason: access.reason, expansions };
  expansions += door.corridorDistance;
  return { ok: true, cost: doorTraversalCost(door) * door.corridorDistance, expansions };
}

/** Mirrors findRoute: same-cell trivial case, one-hop to/from canteen, or a two-hop cell-to-cell route through it. */
function findRoute(graph, originCellId, destinationCellId, context, chargeRegionGraphCost) {
  if (originCellId === destinationCellId) return { ok: true, cost: 0, expansions: 1 };

  if (originCellId === CANTEEN) {
    const leg = resolveLeg(graph, destinationCellId, context, chargeRegionGraphCost);
    return leg.ok ? { ok: true, cost: leg.cost, expansions: leg.expansions } : { ok: false, reason: leg.reason, expansions: leg.expansions };
  }
  if (destinationCellId === CANTEEN) {
    const leg = resolveLeg(graph, originCellId, context, chargeRegionGraphCost);
    return leg.ok ? { ok: true, cost: leg.cost, expansions: leg.expansions } : { ok: false, reason: leg.reason, expansions: leg.expansions };
  }

  const legA = resolveLeg(graph, originCellId, context, chargeRegionGraphCost);
  if (!legA.ok) return { ok: false, reason: legA.reason, expansions: legA.expansions };
  const legB = resolveLeg(graph, destinationCellId, context, false); // region-graph part already paid/shared once above
  if (!legB.ok) return { ok: false, reason: legB.reason, expansions: legA.expansions + legB.expansions };
  return { ok: true, cost: legA.cost + legB.cost, expansions: legA.expansions + legB.expansions };
}

function contextFingerprint(context) {
  return `${context.securityClearance}|${[...context.permissions].sort().join(',')}`;
}

function spawnActors(rng, actorCount, cellCount, mode) {
  const actors = [];
  for (let i = 0; i < actorCount; i += 1) {
    const clearance = rng() % 6;
    const hasMedical = rng() % 5 === 0;
    const context = { securityClearance: clearance, permissions: hasMedical ? ['medical'] : [] };
    const priority = rng() % 3;

    let originCellId;
    let destinationCellId;
    if (mode === 'meal-rush') {
      originCellId = 1 + (rng() % cellCount);
      destinationCellId = CANTEEN;
    } else if (mode === 'lockdown-return') {
      originCellId = CANTEEN;
      destinationCellId = 1 + (rng() % cellCount);
    } else {
      originCellId = rng() % (cellCount + 1);
      destinationCellId = rng() % (cellCount + 1);
    }

    actors.push({ id: i, originCellId, destinationCellId, context, priority });
  }
  return actors;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedValues.length);
  return sortedValues[Math.max(0, rank - 1)];
}

/** Deterministic priority+age-fairness+budget+flow-field-sharing queue, mirroring path-request-queue.ts. */
function runQueue(graph, actors) {
  const pending = new Map(actors.map((actor) => [actor.id, { actor, enqueuedAtTick: 0 }]));
  const resolved = [];
  let totalExpansions = 0;
  let flowFieldActivations = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  const routeCache = new Map();

  const cacheKeyFor = (actor) => `${actor.originCellId}->${actor.destinationCellId}#${contextFingerprint(actor.context)}`;

  let tick = 0;
  for (; tick < MAX_TICKS && pending.size > 0; tick += 1) {
    const entries = [...pending.values()];
    entries.sort((a, b) => {
      const waitedA = tick - a.enqueuedAtTick;
      const waitedB = tick - b.enqueuedAtTick;
      const effectiveA = a.actor.priority + Math.floor(waitedA / AGING_INTERVAL_TICKS);
      const effectiveB = b.actor.priority + Math.floor(waitedB / AGING_INTERVAL_TICKS);
      if (effectiveA !== effectiveB) return effectiveB - effectiveA;
      if (a.enqueuedAtTick !== b.enqueuedAtTick) return a.enqueuedAtTick - b.enqueuedAtTick;
      return a.actor.id - b.actor.id;
    });

    const groupCounts = new Map();
    for (const entry of entries) {
      const key = `${entry.actor.destinationCellId}#${contextFingerprint(entry.actor.context)}`;
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }

    const groupChargedThisTick = new Set();
    let usedBudget = 0;

    for (const entry of entries) {
      if (resolved.length > 0 && usedBudget >= WORK_BUDGET_PER_TICK) break;

      const groupKey = `${entry.actor.destinationCellId}#${contextFingerprint(entry.actor.context)}`;
      const eligible = (groupCounts.get(groupKey) ?? 0) >= FLOW_FIELD_ACTIVATION_THRESHOLD;
      const isFirstInGroupThisTick = eligible && !groupChargedThisTick.has(groupKey);
      if (isFirstInGroupThisTick) {
        groupChargedThisTick.add(groupKey);
        flowFieldActivations += 1;
      }

      const cacheKey = cacheKeyFor(entry.actor);
      let result;
      let expansions;
      if (!eligible && routeCache.has(cacheKey)) {
        result = routeCache.get(cacheKey);
        expansions = 0;
        cacheHits += 1;
      } else {
        if (!eligible) cacheMisses += 1;
        const chargeRegionGraphCost = eligible ? isFirstInGroupThisTick : true;
        result = findRoute(graph, entry.actor.originCellId, entry.actor.destinationCellId, entry.actor.context, chargeRegionGraphCost);
        expansions = result.expansions;
        if (!eligible) routeCache.set(cacheKey, result);
      }

      pending.delete(entry.actor.id);
      totalExpansions += expansions;
      usedBudget += expansions;
      resolved.push({
        id: entry.actor.id,
        ok: result.ok,
        reason: result.ok ? null : result.reason,
        cost: result.ok ? result.cost : null,
        waitedTicks: tick - entry.enqueuedAtTick,
      });
    }
  }

  return { resolved, ticksTaken: tick, totalExpansions, flowFieldActivations, cacheHits, cacheMisses };
}

function runNavigationScenario(seed, actorCount, mode) {
  const cellCount = Math.max(16, Math.ceil(actorCount / 8));
  const nextRng = xoshiro128(seed, seed ^ 0x6c8e9cf5, seed ^ 0xb2ac1087, seed ^ 0x91e10da5);
  const graph = buildCellBlockGraph(cellCount);
  const actors = spawnActors(nextRng, actorCount, cellCount, mode);
  const outcome = runQueue(graph, actors);

  const latencies = outcome.resolved.map((r) => r.waitedTicks).sort((a, b) => a - b);
  const resolvedCount = outcome.resolved.filter((r) => r.ok).length;
  const failedCount = outcome.resolved.length - resolvedCount;

  let stateHash = seed >>> 0;
  for (const r of outcome.resolved) {
    const costBits = r.cost === null ? 0 : Math.round(r.cost * 1000);
    stateHash = Math.imul(stateHash ^ (r.id + 1) ^ costBits ^ r.waitedTicks, 0x517cc1b7) >>> 0;
  }
  stateHash = (stateHash ^ outcome.ticksTaken ^ outcome.totalExpansions ^ outcome.flowFieldActivations) >>> 0;

  const metrics = {
    actorCount,
    cellCount,
    resolvedCount,
    failedCount,
    ticksTaken: outcome.ticksTaken,
    totalExpansions: outcome.totalExpansions,
    workUnitsPerActor: Math.round((outcome.totalExpansions / actorCount) * 1000) / 1000,
    flowFieldActivations: outcome.flowFieldActivations,
    cacheHits: outcome.cacheHits,
    cacheMisses: outcome.cacheMisses,
    latencyTicks: {
      mean: Math.round((latencies.reduce((sum, v) => sum + v, 0) / latencies.length) * 1000) / 1000,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.at(-1) ?? 0,
    },
  };

  return { checksum: `0x${stateHash.toString(16).padStart(8, '0')}`, metrics };
}

function makeScenario(id, description, seed, mode) {
  return Object.freeze({
    id,
    version: 1,
    description,
    seed,
    profiles: Object.freeze({
      smoke: Object.freeze({ warmupIterations: 1, measuredIterations: 3, operationsPerIteration: 250 }),
      full: Object.freeze({ warmupIterations: 2, measuredIterations: 5, operationsPerIteration: 5_000 }),
    }),
    run({ seed: runSeed, operationsPerIteration }) {
      return runNavigationScenario(runSeed, operationsPerIteration, mode);
    },
  });
}

export const navigationMealRushScenario = makeScenario(
  'navigation.meal-rush',
  'Work-budget/queue/flow-field throughput for many actors converging on one shared destination (meal rush), mirroring src/simulation/navigation/path-request-queue.ts and flow-field.ts.',
  0x4d45414c, // 'MEAL'
  'meal-rush',
);

export const navigationLockdownReturnScenario = makeScenario(
  'navigation.lockdown-return',
  'Work-budget/queue throughput for many actors each returning to a distinct assigned cell (lockdown return-to-cell) -- no shared-destination flow-field benefit available.',
  0x4c4f434b, // 'LOCK'
  'lockdown-return',
);

export const navigationMixedDestinationScenario = makeScenario(
  'navigation.mixed-destination',
  'Work-budget/queue/flow-field throughput for actors with independently random origin/destination pairs (mixed destinations).',
  0x4d495844, // 'MIXD'
  'mixed',
);

/** Exposed for `scripts/run-navigation-actor-tier-report.mjs`'s all-four-tiers directional report. */
export { runNavigationScenario };
