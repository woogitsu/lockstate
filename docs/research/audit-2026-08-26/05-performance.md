# Lockstate — Performance & Scalability Audit

Auditor scope: per-tick allocation, algorithmic complexity, navigation, world storage,
worker↔main messaging, rendering, UI, memory leaks, benchmark coverage, startup.
Repo state: read-only inspection at `/workspace/lockstate` (v0.0.108).

## How measurements were taken

Every number labelled **measured** below was produced on this development container
(Node v24.19.0, 4× Intel Xeon @2.80 GHz, Linux 6.18) by scripts written into
`/tmp/.../scratchpad/audit/` — nothing was written into the repository.

1. `node scripts/run-benchmarks.mjs --profile smoke --output <scratchpad>/smoke.json` —
   the repo's own harness, output redirected out of the repo.
2. `<scratchpad>/nav.bench.test.ts`, `nav2.bench.test.ts` — run through the repo's
   installed vitest with a scratchpad config (`cacheDir` also in the scratchpad),
   importing the **real** production modules (`SparseWorld`, `buildNavigationGraph`,
   `findRoute`, `NavigationSystem`) and the repo's own `tests/helpers/navigation-fixture.ts`.
   Medians of 3–200 iterations, warm.
3. `<scratchpad>/real-json-bench.mjs` — imports the real `src/shared/json.ts` via
   `node --experimental-strip-types` and times `isJsonValue` on a snapshot-shaped payload.

Numbers are directional (one container, one CPU), but the *ratios* and the *growth
terms* are what the findings rest on, and those are read off the code as well.

---

## Findings

| ID | Title | Sev | Status | Where |
|----|-------|-----|--------|-------|
| PRF-01 | Navigation work budget does not bound per-tick wall-clock work; shipped default is ~8× the real-time step | Critical | CONFIRMED | `src/simulation/navigation/path-request-queue.ts:174`, `src/simulation/runtime/new-session.ts:66` |
| PRF-02 | Both searches pick the frontier minimum by linear scan → O(E·\|frontier\|); ~15–20 µs per expansion | Critical | CONFIRMED | `src/simulation/navigation/local-search.ts:141`, `src/simulation/navigation/region-dijkstra.ts:62` |
| PRF-03 | Renderer is fed by full session snapshots; main thread deep-walks the whole bundle (31 ms measured) every 2 s | Critical | CONFIRMED | `src/rendering/feed/simulation-snapshot-feed.ts:62`, `src/shared/json.ts:44` |
| PRF-04 | `RouteCache` and `FlowFieldCache` are unbounded — no size cap, no LRU, no TTL | High | CONFIRMED | `src/simulation/navigation/route-cache.ts:72`, `src/simulation/navigation/flow-field.ts:199` |
| PRF-05 | `NavigationSystem.results` never expires; every abandoned path request leaks a whole route | High | CONFIRMED | `src/simulation/navigation/navigation-system.ts:48` |
| PRF-06 | One wall or door placement rebuilds the entire region/portal graph: 296 ms at 65,536 tiles | High | CONFIRMED | `src/simulation/navigation/region-graph.ts:78`, `navigation-system.ts:113` |
| PRF-07 | `${x},${y}` string keys are the currency of every hot path — ~12–16 string allocations per A* expansion | High | CONFIRMED | `src/simulation/world/coordinates.ts:175`, `src/simulation/navigation/door.ts:60` |
| PRF-08 | Every simulation-side tile read allocates 3 objects + 1 string and re-validates the chunk size | High | CONFIRMED | `src/simulation/world/sparse-world.ts:305`, `src/simulation/world/coordinates.ts:144` |
| PRF-09 | `SparseWorld.isTileOwned` copies and sorts every parcel, per tile, inside per-area build/zoning loops | High | CONFIRMED | `src/simulation/world/sparse-world.ts:558`, `src/simulation/rooms/zoning.ts:423` |
| PRF-10 | Fixed-step clock accumulator is unclamped: any stall becomes permanent tick debt, unreported | High | CONFIRMED | `src/simulation/clock/fixed-step-clock.ts:59`, `src/simulation/worker/state-machine.ts:246` |
| PRF-11 | `processTick` sorts and re-keys the whole pending queue every tick regardless of the budget | Medium | CONFIRMED | `src/simulation/navigation/path-request-queue.ts:152` |
| PRF-12 | Collection-rebuild-per-call: guard roster and incident log copy+sort+re-materialise on every read | Medium | CONFIRMED | `src/simulation/security/guard-roster.ts:169`, `src/simulation/incidents/incident.ts:177` |
| PRF-13 | `IncidentLog.records` is never pruned, and it rides in the snapshot the renderer polls | Medium | CONFIRMED | `src/simulation/incidents/incident.ts:166` |
| PRF-14 | Snapshots box SoA typed arrays into plain number arrays; the `array-buffer` transport is dead code | Medium | CONFIRMED | `src/simulation/runtime/session-systems.ts:311`, `src/simulation/protocol/transferables.ts:30` |
| PRF-15 | `projectRoomList` builds a row for every room instance and pages afterwards | Medium | CONFIRMED | `src/simulation/presentation/room-projection.ts:350` |
| PRF-16 | No benchmark imports production code; the navigation scenario mirrors a composition the code no longer has | Medium | CONFIRMED | `benchmarks/scenarios/navigation-actor-tiers.mjs:1`, `.github/workflows/ci.yml:93` |
| PRF-17 | No code splitting; Phaser (1.4 MB minified ESM) is a static import in the entry chunk | Medium | CONFIRMED | `src/main.ts:1`, `vite.config.ts:80` |
| PRF-18 | Flow-field dependency capture is O(regions + portals) per request and is *not* counted against the budget | Medium | CONFIRMED | `src/simulation/navigation/flow-field.ts:169`, `region-dijkstra.ts:91` |
| PRF-19 | `EntityQuery.execute()` allocates a full id array per call, then callers convert each id back to an index | Low | CONFIRMED | `src/simulation/entity/query.ts:37` |
| PRF-20 | `Kernel` re-sorts its whole system/command array on every insert; `_commands.shift()` is O(n) | Low | CONFIRMED | `src/simulation/kernel/kernel.ts:113`, `:141`, `:162` |
| PRF-21 | `ActorLayer` sets depth on every visible sprite every frame, forcing a display-list sort | Low | SUSPECTED | `src/rendering/phaser/actor-layer.ts:146` |
| PRF-22 | `session-component-payload-size.test.ts` asserts a documentation counterfactual, not a payload bound | Info | CONFIRMED | `tests/unit/session-component-payload-size.test.ts:81` |

