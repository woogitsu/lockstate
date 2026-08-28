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
| Ground (terrain, ownership, zoning, grid) | one `Graphics` per **chunk** | the chunk scrolls into view, or the world revision changes |
| Walls, doors, objects | one `Graphics` per **world row that has something on it** | that row scrolls into view, or the world revision changes |
| Actors | one pooled `Image` per **visible** actor | every frame, in place |

Consequences worth stating plainly:

- Panning and zooming repaint nothing. They move the camera; the geometry is
  already there. Chunks and rows that leave the view return to a pool.
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
`array-buffer` `versionedPayload` -- `lockstate.render-actors` v1, whose layout
is defined once in `src/simulation/protocol/render-actors-payload.ts` -- and it
is transferred rather than copied. Applying one replaces `RenderFrame.actors`
and nothing else.

**Geometry still arrives on a snapshot request**, which is now a consistency net
rather than the render path. The feed makes one with
`reason: 'consistency-check'` so its requests are distinguishable from saves,
and it asks only when the world can actually have changed: once when a session
becomes ready, after any command is accepted, again once the simulation reaches
the tick that command was scheduled for, when the clock *starts*, and on a
**30-second** interval while the clock is running. A paused, *idle* prison costs
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
running worker actually puts on the boundary.

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
| render-actors keyframe | 8,016 bytes | **80,016 bytes** |
| the same actors as JSON rows | 11,811 bytes | 126,823 bytes |

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

- **Actor movement, and guards.** Every prisoner is drawn with the idle clip and
  `actor-pose.ts`'s default facing, on both of the paths that reach the frame.
  Those are written as documented defaults and labelled as such at the call
  site, not derived by differencing two publications into an invented walk --
  that would be a renderer-side movement model, which architectural boundary 1
  forbids.

  **The render delta channel is not what is missing for motion, and this
  paragraph used to say it was.** The simulation updates an actor's position
  only on arrival at a resolved route's destination
  (`src/simulation/prisoners/components.ts` states the convention;
  `action-system.ts` and `patrol-system.ts` each teleport and say so), so an
  actor's authoritative position changes about twice per errand. A channel at
  any cadence therefore delivers *fresher teleports*, not walking. What is
  missing is simulation-side locomotion, which is its own decision and is not
  taken by ADR 0040 -- and until it is taken, no cadence on this channel will
  make an actor walk. The renderer's half is finished and proven:
  `DemoActorFeed` produces fractional positions and real motion vectors and
  `ActorLayer` draws them.

  Guards are the other population whose tiles the simulation already holds
  (`simulation.security.guards`, as `GuardRecord.tileX`/`tileY`), and they are
  reachable **without** waiting for anything: the delta's record carries a
  population ordinal for exactly this, and ADR 0040 puts guards in slice 2 with
  their own asset choice.

- **Environment art.** The 23 source sheets under
  `public/game-content/source-art/` are intake material awaiting a reviewed
  extraction manifest, and ADR-0014 leaves their fate as an open content
  decision. Nothing loads them. Ground, walls and objects are drawn as shaded
  geometry from the appearance tables in `src/rendering/world/appearance.ts`.

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

- **A completed door is drawn as a wall.** Issue #74 made
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
