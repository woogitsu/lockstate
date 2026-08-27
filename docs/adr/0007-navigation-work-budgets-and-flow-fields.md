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

When this ADR was written, no real prisoner/staff entity model existed
(#23/#24 own that). That is no longer true: six production systems under
`src/simulation/` now call `NavigationSystem.requestRoute` —
`incidents/response-system.ts:329`, `operations/job-system.ts:164`,
`contraband/search-system.ts:262`, `prisoners/action-system.ts:380`,
`security/deployment-system.ts:128` and `security/patrol-system.ts:103`. The
decision below is unaffected by that and remains correct: `NavigationSystem`
is still generic over `id: string`
(`src/simulation/navigation/navigation-system.ts:70`, in the `requestRoute`
signature declared at `:69`) and each of the six supplies its own id shape,
which is precisely what this Context argued for.

**Five of those seven anchors were re-measured and had drifted; the count of six
callers is unchanged and was re-derived, not carried over.** `grep -rn
"requestRoute(" src/simulation/` excluding the declaration returns exactly these
six files, one call each. The old anchors read `navigation-system.ts:66`,
`response-system.ts:147`, `job-system.ts:140`, `search-system.ts:177` and
`action-system.ts:205`; `deployment-system.ts:128` and `patrol-system.ts:103`
had not moved. The count is the durable half of this sentence and the anchors
are not, which is why the grep that produces it is written out here.

Per the owner's explicit decision for this issue, the budget/queue/flow-field
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
`TopologyManager`'s existing "no enumeration" convention as documented in
`docs/NAVIGATION.md:236`. (That parenthetical previously quoted
`docs/NAVIGATION.md` as saying "`SparseWorld` exposes no such enumeration";
that string has never been in that file, on any branch. The convention it
described is real, so only the quotation is withdrawn.)

### Minimal stub actors, not gameplay
Per the owner's decision, `tests/helpers/navigation-actor-stub.ts` spawns
synthetic actors through the real `EntityStore` (a stable numeric id, a
seeded origin/destination/`RouteContext`, nothing else) purely to drive
`NavigationSystem` at representative scale
(`tests/unit/navigation-system.test.ts`, 250 actors per scenario family,
Kernel-stepped to completion). It is intentionally *not* exported from
`src/`: it is test/benchmark scaffolding, not a production entity model,
so it cannot be mistaken for a real catalog-driven prisoner or staff model.
That model is no longer hypothetical — `src/simulation/prisoners/` and
`src/simulation/security/` hold one — and this helper is still confined to
`tests/`, which is what the distinction above turns on.

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

## Amendment, 2026-08-25: the two accessors named for deferred status are removed; the decision is not

*Issue #177, item 2. The "Cancellation and deferred status are explicit, not
implicit" section above is left exactly as accepted — an ADR is the record of
what was decided, not a description of the current tree — and this amendment
records what the tree does instead, and why that is the same decision rather
than a departure from it.*

`PathRequestQueue.getPending(id)` and `PathRequestQueue.pendingIds()` are
deleted. `size()` stays, and `NavigationSystem.getResult(id)` is what a caller
reads to tell the two states apart.

### What the decision above actually decides

Three things, and only the first two are decisions:

1. `cancel(id)` is a no-op on an id that is unknown or already resolved.
2. There is **no separate "deferred" event stream and no third state
   machine**: a request's status is "in the queue" or "resolved".
3. `getPending(id)`/`pendingIds()` are the accessors through which (2) is
   observed, "expos[ing] enqueue tick (hence age) and queue depth directly".

(1) and (2) are the architecture. (3) is a claim about *mechanism*, written
when the section was drafted and when — as the Context section above already
records — no real prisoner or staff entity model existed to read it. It was
never re-checked against the callers that arrived afterwards.

### What the tree does instead, per clause

**"In the queue" versus "resolved" — satisfied, by every caller there is.**
All six production callers of `NavigationSystem.requestRoute` named in the
Context section keep their own request id and read status as
`getResult(id) === undefined` → still queued, defined → resolved. Their own
comments say it in the ADR's words: *"still queued/deferred"*
(`operations/job-system.ts`, `security/patrol-system.ts`). That is two states,
polled, with no event stream and no third state — the decision, implemented,
six times over.

**"Queue depth" — satisfied, and still exposed.** `PathRequestQueue.size()`,
surfaced on the system as `NavigationSystem.pendingCount()`. `pendingIds()`
was a strictly weaker duplicate of it; the tests that pinned it asserted
`pendingIds().length === size()`, which is the admission in test form.

**"Enqueue tick (hence age)" — the one clause that loses its accessor, and
the aging rule above is why it can.** `enqueuedAtTick` is still recorded on
every pending entry, still the input to `effectivePriority`, and still
reported to the caller as `ResolvedPathRequest.waitedTicks` when the request
resolves. What is gone is reading a *waiting* request's age from outside. The
fairness decision two sections above is what makes that unnecessary: aging
guarantees any request's effective priority eventually exceeds any fixed
tier, so an old request is promoted by the queue automatically. An external
observer watching for one and intervening would be re-implementing aging by
hand, on top of the mechanism built to remove the need for it.

**The one case where "in the queue" could have been ambiguous is closed
structurally, not by asking.** A snapshot restored into a freshly constructed
`NavigationSystem` leaves a consumer holding an id that the new queue never
received, which would poll `getResult` forever. `getPending(id)` is exactly
the accessor that would diagnose it. It is not what the code does: three
independent `loadSnapshot` implementations — `operations/job.ts`,
`security/guard-roster.ts` and `prisoners/components.ts` — clear the stale id
and re-request on the next scheduled tick, each with the reasoning written
out. The situation the accessor would have reported is prevented instead of
queried, which is the stronger fix and the one already shipped.

### Why deleting rather than wiring

The honest alternative was to give the accessors a consumer. There is none to
give them: the "future regime/security systems" the section anticipates have
since arrived — incidents, jobs, contraband searches, prisoner actions,
deployment and patrol — and not one of them needs a pending request's age or
a listing of ids, because each already knows the single id it is waiting on.
Inventing a consumer to justify an accessor is the inversion of this
repository's rule that implementation follows the decision, and it would have
added a reader whose only purpose was to be read.

Measured before deleting, and the reason this could not simply be left alone:
replacing `pendingIds()` with `return []` and `getPending()` with
`return undefined` left the entire suite green before #251 added
`tests/unit/navigation-path-request-queue.test.ts`. An accessor an accepted
ADR relies on was free to return nothing. Unused *and* unguarded is how a
decision record drifts away from the code it records.

### The gate

`tests/foundation/navigation-deferred-status-contract.test.ts` fails if either
name reappears anywhere in `src/`, and fails if this amendment or the original
sentence it amends is removed from this file. Bringing either accessor back is
therefore a change to this ADR, which is what it was in the first place.

## Amendment, accepted 2026-08-26: the shared plan is the plan `findRoute` computes, because the router's search direction moved to meet it

*Issues #357, #358, #359 and #360. The sections above are left exactly as
accepted — an ADR is the record of what was decided — and this amendment records
what changed underneath them, which of their sentences was false when it was
written, and the one decision the sections above do not contain.*

*Approved by the owner on 2026-08-26, and the approval is worth one sentence of
its own because nothing mechanical can show it: 0007's `Status` line does not
move, no row in `docs/adr/README.md` changes, and
`adr-numbering-contract.test.ts` counts documents by their `Status` line, so an
amendment inside an accepted ADR is invisible to every gate in this repository.
The queue entry in `docs/adr/STATUS-QUEUE.md` §2 was the only record that this
decision was outstanding, and it is deleted in the same commit as this heading —
which means this paragraph is now the only record that it was ever pending.*

### The sentence that was false, and what it cost

> For an undirected graph with symmetric edge costs this is **mathematically
> identical** to running #21's destination-rooted search once instead of once
> per actor: it is **the same shortest-path tree every individual `findRoute`
> call to that destination would eventually discover**, computed once and
> reused.

#21's search was not destination-rooted. `router.ts`'s `dijkstraRegionPath`
passed `origin` as the source and `destination` as the early exit, so the
parenthetical described a search that did not exist, and the two ends do not
agree. Total path cost is symmetric, so `dist` agreed; `prevPortal` did not. A
relaxation in `runRegionDijkstra` is a strict improvement, so among equal-cost
predecessors the recorded one is whichever was relaxed first — and "first" is
frontier order *measured from the search's own source*. Rooted at the origin,
the destination's predecessor is chosen by distance-from-origin; rooted at the
destination, the origin's successor is chosen by distance-from-destination.
Those are different quantities, so the two searches selected different portals
whenever two region routes tied, and the chosen portal sequence is what bounds
the tile search — so a region-level tie became a tile-level difference.

Measured on a four-room ring with both ways round costing the same (three doors
of multiplier 1/2/2/1, `tests/helpers/navigation-fixture.ts`'s
`buildRingFixture`): **64 of 256 origin/destination pairs took a different door
and 20 cost strictly more, up to double.** Which of the two an actor received
was decided by `flowFieldActivationThreshold` against the number of *other*
pending requests sharing its destination that tick — so by the company it kept
rather than by the state of the prison. That is the line `docs/DETERMINISM.md`
draws for the transport controls ("they change when ticks happen and never what
a tick computes") and generalises for multi-rate schedules, and it is a stronger
claim than the hierarchical-versus-flat-optimal caveat in `docs/NAVIGATION.md`,
which accepts inexactness for a *fixed* set of inputs and not two answers for
one set.

### The decision this amendment adds: the region search's direction is part of the sharing contract

`dijkstraRegionPath` is rooted at the **destination** and walked from the
origin. A `RegionFlowField` can only be rooted at the destination — that is what
makes one pass answer for every origin — so that is the end that had to move,
and the two are now literally the same search with and without an early exit.
The `origin`/`destination` parameters keep their caller-facing meaning and the
returned portals are still ordered origin to destination.

Two alternatives were rejected on measurement rather than taste:

- **Break ties on the portal's door id**, the cheaper fix #360 proposes. It is
  not sufficient. Rooted at the origin that rule picks the canonically smallest
  *last* hop of a tied path; rooted at the destination it picks the smallest
  *first* hop; and the path with the smaller first hop need not be the path with
  the smaller last hop. On a ring whose door ids are named so that those two
  disagree, adding the tie-break to the origin-rooted search leaves **64 of 256
  pairs diverging** — the same count it appears to fix on a ring whose ids
  happen to agree.
- **Leaving the divergence and amending the claim** to say the shared plan is
  merely an equal-cost alternative. It is not always equal-cost: 20 of those 64
  were strictly more expensive through the field.

Aggregate routing quality is unchanged by the new direction, which is the
question a reader should ask of it: against a flat full-map Dijkstra over the
same ring, the hierarchical answer's **total excess is 48 over all 256 pairs
either way, worst case 4 either way, on the same 20 pairs**. Neither direction
was optimal and neither is now; what changed is that there is one answer per
state instead of two.

### Targeted invalidation, restated over traversal verdicts rather than access versions

> a group at or above `flowFieldActivationThreshold` uses
> `getOrComputeRegionFlowField` (backed by `FlowFieldCache`, **invalidated
> exactly like `RouteCache` -- geometry change invalidates everything, a
> specific door's access-version change invalidates only fields that depend on
> it**)

The intent was right and the recorded set was wrong, in both caches. Each
recorded the doors a decision *used* — the doors a route crossed, the portals
that ended up in a field's tree, and for a failure the `blockedBy` door that
`route.ts` documents as a best-effort diagnostic. A door whose being shut is the
reason the answer looks the way it does was recorded nowhere, so opening it
evicted nothing: a `permission-denied` outlived the lockdown that caused it
(#357) and a field kept routing a whole group through the door it was forced to
use (#358).

`runRegionDijkstra` now reports the doors an answer depends on, and the rule is
derived at that function rather than guessed: the doors incident to a region
within reach of the answer, where "reach" is the distance to the region the
answer was asked about. A door whose two endpoint regions are both further away
than that cannot shorten the answer nor introduce a new equal-cost route a
tie-break could pick, and a door touching a region at or inside it can, whether
the search crossed it, refused it or passed it over.

Two consequences worth stating, because they pull in opposite directions:

- **Invalidation is now finer than the accepted text describes, not coarser.**
  An entry goes when a door it depended on stops giving the *traversal verdict*
  it was computed under — may this context cross it, and at what cost — rather
  than whenever that door's access version moves. A door that was refused and is
  still refused evicts nothing, so a lockdown deepening on a wing a prisoner
  could never use leaves their cached routes alone.
- **A field's dependency set is prison-wide, and that is accepted.** A field
  answers for every reachable region, so its answer genuinely depends on every
  door incident to one; any door state change therefore invalidates a field.
  This is the honest price of one shared object rather than a defect, and it
  costs one Dijkstra pass — the pass sharing exists to amortise. The narrow half
  lives in `RouteCache`, which since #359 holds a per-route entry for
  field-resolved requests whose dependency set is bounded by that request's own
  origin.
- **A route's set is still wide enough to matter, and one class of door is
  excluded from it on a proof rather than on a guess.** A corridor touches every
  cell door, so on the shape a prison actually has, nearly every door in a block
  is inside every route's reach. `portalCannotBeCrossedBetween` drops the doors a
  route provably *cannot* cross: a cell is a leaf region, so any route entering it
  must leave by the same door and pay for it twice, and dropping that excursion is
  a strictly cheaper route between the same two tiles — so such a door is on no
  shortest route and on no tied one, whatever its state. Measured on
  `buildCellBlockFixture(24)`, eight legs each tick for ten ticks with one
  unrelated cell door toggling every tick, sharing off: **2,670 work units without
  that exclusion, 266 with it**, for identical routes — against 358 for the old,
  insufficient dependency set. It is not applied to a field, which answers for
  every origin including one behind such a door. What cannot be tightened further
  without a second search is the rest: a destination-rooted pass knows each
  region's distance to the destination and not its distance from this origin, and
  the tight test needs both. Buying that back would cost the origin-rooted pass
  sharing exists to avoid.

### Sharing sits behind the route cache, not in front of it

The accepted text decides that the portal pass is paid "once per (destination
region, `RouteContext` fingerprint) group per cache generation, not once per
actor". It says nothing about the order the two mechanisms are consulted in, and
the implementation checked the field first and never wrote a field-resolved
answer into `RouteCache` — so turning sharing on turned the route cache off for
that group, and the busiest destination in the prison was the only one that got
no cross-tick reuse (#359).

`PathRequestQueue.processTick` now resolves every request through
`findRouteCached`, with flow-field sharing inside the compute callback: the cache
decides whether anything is computed, and sharing decides only *how a miss is
computed*. On `buildCellBlockFixture(24)`, eight legs re-requested each tick for
ten ticks, sharing on: **1,906 work units before, 214 after**, against 268 with
sharing off — and the per-tick cost decays to nothing instead of staying flat at
188. The case sharing exists for is untouched: 24 distinct origins onto one
destination still costs 398 against 720 and still drains in one tick against
two. This ordering is only safe because of the equivalence above; while the two
mechanisms disagreed, which of them warmed an entry would have decided what
every later caller read.

One metric moves as a result: `flowFieldActivations` now counts fields that were
actually needed, so a repeated leg no longer activates one per tick.
`benchmarks/scenarios/navigation-actor-tiers.mjs` is the hand-rolled mirror this
ADR's benchmark section describes, and it still mirrors the old ordering, so its
activation and cache numbers — and the table in `docs/NAVIGATION.md` that quotes
them, including the `0 / 60` cache hit/miss for `meal-rush` that was this defect
published as a property of the scenario — describe the previous composition until
someone re-runs them. That is the accepted drift this ADR's benchmark section
already names, now with a known instance.

### The gate

- `tests/determinism/navigation-shared-plan-equivalence.test.ts` — a
  field-resolved route and `findRoute` agree on the door sequence, the cost and
  the waypoints for every origin/destination pair on the ring, across all 81
  combinations of its four doors' states; one actor gets the same route alone and
  in a crowd; and a run with both caches discarded every tick resolves every
  request identically to a run with them warm across a lockdown.
- `tests/determinism/navigation-cache-agreement.test.ts` — the #357 and #358
  cases, through the real `NavigationSystem` on a real `Kernel`, asserted against
  a fresh `findRoute` rather than against an eviction count.
- `tests/unit/navigation-work-budget-and-cache.test.ts` — the cross-tick
  accounting for #359, which is the shape a single-tick assertion cannot see.

What this amendment does **not** touch: the work-unit budget, the fairness rule,
the "always at least one request per tick" rule, the deferred-status decision
amended on 2026-08-25, and `docs/NAVIGATION.md`'s hierarchical-versus-flat-optimal
caveat, which is a different claim and still stands.