---

## PRF-01 — The navigation work budget does not bound per-tick wall-clock work (Critical, CONFIRMED)

`PathRequestQueue.processTick` sums `SearchStats.expansions` against `workBudget`
(`src/simulation/navigation/path-request-queue.ts:174`, `:244`) and the shipped default is
`workBudgetPerTick: 2_000` (`src/simulation/runtime/new-session.ts:66`). An expansion is
one node dequeued — it is a *counted-work* budget, which is the right idea, but the
per-expansion cost is neither constant nor small (PRF-02), so the budget converts into
wall-clock only if you know the constant.

**Measured** (real `NavigationSystem` on the repo's own `buildCellBlockFixture`, default
options, meal-rush shape — every actor routing from a cell to the canteen):

| cells | actors | ticks to drain | mean ms/tick | worst ms/tick | µs / expansion |
|---|---|---|---|---|---|
| 64 | 250 | 2 | 23.9 | 43.1 | 20.4 |
| 64 | 1000 | 2 | 21.7 | 36.0 | 18.6 |
| 128 | 2000 | 5 | 25.6 | 76.7 | 14.6 |

The real-time allowance per tick is much smaller than that. The worker wakes on a 15 ms
`setInterval` and pumps at most 5 ticks per wake (`src/simulation/worker/state-machine.ts:228`,
`:246-252`), i.e. ~3 ms of compute per tick if it ever needs to catch up; the nominal step is
50 ms (`src/simulation/clock/fixed-step-clock.ts:29`), so at speed 4 the budget per tick is
12.5 ms of real time for *all* sixteen systems. Navigation alone measures 22–26 ms.

Second, independent hole: the "always process at least one request" rule
(`path-request-queue.ts:174` — the break only fires when `resolved.length > 0`) means a
single request may exceed the budget arbitrarily. **Measured**: one `findRoute` across a
single 256×256-tile open region expanded 65,200 nodes in **1,325 ms** — 33× the budget in
work units and ~100× the tick's real-time allowance. A prison yard or a large canteen is
exactly that shape.

**Scaling term.** Cost per tick = `workBudget × c(expansion)` where `c ≈ 15–20 µs` today.
Worst-case single request = `O(tiles in the widest region)` with no cap at all.

**Fix.** (a) Fix `c` first (PRF-02, PRF-07) — a heap + integer keys should bring it under
1 µs, at which point 2,000 is a defensible budget. (b) Give the budget a wall-clock
co-bound as well as a work bound, checked *inside* the search via `SearchStats`
(`stats.expansions > cap → abort and requeue`), so a single request cannot blow the tick.
(c) Derive the default budget from the step duration rather than picking a round number,
and record the constant next to it.

## PRF-02 — Both searches select the frontier minimum by linear scan (Critical, CONFIRMED)

`boundedLocalSearch` keeps `open` as a `Map<string, TilePosition>` and finds the least
f-score by iterating the whole map on every expansion:

```ts
// src/simulation/navigation/local-search.ts:141-148
for (const [key, tile] of open) {
  const f = (gScore.get(key) ?? Number.POSITIVE_INFINITY) + heuristic(tile, destination);
  if (f < bestF || (f === bestF && (currentKey === undefined || key < currentKey))) { ... }
}
```

That is O(E · |open|) — quadratic in the size of the search. `runRegionDijkstra` has the
identical shape over its region frontier (`src/simulation/navigation/region-dijkstra.ts:62-67`),
so it is O(R²) in region count, and a flow field (no `stopAt`) visits every region.

**Measured** signature of the quadratic term — one corner-to-corner route in a single open
region, all four layers empty:

| tiles | expansions | route ms | µs/expansion |
|---|---|---|---|
| 4,096 | 4,030 | 84.6 | 21.0 |
| 16,384 | 16,162 | 175.1 | 10.8 |
| 36,864 | 36,585 | 572.9 | 15.7 |
| 65,536 | 65,200 | 1,325.0 | 20.3 |

The per-expansion cost is not falling as the search grows (it rises from the 16k point on),
which is what the linear frontier scan plus per-neighbour string keys produce together.

**Fix.** Binary heap (or bucket queue — edge costs are 1, 1.5, 2, so a small bucket set is
exact) keyed by a packed integer tile id (`y * stride + x`, or `(x<<20)|y`) instead of the
`tileKey` string; keep the existing tie-break by comparing the packed integer, which is the
same total order as the decimal string only if you keep the string comparison — so tie-break
on the packed id and update `tests/determinism/navigation-search-tie-breaks.test.ts` in the
same change. The determinism contract is stated in terms of *a* canonical order, not
specifically the string order, so this is a documented change rather than a regression.

## PRF-03 — The renderer is fed full session snapshots, and the main thread deep-walks them (Critical, CONFIRMED)

