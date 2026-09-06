# What a finished door is actually drawn as (#1027)

**Verdict: the opaque slab was not reproduced, and it is not reachable from any
frame this build can construct.** What *is* there, measured three times, is a
finished door still drawn as its **translucent `planned` ghost** for
**twenty-two to twenty-eight seconds** after the Build panel stopped listing it
— the
"the world has not caught up yet" reading that issue #1027 named as the rival
explanation and set out to rule out.

`main` @ `02490b6e` (v0.0.505). Measured with
`tests/browser/playtest-1027-what-a-finished-door-is-drawn-as.playtest.ts`,
whose raw output is
[the run log](./2026-09-06-what-a-finished-door-is-drawn-as/log.txt) and
[every sample it took](./2026-09-06-what-a-finished-door-is-drawn-as/samples.json). Art bytes present in the tree under test — `file
public/assets/actors/actor.guard.base.idle.png` returned `PNG image data, 260 x
3104, 8-bit/color RGBA, non-interlaced` in both the worktree and
`/workspace/lockstate` — so what the browser drew is what a player sees.

---

## 1. The three states, as pixels

One `door-wooden` order, placed with the mouse on the north edge of tile
(15,13), verified from the command the press produced
(`definitionId=door-wooden at (15,13) edge=north`). The probe is the **centre**
of that tile: a construction slab covers the whole tile, and the edge bar a
finished door is drawn as is 0.22 tiles deep at the tile's northern boundary and
never reaches the centre. So the centre pixel separates "a construction slab is
here" from "the door is here as an edge", and the alpha separates the rest.

That tile's own bare floor, sampled before anything was ordered on it, is
`[106,87,68]`. `door-wooden`'s side fill is `0x7c6037` = `[124,96,55]`
(`src/rendering/world/appearance.ts:145`). So the painter's own arithmetic
predicts:

| state | alpha | predicted centre | measured centre |
| --- | --- | --- | --- |
| nothing drawn on the tile | – | `[106,87,68]` | `[106,87,68]` |
| `planned` ghost | `PLANNED_ALPHA` = 0.35 (`appearance.ts:275`) | `[112,90,63]` | **`[112,90,63]`** |
| `building` ghost | `BUILDING_ALPHA` = 0.65 (`appearance.ts:276`) | `[118,93,60]` | **`[118,93,60]`** |
| **#1027's opaque slab** | `alphaFor('built')` = 1 (`src/rendering/phaser/tile-layer.ts:622-629`) | `[124,96,55]` | **never observed** |

**Zero samples at full opacity, across every run.** The fourth row is what
#1027 says a player sees, and it was not on the screen at any point.

The second probe, six pixels south of the tile's northern boundary, is what
says the finished door really is drawn: it reads `[130,105,72]` while the
construction ghost is up (`door-wooden`'s top fill `0xb08a4f` at 0.35 over the
same floor, which solves to 0.343 / 0.353 / 0.364 on the three channels) and
`[125,119,116]` once the order is complete — the interior-door artwork, not a
coloured slab, because the environment sheets had loaded.

## 2. Act one: what a player sees, with nothing pressed

Order the door, press Play, touch nothing else. Every accepted command is one of
the five `dirty` marks (`src/rendering/feed/simulation-snapshot-feed.ts:243,
279, 304, 311, 361`), so a second gesture anywhere in here would have measured
the gesture instead of the window.

```
t+   272ms centre=[112,90,63] slabAlpha=0.35 | queue: QUEUED | 1 waiting · 0 being built | last snapshot tick 5 says the order is "materials-pending"
t+  4612ms centre=[112,90,63] slabAlpha=0.35 | queue: .hud-build__queue: not laid out | last snapshot tick 5 says the order is "materials-pending"
t+ 30393ms centre=[106,87,68] slabAlpha=0.00 | queue: .hud-build__queue: not laid out | last snapshot tick 607 says the order is "completed"
```

The Build panel stopped listing the order at **t+4,612 ms** — the simulation had
finished the door. The renderer's frame was still the snapshot taken at **tick
5**, in which the order is `materials-pending`, until **t+30,393 ms**, when the
thirty-second consistency poll (`simulation-snapshot-feed.ts:107`) fetched tick
607 and the tile went back to bare floor.

**The window is 25,781 ms.** Five runs of the same instrument, differing only in
where in the poll period the build landed and where the sampler happened to
land, measured **22.0, 25.8, 26.1, 27.6 and 28.0 seconds**. All five are the
thirty-second poll minus how far into its period the order finished, which is
what the mechanism predicts.

