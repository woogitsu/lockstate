# Navigation: hierarchical routing, doors and permissions

This document covers `src/simulation/navigation/`: issue #21's correctness
foundation for hierarchical, permission-aware routing over the chunked
world. It implements the *shape* of a route and the rules for what makes
one valid — not actor movement/rendering, crowd steering, flow fields, or
CPU budgets (all explicitly out of scope; the last three are issue #22).

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

## Performance

Directional-only measurement (not a committed benchmark or threshold, same
caveat as `docs/PERSISTENCE.md`/`docs/CLOUD_SAVE.md` — `docs/BENCHMARKING.md`
defers real navigation budgets to #22's dedicated actor-tier scenarios): on
a 128×128-tile, 4×4-chunk synthetic cell-block layout (1,024 4×4 cells,
1,984 doors), building the region/portal graph took ~99 ms and a
corner-to-corner route (63 region crossings) took ~16 ms on this
development container.

## What is out of scope here

Crowd steering/local collision avoidance; flow fields and shared-route
optimization (#22); final path-request CPU budgets (#22); door animations
or full security gameplay; teleporting actors when a route fails (a
`RouteResult` failure is just information — the caller decides what an
actor does next, e.g. wait, idle, or request a new route later).