There is no delta channel. `SimulationSnapshotFeed` states this outright
(`src/rendering/feed/simulation-snapshot-feed.ts:16-37`) and polls
`simulation/request-snapshot` every 2 s while the clock runs
(`:62`, `:171-191`), plus immediately after any accepted command (`:131`). The worker
answers with `captureSessionSnapshot(this._runtime)` — the *save* bundle
(`src/simulation/worker/state-machine.ts:683`), `transport: 'structured-clone'`.

Four separate costs stack up on arrival:

1. **Boundary validation on the main thread.** Every worker→main message goes through
   `decodeWorkerToMainMessage` → `workerToMainMessageSchema.safeParse`
   (`src/simulation/worker/client.ts:94`), whose payload rule is
   `data: jsonValueSchema` = `isJsonValue` (`src/simulation/protocol/types.ts:64`,
   `src/shared/json.ts:44`). `isJsonValue` recursively walks the whole bundle and, for
   arrays, calls `Reflect.ownKeys(value)` **and** `Object.getOwnPropertyDescriptor(value, String(index))`
   *per element* (`src/shared/json.ts:46-53`) — a string allocation and a descriptor object
   per number in the payload.
   **Measured** on the real module, snapshot-shaped payload (18 prisoner arrays + 64 chunks
   of RLE): **10.4 ms at 500 prisoner slots, 31.0 ms at 5,000**. For reference, `JSON.parse`
   of the same data is 2.2 ms and `structuredClone` is 4.6 ms — the validator is ~7× the
   cost of the transport it is guarding.
2. **Full re-decode.** `WorldRenderView.fromSnapshot` allocates four `Uint8Array(1024)`
   per loaded chunk from RLE, every time (`src/rendering/world/world-view.ts:108-130`).
   A 1,024-chunk prison = 4,096 arrays / 4 MiB allocated and discarded every 2 s.
3. **Full row re-index.** `TileLayer.update` sees a new `frame.revision` and calls
   `buildRowIndex` (`src/rendering/phaser/tile-layer.ts:68-72`), which reads *every
   materialised tile* (`src/rendering/world/row-index.ts:88-99`) — and `readTile` builds a
   `${chunkX},${chunkY}` string per call (`world-view.ts:163`). The memo on line 166 saves
   the map probe but **not** the string, contrary to the comment at `:62-67`.
4. **Full repaint.** The same revision change calls `releaseAll()`
   (`tile-layer.ts:71`, `:93-102`), so every visible chunk's `Graphics` is recycled and
   repainted from scratch, even when nothing in view changed.

All four run on the frame thread. 31 ms is two dropped frames at 60 Hz; 10 ms is a visible
hitch. And the payload only grows: the incident log is never pruned (PRF-13) and the
prisoner arrays are written at the allocated prefix (PRF-14).

There is also a correctness-shaped consequence worth naming here: actor positions arrive
only with a snapshot, so actors move in 2-second jumps (`simulation-snapshot-feed.ts:233-238`
says so).

**Fix.** Emit `simulation/delta` for the render path — the message kind already exists
(`src/simulation/protocol/types.ts`, `transferables.ts:24`). Minimum viable version: a
per-tick actor position delta as a transferable `ArrayBuffer` (id/x/y triples), plus a world
geometry delta keyed on the per-chunk `geometryRevision`/`contentRevision` that `ChunkState`
already carries. Separately, gate the `isJsonValue` walk: it is a *shape* check on data the
worker just produced and structured-clone already round-tripped, so it should either be
skipped for `snapshot`/`delta` payloads (validate the envelope, trust the body, as
`transferables.ts:30-36` already assumes for buffers) or replaced with a bounded check that
does not call `getOwnPropertyDescriptor` per element.

## PRF-04 — `RouteCache` / `FlowFieldCache` are unbounded (High, CONFIRMED)

`RouteCache.entries` is a `Map` keyed by
`` `${tileKey(origin)}->${tileKey(destination)}#${routeContextFingerprint(context)}` ``
(`src/simulation/navigation/route-cache.ts:8`, `:72`). Entries are removed only when the
graph geometry signature changes or a door dependency verdict moves (`:92-103`). There is no
size cap, no LRU, no TTL, and nothing anywhere in `src/simulation/` evicts on pressure —
a grep for `evict|prune|maxEntries|capacity` over the tree finds only RLE codec messages.

**Measured** long-session shape: 300 stub actors repathing between random cells on
`buildCellBlockFixture(64)`, 3 new requests per tick for 400 ticks —
**1,037 cache entries from 1,200 requests, 163 hits / 1,037 misses (14 % hit rate)**.
Distinct origin/destination pairs is the realistic case, and the docs' own
`mixed-destination` row agrees (3 hits / 4,992 misses at 5,000 actors).

**Growth term.** Entries ≈ min(distinct `(origin, destination, context)` triples,
requests issued) = O(T²·C) bounded above, O(requests) in practice. At 20 ticks/s and one
request per actor per action cycle, a 200-actor prison issues on the order of tens of
requests per second; each entry retains a whole `RouteResult` — every `RouteSegment` and
every `TilePosition` waypoint of the path. Tens of MB per hour of play, in the worker heap,
where nothing observes it.

**Fix.** Bound both caches (LRU on a `Map`, which preserves insertion order for free) with
the cap as an explicit option next to `workBudgetPerTick`, and add `size` to a metric the
session actually reports. Note that eviction order becomes part of what a replay depends on,
so LRU must be driven by simulation-visible state (tick of last use), not by wall clock.

## PRF-05 — `NavigationSystem.results` never expires (High, CONFIRMED)

`private readonly results = new Map<string, ResolvedPathRequest>()`
(`src/simulation/navigation/navigation-system.ts:48`); the doc comment at `:88` says
"Callers should clear a result once consumed; the system never expires results on its own."
Six callers do clear on the happy path. But abandonment paths deliberately do not, and say
so: `src/simulation/contraband/search-system.ts:155-160` — "The path request the released
guard had in flight is dropped rather than cleared … a result nothing collects is garbage
the queue ages out". **The queue does not age out results.** Nothing deletes from `results`
except `clearResult`.

