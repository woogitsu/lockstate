# Navigation: hierarchical routing, doors and permissions

This document covers `src/simulation/navigation/`: issue #21's correctness
foundation for hierarchical, permission-aware routing over the chunked
world, and issue #22's scheduling layer on top of it — a per-tick work
budget, priority/age-fair request queuing, and shared flow fields for
common-destination scenarios. #21 implements the *shape* of a route and
the rules for what makes one valid; #22 (see its own section below and
`docs/adr/0007-navigation-work-budgets-and-flow-fields.md`) bounds and
schedules *how much of that* runs per tick, and shares it where many
actors converge on one destination. Crowd steering, door animations and
teleporting-on-failure remain out of scope for both.

> **"Actor movement/rendering" was in that list and is not any more.**
> [ADR 0059](./adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md) gave the
> waypoints this module produces a consumer: `LocomotionStore.beginWalk` walks
> them one tile at a time, and refuses a route whose legs are not one tile along
> one axis rather than cutting a corner. Nothing about *how a route is found*
> moved -- what changed is that the answer is now travelled rather than applied.

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
  after a build order completes. The one sector a session now registers
  ([ADR 0036](./adr/0036-a-derived-default-security-sector.md)) is registered at
  composition time and **governs no doors at all**, for exactly this reason among
  others — so a built door is in nobody's perimeter and demolishing it cannot
  break a baseline. A surface that let a player put a *built* door into a sector
  would have to answer what happens when its perimeter is demolished.
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
is built from chunk `geometryRevision`s alone, plus — for both caches — the
per-door traversal verdicts the entry was computed under (see "Invalidation and
caching" below). This read "*(for `RouteCache`) the access versions of the doors
an entry actually used*" until #357, which was wrong twice over: about which
doors an answer depends on, and about `FlowFieldCache`, which has tracked doors
of its own since #22. A door that appeared or
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

Both frontiers are a `FrontierHeap` (`frontier-heap.ts`) since #413, not the
linear scan that picked the minimum until then, and the first two rules above
are exactly what makes that swap safe. A binary heap is not a stable sort: among
entries its comparator calls *equal*, sift direction and insertion history
decide which surfaces first, so a frontier ordered by cost alone would make the
route a function of heap internals. The comparator is therefore total by
construction rather than by care — cost first, then a tie-break key that is
unique per frontier node and derived from search state (the `tileKey`, the
region id, the same keys compared in the same direction as before), so the
minimum is unique and pop order is fully determined whatever arrangement the
array is in. The heap has no decrease-key: a relaxation pushes a second,
strictly cheaper entry and the superseded copy is discarded when it surfaces,
which is why both searches check `closed`/`visited` **before** charging an
expansion to the budget — a discarded copy is not an expansion. Verified rather
than argued: at `c201547` (v0.0.121 plus #410) the three
`navigation.production.*` benchmark scenarios — 500 real requests plus two
corner-to-corner routes — return byte-identical checksums and identical counted
work before and after the swap.

> **What `c201547` is, because the run was not taken on it.** Both measurements
> in this document were taken in a worktree, on that worktree's own commit,
> which the coordinator then cherry-picked — so the sha the run printed is on no
> remote and nobody but its author can resolve it. `c201547` is the published
> form of the same change: identical subject, and `src/`, `benchmarks/` and
> `tooling/` byte-identical (`git rev-parse c201547:src` and the two others match
> the worktree commit's exactly), which are the only trees these scenarios read.
> It differs by carrying #424 and three documentation commits as well, none of
> which this benchmark opens. Stated rather than substituted quietly, because
> re-pointing an anchor at a tree nobody measured on is the defect this
> repository keeps paying for; the point here is that the measured trees are the
> same tree.


A fourth thing decides which route comes back, and it is not an ordering: the
**end the region search is rooted at**. A tie-break among equal-cost
predecessors is applied from the search's own source, so the same three rules
above select different doors depending on which end they run from — origin-rooted
picks the tied path by its last hop, destination-rooted by its first. That is why
`dijkstraRegionPath` is rooted at the destination and walked from the origin
(`router.ts`): a `RegionFlowField` can only be rooted at the destination, so
rooting `findRoute` anywhere else made a shared plan a *different* plan.
Measured on a four-room ring whose two ways round cost exactly the same, before
that change: 64 of 256 origin/destination pairs took a different door through a
shared field than through `findRoute`, 20 of them at strictly higher cost, and
which of the two an actor received depended on how many others happened to share
its destination that tick (#360). Aggregate quality is unchanged by the
direction — against a flat full-map search the hierarchical answer's total excess
over all 256 pairs is 48 either way, worst case 4 either way, on the same 20
pairs — so what changed is that there is one answer per state instead of two.
`tests/determinism/navigation-shared-plan-equivalence.test.ts` is the guard for
that fourth thing, over every pair on the ring and all 81 combinations of its
four doors' states; a per-portal tie-break on the door id was measured as
insufficient before this was chosen, because the smallest first hop and the
smallest last hop of a tied pair need not belong to the same route.

`tests/determinism/navigation-search-tie-breaks.test.ts` is the guard for all
three orders above. It states each canonical answer as a concrete route **and**
asserts the alternative is genuinely available at the same cost, so no case there can
pass because there was only ever one route to find. Measured, reverting one
site at a time: the A* tie-break fails one case, the Dijkstra tie-break one,
the portal sort two.

That guard had one hole, found and closed by #413's mutation runs and worth
recording because the reason generalises. `buildDiamond`'s comment claims its
door ids make the portal order point the opposite way to the region-id order,
and that is true of the *source* region's portals — but the region search is
rooted at the destination (the fourth thing, above), so the order that decides
the tie is the **destination** region's portal list, and there it pointed the
same way as the region ids. Measured: deleting `region-dijkstra.ts`'s tie-break
outright, so ties fall to frontier order, left that case green; only reversing
it went red. A second fixture, `buildMirroredDiamond`, names the same four doors
so the destination's portal order reaches the higher-numbered region first, and
it fails under both mutations. `tests/unit/navigation-frontier-heap.test.ts` is
the unit-level half: it drains seeded entry sets against an independently
written sort, over ~2,000 entries of which more than half tie on cost, and pins
that the same entry set drains the same way whatever order it was pushed in.

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
  or a remove. `RouteCache` (`route-cache.ts`) and `FlowFieldCache`
  (`flow-field.ts`) record, per entry, every door the answer *depended on* and
  what the search concluded about each: may this `RouteContext` cross it, and at
  what cost (`route-dependencies.ts`). An entry is evicted when one of those
  doors stops giving the verdict it was computed under — `accessRevision` is the
  O(1) proof that no door anywhere has moved, and the per-door version the same
  proof one door at a time, so the verdict is only re-evaluated for a door that
  actually changed.

  **This bullet said "which doors it actually depended on (crossed, or — for a
  `permission-denied` failure — was blocked by)" until #357, and that
  parenthetical was the defect rather than a gloss on it.** The doors a route
  crossed are not the doors it depended on: an answer depends just as much on
  every door that was *shut* when it was computed, and on every cheaper crossing
  that was not yet open. Read as an exhaustive dependency set it let a cached
  `permission-denied` outlive the lockdown that caused it, and a cached route
  outlive the opening of a cheaper door — and, at the flow-field layer (#358), it
  let one stale field route a whole sharing group through the door it had been
  forced to use. `RouteFailure.blockedBy` is documented above as a best-effort
  diagnostic and is no longer read as anything else.

  What an answer depends on is **the doors incident to a region within reach of
  it**, derived and stated at `runRegionDijkstra`: a door whose two endpoint
  regions are both further from the destination than the region being asked
  about can neither shorten that answer nor introduce an equal-cost alternative a
  tie-break could pick instead. Minus one exclusion, also a proof rather than a
  heuristic (`portalCannotBeCrossedBetween`): a cell is a leaf region, so any
  route entering it must leave by the same door and pay for it twice, and dropping
  that excursion is a strictly cheaper route between the same two tiles — so such
  a door is on no shortest route and on no tied one, whatever its state. That
  exclusion is what keeps the rule proportionate on the shape a prison actually
  has, where one corridor touches every cell door: 2,670 work units against 266
  on a ten-tick measurement with one unrelated cell door toggling every tick. A
  *field* keeps even those doors, because it answers for every origin including
  one behind such a door, so its dependency set is every door incident to a
  reachable region and any door change invalidates it; the narrow per-route half
  lives in `RouteCache`.

  So a lockdown on one door still evicts only the entries that door could change,
  leaving unrelated cached routes untouched — "a closed/locked door can
  invalidate connectivity without rebuilding unrelated world regions" — and it no
  longer fails to evict the entries that door shaped by being shut. The guard is
  `tests/determinism/navigation-cache-agreement.test.ts`, which asserts a warmed
  cache's answer against a fresh `findRoute` rather than against an eviction
  count, over every single-door state change on a cell-block fixture; a
  behavioural form was necessary because the old rule's own unit test passed by
  only ever *closing* a door that had been used, never opening one that had not.

Region/portal topology is **not** sensitive to lock state changes alone:
a door always splits two regions whether it is open or locked, so toggling
a lock never requires rebuilding the graph, only re-checking (or evicting
from cache) the entries whose answer that door could change — which, per the
bullet above, is not the same set as the routes that cross it.

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

  **What one expansion costs, and what the budget therefore does and does
  not bound.** Until #413 the unit was not proportional to time: both
  frontiers selected their minimum by scanning, so an expansion cost more
  the larger the search got. Measured at `c201547` (v0.0.121 plus #410,
  Node 24.19.0, this container — the ratios travel, the absolute numbers do
  not; see the note above on what that sha is), one `findRoute`
  corner-to-corner across one open square region,
  which is the shape with the largest frontier:

  | region | expansions | µs/expansion before | after | route ms before | after |
  | --- | --- | --- | --- | --- | --- |
  | 32×32 | 987 | 2.75 | 1.35 | 2.7 | 1.3 |
  | 64×64 | 4,030 | 5.44 | 1.48 | 21.9 | 6.0 |
  | 128×128 | 16,162 | 10.31 | 1.93 | 166.7 | 31.2 |
  | 256×256 | 65,200 | 19.23 | 2.46 | 1,253.8 | 160.2 |

  A 66× growth in search size moved the unit 7.0× before and 1.8× after, so
  the unit is now close to constant and a budget denominated in it is
  reasoning about something stable. Draining 250 requests through the real
  `NavigationSystem` (the `navigation.production.*` benchmark workloads)
  moved less, because those frontiers are small: 4.67 → 4.12 ms/tick mean on
  the meal rush, 4.43 → 3.58 on the lockdown return, for identical counted
  work.

  What the heap did **not** change is what the budget bounds. It is still
  counted work, not wall clock, and `processTick` still tests
  `usedBudget >= workBudget` before a request and never inside one, so one
  request can still charge many times the per-tick allowance: 65,200
  expansions is 32.6× `workBudgetPerTick` at its shipped 2,000, and it now
  costs 160 ms instead of 1,254 ms — smaller, and still three ticks' worth
  of a 50 ms tick in one tick. Changing the budget's *value* or the "always
  process one request" rule is an open decision (#413), deliberately not
  taken alongside the data-structure change.

  **What a navigation tick is actually made of, and how much of it the budget
  bounds.** Re-measured 2026-08-28 at `21e5f66` (v0.0.156), same instrument as
  the table above (`scripts/report-navigation-cost-model.mjs`, section 2) on a
  busier container: 1.370 / 1.560 / 2.108 / 3.066 µs per expansion at 32×32
  through 256×256, against the 1.35 / 1.48 / 1.93 / 2.46 recorded above. The
  ratios travel and the absolute numbers do not, exactly as that table says;
  the unit moves 2.2× over a 66× range either way. So the *unit* is a
  reasonable proxy for time, and the budget denominated in it is not the
  problem #413 thought it was.

  The tick has four cost terms and `workBudgetPerTick` bounds one of them.
  Measured on one open 64×64 region at the shipped budget, timing each
  `NavigationSystem.update` on its own (section 3 of the same script):

  | pending | tick 0 | steady tick | steady expansions | worst tick after 0 | its expansions |
  | --- | --- | --- | --- | --- | --- |
  | 250 | 12.43 ms | 4.06 ms | 2,332 | 6.96 ms | 4,026 |
  | 5,000 | 16.37 ms | 6.79 ms | 2,332 | 9.82 ms | 3,979 |

  1. **The graph rebuild.** `NavigationSystem.update` calls `ensureGraph`
     first, and `buildNavigationGraph` runs whenever
     `isNavigationGraphStale` says so — 12–17 ms here, and a geometry change
     makes the next tick pay it again. Not budgeted, and no budget value
     changes it. Measured on its own rather than inferred: an `update` on an
     empty queue costs 10.11 ms (yard) / 10.01 ms (block) the first time and
     0.018 / 0.026 ms the second.
  2. **The per-tick prelude.** `processTick` copies and sorts *every* pending
     entry and then computes a flow-field group key for every pending entry —
     `tileKey` plus `routeContextFingerprint`, which copies, sorts and joins
     the permission list — including for the requests the tick will never
     reach. The two rows above differ by 2.7 ms on identical counted work,
     and that difference is this. Not budgeted, and it grows with queue depth.
  3. **The budgeted search.** `steady expansions` at the unit above.
  4. **The overshoot.** Because the budget is tested before a request and
     never inside one, a tick spends up to the budget *plus one whole
     request*. `navigation.production.yard-crossing` gates this as
     `tickOvershootRatio`: 2.04 (smoke), 2.46 (full).

  `tests/unit/navigation-system.test.ts` already states term 4 as a contract —
  *"the queue always finishes the request it started, so at most one request's
  work may stand above the budget"* — so the bound is guarded; what was missing
  was a workload in which it is large.
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

  **The parenthetical above was false until #360 and is kept because it is true
  now.** `findRoute`'s region search was rooted at the **origin**, so it was not
  the same pass from the same end: cost is symmetric, so the two agreed on
  distances, but the predecessor each recorded among equal-cost candidates was
  chosen by distance from its own source, so they disagreed about *which door*
  whenever two region routes tied. `dijkstraRegionPath` is rooted at the
  destination now — the end a field can only be rooted at — which is what makes
  one pass answer for every origin and makes the claim above hold as written. See
  the Determinism section for what it cost while it did not.
- **Sharing sits behind the route cache, not in front of it.** Every request
  resolves through `findRouteCached`, and flow-field sharing decides only how a
  *miss* is computed. Until #359 the field branch ran ahead of `RouteCache` and
  never wrote to it, so the busiest destination in the prison — the one that
  trips the activation threshold, i.e. the one whose legs repeat most — was the
  only one that got no cross-tick reuse, re-paying a full per-actor local A*
  every tick. On `buildCellBlockFixture(24)`, eight legs re-requested each tick
  for ten ticks: 1,906 work units before, 214 after, against 268 with sharing
  switched off. The composition only became safe once the two mechanisms
  computed the same route, which is why #360 and #359 are one change.
- **Cache metrics.** `RouteCache` and the new `FlowFieldCache` both expose
  cumulative `hits`/`misses`/`evictions` (an entry dropped because a door it
  depended on no longer gives the traversal verdict it was computed under — this
  read "a specific door's access-version change" until #357, and a version
  change that leaves the verdict alone is deliberately not an eviction) and
  `geometryInvalidations` (a whole-graph rebuild) via `getMetrics()`.
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

### What the two cache columns above do and do not say (#359)

**Those numbers come from the hand-rolled mirror, and its `Cache hit/miss` and
`Flow-field activations` columns describe a composition the shipped code no
longer has.** `benchmarks/scenarios/navigation-actor-tiers.mjs` is a separate
implementation by deliberate choice — ADR 0007 explains why, and names drift
from the real algorithm as the accepted cost — and it still consults its route
cache **only for requests that are not eligible for sharing**
(`if (!eligible && routeCache.has(...))`), which is the ordering #359 replaced.
The mirror is unchanged by that fix, so re-running it would reproduce the same
figures; what has to be corrected is the reading, not the number.

So `0 / 60` for meal-rush at 5,000 actors is **not** "the cache never helped a
meal rush". In the mirror an eligible request increments neither counter, so the
column is reporting the 60 requests of 5,000 that were never eligible, all of
which missed — the ratio of a residue, not of the scenario. It was read here as
a property of the scenario, and it was in fact the defect: sharing and the route
cache were mutually exclusive, so the busiest destination was the only one with
no cross-tick reuse. The same misreading is why the activation counts are not
comparable across the fix either: they counted one field per group per tick,
where the shipped code computes a field only when the cache cannot already
answer.

Measured on the real modules instead — the actual `NavigationSystem` on a real
`Kernel`, same 64-cell layout, `workBudgetPerTick=400`, `agingIntervalTicks=15`,
`flowFieldActivationThreshold=6`, same seeds and stub-actor populations as
`tests/unit/navigation-system.test.ts`, this development container, before and
after #380. Directional only, on the same footing as everything else in this
section:

| Scenario | Actors | Ticks | Work units | Activations | Route cache hit/miss |
| --- | --- | --- | --- | --- | --- |
| meal-rush | 250 | 27 → **26** | 11,374 → **10,890** | 115 → 99 | 24 / 108 → **45 / 205** |
| meal-rush | 5,000 | 300 → **81** | 127,245 → **34,203** | 2,278 → 476 | 1,590 / 277 → **4,261 / 739** |
| lockdown-return | 250 | 35 → **40** | 15,018 → **17,413** | 0 → 0 | 6 / 244 → 6 / 244 |
| lockdown-return | 5,000 | 544 → **477** | 236,270 → **208,106** | 2,096 → 1,532 | 991 / 2,758 → 1,724 / 3,276 |
| mixed-destination | 250 | 32 → 32 | 13,740 → **13,582** | 7 → 7 | 0 / 245 → 0 / 250 |
| mixed-destination | 5,000 | 537 → 537 | 231,466 → **231,539** | 2,132 → 2,073 | 146 / 3,750 → 237 / 4,763 |

Every request now reaches the cache, so hits and misses both rise and the ratio
becomes readable: meal-rush at 5,000 actors goes from 1,590 hits to 4,261 and
drains in 81 ticks instead of 300, for a quarter of the work units. **One row
moved the wrong way and is left in rather than dropped:** lockdown-return at the
250 tier costs 17,413 work units against 15,018 and takes five ticks longer,
because rooting the region search at the destination (Determinism, above) changes
which end the early exit truncates, and on this layout — one canteen region
against 64 cell regions — the ball around a cell is not the ball around the
canteen. It is a per-shape cost of having one answer per state, it reverses at
the 5,000 tier of the same scenario, and nothing here is a gate.

## What is out of scope here

Crowd steering/local collision avoidance; door animations or full security
gameplay; teleporting actors when a route fails (a `RouteResult` failure is
just information — the caller decides what an actor does next, e.g. wait,
idle, or request a new route later); per-tile (rather than per-region)
flow fields; real gameplay entities consuming this system (#23/#24).
