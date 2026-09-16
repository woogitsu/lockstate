# World rendering

How the tile world and its actors get on screen. This is the renderer's half of
the contract that [ARCHITECTURE.md](./ARCHITECTURE.md) states from the
simulation's side, and it is binding in the same way.

## The one rule everything else follows

**Rendering is not simulation** (`AGENTS.md`, boundary 1). Every Phaser object
is a view of data the simulation already decided. The renderer:

- reads immutable projections and never writes back;
- holds no authoritative state, and rebuilds what it holds from the next
  projection rather than patching it;
- never sends a simulation command as a side effect of drawing.

`tests/unit/rendering-module-boundaries.test.ts` pins the parts of this that can
be checked statically.

## Layout

```text
src/rendering/
  tile-metrics.ts     tile <-> world units, camera culling range
  depth.ts            draw-order rules for a top-down view with visible sides
  assets/             logical asset id -> atlas frame (ADR-0014)
  camera/             camera transforms (docs/CAMERA.md)
  world/              world projection, appearance data, row index
  actors/             pose selection and foot-pivot placement
  feed/               where render frames come from
  phaser/             the only modules that touch a display list
  scene/              WorldScene: camera, input, layers
```

Everything outside `phaser/` and `scene/` is free of Phaser and of the DOM, so
direction selection, frame timing, pivot maths, depth ordering and the world
projection are unit-testable in the default Node environment.

## Coordinates

`docs/CAMERA.md` defines world coordinates as continuous logical units and
`zoom` as screen pixels per world unit. It does not say how large a tile is,
because that is a presentation choice: `TILE_SIZE_PX` in
`src/rendering/tile-metrics.ts` is the single place it is decided.

It is 64, chosen against the art rather than by taste. Character frames are
authored 256px wide for a 1x1 tile footprint
(`assets/contracts/character-8-direction.contract.json`), so a 64px tile draws
them at quarter scale and the closest zoom approaches their authored
resolution.

## World reference art is not a runtime asset (identity v5, 2026-09-13)

`docs/design/2026-09-13-identity-v5/ASSETY/wizja-mapy.png` (`dist/world.png` in
the delivered prototype) is one 1536×1024 illustration of the whole campus, and
nothing under `src/rendering/` reads it: it declares no id
`src/rendering/assets/environment-sprites.ts` resolves and is absent from the
atlas registry and both `public/game-content/*.v1.json` catalogs (checked
2026-09-13). `docs/ART_PIPELINE.md`'s "World illustration reference" section
carries the delivery's own words for why — it is an artistic reference for
producing individual objects, explicitly not a source to cut a sprite set out
of. Anything the renderer draws of what it depicts still comes from a `.blend`
through the character or environment-object pipeline above, at this file's
projection, pivots and `depthForAnchor` occlusion rule.

## Depth

A top-down view in which objects have visible sides needs a draw order, not
just a layer stack. Everything with height is anchored at its *southern* edge
and sorted by it, so a thing further south covers a thing further north.
`depthForAnchor(anchorWorldY, layer)` is the whole rule; the layer bias only
breaks ties within one row, and can never promote something past the next row.

An actor's anchor is its feet. A structure's anchor is the southern edge of the
tile it stands on. That is why a prisoner walking in front of a wall covers it
and one standing behind it is hidden.

## What is drawn, and what it costs

`AGENTS.md`'s performance philosophy makes budgets contracts. The renderer has
two caches and one pool, all keyed by things that rarely change:

| Layer | Unit of work | Repainted when |
| --- | --- | --- |
| Ground (terrain, ownership, zoning, grid) | one `Graphics` per **chunk**, plus one pooled `TileSprite` per merged rectangle of floor art in it | the chunk scrolls into view, or the world revision changes |
| Walls, doors, objects | one `Graphics` per **world row that has something on it**, plus one pooled `TileSprite` per run of wall art on it **and one per object drawn as art** | that row scrolls into view, or the world revision changes |
| Actors | one pooled `Image` per **visible** actor | every frame, in place |

Consequences worth stating plainly:

