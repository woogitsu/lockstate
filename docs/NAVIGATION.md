# Navigation: hierarchical routing, doors and permissions

This document covers `src/simulation/navigation/`: issue #21's correctness
foundation for hierarchical, permission-aware routing over the chunked
world, and issue #22's scheduling layer on top of it — a per-tick work
budget, priority/age-fair request queuing, and shared flow fields for
common-destination scenarios. #21 implements the *shape* of a route and
the rules for what makes one valid; #22 (see its own section below and
`docs/adr/0007-navigation-work-budgets-and-flow-fields.md`) bounds and
schedules *how much of that* runs per tick, and shares it where many
actors converge on one destination. Actor movement/rendering, crowd
steering, door animations and teleporting-on-failure remain out of scope
for both.

## Why hierarchical, not one flat search

A full-map A* per actor cannot scale to large prisons. Routing here is
two-layered:

1. **Region/portal graph** (`region-graph.ts`): the world's tiles are
   partitioned into *regions* — maximal sets of tiles connected by plain
   open boundaries (no wall, no door) — and *portals*, one per door,
   connecting two regions. Doors always separate regions, regardless of
   their current lock state; only the *portal's existence* is a topology
   fact.
2. **Bounded local search** (`local-search.ts`): once a region-level path
   is chosen, a single A* runs, restricted to only the regions/doors on
   that path — never the whole map.

`findRoute` (`router.ts`) ties these together: resolve origin/destination
regions → Dijkstra over the portal graph (permission-checked) → bounded
local A* for the exact tile path → slice the result into per-region
segments.

## Doors and world geometry are independent layers

`DoorRegistry` (`door.ts`) is deliberately **not** part of `SparseWorld`.
Door placement is not wired into `ConstructionSystem` yet (`finalizeConstruction`
only bumps the geometry revision — see its own comment), so navigation
cannot assume a door corresponds to any particular wall-edge numericId.
Instead: a door registered at an edge is authoritative for gating that
edge, whatever the world's own edge value is; a plain nonzero edge value
with no registered door is an ordinary, permanently impassable wall. When
construction eventually places real doors, it only needs to call
`DoorRegistry.register`/`setState` — navigation's model does not change.

## Permission model

Permission checks are **part of edge traversal, not a UI-only filter**:
the region/portal graph includes every door regardless of whether the
current actor could ever cross it; `checkDoorAccess` (`route-context.ts`)
is what actually gates it, called fresh at traversal time against the
door's *current* state:

```
locked, no emergencyOverride       -> denied: 'locked'
securityClearance < required       -> denied: 'insufficient-clearance'
requiredPermission not held        -> denied: 'missing-permission'
otherwise                          -> allowed
```

`emergencyOverride` bypasses only the `locked` check — never clearance or
a named permission. Closed/locked doors also cost more to traverse than
open ones (`doorTraversalCost`), modeling an opening delay; this cost
feeds both the local A* and the portal-graph Dijkstra identically.

## Route result and failure reasons

```ts
interface Route {
  segments: readonly RouteSegment[]; // { regionId, waypoints, enteredViaDoorId? }
  totalCost: number;
}
```

Each `RouteSegment` is the run of waypoints inside one region;
`enteredViaDoorId` names the door crossed to arrive there (absent on the
first segment). A caller that only needs raw tile-by-tile movement can
flatten `segments.flatMap(s => s.waypoints)`.

`findRoute` never throws for a routing failure; it returns a distinct
reason instead:

| Reason | Meaning |
| --- | --- |
| `invalid-origin` / `invalid-destination` | The tile has no region — not part of any loaded chunk. |
| `unreachable` | No path exists even ignoring every door's lock/permission state. |
| `permission-denied` | A physical path exists, but every door on the cheapest one is closed to this `RouteContext`. `blockedBy` names one such door and why — a best-effort diagnostic (the first blocking door on the cheapest *physical* path), not an exhaustive list of every door that would need to change. |

Distinguishing `unreachable` from `permission-denied` costs a second,
permission-*unaware* Dijkstra pass over the portal graph only on the
failure path — the identical graph and tie-break as the primary search,
so the diagnostic stays deterministic.

## Determinism

