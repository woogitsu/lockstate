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

ADR-0003 publishes snapshots, deltas and events to the main thread, but only
the correlated snapshot path is implemented -- nothing emits a
`simulation/delta` yet. A snapshot request is therefore the only legal way
world geometry can reach the renderer, and the feed makes one with
`reason: 'consistency-check'` so its requests are distinguishable from saves.

Because each request makes the worker capture a full session bundle, the feed
does not poll on a timer. It polls when the world can actually have changed:
once when a session becomes ready, after any command is accepted, and on an
interval only while the clock is running. A paused, idle prison costs exactly
one request.

**This is a placeholder, and its replacement is a simulation-side change**: a
render delta channel that publishes geometry changes and actor state would let
the feed drop polling entirely without the renderer changing at all.

## What is not rendered yet, and why

- **Actors from the simulation.** A fresh session has none: the simulation
  fabricates no default population, and `SessionSnapshotBundle` carries no actor
  positions even when some exist (`CURRENT_SAVE_RESTORED_SCOPE` lists prisoner
  state as not carried). No protocol message publishes them either. The renderer
  is ready for them -- swapping the feed is the whole change -- but it will not
  invent them.

  `?actors=demo` puts scripted actors on screen instead. They are a renderer-side
  demonstration of the sprite path, clearly labelled as such in
  `DemoActorFeed`, opt-in, and never mixed into the world underneath.

- **Environment art.** The 23 source sheets under
  `public/game-content/source-art/` are intake material awaiting a reviewed
  extraction manifest, and ADR-0014 leaves their fate as an open content
  decision. Nothing loads them. Ground, walls and objects are drawn as shaded
  geometry from the appearance tables in `src/rendering/world/appearance.ts`.

- **Wall geometry from construction.** `ConstructionSystem.finalizeConstruction`
  bumps a chunk's geometry revision without writing the world's `topEdge` /
  `leftEdge` layers, so a completed wall order is drawn from the order itself.
  The renderer draws both sources; when construction starts writing edges, the
  picture stays correct.