- Panning and zooming repaint nothing. They move the camera; the geometry is
  already there. Chunks and rows that leave the view return to a pool.
- **Art did not change that, and the sprite counts are bounded by runs rather
  than by tiles.** `mergeFloorRects` collapses a chunk's floor art into greedy
  rectangles, so a zoned room is one sprite and not one per tile;
  `mergeTopEdgeRuns` collapses a row's north wall into one sprite per unbroken
  run. Both are pure functions in `src/rendering/world/tile-art-runs.ts` and
  both are unit-tested, which is the only way any of this is reachable from a
  suite with no canvas.
- **What art costs a chunk paint, measured** (Node 24, the production modules
  loaded through the same `registerHooks` resolution `benchmarks/production-modules.mjs`
  uses; 3,000 iterations after 300 warm-up, one 32x32 chunk):

  | | per chunk paint |
  | --- | --- |
  | the tile pass that already existed (1,024 `readTile`) | 73.25 us |
  | `buildRowIndex` over the same chunk, for scale | 74.83 us |
  | **added:** 1,024 `zonedFloorSprite`, every tile zoned | **1.04 us** |
  | **added:** `mergeFloorRects`, one room-shaped rectangle | **18.63 us** |
  | **added:** `mergeFloorRects`, 512 rectangles (alternating zoning) | 141.42 us |

  So a chunk that scrolls into view costs about 20 us more than it did, against
  the ~75 us it already spent — and nothing extra per frame, because a chunk is
  still painted once. The floor decision is taken **inside** the pass that
  already reads every tile rather than in one of its own; a separate pass was
  written first and measured 73-79 us, which is the whole existing cost again.
  The 141 us row is a chunk zoned like a chessboard, which is not a prison; it
  is here because a greedy merge's worst case should be stated rather than
  discovered. These are direct measurements, not a `benchmarks/` scenario:
  adding one would mean a registry entry, a scenario version and a kind
  declaration for a figure that is not a gate.
- The ground is painted per chunk because the world *is* chunked
  (`AGENTS.md` boundary 8), not because it is convenient.
- **A world revision costs one pass over the materialised tiles**, and only
  those: `buildRowIndex` iterates `WorldRenderView.loadedChunkPositions`, so
  the figure is `loadedChunkCount * chunkSize^2` regardless of how the loaded
  chunks are arranged. Until issue #204 it walked `loadedBounds` instead —
  the bounding box of those chunks — which is the same number only while they
  tile that box: two 32x32 chunks 40 apart span 1,721,344 tile positions and
  contain 2,048. Boundary 8 is the reason that is a defect and not a
  trade-off; a walk over a bounding box is the dense matrix the boundary
  forbids, and it runs on the thread that draws.
- Sprites are never created or destroyed per frame. The pool grows to the
  largest number of *visible* actors ever reached -- bounded by the viewport,
  not by the population.
- The per-frame path allocates nothing: pose selection, frame lookup and pivot
  placement fill caller-owned objects, and `AtlasFrameIndex` answers with
  pre-built descriptors instead of building one per call.
- The remaining cost that scales with total population is one numeric range
  test per actor for culling. A spatial index is what removes that, when
  measurements say it is needed.

## Actors

`AtlasLibrary` resolves a logical asset id, clip, direction and frame ordinal to
an image URL, source rectangle and foot pivot (ADR-0014). `AtlasFrameIndex`
flattens that into a lookup the frame loop can afford, and
`registerAtlasTextures` publishes the rectangles into Phaser's texture manager.
No filename is spelled anywhere in the renderer.

Per actor, per frame:

1. `selectActorPose` picks `idle` or `walk` and one of the eight authored
   directions from the movement vector the simulation produced. Below
   `IDLE_SPEED_THRESHOLD` the actor holds its facing instead of spinning on
   floating-point noise.
2. `actorFrameOrdinal` picks the frame from presentation time, offset by a
   stable per-actor phase so a crowd does not march in lockstep. The phase is
   derived from the actor id alone, so it is deterministic.
3. `placeFootPivotSprite` puts the frame's **pivot** -- not its corner or
   centre -- on the actor's position, as a normalised origin.