**A snapshot on the wire is not necessarily the renderer's, and one run turned
on that.** The feed discards any reply it did not ask for — `if (message.replyTo
!== this.pendingMessageId) return; // Somebody else's snapshot (a save).`
(`simulation-snapshot-feed.ts:323`) — and the local save asks for snapshots of
its own. The 27.6-second run had one of those arrive reporting the door
`completed` twenty-five seconds before the tile stopped being a ghost, which
reads as the guard's two operands disagreeing until the snapshot is attributed.
The instrument now matches every snapshot's `replyTo` against the ids of the
requests carrying `reason: 'consistency-check'` (`:384`), which are the feed's:
in the run quoted above, **21 snapshots on the wire, 19 of them the feed's**.

The `building` ghost is never on screen in act one at all. The order went from
the `planned` ghost straight to the finished edge, because `in-progress` lasts
thirty ticks — a second and a half at 20 Hz — and no snapshot was requested
inside it.

## 3. Act two: what a *fresh* feed draws

Resuming a paused clock is a `dirty` mark
(`simulation-snapshot-feed.ts:279`), so running the simulation in short
Play/Pause bursts keeps the frame within a few ticks of the simulation. A second
door, same buildable, same edge, four tiles east:

```
t+     0ms centre=[112,90,63] slabAlpha=0.35 | last snapshot tick 764 says the order is "materials-pending"
t+  4958ms centre=[118,93,60] slabAlpha=0.65 | last snapshot tick 781 says the order is "in-progress"
t+ 14160ms centre=[106,87,68] slabAlpha=0.00 | last snapshot tick 821 says the order is "completed"
```

Every phase reaches the screen at the alpha its phase names, and the completed
order is drawn as an edge rather than as a block. **Still nothing at full
opacity.**

## 4. Why the opaque slab is not reachable, which is the finding

#1027's argument is that the guard at `src/rendering/phaser/tile-layer.ts:507`

```ts
if (isDrawnAsWorldEdge(structure) && edgeTileXs.has(structure.tileX)) continue;
```

is conjunctive, so a frame carrying a **completed** order whose **edge** has not
arrived falls through to `paintSlab` at full opacity. Every step of that is
true. What is not true is that such a frame can exist, and the reason is that
the guard's two operands are read off **one message**:

- `edgeTileXs` comes from `content.edges` (`tile-layer.ts:455`), which
  `buildRowIndex` fills from the frame's `world` (`row-index.ts:96`);
  `content.structures` comes from the same frame's `structures`.
- `SimulationSnapshotFeed.apply` builds both in a single object literal from a
  single bundle — `world: WorldRenderView.fromSnapshot(bundle.world)` and
  `structures: structuresFromConstruction(bundle.construction)`,
  `simulation-snapshot-feed.ts:523-524`. It is the only producer of a
  `RenderFrame` with geometry in it; `applyDelta` (`:466-471`) and
  `DemoActorFeed.readFrame` (`demo-actor-feed.ts:133-138`) both carry `world`
  and `structures` across by reference.
- `captureSessionSnapshot` takes `runtime.world.snapshot()` and
  `runtime.construction.snapshot()` in one synchronous literal of its own
  (`src/simulation/runtime/restore-session.ts:342-343`), with no tick between
  them.
- `ConstructionSystem` moves an order to `completed` and writes its edge in two
  adjacent statements — `order.state = 'completed'; this.finalizeConstruction(order);`
  (`src/simulation/construction/system.ts:1423-1424`) — and
  `finalizeConstruction` writes `DOOR_EDGE_NUMERIC_ID` through
  `writeEdge` on the same call (`system.ts:1583-1603`).

So **staleness moves both halves together**: a stale frame shows a stale
*phase*, which is a translucent ghost, not an opaque block. Walked tick by tick
in `tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`
— a west-edge door, a north-edge door and a wall, a real session snapshot
captured at each of 600 ticks and projected exactly as the renderer projects it
— there is no tick at which any completed edge-drawn structure lacks its edge.

`occupiesTileEdge` and `edgeNumericIdFor` are also exactly congruent
(`src/simulation/construction/definition.ts:1005-1007` and `:1027-1030`: both
are `category === 'wall' || placesDoor !== undefined`), so there is no buildable
for which `isDrawnAsWorldEdge` answers yes and the completion writes no edge.
That was the other route to a permanent opaque block and it is closed too.

