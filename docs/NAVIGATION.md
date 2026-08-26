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
Completing a build order writes world geometry: `finalizeConstruction`
sets the tile's `topEdge`/`leftEdge` value for an edge-geometry buildable and
only bumps the geometry revision for everything else. That layer says *a
boundary exists here*, and nothing more.
Navigation does not assume a door corresponds to any particular
wall-edge numericId.
Instead: a door registered at an edge is authoritative for gating that
edge, whatever the world's own edge value is; a plain nonzero edge value
with no registered door is an ordinary, permanently impassable wall.
`buildNavigationGraph` and `boundedLocalSearch` both ask
`DoorRegistry.getByEdge` *first* and fall through to the wall value only when
there is no door, which is why the rule holds at both layers.

### Construction places doors, and what that decided (issue #261)

`door-wooden` used to be the one buildable the registry offered that could not
finish meaningfully: `edgeNumericIdFor` answered `0` for it, and
`ConstructionSystem` held no `DoorRegistry`, so a completed order consumed a
plank and changed nothing whatever. Both halves are wired now.
`BuildableDefinition.placesDoor` names the security grade, initial state and
cost multiplier; `finalizeConstruction` writes `DOOR_EDGE_NUMERIC_ID` into the
edge layer *and* hands the buildable, the tile and the `BuildEdge` to a
`DoorPlacementSink`; `DoorConstructionService`
(`src/simulation/construction/door-construction.ts`) turns that into a
`DoorDefinition`. This section named four things as undecided, and each is
answered below rather than deleted, because the reasoning is what a reader
needs.

- **A door writes an edge value, and that is what stops it un-sealing the
  room.** The objection this file and `construction/definition.ts` both used
  to raise — an edge is opaque to `TopologyManager`, so recording a door as one
  "would seal the room it is supposed to open" — was true of an edge value
  written *without* a registry row beside it. With both halves, the two layers
  answer two different questions and both answers are right: topology and
  `roomPerimeterEnclosure` see a barrier, so a cell with a door stays a
  distinct region and reads `sealed`; navigation sees a `Portal`, so the cell
  is reachable. Measured in `tests/unit/construction-doors.test.ts`, including
  the control — the identical wall line with no door is `unreachable`.
  `DOOR_EDGE_NUMERIC_ID` is a value of its own rather than
  `WALL_EDGE_NUMERIC_ID` because the edge planes are carried in the world
  snapshot, so a prison records where its doors are and a renderer that draws
  one differently becomes a change to the renderer alone.
- **Orientation.** A `DoorDefinition` needs a `side` and `BuildOrder` already
  carries an `edge` that the world pointer tool fills in;
  `doorSideForBuildEdge` is the one place the two vocabularies meet
  (`'north'`/`'west'` against `'top'`/`'left'`). **The Build panel's coordinate
  form is still owed a fix**: it derives `occupiesEdge` from
  `category === 'wall'` (`src/main.ts`) and hides the edge chooser for a door,
  so a door submitted through the two number fields silently takes whichever
  edge was last selected. `occupiesTileEdge` in
  `construction/definition.ts` is the predicate that surface should read.
- **Removal.** `DoorRegistry.unregister` exists, and
  `structuralRevision`'s contract widened with it: it is bumped when a door is
  added **or removed**, because both change the region/portal graph.
  `revertConstruction` removes the door *before* it rewrites the edge, and only
  when no other completed order still claims a door there — so undoing a door
  out of a wall line leaves the wall, and undoing a lone door leaves a gap, the
  same thing cancelling a wall leaves. `SecuritySectorRegistry`'s per-door
  baseline is untouched by this and cannot be broken by it today: `register`
  throws on a door id that does not already exist, so a sector can only govern
  doors that existed when it did, and nothing in `src/` registers a sector
  after a build order completes. A surface that let a player put a *built* door
  into a sector would have to answer what happens when its perimeter is
  demolished.
- **Identity.** `constructedDoorIdFor` mints `door:<side>:<x>:<y>` — a pure
  function of the edge, never the order id, which is the choice
  [ADR 0012](./adr/0012-derived-identifier-reproducibility.md) requires a
  declaring module to make explicitly. Portal ordering is by door id, so this
  is what keeps routing tie-breaks a function of geometry rather than of build
  history; the id is colon-separated to match `roomInstanceIdFor` and
  `placedObjectIdFor`, both of which are persisted the same way.