Art that fails to load leaves a playable, legible tile world. Art is not
correctness.

## Where render frames come from

`RenderFeed` is the seam. `SimulationSnapshotFeed` implements it over the
existing worker protocol, and its behaviour is deliberate:

ADR-0003 publishes snapshots, deltas and events to the main thread. Two of the
three reach the feed, and they carry different halves of a frame.

**Actors arrive on `simulation/delta`.** ADR 0040 slice 1 (#414) gave that kind
its first sender: `SimulationWorkerStateMachine.publishRenderDelta` posts an
unsolicited keyframe of the live prisoner population beside the clock and
status-counts publications already on the tick loop, on a **100 ms ceiling**
and skipped entirely while the tick stands still. The body is an
`array-buffer` `versionedPayload` -- `lockstate.render-actors` (v1 at slice 1, v3 since ADR 0099), whose layout
is defined once in `src/simulation/protocol/render-actors-payload.ts` -- and it
is transferred rather than copied. Applying one replaces `RenderFrame.actors`
and nothing else, and **reads one header word that is not about the actors at
all**: ADR 0099's marker, which sets the feed's sixth `dirty` mark and touches
no field of the frame.

**Geometry still arrives on a snapshot request**, which is now a consistency net
rather than the render path. The feed makes one with
`reason: 'consistency-check'` so its requests are distinguishable from saves,
and it asks only when the world can actually have changed: once when a session
becomes ready, after any command is accepted, again once the simulation reaches
the tick that command was scheduled for, when the clock *starts*, **when a
delta reports that the drawn world changed**, and on a **30-second** interval
while the clock is running. A paused, *idle* prison costs
exactly one request — idle meaning the player is not doing anything, which since
ADR 0051 (*"What a player sees for an order given while the clock is paused"*) is a distinction worth drawing: an order given
during a pause is dispatched on the spot, so it costs the request its acceptance
already asked for, and the reply is applied even though the tick has not moved.
That last part is the feed's `pendingForcesApply`, which records whether a poll
was provoked by a change or by the interval; only the interval's reply may still
be skipped at a tick already drawn.

A running one costs **two over thirty seconds** — the session's first, and the
consistency poll at the end of the interval — and
`tests/unit/rendering-feed.test.ts` pins that figure against the traffic a
running worker actually puts on the boundary. A prison *being built* costs one
more per **drawn phase change**, which is two per order and not one, because
that is what the fifth mark reports — plus **one redundant request per
geometry-changing command**, which ADR 0099 does not mention: zoning a room
writes a chunk layer during the tick the feed is already fetching for, so the
next delta asks again for a world it is already holding. Measured at 19 → 20
feed snapshots over a full playtest run, bounded by how many such commands a
player presses; `simulation-snapshot-feed.ts` says why it is not removed (it
would need the marker on the snapshot *reply*, which is the protocol change
ADR 0099 declines) and `tests/unit/rendering-feed.test.ts` pins it at one.

> **The fifth of those marks arrived last, and the list above had five members
> and not six until it did.** Every one of the original five is a fact about a
> message this thread already had — a session becoming ready, an accepted
> command, the tick that command was scheduled for, a resumed clock, a lost
> request — and a build order *completing* is a fact about the simulation
> alone: the command that created it was accepted hundreds of ticks earlier. So
> the drawn world advanced only on the thirty-second poll, and
> `docs/research/2026-09-06-what-a-finished-door-is-drawn-as.md` measured a
> finished door drawn as a translucent unbuilt ghost for **22.0, 25.8, 26.1,
> 27.6 and 28.0 seconds** across five runs while the Build panel had already
> stopped listing the order (issue #1037).
>
> [ADR 0099](./adr/0099-how-the-renderer-learns-the-world-changed.md) is the
> accepted answer and it is deliberately **a notification, not a channel**: the
> worker publishes a monotone marker as the fifth header word of
> `lockstate.render-actors` (`u32[4]`, four bytes a publication whatever the
> population), the feed treats a change in it as a sixth `dirty` mark, and the
> snapshot request above does the fetching. Measured on the branch that landed
> it, with the same instrument that found the defect at 100 ms resolution
> (`tests/browser/playtest-1037-when-the-renderer-learns.playtest.ts`):
> **22,505 ms before, −238 ms after** — negative because the renderer now
> learns from the simulation directly while the Build panel still waits for a
> clock heartbeat.
>
> **The poll stays at thirty seconds and stays a consistency net.** Carrying
> chunk geometry on the delta channel is still ADR 0040's slice 4 and this is
> not it: the marker carries no tile, no order id and no phase, so
> `SimulationSnapshotFeed.apply` still builds `world` and `structures` in one
> object literal from one `SessionSnapshotBundle` and
> `tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`
> holds for exactly the reason it held before. A notification cannot split what
> a single capture joins.

> **This paragraph said the same thing before and was false when it was
> written.** Between `d7b4a56` (2026-08-23) and the correction, the feed marked
> its world dirty on every `simulation/clock-state` that reported a *running*
> clock rather than on the transition into one, and
> `SimulationWorkerStateMachine.publishClockState` posts one of those up to four
> times a second for the life of a running session
> (`CLOCK_STATE_PUBLISH_INTERVAL_MS`, 250 ms). So the interval was never the
> binding constraint: thirty running seconds cost **121** requests, not 2 — and
> not the 16 that the 2 s interval this figure replaced would have cost, which
> makes the shipped behaviour worse than the one the slice was measured
> against. The sentence arrived with `ea117cd` (2026-08-26), three days after
> the line that falsified it, so the interval it promised was never once
> observed. Each of those requests is a full `captureSessionSnapshot` on the
> worker, a `jsonValueSchema` walk on this thread, and — because applying a
> snapshot bumps the frame revision — a full `TileLayer` rebuild on the thread
> that draws, which is the pass priced under *What is drawn, and what it costs*
> as `loadedChunkCount * chunkSize^2`.

### What the delta channel bought, measured

At `54418b6` plus the slice-1 change, in-process, on a synthetic prison built by
`createNewSimulationRuntime` with every chunk's terrain varied so the RLE is not
one run per chunk. Both figures are per message, averaged over repeated runs in
a fresh process per configuration:

| | 500 prisoners, 16 chunks | 5,000 prisoners, 64 chunks |
| --- | --- | --- |
| `decodeWorkerToMainMessage(simulation/snapshot)` | 10.40 ms | 44.53 ms |
| ...of which `isJsonValue` on the bundle | 9.79 ms | 45.39 ms |
| `decodeWorkerToMainMessage(simulation/delta)` | **0.0049 ms** | **0.0051 ms** |
| `WorldRenderView.fromSnapshot` | 0.58 ms | 1.35 ms |
| `actorsFromSnapshot` | 0.22 ms | 0.19 ms |
| `actorsFromDelta(decodeRenderActorsPayload(...))` | 0.05 ms | 0.32 ms |
| session bundle, as JSON | 101,856 bytes | 596,659 bytes |
| render-actors keyframe (layout 1) | 8,016 bytes | **80,016 bytes** |
| render-actors keyframe (layout 2, ADR 0059) | 10,016 bytes | **100,016 bytes** |
| render-actors keyframe (layout 3, ADR 0099) | 10,020 bytes | **100,020 bytes** |
| the same actors as JSON rows | 11,811 bytes | 126,823 bytes |

Every timing in that table was measured against layout 1, whose record was four
words. [ADR 0059](./adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
made it five -- a sub-tile position, a velocity and a heading, because there is
now motion to publish -- so the payload rows are given for each layout and
the timings are **not** re-measured here: the boundary row cannot move for the
reason the paragraph below gives, and the two decode rows would move by a fifth
of a walk of the same records. A re-measurement is worth taking before either is
cited as a current figure.

**The layout 3 row is arithmetic and not a measurement, and it says so rather
than borrowing the credibility of the rows above it.** ADR 0099 adds one header
word and no record field, so the size is the layout 2 figure plus exactly four
bytes at either population — which is also the whole point of putting the
notification in the header rather than in a record.

The delta's boundary cost is **flat in the population** -- a tenfold prison
moves it by 0.0002 ms -- because `arrayBufferPayloadSchema` validates a schema
id, a content type and a `byteLength` cross-check and never walks the body,
where `jsonValueSchema` is `isJsonValue` recursing with an
`Object.getOwnPropertyDescriptor` per array element and per object key.

That walk is **essentially the whole of what decoding a snapshot costs**: the
45.39 ms row and the 44.53 ms row are the same work measured two ways, and they
straddle each other inside the run-to-run noise. Against the renderer's own
decode of the same bundle — 1.35 + 0.19 + 0.002 ms for the world, the actors and
the structures — the boundary is **97%** of the main-thread poll, which is
#414's claim and ADR 0040's figure, reproduced. The worker's side of the delta
is one walk of the position SoA: 0.11 ms at 5,000, against 3.94 ms to capture a
full session bundle for one poll.

What it does **not** buy, stated because the payload is where a reader will look
for it: the record list is still one record per live actor, so the *bytes* and
the receiver's own read still scale with the population. Only the validation
stopped scaling. Changed-only messages are ADR 0040's slice 3, and the `flags`
word and removal list are in the layout from slice 1 so that landing them needs
no version bump.

**Geometry is still polled**, and that is the remaining placeholder: carrying
chunk geometry incrementally, and retiring `simulation/request-snapshot` as a
render path altogether, is ADR 0040's slice 4.

### Actors on the frame

`src/rendering/feed/actors-from-snapshot.ts` turns the bundle's prisoners into
`RenderFrame.actors`. It reads two sections and needs both: `simulation`, whose
`prisoners.components` holds tile positions index-keyed over the entity store's
*allocated prefix* (since #70; `CURRENT_SAVE_RESTORED_SCOPE` reports it under
`restored` as `save.scope.prisoners`), and `entities`, the liveness ledger that
says which of those slots is an actual prisoner and carries the generation
counters an `EntityId` is packed from. A freed slot keeps its previous
occupant's position -- nothing clears a component array on destroy -- so
drawing the prefix unfiltered would draw ghosts. A bundle missing either
section, such as a migrated V2 save, yields no actors rather than a guessed
population.

Actors are keyed by `EntityId`, which is what lets `ActorLayer` keep one pooled
sprite on one prisoner across frames, and emitted in ascending entity-index
order -- the canonical order `EntityQuery.execute` walks (ADR 0005). The decode
runs once per applied snapshot, seconds apart, never per frame; culling stays
the layer's single range test, because this side of the seam has no camera.

**On the shipped app this draws nothing in a prison the player has not zoned a
room in, and the reason is not the renderer.** It is no longer that nothing can
admit a prisoner: #261 step 4 wired the `AdmitPrisoner` command, its handler
branch and the Intake panel that produces it. It is that an admission into a
prison with no room instance of an accommodation target is *refused* at the
boundary, because `IntakeSystem` would mark that arrival terminally `'failed'`.
Once the player has zoned a cell -- which the Rooms tab (#312) is the producer
for -- the admission is accepted and this draws the arrival with no change
here; measured on the merged tree, the prisoner exists from the tick the
command runs and waits at `accommodation-assignment`. A bundle that carries
prisoners is drawn already --
`tests/unit/rendering-feed.test.ts` admits through the real runtime and
asserts the decoded frame.

`?actors=demo` still puts scripted actors on screen. They are a renderer-side
demonstration of the sprite path, clearly labelled as such in `DemoActorFeed`,
opt-in, and never mixed into the world underneath. The flag *replaces* the
frame's actor list rather than adding to it -- the demo numbers its actors from
1 and `EntityId`s start at 0, so a merged list could give two actors the same
pooled sprite -- so a populated prison shows the demo, not its prisoners, while
it is on.

## What is not rendered yet, and why

- **Guards, until #414's surviving half.** This bullet used to say guards "do
  not reach the renderer at all yet" and that ADR 0059 open question 4 left
  the two halves -- decode them at all, and decode them while they still
  teleport -- as one undecided decision. They now reach the renderer:
  `actors-from-snapshot.ts` decodes `simulation.security.guards.records` and
  `render-actors-keyframe.ts`/`actors-from-delta.ts` carry them on the delta at
  the guard population ordinal (ADR 0040 slice 2), drawn with
  `actor.guard.base` -- already in `public/assets/actors/asset-registry.json`,
  so this needed no new art. `docs/research/2026-08-28-drawing-guards.md`
  answers the question ADR 0059 left open, rather than deciding it silently
  here: draw them anyway, because `deriveDefaultSecuritySector` authors no
  patrol route in a session a player can start, so a hired guard mostly stands
  at a fixed post and the teleport-between-waypoints case that worried ADR 0059
  is the rare one, not the common one, and it degrades to exactly the
  motionless-snapshot look a prisoner had before ADR 0059 -- which shipped and
  was fine. **This paragraph then said "what has not changed" is that a guard
  record always carries zero velocity and zero heading, and that is now false
  for deployment travel and a patrol leg.** [ADR 0088](./adr/0088-does-a-guard-walk-to-its-post.md)
  answers ADR 0059 open question 4 for exactly those two errands: `GuardRoster`
  gained its own `LocomotionStore`, and `render-actors-keyframe.ts` reads it
  the same way it already reads a prisoner's. Issue #740 measured the reason --
  a guard's `'travelling'`/`'returning'` phase lasted about as long as a path
  request and 95 roster samples across two acts never once caught it. **What
  is still true, marked rather than silently dropped**: a guard on incident
  response or contraband search duty (`response-system.ts`, `search-system.ts`)
  is unconverted and still teleports on arrival, for the same balance/deadline
  reason ADR 0059 gave for leaving every guard errand inert in the first
  place -- see "How a prisoner is drawn while walking" below for what that
  now means for one guard next to another, not only for a guard next to a
  walking prisoner.

  > **Prisoner movement was in this list until ADR 0059, and the paragraph that
  > held it read:** *"The render delta channel is not what is missing for
  > motion, and this paragraph used to say it was. The simulation updates an
  > actor's position only on arrival at a resolved route's destination …, so an
  > actor's authoritative position changes about twice per errand. A channel at
  > any cadence therefore delivers fresher teleports, not walking. What is
  > missing is simulation-side locomotion, which is its own decision and is not
  > taken by ADR 0040."* Every word of that was true of the code it described,
  > and ADR 0059 is the decision it was waiting for. What survives it unchanged
  > is the sentence before: a renderer may not difference two publications into
  > an invented walk, and it still does not — the velocity it draws by is
  > published, and `actor-extrapolation.ts` states the four conditions that
  > keep advancing a published position on the right side of boundary 1.

- **How a prisoner is drawn while walking.** The payload carries a **sub-tile
  position**, a **velocity in sub-tile units per wall-clock second** and a
  **heading** (layout 2, ADR 0059). `actors-from-delta.ts` turns the first into
  the continuous tile coordinates `RenderActor` has always declared, the second
  into `deltaX`/`deltaY`, and the third into a facing through
  `directionFromMovement` — so `selectActorPose` chooses the walk clip and the
  authored direction, and the 8-direction atlases are reached by a real prison
  rather than only by `DemoActorFeed`. An actor that has never walked publishes
  heading `0, 0`, and `facing` is then **absent** rather than written as south.

  Between two publications — 100 ms apart at ADR 0040's ceiling — the feed
  advances each actor from the position it was published at by the velocity
  published with it, bounded to `MAX_ACTOR_EXTRAPOLATION_SECONDS` and only while
  the clock runs. Without that a prisoner walking at ten tiles a second moves
  in whole-tile steps ten times a second.

  Guards are the other population whose tiles the simulation holds
  (`simulation.security.guards`, as `GuardRecord.tileX`/`tileY`), and this
  paragraph used to say they were reachable "without waiting for anything" and
  named ADR 0040 slice 2 as the step that would do it. That step has landed
  (see "Guards, until #414's surviving half" above): a guard is drawn at
  `GUARD_ACTOR_ASSET_ID`.

  **This paragraph then said `deltaX`/`deltaY` are always `0` because a guard
  "only ever teleports on arrival", and that is no longer true of every
  guard.** [ADR 0088](./adr/0088-does-a-guard-walk-to-its-post.md) gave a
  guard on deployment travel or a patrol leg the same `LocomotionStore` a
  prisoner has had since ADR 0059, so `render-actors-keyframe.ts` reads a real
  sub-tile position, a real velocity and a real heading for those two errands
  -- the guard walks its walk clip exactly as a prisoner does, at the same
  speed, extrapolated the same way between publications. **What is unchanged,
  marked rather than dropped**: a guard on incident response or contraband
  search still has `GuardRecord.tileX`/`tileY` update only on arrival, so
  *that* guard still renders motionless between two tiles and then snaps --
  the same population, two different errands, two different answers, and a
  reader has to ask which one a given guard is on rather than assume either.

- **Environment art, for everything except floors, walls and doors.** A minority
  of the published art under `public/game-content/source-art/` is read
  (ADR-0052): a zoned tile is drawn as institutional linoleum, an east-west wall
  as a frontal elevation, a north-south wall as its coping seen from above, and
  a door as a door. **This read "Three of the 23 sheets" and both halves had
  moved by 2026-09-15**: `ls public/game-content/source-art/ | wc -l` returns
  **26** files (23 owner sheets plus three `rendered.*` renders published under
  ADR 0100), and the distinct sources named in
  `src/rendering/assets/environment-sprites.ts` are **seven**, not three — the
  four object sprites below arrived without this sentence moving. The pair is
  replaced by its enumerator rather than by a new pair: `ENVIRONMENT_SPRITE_IDS`
  in that module is the list of what is drawn, and each entry names the sheet or
  render it comes from. Everything else is still shaded geometry from the appearance
  tables in `src/rendering/world/appearance.ts`, and which identities those are
  is written down rather than implied —
  `src/rendering/world/environment-art.ts` holds the lists and the reason for
  each, and a test fails if they and the content registries disagree. **No
  terrain is drawn as art**, and the reason is not that no sheet fits: nothing
  in `src/` calls `SparseWorld.setTerrain`, so every tile is `dirt` and a
  terrain-keyed mapping would download a sheet to draw nothing.

  Furniture is the largest gap. Seven of the twenty catalogued objects have no
  sheet at all — no stove, fridge, bookshelf, washing machine, medical bed,
  medicine cabinet or security console — and most of those that do have one are
  left on colour deliberately, because each additional sheet is a ~1.5 MiB
  download. ADR-0052 records that as its open question. **Which objects are on
  colour is not tallied here**: `OBJECTS_ON_COLOUR_FALLBACK` and
  `SPRITE_BY_OBJECT_ID` in `src/rendering/world/environment-art.ts` partition
  the catalogue between them, that module's docblock carries a reason per entry,
  and `tests/unit/environment-art.test.ts` fails if either list names something
  the content registries do not.

  **One object left the colour fallback on 2026-09-05, and the paragraph above
  is kept because the download argument it makes is still the reason most of the
  rest are (#1020).** This said "one of those thirteen ... the other twelve are",
  and it was overtaken the next day and never moved: re-derived 2026-09-15,
  `SPRITE_BY_OBJECT_ID` holds **four** — `object.bed`, and `object.toilet`,
  `object.bench` and `object.desk` on 2026-09-06 (ADR 0100, #1020) — against
  sixteen still on colour, of which seven have no sheet at all.
  `environment-art.ts`'s own docblock recorded every one of those departures,
  including `object.storage-rack` leaving and returning; this sentence recorded
  none of them, which is the argument for citing the module rather than
  restating its arithmetic. `object.bed` is drawn from
  `furniture.cell.bed.single.variants` — the one view on that sheet taken from
  directly above — and it is the first object of any kind drawn as art rather
  than as a shaded slab. What had to be built first was not the mapping row but
  a **painter path**: `objectSprite` had no reader that draws, so until this
  change a row in `src/rendering/world/environment-art.ts` moved a coverage
  number and not a pixel. `TileLayer.paintRow` now asks for an object's sprite
  and falls back to `paintSlab` when there is none, exactly as it already did
  for edges.

  An object sprite covers the **footprint the simulation reserved** and not the
  slab's bounds. The slab fakes height by lifting its top face north; the object
  sheets are photographs from directly above with no elevation in them, so a
  frame stretched over the bounds would hang a fifth of the bed over the tile to
  its north. That trade is argued where it is implemented, in
  `TileLayer.acquireObjectSprite`.

  So a second object is now a rectangle in
  `src/rendering/assets/environment-sprites.ts`, a row in
  `src/rendering/world/environment-art.ts`, a line struck from the fallback
  list, and its sheet added to the LFS filter in `.github/workflows/ci.yml` —
  no renderer change. `tests/browser/environment-art.spec.ts` is what proves the
  bed reaches the screen: it reads the pixel at the middle of a finished bed,
  removes the artwork, and requires the colour to change.

- **Build input.** The scene owns one non-camera gesture: while the HUD's build
  tool is armed, a press on the world reports the tile edge it landed nearest
  and a drag reports the run it covers, drawn as a ghost by `BuildOverlay`
  until the gesture ends. The scene reports **edges**, never commands --
  `tests/unit/rendering-module-boundaries.test.ts` forbids the renderer
  submitting one, and `src/ui/build-tool.ts` is where a gesture becomes a build
  order in the HUD's vocabulary. The picking rule is pure geometry in
  `src/rendering/build/edge-picking.ts` and is unit-tested without a canvas.

  From there the run takes the **same path as the Build panel's own *Place
  order* button**: the tool reports the whole gesture to the HUD, the HUD
  dispatches it as one gated `place-build-order` intent, and `src/main.ts`
  turns that intent into `PlaceBuildOrder` commands sharing one
  `transactionId`. That is not a detour -- it is the reason a refused drag is
  now reported to the player at all. Until issue #225 the tool submitted the
  run itself and wrote a refusal to `console.warn`, so the primary way to build
  a wall was also the only one that said nothing when the worker said no.

  The interaction is **modal** rather than threshold-discriminated: laying a
  run *is* a drag, so no travel threshold can separate it from a pan without
  guessing. Arming is one visible toggle; while it is off every gesture keeps
  its old meaning. Middle-drag, the wheel and the keyboard always pan, and two
  fingers always pan and pinch -- which is why `TouchGestureTracker`'s pinch
  carries a translation, and why the scene calls `input.addPointer(2)` (Phaser
  tracks one touch pointer by default, so the second finger was previously
  never delivered at all).

- **A completed door is drawn as a wall.** *No longer true, and kept in place
  rather than deleted because the mechanism it describes is still exactly right
  and is what the fix used.* `appearance.ts` now holds
  `edgeAppearance(edgeNumericId)`, a per-value lookup beside
  `EDGE_WALL_APPEARANCE`, and `environment-art.ts` maps the same two values to
  two different sprites — so a door is drawn as a door with art and in
  `door-wooden`'s own colours without it. What the paragraph below diagnosed
  was right: the value that tells the two apart was already in the layer the
  renderer reads. The original follows.

  Issue #74 made
  `ConstructionSystem.finalizeConstruction` write the world's `topEdge` /
  `leftEdge` layers, so a completed **wall** order is real geometry and the
  renderer draws it from the world like any other edge — the order-derived
  structure it also draws simply agrees. A completed **door** order writes the
  same layers, with `DOOR_EDGE_NUMERIC_ID` rather than `WALL_EDGE_NUMERIC_ID`,
  and `tile-layer.ts` paints every non-zero edge with `EDGE_WALL_APPEARANCE`
  regardless of value — so the door the player watched being built in
  `door-wooden`'s own colours turns into a brick wall the moment it finishes.
  The value that tells the two apart is already in the layer the renderer
  reads; what is missing is a per-value appearance lookup beside
  `EDGE_WALL_APPEARANCE`. A completed order for anything that is *not* edge
  geometry — every object — only bumps the chunk's geometry revision, and is
  drawn from the build order itself.