Every guard released mid-travel, every prisoner whose action is interrupted, and every
`loadSnapshot` that "drops all of them" therefore leaves one permanent entry holding a full
route. Request ids embed the tick (`src/simulation/operations/job-system.ts:154`:
`` `job.${job.id}.${job.leg}.${tick}` ``), so a retried leg never reuses the leaking key.

**Fix.** Expire results after N ticks inside `NavigationSystem.update` (a tick stamp is
already on `ResolvedPathRequest.waitedTicks`'s inputs), or make `getResult` consuming.
Either way, correct the comment in `search-system.ts`.

## PRF-06 — A single wall or door placement rebuilds the whole navigation graph (High, CONFIRMED)

`NavigationSystem.ensureGraph` runs every tick (`schedule = { intervalTicks: 1 }`,
`navigation-system.ts:41`, `:113-121`) and rebuilds from scratch whenever
`isNavigationGraphStale` is true — which it is whenever `DoorRegistry.structuralRevision`
moves or any loaded chunk's `geometryRevision` moves (`region-graph.ts:181-189`).
`finalizeConstruction` writes an edge value for every wall segment, so every completed build
order in a wall line is a whole-world rebuild.

`buildNavigationGraph` (`region-graph.ts:78-179`) is a full scan with heavy per-tile
allocation: one `TilePosition` object and one `tileKey` string per tile for `tiles`/`tileSet`
(`:88-101`), then a flood fill allocating a 4-element array of 4 fresh `TilePosition`s and 4
`tileKey` strings per tile (`neighbors()` at `:52-59`, used at `:121`), then a *second* full
pass doing the same for portals (`:139-152`), then `new Set([a, b])` per portal (`:164`).
Order of 20 allocations per tile.

**Measured** (real module, empty chunks, no doors — i.e. the cheapest possible case):

| chunks | tiles | `buildNavigationGraph` |
|---|---|---|
| 2×2 | 4,096 | 34.3 ms |
| 4×4 | 16,384 | 66.1 ms |
| 6×6 | 36,864 | 158.7 ms |
| 8×8 | 65,536 | 296.2 ms |

`docs/NAVIGATION.md` reports ~99 ms for a 128×128 cell-block layout, consistent.

**Scaling term.** O(loaded tiles) with a ~4.5 µs/tile constant, *per structural change*. A
256×256-tile prison freezes the worker for ~300 ms per wall; a drag placing 30 wall segments
that complete on different ticks costs ~9 s of stall, during which the clock accumulator
runs away (PRF-10).

**Fix.** Incremental invalidation: rebuild only the chunks whose `geometryRevision` moved
plus their border regions, and re-stitch region ids across chunk seams (the per-chunk
`geometryRevision` needed for this is already tracked, and `TopologyManager.processChunk`
already demonstrates a per-chunk region walk). Failing that, coalesce: a build gesture should
bump the revision once at the end, not per segment.

## PRF-07 — `${x},${y}` string keys everywhere in the hot path (High, CONFIRMED)

The world and navigation layers use decimal string keys as their primary index:

- `tileKey` / `chunkKey` — `src/simulation/world/coordinates.ts:167`, `:175`
- `doorEdgeKey` — `src/simulation/navigation/door.ts:60`
- `layerKey` (renderer) — `src/rendering/world/world-view.ts:51`
- `flowFieldGroupKey`, `cacheKey`, `routeContextFingerprint` — the last of which allocates
  an array copy, sorts it and joins it on every call (`route-context.ts:51-54`)

Per A* expansion in `boundedLocalSearch`: 4 `tileKey` (`:172`), 4 `tileKey` inside `canStep`
(`:50`), 4 `doorEdgeKey` via `getByEdge` (`:60`), plus 4–8 `chunkKey` inside
`world.getLeftEdge`/`getTopEdge` (PRF-08). Call it 12–16 string allocations plus the same
number of string hashes per expansion, on top of ~13 short-lived objects. At the shipped
2,000-expansion budget that is ~25–30 k string allocations per tick, ~600 k/s at 20 ticks/s.

**Fix.** Pack tile coordinates into a single integer (`x` and `y` are branded safe integers;
`(y << 20) | x` or `y * stride + x` covers any world a browser will hold) and use
`Map<number, …>`/`Set<number>`. Keep one string-keyed accessor for diagnostics only.

## PRF-08 — Every simulation-side tile read allocates (High, CONFIRMED)

```ts
// src/simulation/world/sparse-world.ts:305-314 (and :448-454 for edges/zoning)
const { chunk, local } = tileToChunk(tile, this.tileChunkSize);
const key = chunkKey(chunk);
const terrainData = this.chunkTerrain.get(key);
```

`tileToChunk` (`coordinates.ts:144-156`) allocates three objects (`{chunk:{x,y}, local:{x,y}}`)
and calls `chunkSize(value)` — a full `Number.isSafeInteger` re-validation of an invariant
constant — plus two `localTileCoordinate` calls that validate again. Then `chunkKey`
allocates a string and the `Map` hashes it. So a single `getTopEdge` costs 3 objects, 1
string, 1 string hash and 3 redundant validations. `resolveEdge` calls one per neighbour
examination; `TileLayer.paintChunk` calls `readTile` twice per tile.

`getChunk` additionally returns `cloneState(state)` — two more objects per call
(`sparse-world.ts:73-75`, `:231-234`) — and `NavigationSystem.ensureGraph` calls it once per
loaded chunk per tick (`navigation-system.ts:114`), plus `.map` and two `.filter` array
allocations. (Per-tick cost of `ensureGraph`'s staleness check itself is small — **measured**
0.002–0.011 ms for 4–64 chunks — so this one is allocation churn, not a stall.)

**Fix.** Add an integer fast path: `private readTileIndex(x, y): {chunkKeyInt, index}` with no
object allocation and no re-validation (validation belongs at the API boundary, not per read),
and keep the chunk planes in a `Map<number, Uint8Array>`. A one-entry memo like the
renderer's would also help, since navigation reads are spatially clustered.

## PRF-09 — Parcel ownership sorts the whole parcel list per tile (High, CONFIRMED)

```ts
// src/simulation/world/sparse-world.ts:558-561
public isTileOwned(tile: TilePosition): boolean {
  const { chunk } = tileToChunk(tile, this.tileChunkSize);
  return isTileOwnedBy(tile.x, tile.y, this.ownedParcelBounds(), this.isOwned(chunk));
}
```

`ownedParcelBounds()` (`:572-578`) calls `getAllParcels()` (`:501-503`), which copies every
parcel into an array **and sorts it**, then allocates a second array of bounds. So one
ownership question costs O(P log P) plus two arrays. `getParcelAtTile` (`:542-549`) does the
same.

The caller that matters is per-area: `RoomZoningService` loops every tile of the requested
rectangle and, per tile, allocates a `TilePosition`, calls `tileToChunk`, `getChunk`
(clone), `canBuildAt` → `isTileOwned` (sort), `getTerrain` and `getZoning`
(`src/simulation/rooms/zoning.ts:412-427`). Zoning a 20×20 room = 400 parcel sorts and
~2,400 chunk-key strings, synchronously inside the worker tick that handles the command.
`ObjectPlacementService` and `ConstructionSystem.submitOrder` use the same `canBuildAt`.

The renderer's parallel path is done right — `WorldRenderView` precomputes `ownedParcels`
once per snapshot (`world-view.ts:135-140`) — which is the shape the simulation side needs.

**Fix.** Cache the sorted parcel list and the owned-bounds array on `SparseWorld`,
invalidated in `registerParcel`/`setParcelOwned` (both are rare). Same for `getAllParcels`.

## PRF-10 — The fixed-step clock accumulator is unclamped (High, CONFIRMED)

```ts
// src/simulation/clock/fixed-step-clock.ts:69-74
this.accumulator += elapsed * this.currentControl.speed;
const available = Math.floor(this.accumulator / this.stepMilliseconds);
const executed = Math.min(available, budget);
this.accumulator -= executed * this.stepMilliseconds;
```

Time is added unconditionally; only `executed × step` is removed, and `budget` is 5
(`src/simulation/worker/state-machine.ts:247`). There is no maximum-frame-time clamp — the
standard guard in a fixed-step loop — so any stall (a 296 ms graph rebuild, a 1.3 s A*) is
converted into permanent tick debt rather than dropped. `backlogMilliseconds` is exposed
(`:78`) and nothing reads it: no message kind reports it, no HUD element shows it, and there
is no degradation path (no "reduce budget while behind", no speed clamp). `docs/BENCHMARKING.md`
lists "backlog behaviour under a tick the scheduler cannot keep up with" as unmeasured, which
matches.

Combined with PRF-01's measured 22 ms/tick for navigation alone, a busy prison at speed 4
(80 ticks/s needed) cannot keep up and will silently drift arbitrarily far behind wall clock.

**Fix.** Clamp `elapsed` to a maximum per pump (e.g. 4 × step × speed) and expose
`backlogMilliseconds` over `simulation/clock-state` so the HUD can show "simulation behind"
instead of the game appearing to run slowly for no visible reason.

## PRF-11 — The queue re-sorts and re-keys everything pending, every tick (Medium, CONFIRMED)

`processTick` (`path-request-queue.ts:148-179`) copies all pending entries into an array,
sorts them (`:152-159`), then walks *all* of them again to build `groupCounts`, allocating a
`tileKey` and a `flowFieldGroupKey` (which calls `routeContextFingerprint`, itself an
array-copy + sort + join) per pending request (`:161-167`). Only then does the budget bound
the loop that actually does work.

**Growth term.** O(P log P) comparisons + O(P) × 3 string allocations per tick, where P is
queue depth, independent of `workBudget`. The docs' own 5,000-actor tiers drain over
1,100–1,750 ticks, so this pass runs against a deep queue for the entire drain.

**Fix.** Keep the pending set in a priority structure updated on enqueue/cancel rather than
sorted per tick (aging is a monotone function of `tick - enqueuedAtTick`, so a bucketed
priority queue by effective priority works), and maintain `groupCounts` incrementally as
requests are enqueued and resolved.

## PRF-12 — Rebuild-per-call collections (Medium, CONFIRMED)

- `GuardRoster.allGuardIds()` = `[...this.records.keys()].sort(...)`
  (`src/simulation/security/guard-roster.ts:169-171`); `unassignedGuardIds()` = that plus a
  `.filter` with a `require(id)` map lookup per guard (`:174-176`). `ResponseSystem`
  calls it once **per incident** via `claimableResponders` (`response-system.ts:261`, `:280`,
  `:406`), so a dispatch sweep is O(I · G log G) with 2 arrays per incident. `DeploymentSystem`,
  `PatrolSystem` and `SearchSystem` each call it on their own intervals, and
  `projectStatusStrip` calls it twice a second (`status-strip-projection.ts:192`).
- `IncidentLog.openIncidents()` = `[...this.openIds].sort().map(toRecord)`
  (`src/simulation/incidents/incident.ts:177-179`) — copy, sort, and a fresh record object per
  open incident, on every `ResponseSystem.update` (every 10 ticks) and every status-counts
  publication.

**Fix.** Maintain a sorted-by-id index of unassigned guards as a side effect of the phase
transitions that are already centralised in the roster, and return a stable readonly view of
open incidents rather than re-materialising records.

## PRF-13 — The incident log grows for the session's lifetime (Medium, CONFIRMED)

Terminal incidents are removed from `openIds` and `openIdsBySectorId` but never from
`records` (`src/simulation/incidents/incident.ts:166-167`); `all()` and `getSnapshot()`
sort every incident ever created (`:189-194`). Because `getSnapshot` feeds
`captureSessionSnapshot`, which the renderer polls every 2 s (PRF-03), the snapshot payload —
and therefore the structured clone, the `isJsonValue` walk and the save file — grow
monotonically with total incidents for as long as the session runs.

**Fix.** Bound the retained log (keep the last N, or the last N in-game days) with the
retention window in the save schema so a restore reproduces it, and keep aggregate counters
for anything the HUD needs beyond the window.

## PRF-14 — Snapshots box typed arrays; the zero-copy transport is dead code (Medium, CONFIRMED)

`encodePrisonerComponents` converts 18 SoA arrays into plain JS number arrays via `sliceOf`
(`src/simulation/runtime/session-systems.ts:311-338`) — one boxed double per element,
serialised as decimal digits. The repo's own test measures the shape at 305 KB (empty at
capacity) and ~425 KB (populated at capacity)
(`tests/unit/session-component-payload-size.test.ts:81`, `:101`).

