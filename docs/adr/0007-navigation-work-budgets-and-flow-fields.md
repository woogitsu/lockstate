# ADR 0007: Navigation Work Budgets, Request Fairness and Flow-Field Sharing

## Status
Accepted

## Context
Issue #21 gave Lockstate a correct, permission-aware hierarchical router
(`findRoute`), but it is a synchronous, unbounded-per-call function: nothing
stops hundreds or thousands of actors from each requesting a full route
computation in the same simulation tick, and nothing lets many actors headed
to the same destination (a meal rush, a lockdown return-to-cell) share any
of that work. Issue #22 needs deterministic scheduling, a bounded per-tick
CPU budget, and evidence-backed sharing for common-destination scenarios,
without weakening #21's correctness or determinism guarantees.

No real prisoner/staff entity model exists yet (#23/#24 own that). Per the
owner's explicit decision for this issue, the budget/queue/flow-field
infrastructure is built and benchmarked against minimal synthetic "stub"
actors (an `EntityStore`-backed id plus a position/destination/
`RouteContext`, nothing else) rather than blocking on real gameplay content.

## Decision

### Work-unit budget: expanded search nodes, charged per resolved request
`SearchStats` (`local-search.ts`, `region-dijkstra.ts`) is an optional,
purely additive counter threaded through `boundedLocalSearch` and the
region/portal Dijkstra core (`runRegionDijkstra`, shared by `router.ts` and
`flow-field.ts`). One "expansion" is one tile or region dequeued from the
search frontier and having its neighbors examined -- the same unit
`docs/NAVIGATION.md`'s architecture notes already named as the deterministic
budget currency. `findRoute` and `findRouteUsingFlowField` both accept an
optional trailing `stats` parameter; passing none costs nothing and changes
no return value, so every #21 call site and test kept working unmodified.

Budgeting happens at **request granularity**, not by preempting a single
search mid-flight: `PathRequestQueue.processTick` sums each *fully computed*
request's expansions against a configured `workBudget` and stops picking up
new requests once that budget is spent for the tick, deferring the rest.
This matches #21's own bounding (`boundedLocalSearch` is already restricted
to the regions a route's plan touches, never the whole map), so a single
request's cost is naturally small and finite -- truncating a search
mid-computation would produce a route to nowhere, which is strictly worse
than deferring the whole request to the next tick.

**Always at least one request per tick.** If the very next request's cost
alone exceeds the remaining (or entire) budget, it is processed anyway. The
alternative -- a request whose cost exceeds the configured budget waits
forever -- is a availability bug, not a budget; forward progress always
wins over strict budget adherence for the pathological case.

### Priority + age-based fairness, not strict priority alone
`PathRequestQueue` orders pending requests by `effectivePriority = priority
+ floor(waitedTicks / agingIntervalTicks)`, then by enqueue tick, then by
request id (final deterministic tie-break, never Map iteration order, same
rule as every other search in this module). Strict priority alone can
starve low-priority requests indefinitely under sustained high-priority
load; aging guarantees any request's effective priority eventually exceeds
any fixed priority tier, so every request is processed in bounded time
provided the queue ever drains below its budget. `agingIntervalTicks` is a
configurable constant, not hard-coded gameplay policy -- callers (future
regime/security systems) choose what "urgent" means.

### Cancellation and deferred status are explicit, not implicit
`PathRequestQueue.cancel(id)` removes a still-pending request and is a
no-op (not an error) if the id is unknown or already resolved -- callers may
legitimately race with processing (an actor died, a destination became
irrelevant). `getPending(id)`/`pendingIds()` expose enqueue tick (hence
age) and queue depth directly; there is no separate "deferred" event
stream; a request's status is simply "in the queue" or "resolved," matching
the issue's "structured deferred status" requirement without inventing a
third state machine.

### Flow fields: shared region-level plan, per-actor local search
A `RegionFlowField` (`flow-field.ts`) is a single-source Dijkstra rooted at
the *destination* region (`runRegionDijkstra`, no early exit) recording,
for every other reachable region, the one portal to cross next toward that
destination. For an undirected graph with symmetric edge costs this is
mathematically identical to running #21's destination-rooted search once
instead of once per actor: it is the same shortest-path tree every
individual `findRoute` call to that destination would eventually discover,
computed once and reused.

Sharing happens at the **region-graph layer only**. The bounded local A*
tile search still runs once per actor (each starts from a different tile;
there is nothing to share there), but the expensive, graph-size-scaling
part -- the portal Dijkstra pass -- is paid once per (destination region,
`RouteContext` fingerprint) group per cache generation, not once per actor.
`PathRequestQueue` computes this per tick: pending requests are grouped by
`(destinationRegion, contextFingerprint)`; a group at or above
`flowFieldActivationThreshold` uses `getOrComputeRegionFlowField` (backed by
`FlowFieldCache`, invalidated exactly like `RouteCache` -- geometry change
invalidates everything, a specific door's access-version change invalidates
only fields that depend on it) instead of one `findRoute` per member.

**A field never fabricates a permission-denied diagnosis.**
`findRouteUsingFlowField` returns `undefined` (not a failure `RouteResult`)
whenever the field cannot answer a request -- wrong destination, stale
geometry, or the origin's region absent from the field's reachable set
(unreachable or blocked for that context). The caller then falls back to
`findRoute`, which pays for its own permission-aware-then-physical-fallback
double pass to produce #21's accurate `blockedBy` diagnostic. This keeps
the *shared* fast path free of any diagnostic responsibility: correctness
for the common (successful) case is proven by direct comparison against
`findRoute` (`tests/unit/navigation-flow-field.test.ts`); correctness for
every failure case is unconditionally #21's existing, already-tested logic.

### Route cache and flow-field cache both expose hit/miss/eviction metrics
`RouteCache`/`FlowFieldCache` (extended, not replaced -- `RouteCache`'s
existing two-tier invalidation from #21 is unchanged) now track cumulative
`hits`/`misses`/`evictions` (a specific door's access-version change) and
`geometryInvalidations` (a whole-graph rebuild), separately, because they
have very different blast radii and both benchmarks and future tuning work
want to see them apart.

### `NavigationSystem`: a real, generic, Kernel-scheduled system
`NavigationSystem implements SystemRegistration` and is registered on
`SimulationRuntime`'s `Kernel` in `createNewSimulationRuntime`
(`order: 150`, runs every tick). It owns its own `DoorRegistry` (or accepts
one, for tests/fixtures that need to pre-populate doors) and rebuilds its
`NavigationGraph` lazily via `isNavigationGraphStale`, exactly like #21's
existing invalidation contract. It is generic over request identity
(`id: string`) and knows nothing about what a prisoner or staff member is --
that is deliberate: #23/#24 own the real entity/component model; coupling
navigation scheduling to a specific gameplay entity representation now
would be inventing architecture #22 was never scoped to decide. Chunk
loading is still driven externally (`setLoadedChunks`), matching
`TopologyManager`'s existing convention documented in `docs/NAVIGATION.md`
("`SparseWorld` exposes no such enumeration").

### Minimal stub actors, not gameplay
Per the owner's decision, `tests/helpers/navigation-actor-stub.ts` spawns
synthetic actors through the real `EntityStore` (a stable numeric id, a
seeded origin/destination/`RouteContext`, nothing else) purely to drive
`NavigationSystem` at representative scale
(`tests/unit/navigation-system.test.ts`, 250 actors per scenario family,
Kernel-stepped to completion). It is intentionally *not* exported from
`src/`: it is test/benchmark scaffolding, not a production entity model,
so it cannot be mistaken for #23/#24's eventual real catalog-driven
prisoners and staff.

### Benchmark evidence: a hand-rolled mirror, not an import of production code
`benchmarks/scenarios/navigation-actor-tiers.mjs` follows this repository's
existing benchmark convention (`kernel-throughput.mjs`, `entity-soa.mjs`):
a small, dependency-free, hand-rolled re-implementation of the same
algorithm *shape* (the star-shaped cell-block-plus-canteen layout, the same
door clearance/permission/state cycling formulas as
`tests/helpers/navigation-fixture.ts`'s `buildCellBlockFixture`, the same
priority+aging+budget+flow-field-sharing queue logic), not an import of the
real TypeScript modules. This was a deliberate choice, not a shortcut:
`node`'s built-in TypeScript support (available on the pinned Node version)
strips *types* but rejects TypeScript-only runtime syntax this codebase
uses idiomatically (constructor parameter properties, used throughout,
including in `PathRequestQueue` itself) unless run with the experimental
`--experimental-transform-types` flag. `docs/BENCHMARKING.md` explicitly
commits the benchmark harness to stable, dependency-free tooling; adding an
experimental runtime flag requirement to `pnpm benchmark` would contradict
that contract for a single feature's benchmarks. Correctness of the real
algorithm is proven by TypeScript unit/integration tests that import the
actual modules (`navigation-path-request-queue.test.ts`,
`navigation-flow-field.test.ts`, `navigation-system.test.ts`); the
benchmark mirror exists only for throughput/scaling evidence, exactly the
role every other scenario in `benchmarks/` already plays.

`benchmarks/harness.mjs` gained one small, additive, backward-compatible
extension for this: a scenario's `run()` may now return
`{ checksum, metrics }` instead of a bare checksum, where `metrics` is a
JSON-serializable object of scenario-specific structured evidence (work
units, cache hit/miss, flow-field activations, per-tick latency
distribution). `metrics` is re-verified for exact determinism by
`scripts/verify-benchmark-result.mjs`, the same guarantee the checksum
already had. Non-deterministic evidence (heap memory) is deliberately kept
*out* of `metrics` for that reason and is reported only by the separate,
manually-run `scripts/run-navigation-actor-tier-report.mjs`, which is not
part of `pnpm benchmark`/`benchmark:smoke` and never gates CI -- see
`docs/NAVIGATION.md`'s directional evidence section and
`docs/BENCHMARKING.md`'s "no hard timing threshold" policy, both unchanged
in spirit by this ADR.

## Consequences

**Positive:**
- Per-tick navigation CPU cost is bounded and observable without ever
  truncating an in-flight search into a wrong answer.
- No request can starve indefinitely under sustained load (aging
  guarantees eventual promotion).
- Meal-rush-shaped convergence measurably shares work: the benchmark
  evidence shows `navigation.meal-rush` triggering many flow-field
  activations while `navigation.lockdown-return` (distinct destinations)
  triggers almost none, exactly the "evidence-driven, not used for every
  destination" requirement.
- Zero behavioral or type-signature change to any #21 code path that
  doesn't opt into the new optional `stats` parameter.

**Negative / accepted tradeoffs:**
- Request-granularity budgeting (not per-search-node preemption) means a
  single unusually expensive request can make one tick's actual work
  exceed the configured budget. Accepted because truncating a route
  mid-search has no safe partial answer, and the "at least one" rule
  bounds the pathological case to a single tick's overrun, not unbounded
  starvation.
- `flowFieldActivationThreshold`, `agingIntervalTicks` and
  `workBudgetPerTick` (`DEFAULT_NAVIGATION_SYSTEM_OPTIONS` in
  `new-session.ts`) are directional defaults backed by this ADR's
  benchmark evidence, not a committed performance contract -- consistent
  with `docs/ISSUE_BACKLOG.md`'s governance rule that candidate values
  remain candidates until repeated controlled baselines exist. Revisit
  once real gameplay load (#23+) is available to benchmark against.
- The benchmark mirror can drift from the real algorithm over time since
  it is a separate implementation. Accepted as the established, working
  tradeoff this repository already made for every prior benchmark
  scenario; kept honest by referencing the exact TypeScript files it
  mirrors in its own file header.