Region IDs are assigned by iterating loaded chunks in `compareChunkPositions`
order and tiles within each chunk in row-major order, so identical world
state always produces identical region IDs. Both the portal-graph Dijkstra
and the local A* break ties on the tile/region's canonical string key
(`tileKey`), never on iteration/insertion order of a `Map`/`Set`, so
identical requests always return identical routes — verified directly by
a determinism test in `tests/unit/navigation-router.test.ts`.

## Invalidation and caching

Two revision counters on `DoorRegistry`, because they invalidate different
things:

- **`structuralRevision`** — bumped only when a door is *added* (changes
  which edges are gated, i.e. topology). `isNavigationGraphStale`
  (`region-graph.ts`) checks this plus the world's own per-chunk
  `geometryRevision` (fingerprinted as `NavigationGraph.geometrySignature`)
  to decide whether the region/portal graph itself needs rebuilding.
- **`accessRevision`** (registry-wide) and a **per-door access version**
  (`getAccessVersion(doorId)`) — bumped on every state change. `RouteCache`
  (`route-cache.ts`) records, per cached route, which doors it actually
  depended on (crossed, or — for a `permission-denied` failure — was
  blocked by) and their version at compute time. A lockdown on one door
  therefore evicts only the cache entries that actually used that door,
  leaving unrelated cached routes untouched — "a closed/locked door can
  invalidate connectivity without rebuilding unrelated world regions."

Region/portal topology is **not** sensitive to lock state changes alone:
a door always splits two regions whether it is open or locked, so toggling
a lock never requires rebuilding the graph, only re-checking (or evicting
from cache) the routes that cross it.

## Known correctness caveat: hierarchical vs. flat-optimal cost

The portal-graph search picks the cheapest *sequence of doors*, treating
intra-region travel as free at that level; the bounded local search is
optimal only *within the regions that sequence visits*. For a topology
with genuinely ambiguous alternate routes through extra regions the
portal graph didn't select, the resulting tile-path cost is not
guaranteed to equal a full flat-map optimum — a standard, accepted
characteristic of hierarchical pathfinding (HPA*-style), not a bug.
`tests/unit/navigation-flat-search-reference.test.ts` cross-checks cost
equality specifically for fixtures where there is no such ambiguity (a
single viable door per actor), and reachability agreement more generally,
per the issue's "reference comparison against a small flat search" test
requirement. Closing this gap (if it ever needs closing) belongs to #22.

## Work budgets, request fairness and flow fields (issue #22)

`path-request-queue.ts`, `flow-field.ts`, `region-dijkstra.ts` and
`navigation-system.ts` add a scheduling layer on top of #21's `findRoute`,
without changing its behavior for any caller that doesn't opt in. Full
rationale lives in
`docs/adr/0007-navigation-work-budgets-and-flow-fields.md`; summary:

- **Work-unit budget.** An optional `SearchStats` counter (`{ expansions }`)
  threads through `boundedLocalSearch` and the shared region/portal
  Dijkstra core (`runRegionDijkstra`) — one expansion per tile/region
  dequeued from the search frontier. `PathRequestQueue.processTick` sums
  each *fully resolved* request's expansions against a configured
  `workBudget` and defers the rest once spent, always processing at least
  one request per tick so an unusually expensive request can't stall the
  queue forever.
- **Priority + age-based fairness.** Requests are ordered by
  `priority + floor(waitedTicks / agingIntervalTicks)`, then enqueue tick,
  then request id — never Map iteration order. Aging guarantees any
  request's effective priority eventually exceeds any fixed tier, so
  nothing waits forever under sustained higher-priority load.
- **Flow fields share the region-graph layer only.** A `RegionFlowField`
  is one destination-rooted Dijkstra pass over the portal graph (the same
  algorithm #21's `findRoute` already runs per-request, just single-source
  instead of single-target), reused by every request sharing a
  `(destinationRegion, RouteContext fingerprint)` once a tick's pending
  count for that pair reaches `flowFieldActivationThreshold`. The
  per-actor bounded local A* still runs once per actor — there is nothing
  to share there, since each starts from a different tile. A field that
  can't answer a request (wrong destination, stale geometry, unreachable
  region) returns `undefined`, and the caller falls back to #21's full
  `findRoute` for an accurate diagnosis — the shared fast path never
  fabricates a `permission-denied` reason.