Meanwhile the protocol already defines an `array-buffer` transport with transferable
collection (`src/simulation/protocol/transferables.ts:6-36`,
`src/simulation/protocol/types.ts:66-77`), and **nothing in `src/` ever constructs one** —
grep for `'array-buffer'` finds only the schema and the collector. `transferables.ts:30-34`
admits it: "Nothing builds one today: every catalog entry posts `transport: 'structured-clone'`."

**Fix.** For the *render* path this is subsumed by PRF-03's delta channel. For the save path,
the SoA arrays are already contiguous typed arrays — ship them as one `ArrayBuffer` under the
existing `array-buffer` transport (a real use for `collectProtocolTransferables`), which
removes the boxing, the digit-width cost and the `isJsonValue` walk in one move.

## PRF-15 — Paged projections that are not actually paged (Medium, CONFIRMED)

`projectRoomList` builds a `projectRow` for **every** room instance and pages the result
afterwards (`src/simulation/presentation/room-projection.ts:349-350`, `:362` via
`pageOf` → `rows.slice`, `view-model.ts:191-194`), and `projectRow` → `requirementStatus`
does `instance.objectCapabilities.includes(capability)` inside a loop over requirements
(`:221`, `:301`). `collectRoomInstances` also spreads into an accumulator per room type and
sorts the whole thing (`:206-210`).