- **Access requirements.** `placesDoor` names a **security grade** and
  `createGradedDoor` (`security/sector.ts`) reads the clearance and permission
  off it, which is what that function's own comment demands: requirements must
  come from a grade rather than hand-picked values that could drift from a
  sector's stated grade. `door-wooden` names `grade.general` — clearance 0, no
  permission — because an ordinary wooden door gates nothing. A door that gates
  a wing is another content row naming another grade, not a code change.

**Still owed, and not claimed here:** the renderer draws every non-zero edge
with `EDGE_WALL_APPEARANCE` (`rendering/phaser/tile-layer.ts`), so a finished
door currently *looks* like a wall. The value it needs to tell them apart is in
the layer it already reads.

A door is still a portal whatever placed it, so `findRoute`'s model is
unaffected. Two things around it are. First, *when* the graph is rebuilt:
every placed door moves `structuralRevision`, so `isNavigationGraphStale`
makes each one a whole-graph rebuild, and how often a build gesture may do
that is the work budget's problem —
[ADR 0007](./adr/0007-navigation-work-budgets-and-flow-fields.md) territory.
Second, `RouteCache`/`FlowFieldCache` do **not** invalidate on
`structuralRevision`: they compare `NavigationGraph.geometrySignature`, which
is built from chunk `geometryRevision`s alone, plus (for `RouteCache`) the
access versions of the doors an entry actually used. A door that appeared or
vanished without its chunk's geometry revision moving would therefore leave
routes cached from before the change. Nothing does that: the two callers of
`DoorRegistry.register` are `restoreSessionSystems`, which runs before any
route is computed, and `DoorConstructionService`, which is reached from
`finalizeConstruction`/`revertConstruction` — both of which write the tile edge
in the same call and therefore bump the revision. A future caller that mutates
the registry *without* touching world geometry would have to close this itself.

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
state always produces identical region IDs.

**Three** canonical orders then decide which route comes back when more than
one costs the same, and none of them is the iteration/insertion order of a
`Map`/`Set`:

1. the local A*'s frontier takes the least f-score and breaks equal f on the
   tile's canonical string key (`tileKey`, `local-search.ts`);
2. the portal-graph Dijkstra's frontier takes the least distance and breaks
   equal distance on the region id (`region-dijkstra.ts`);
3. `buildNavigationGraph` sorts `portals` by door id before any search sees
   them (`region-graph.ts`), which is what chooses between two doors joining
   the same pair of regions. This section named only the first two until
   #365; the sort is the third thing a route depends on, and
   `constructedDoorIdFor`'s docstring already treated it as one.

`tests/determinism/navigation-search-tie-breaks.test.ts` is the guard for all
three. It states each canonical answer as a concrete route **and** asserts
the alternative is genuinely available at the same cost, so no case there can
pass because there was only ever one route to find. Measured, reverting one
site at a time: the A* tie-break fails one case, the Dijkstra tie-break one,
the portal sort two.

Repeatability — identical requests return identical routes — is the weaker,
separate claim, and `tests/unit/navigation-router.test.ts`'s "is
deterministic: identical requests return identical routes" is what verifies
it. That case calls `findRoute` twice on one graph, which is identical under
either rule, so it cannot see any of the three orders above; this section
cited it for the stronger claim until #365, and all three reverts leave it
green.

## Invalidation and caching

Two revision counters on `DoorRegistry`, because they invalidate different
things:

- **`structuralRevision`** — bumped when a door is *added or removed* (both
  change which edges are gated, i.e. topology). `isNavigationGraphStale`
  (`region-graph.ts`) checks this plus the world's own per-chunk
  `geometryRevision` (fingerprinted as `NavigationGraph.geometrySignature`)
  to decide whether the region/portal graph itself needs rebuilding. It read
  "only when a door is *added*" until doors became buildable and therefore
  removable; see the door-placement section above.
- **`accessRevision`** (registry-wide) and a **per-door access version**
  (`getAccessVersion(doorId)`) — bumped on every state change, and on an add
  or a remove. `RouteCache`
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