**The one frame that would produce the block is a save written before #74** —
completed wall orders, no edge values — which is the case the guard's second
operand exists for, and it draws the wall as a full-tile block deliberately
rather than losing it.

## 5. What #1018 actually saw, and what is actually wrong

#1018 recorded a door still drawn as a construction block after
`waitForQueueEmpty` reported empty. That is act one above, exactly: a
**translucent** ghost at `PLANNED_ALPHA`, for twenty-six seconds, on a door the
Build panel had already stopped listing. #1027 read it as the sharper branch;
the measurement says it is the simpler one.

That is still a defect, and it is a bigger one than the nine-point-seven seconds
`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` §7 measured
for walls: the player is told in words that the queue is empty while the world
still shows an unbuilt door.

## 6. The candidate fix #1027 names cannot be written where it says

> Mark the feed dirty when the construction snapshot's completed set grows.

The feed learns the construction snapshot **only from the snapshot it is
deciding whether to request**. A sixth `dirty` mark inside
`simulation-snapshot-feed.ts` therefore has nothing to read: by the time it can
see the completed set has grown, the request it would have provoked has already
been answered. That is why all five existing marks are facts about a *message* —
it is not an oversight, it is the only information that reaches the feed
unsolicited.

Two routes exist and both are decisions rather than edits:

1. **An unsolicited worker message that names the change.** `simulation/event`
   exists; `statusCountsSchema` (`src/simulation/protocol/types.ts:710-…`)
   carries no build-queue field, so `simulation/status-counts` cannot serve.
2. **The answer the main thread already has.** `BuildQueueReader.read`
   (`src/ui/simulation-build-queue.ts:147, :188`) asks the worker for
   `hud/build-queue` on the clock heartbeat — about four times a second — and is
   given an authoritative view of the construction queue. The main thread
   therefore learns of a completion within ~250 ms and the renderer's feed is
   simply not told. Wiring that across is a `src/ui/` → `src/rendering/`
   dependency, which `tests/unit/ui-orchestration-boundaries.test.ts` constrains
   in terms of intent, so it needs an argued decision and not a patch.

## 7. How this meets ADR 0097 option A and ADR 0040 slice 4

ADR 0040's slice 4 is *"carrying chunk geometry on the delta channel, and
retiring the poll for renders altogether"* (`simulation-snapshot-feed.ts:50-52`).
**That is the change that makes #1027 real.** It puts geometry and the
construction projection on two channels with two cadences, and the moment they
can arrive apart, the guard at `tile-layer.ts:507` starts painting opaque blocks
over finished doors — for as long as the two channels disagree. The same is
true of ADR 0097's accepted option A to the extent that it moves anything the
guard reads onto the delta channel: the condition overlay itself does not, but
it establishes the pattern, and the invariant this depends on is nowhere
written down in either document.

`tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts` is
now where it is written down, with a control that builds the split frame by hand
from two captures of one session and asserts it *does* produce the block — so
the day the channels split, the gate says which tile and at which tick.

## 8. Recommendation

**Re-scope #1027.** Its title claim — a completed door painted as a full-tile
*opaque* slab — is not reproducible and is unreachable in this build; its
premise about the guard is correct and its premise about the feed's `dirty`
marks is correct, and the two do not compose into the symptom. What remains, and
is worth its own issue, is the twenty-six-second window in which a finished door
is drawn as an unfinished one, and the fact that its fix is not available inside
the feed.

## 9. Weakest claim, named

**The window's timing resolution is coarse.** Each sample costs two
`page.screenshot` round trips and a `page.evaluate` decode, so the sampler runs
at roughly one sample every 3.5 s and every boundary above is known to within
about four seconds. The *mechanism* is not affected — the feed's own snapshot
tick jumps from 5 to 607 in one step and the poll interval is a constant — but
"25,781 ms" should be read as "about 26 seconds", and the five runs' spread
(22.0, 25.8, 26.1, 27.6, 28.0 s) is that resolution plus where in the poll
period the build landed, not five different behaviours.

Second: the machine was not idle. Another agent's browser suites were running
on this container during these runs, and one of this agent's own commands killed
two of their dev servers — reported rather than hidden. Wall-clock contention
does not move a thirty-second poll interval or a blend arithmetic, and the five
runs agree, but the *sampler's* cadence is where load would show and the
resolution caveat above already covers it.

Third: act two keeps the feed fresh by pausing and resuming the clock,
which is a real control but is not how a player plays. It is offered as evidence
about what the *painter* does with a fresh frame, and act one — with nothing
pressed — is the evidence about what a player sees.