`projectPrisonerRoster` is the counter-example done right: it walks indices and only
materialises rows inside the window (`prisoner-projection.ts:280-286`). The room projection
should match it.

**Growth term.** O(R × requirements × capabilities) per HUD request, where R is room
instances, regardless of `limit`. A 2,000-room prison pays 2,000 row projections to display 20.

## PRF-18 — Unbudgeted dependency capture (Medium, CONFIRMED)

The door-dependency sets are collected *after* the search, and that work is not counted in
`SearchStats.expansions`, i.e. not charged against the work budget:

- `runRegionDijkstra:91-100` walks every region within reach and every portal of each, and
  calls `portalIsUncrossable`, which allocates a 2-element array per call (`:130`).
- `findRouteUsingFlowField:169-172` iterates **every region in the field** and calls
  `addIncidentDoors` for each.
- `captureDoorDependencies` copies and sorts the id set and builds a `Map` with a verdict
  object per door (`route-dependencies.ts:61-64`).

**Growth term.** O(R + P) per resolved request, plus O(D log D) for the capture, all outside
the budget. On a real prison shape (one corridor touching every cell door) `P` is
proportional to cell count, so this term grows with the prison while the budget believes it
is bounded.

**Fix.** Charge the dependency walk to `SearchStats` too — it is real work the budget exists
to bound — or precompute per-region incident-door sets on the graph (they change only when the
graph is rebuilt).

## PRF-16 — Benchmark coverage does not cover the risk (Medium, CONFIRMED)

- **No scenario imports production code.** All five files in `benchmarks/scenarios/` are
  hand-rolled mirrors, stated explicitly at `navigation-actor-tiers.mjs:1-11` and
  `kernel-throughput.mjs:34`. So none of PRF-01…PRF-09 is observable from the benchmark
  suite: the mirror models a region pass as `regionGraphExpansionCost = ceil(cellCount/4)`
  (`navigation-actor-tiers.mjs:65`), an invented constant, where the real cost is a
  linear-scan Dijkstra over the real graph.