- **Cache metrics.** `RouteCache` and the new `FlowFieldCache` both expose
  cumulative `hits`/`misses`/`evictions` (a specific door's access-version
  change) and `geometryInvalidations` (a whole-graph rebuild) via
  `getMetrics()`.
- **`NavigationSystem`** is a real `SystemRegistration` registered on
  `SimulationRuntime`'s `Kernel` (`createNewSimulationRuntime`, order 150,
  every tick) — generic over request identity (`id: string`), so it knows
  nothing about what a prisoner or staff member is; #23/#24 own that.
  Chunk loading is still driven externally via `setLoadedChunks`, matching
  `TopologyManager`'s existing "no enumeration" convention (see above).
- **Minimal stub actors, not gameplay.** Per the owner's explicit decision
  for this issue, `tests/helpers/navigation-actor-stub.ts` spawns synthetic
  actors through the real `EntityStore` (id + origin/destination/
  `RouteContext`, nothing else) to drive `NavigationSystem` at
  representative scale before #23/#24's real entity model exists. It is
  test/benchmark scaffolding, not exported from `src/`.

## Performance

Directional-only measurement, not a committed benchmark or threshold (same
caveat as `docs/PERSISTENCE.md`/`docs/CLOUD_SAVE.md`); see
`docs/BENCHMARKING.md`'s "no hard timing threshold" policy for what would
be required before any of this becomes a regression gate.

**#21 correctness-path cost** (unchanged by #22): on a 128×128-tile,
4×4-chunk synthetic cell-block layout (1,024 4×4 cells, 1,984 doors),
building the region/portal graph took ~99 ms and a corner-to-corner route
(63 region crossings) took ~16 ms on this development container.

**#22 actor-tier evidence**, from `pnpm benchmark`'s
`navigation.meal-rush`/`navigation.lockdown-return`/
`navigation.mixed-destination` scenarios (250/5,000-actor smoke/full
tiers) and `node --expose-gc scripts/run-navigation-actor-tier-report.mjs`
(all four tiers — 250/1,000/2,500/5,000 — this script is not part of
`pnpm benchmark` and never gates CI; see
`docs/adr/0007-navigation-work-budgets-and-flow-fields.md`), on a
synthetic 64-cell cell-block-plus-canteen layout, `workBudgetPerTick=400`,
`agingIntervalTicks=15`, `flowFieldActivationThreshold=6`, this development
container:

| Scenario | Actors | Ticks | Work units | Flow-field activations | Cache hit/miss | Latency (ticks) mean/p95/max |
| --- | --- | --- | --- | --- | --- | --- |
| meal-rush | 250 | 12 | 4,780 | 78 | 4 / 42 | 5.2 / 11 / 11 |
| meal-rush | 5,000 | 1,471 | 754,014 | 4,308 | 0 / 60 | 731.7 / 1,393 / 1,470 |
| lockdown-return | 250 | 10 | 3,875 | 0 | 81 / 169 | 4.7 / 9 / 9 |
| lockdown-return | 5,000 | 1,107 | 566,910 | 1 | 1,681 / 3,318 | 629.9 / 1,071 / 1,106 |
| mixed-destination | 250 | 19 | 8,006 | 0 | 2 / 248 | 8.8 / 17 / 18 |
| mixed-destination | 5,000 | 1,754 | 902,510 | 5 | 3 / 4,992 | 879.4 / 1,667 / 1,753 |

The full four-tier table (250/1,000/2,500/5,000, all three scenarios) is
reproducible with the command above. The directionally interesting result:
**meal-rush activates flow-field sharing heavily (many actors, one shared
destination region) while lockdown-return and mixed-destination — distinct
destinations per actor — almost never do**, exactly the "evidence-driven,
not used for every destination" requirement; this is the intended,
observed crossover, not a coincidence of these particular seeds.

## What is out of scope here

Crowd steering/local collision avoidance; door animations or full security
gameplay; teleporting actors when a route fails (a `RouteResult` failure is
just information — the caller decides what an actor does next, e.g. wait,
idle, or request a new route later); per-tile (rather than per-region)
flow fields; real gameplay entities consuming this system (#23/#24).