- **The mirror is knowingly stale.** `docs/NAVIGATION.md` (§"What the two cache columns do
  and do not say") records that the mirror still consults its cache only for non-shareable
  requests — "the ordering #359 replaced" — so its published `Cache hit/miss` and
  `Flow-field activations` columns describe a composition the shipped code no longer has.
- **Sanity check on the gap.** `pnpm benchmark:smoke` (run here) reports
  `navigation.meal-rush@1 (smoke): 1.756 ms mean`, while the same scenario shape on the real
  modules measures 23.9 ms/tick over 2 ticks. The benchmark is ~30× off the thing it names.
- **Thresholds.** `scripts/verify-benchmark-result.mjs` recomputes the checksum, the metrics
  and the summary statistics — genuinely good, and robust rather than wall-clock — but asserts
  **no** performance bound, by documented policy (`docs/BENCHMARKING.md` §"CI policy"). CI
  runs `pnpm verify:benchmark` (`.github/workflows/ci.yml:93-94`), so what is gated is that
  the harness works and is deterministic. That is a correct gate for what it claims; it is not
  a performance gate.
- **Uncovered areas, all of them load-bearing:** worker↔main encode/clone/decode, projection
  cost, renderer submission and frame time, allocation/GC counts, memory high-water, and
  backlog under a starved tick. `docs/BENCHMARKING.md` lists most of these as planned.

**Fix.** The single highest-value change is to make the navigation scenarios import
`src/simulation/navigation/` (vitest already transpiles TS for the test suite; a small
build step or `--experimental-strip-types` with explicit extensions would do it for the
harness) and add two counted-work metrics that are robust in CI: allocations are hard, but
`stats.expansions` **plus a comparison-count** would have caught PRF-02 as a counted-work
regression with no wall-clock flake. Add a snapshot-encode/decode scenario for PRF-03/PRF-14.

## PRF-17 — Startup: one chunk, Phaser statically imported (Medium, CONFIRMED)

`src/main.ts:1` is `import Phaser from 'phaser'`; `node_modules/phaser/dist/phaser.esm.min.js`
is 1.4 MB. `vite.config.ts:80-86` sets `target`, `sourcemap: false` and
`reportCompressedSize` — no `build.rollupOptions.output.manualChunks`, no dynamic import
anywhere in `src/` (a grep for `import(` finds only two `import('…')` *type* positions in
`rooms/topology.ts`). `index.html` loads `/src/main.ts` as the only entry. So Phaser, zod,
the whole HUD, the whole simulation and all content catalogues are one chunk that must
download, parse and execute before first paint.

Two things are already right: `@supabase/supabase-js` is imported **type-only**
(`src/persistence/cloud/supabase-client.ts:1`, `src/services/entitlements/client.ts:1`), so
it is erased; and the actor atlases load asynchronously after the scene exists
(`world-scene.ts:476`, `:973-984`) over only 112 KB of assets.

**Fix.** Split the renderer: `const { WorldScene } = await import('./rendering/scene/world-scene')`
behind the HUD's first paint, so the HUD and the "cannot start a worker" notice — which
`main.ts:120-125` already wants at first paint — do not wait on Phaser. A `manualChunks`
entry for `phaser` at minimum, so it caches separately from game code across deploys.

## PRF-19 / PRF-20 / PRF-21 (Low)

- **PRF-19.** `EntityQuery.execute()` returns a fresh `EntityId[]` per call
  (`src/simulation/entity/query.ts:37-48`) and every caller immediately does
  `this.store.getIndex(entityId)` (e.g. `prisoners/action-system.ts:97-98`) — index → id →
  index. Mitigated by multi-rate scheduling (intervals of 5/10/20 ticks), so this is one
  N-element array a few times per tick, not per system per tick. Fix: an index-yielding
  iterator (`forEachIndex(cb)`) alongside `execute()`.
- **PRF-20.** `Kernel.registerSystem` re-sorts the whole system array on every registration
  and `submitCommand` re-sorts the whole command queue on every submit
  (`kernel.ts:113-116`, `:141-144`); `step()` dequeues with `_commands.shift()` (`:162`), O(n)
  per command. Only matters for a burst of commands (a build drag), and the array is small.
  Fix: binary-insert, and an index cursor instead of `shift`.
- **PRF-21 (SUSPECTED).** `ActorLayer.draw` calls `sprite.image.setDepth(...)` for every
  visible actor every frame (`actor-layer.ts:146`). In Phaser, `setDepth` marks the display
  list for a depth sort, so this likely forces an O(n log n) sort of the scene's children
  every frame — even though actor positions only change when a snapshot arrives (every 2 s).
  Marked SUSPECTED because it depends on Phaser 4 internals I did not read. Fix: only call
  `setDepth` when the computed depth differs from the last one applied, which the class
  already does for `setTexture`.

## PRF-22 — What `session-component-payload-size.test.ts` actually bounds (Info, CONFIRMED)

Asked directly: **the bound it asserts is not a meaningful payload bound.** The test
reconstructs a hypothetical shape — 18 arrays × 5,000 slots filled with chosen constants —
and `JSON.stringify`s it (`:55-62`, `:81`, `:101`). Its own docstring says so: "the figure is
a **counterfactual**, so it cannot be measured through `encodePrisonerComponents`". It is a
documentation-consistency guard that stops two prose figures in
`session-systems.ts`/`docs/PERSISTENCE.md` drifting, and it is a good one for that purpose —
it fails if the capacity, the array count or the need scale changes.

What it does *not* do: measure the real encoder, bound the real snapshot, or notice growth
from any other section of the bundle (world chunks, incidents, construction, rooms). A real
payload guard would call `captureSessionSnapshot` on a populated fixture and assert bytes,
and the number it should be defending is the one on the *render* path (PRF-03), which is
polled every two seconds and is nowhere asserted.

---

## What is genuinely solid

This codebase is unusually thoughtful about performance in the places it has looked at, and
several parts are better than typical:

- **`ActorLayer` is a model of how to draw a crowd** (`src/rendering/phaser/actor-layer.ts`):
  free-list pooling with nothing created or destroyed per frame, a numeric cull test per
  actor, caller-owned pose/placement objects so the per-frame path allocates nothing, and
  redundant `setTexture`/origin/scale writes skipped. The class doc states its own cost
  model honestly, including the term that still scales with population.
- **`TileLayer` caches at the right granularity** (`tile-layer.ts`): ground painted per chunk
  once and pooled, height-bearing content painted per world *row* once so depth sorting works,
  run-merged fills so a 32×32 chunk costs far fewer fills than tiles, and reused
  `liveChunkKeys`/`liveRowKeys` sets so culling allocates nothing. The only problem is what
  invalidates it (PRF-03), not how it is built.
- **`WorldRenderView.readTile` fills a caller-owned `TileSample`** and memoises the chunk
  layer lookup (`world-view.ts:27-49`, `:159-181`). Exactly the right shape; it just needs
  the key made integral.
- **Chunked dense `Uint8Array` planes with RLE at rest** (ADR-0004, `sparse-world.ts:211-216`)
  is the right storage decision, taken on comparative evidence, with the chunk size in the
  snapshot for migration and a hard `WORLD_CHUNK_SIZE_LIMIT` that came from a measured
  1,526 MiB allocation from a 453-byte corrupt save.
- **The SoA entity store** (ADR-0005) — decoupled typed arrays, a component bitset, snapshots
  that are array copies, index-ordered iteration for determinism. `maxActiveIndex` bounding
  the walk, and the allocated-prefix encoding rather than capacity-shaped, are both right.
- **Multi-rate system scheduling** (`kernel.ts:168-172`, intervals of 1/5/10/20/50/2400)
  keeps most of the simulation off the per-tick path. This is the main reason the entity-side
  costs are not a problem today.
- **`buildRowIndex` iterating `loadedChunkPositions` rather than `loadedBounds`**
  (`row-index.ts:13-33`) — a real O(extent²) → O(contents) fix, documented with the
  1,721,344-vs-2,048 measurement that motivated it. Good instincts.
- **The UI layer is clean**: no `innerHTML` anywhere in `src/ui`, rows created once and updated
  through `setLabel`/`setBadge` (`primitives/list-row.ts`), no per-frame DOM writes, the only
  `getBoundingClientRect` is a scroll-into-view on a user gesture
  (`build-panel.ts:629`), and every `addEventListener` is on an element the component itself
  owns — so there is no window/document listener accumulation. Projections are pull-based
  request/response, not per-frame.
- **`projectPrisonerRoster` pages properly** (`prisoner-projection.ts:280-286`) — it counts the
  total and materialises only the window, which is what `projectRoomList` should copy.
- **Teardown is handled**: `simulation/shutdown` with an acknowledgement timeout then
  `terminate()` (`worker-per-session-host.ts`, `worker-session-host.ts:180-188`), autosave
  disposal (`session-controller.ts:222`, `:324`), scene layer `destroy()` (`world-scene.ts:462-466`),
  and the one long-lived listener (`SimulationSnapshotFeed`) is registered once at boot against
  a channel that outlives sessions — so no per-session listener leak.
- **The benchmark harness itself is well built**: versioned result schema, explicit seeds,
  warm-up separated from measured samples, deterministic checksum *and* structured metrics
  both recomputed by the verifier, and a documented refusal to add a wall-clock CI threshold
  until the prerequisites are recorded. That refusal is the right call for a noisy runner. The
  problem is what the scenarios measure (PRF-16), not the harness.
- **Documentation honesty.** `docs/NAVIGATION.md` and `docs/BENCHMARKING.md` label their own
  numbers "directional only", name the mirror's drift as an accepted cost, and leave a row that
  moved the wrong way in the table rather than dropping it. Several findings above were easier
  to confirm because the docs already pointed at the gap.

---

## Prioritised top 5 (best headroom per unit of effort)

1. **PRF-02 — replace the two linear frontier scans with a heap, and tile keys with packed
   integers.** One localised change to `local-search.ts` and `region-dijkstra.ts` (plus
   `coordinates.ts`). Measured 15–20 µs/expansion should drop by more than an order of
   magnitude; this alone makes the shipped `workBudgetPerTick: 2_000` defensible instead of
   ~8× over the tick's real-time allowance, turns the 1,325 ms open-region route into tens of
   ms, and cuts PRF-07's allocation churn at the same time. Everything else in navigation gets
   cheaper behind it. One determinism test needs its tie-break updated in the same commit.

2. **PRF-03 — stop feeding the renderer full session snapshots.** Two independent wins for
   modest effort: (a) skip or replace the `isJsonValue` deep walk for snapshot/delta payloads
   — **measured 10.4–31.0 ms of main-thread time per snapshot**, ~7× the transport it guards,
   and this is a few lines at the boundary; (b) emit a per-tick actor-position
   `simulation/delta` as a transferable `ArrayBuffer` — the message kind, the transport and the
   transferable collector all already exist and are unused. That removes the 2-second full
   re-decode, the full row re-index, the full repaint, and the visible 2-second actor
   teleporting, all at once.

3. **PRF-04 + PRF-05 — bound the caches and expire the results map.** An LRU cap on
   `RouteCache` and a tick-based expiry on `NavigationSystem.results` is a small, low-risk
   change that closes the two genuine unbounded-growth paths in a long-lived session
   (**measured** ~1,000 route-cache entries per 400 ticks at a 14 % hit rate, plus one leaked
   route per abandoned request). Do it before anyone plays for an hour.

4. **PRF-06 — make navigation-graph invalidation incremental, or at least coalesce it.**
   **Measured 296 ms per rebuild at 65,536 tiles**, triggered by every wall segment. Coalescing
   the revision bump across a build gesture is cheap and buys most of the win; per-chunk
   incremental rebuild is the real fix and the per-chunk `geometryRevision` needed for it is
   already tracked.

5. **PRF-16 — point one benchmark scenario at the real navigation modules.** Not a
   performance fix, but the reason four of the findings above were invisible to CI. Importing
   `src/simulation/navigation/` into `navigation-actor-tiers.mjs` and adding a
   *counted-work* metric (frontier comparisons alongside expansions) gives a CI-robust,
   non-flaky regression gate for PRF-01/PRF-02/PRF-18 — no wall-clock threshold required, which
   keeps `docs/BENCHMARKING.md`'s policy intact.

Honourable mention, cheap and self-contained: **PRF-09** (cache the sorted parcel list — one
memo field, removes a sort per tile from every area build/zoning gesture) and **PRF-10** (clamp
the clock accumulator and expose `backlogMilliseconds` — a handful of lines that turn an
invisible failure mode into a reported one).
