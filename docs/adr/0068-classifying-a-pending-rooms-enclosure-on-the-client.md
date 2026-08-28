# ADR 0068: Classifying a pending room's enclosure on the client, not the worker

> **0068 was assigned centrally**, after this draft returned unnumbered, which
> is the practice `AGENTS.md` and `docs/AGENT_WORKFLOW.md` §2 both require so
> that two agents drafting at once cannot take one number. The arithmetic was
> re-derived from disk at the moment of writing rather than taken on trust:
> with `origin/main` merged in, `docs/adr/` holds **0067** as its highest
> number (0066 the navigation-tick-budget ADR, 0067 the assault-sanction ADR),
> so the next free number is 0068 and the index's line moves to 0069. 0067's
> own text had briefly reserved 0067 for this issue and was corrected once
> 0067 landed on something else first; this draft takes the number that
> correction leaves, and would renumber without argument if an unmerged branch
> turns out to hold it first.

## Status

**Proposed.** Decided under the owner's standing mandate (`AGENTS.md`, "The
owner's standing mandate"): research, decide, record, rather than ask. One
half of decision 2 below — the exact wording of a new sentence naming which
side of a rectangle is open — is explicitly **not** decided here and is left
to the owner, per `AGENTS.md`'s fourth exclusion (a player-visible promise the
code does not keep until the owner approves the words).

## The decision, in one sentence

**No message crosses the worker boundary for this at all.** The rectangle's
own enclosure is classified on the client, against `WorldRenderView` — the
renderer's existing, already-resident decoding of the same two edge layers a
wall is painted from — reusing `roomPerimeterEnclosure`, the identical
function `RoomZoningService.zone` refuses an open room by. The verdict is
computed live, once per rendered frame, at the composition root (`RoomTool`),
and reaches the Rooms panel as an ordinary value through a new synchronous
query the host answers (`classifyArea`), so both producers of a pending
rectangle — a world drag and the panel's own typed-coordinates form — reach
the identical answer for the identical four numbers.

## Context

### What issue #493 found

A player selects Cell, drags a rectangle, is offered an **enabled** control
reading "Designate 4 × 3", presses it, and is refused: *"this room type must
be enclosed, and the area you drew is open on at least one side."* The panel
states the rule before the drag (`paintRule`, "Must be enclosed") and the
refusal is correct behaviour (the owner's ruling on #446, recorded in
`src/simulation/rooms/enclosure.ts:22-28`). What is missing is the one
statement in between: that *this* rectangle, right now, will be refused.

`src/ui/hud/rooms-panel.ts` had already named the gap and left it unassigned:
the panel may not import `src/simulation/**` at all (`AGENTS.md` boundary 1),
so it has no edge data of its own, and the comment called this "a
HUD-projection decision".

### Verifying the boundary claim before answering it

The brief this ADR answers under said, correctly, not to build a worker round
trip on the strength of an unverified claim. `tests/unit/ui-hud-messages.test.ts`
does confirm an absolute rule, but only for `src/ui/hud/**` and
`src/ui/primitives/**`: it scans those two trees for any import matching
`/from ['"][^'"]*\/simulation\//` and asserts none exists, with fixtures
proving the scanner cannot be fooled by a comment. That rule does not extend
to `src/rendering/**` or the composition-root layer (`src/ui/*.ts`) —
`tests/unit/ui-orchestration-boundaries.test.ts`'s own header states the
opposite there: "reading simulation types and pure helpers is the point of a
projection", and `src/rendering/world/world-view.ts` already does exactly
this, importing `isTileOwnedBy` and `decodeTerrainRle` from
`src/simulation/world/**` as values.

That is the finding this decision rests on: **the worker boundary this panel
cannot cross was never the whole boundary the rectangle's enclosure needs to
cross.** The renderer already receives the world's two edge layers, decoded,
on every `world/render-snapshot` refresh — the same data a wall is painted
from — because `src/rendering/world/world-view.ts`'s `WorldRenderView` exists
for exactly that. Nothing about *this* feature needed a new message kind, a
new projection channel, or a new round trip to the worker: the edge data was
already on the client, already current to the same staleness bound as what is
drawn on screen, before this issue was opened.

## Decision 1 — What crosses the boundary, and when

**Nothing new crosses the worker boundary. The rectangle's enclosure is
classified entirely on the client, at render-frame cadence, against data the
render-snapshot feed already delivers for painting walls.**

The issue posed this as a choice between a per-frame round trip (expensive,
and proportional to how often the player moves the mouse) and an on-release
round trip (one message, but silent during the drag). Both options assume a
message has to be sent at all. It does not:

- `roomPerimeterEnclosure` (`src/simulation/rooms/enclosure.ts`) is
  `2 * (width + height)` reads of two edge arrays. Its parameter is now
  `RoomEdgeReader`, a two-method port (`getTopEdge`/`getLeftEdge`) rather than
  the concrete `SparseWorld` class — the minimal change that lets a second,
  read-only implementation satisfy it structurally, exactly as
  `WorldRenderView.isTileOwned` already imports `isTileOwnedBy` rather than
  reimplementing tile ownership (the fix issue #93 forced after two
  independent readings of ownership disagreed).
- `WorldRenderView` (`src/rendering/world/world-view.ts`) gained
  `getTopEdge`/`getLeftEdge` methods reading the same decoded chunk arrays
  `readTile` already holds, so it now satisfies `RoomEdgeReader` too. This is
  the renderer's own copy of the world, replaced wholesale on every
  `world/render-snapshot` refresh (`SimulationSnapshotFeed`'s own header:
  once at session ready; after any command that can have changed geometry,
  both when accepted and again once its scheduled tick is reached; on clock
  start; and on an interval only while the clock runs). Nothing about this
  feature changes that cadence or adds a request to it.
- `RoomTool` (`src/ui/room-tool.ts`, the composition root — "the only place
  that knows both halves", mirroring `BuildTool`'s own description) is handed
  the newest `WorldRenderView` once per rendered frame, by `WorldScene.update`,
  in the same place the scene already reads `frame.world` for its own repaint
  (`this.roomTool?.setWorld?.(frame.world)`). `RoomTool.classifyArea` then
  answers `roomPerimeterEnclosure(this.world, area).enclosure` synchronously,
  for any rectangle it is asked about.

The consequence for the tick budget is not "this crossing was made cheap" —
it is that **there is no crossing to budget**. ADR 0066 measured that a
per-tick prelude proportional to pending work can cost more than the work
itself, on the simulation's own thread; this feature adds no work to the
simulation's thread at all, in any tick, ever. The entire computation runs on
the main thread's own frame budget, using data the render pipeline already
holds for an unrelated reason (drawing walls). The worst case is one rendered
frame of staleness between a wall finishing construction and the tool's own
copy noticing — which is also, exactly, the staleness bound of what the
player sees drawn on screen. The enclosure hint can therefore never disagree
with what the player is looking at; it can only (rarely, for one frame) be
behind it, in the same direction and by the same amount the walls themselves
are.

**Both producers of a rectangle reach the same verdict for the same reason.**
`RoomTool.classifyArea` is a query (`HudWorldRoomSource.classifyArea`), not an
event a drag alone can raise, so the panel's typed-coordinates form — which
drags nothing and has no frame of its own to be told on — asks it directly
through `RoomsPanelOptions.classifyArea`, the same function `hud.ts` uses for
a finished world gesture. This is #411's parity guarantee ("nothing downstream
can tell which [producer] it was") extended to a fact neither producer could
answer for itself.

## Decision 2 — What the player is told

**Shipped: the existing two-value readout, reused rather than duplicated.**
The pre-confirm note reuses `hud.rooms.enclosure-open` ("Open on at least one
side") — the identical sentence the post-designation readout already shows
for an open room — rather than drafting new copy for the same fact in a
second place. `hud.rooms.enclosure-sealed`/`-open` existed, unused for this
purpose, exactly as issue #493 said.

**Not shipped: naming which side.** `roomPerimeterEnclosure`'s scan already
visits every perimeter edge in a fixed order — the rectangle's north side,
then south, then west, then east — and returns the first gap it finds
(`RoomEnclosureResult.gap`, `{ tile, edge }`). Which of the four rectangle
sides that gap belongs to is derivable from the same information at zero
additional edge reads: the scan already knows which phase found it. So "open
on the east side" is exactly as cheap as "open on at least one side" — the
issue's own framing was correct.

It is not shipped because it is new player-facing copy, and `AGENTS.md`'s
fourth exclusion reserves that to the owner: *"Anything that reaches a player
as a promise the code does not keep… do not add one, in any tree"* is one
direction of that rule, and the sibling direction — a new sentence nobody
outside this document has approved — is the one this decision declines to
cross unilaterally. The refusal sentence at
`src/content/default-locale-en.ts:344` (`hud.alert.refusal.zone.not-enclosed`)
is exactly as unhelpful after the press as the old pre-confirm silence was
before it, for the identical reason, and the recommendation below applies to
both places at once.

**Recommended wording, for the owner to approve or reject:**

> "Open on the {side} side" — four variants (north/south/east/west), or one
> parameterised key — replacing `hud.rooms.enclosure-open` where a specific
> side is known, and a matching gain for
> `hud.alert.refusal.zone.not-enclosed`: *"…and the area you drew is open on
> the {side} side."* The generic sentence stays as the fallback for a
> rectangle with more than one gap, since the scan reports only the first.

Should the owner approve, the plumbing is a small, well-contained addition —
`RoomEnclosureGap` gains a `side: 'north' | 'south' | 'east' | 'west'` field,
computed once per phase inside `roomPerimeterEnclosure` at zero extra reads —
and is not built here, so this document does not ship a promise the code does
not yet keep.

## Decision 3 — What the confirm control does

**Disable it, with the note carrying the reason — the same treatment the
too-small warning already has, extended rather than duplicated.**

`confirmButton` is disabled when the pending rectangle is either under the
selected room's authored minimum **or** open against a room type that
requires enclosure (`enclosed`). The rectangle is not taken away — the player
drew it, and a pending rectangle with no visible reason for having no way
forward is its own dead end, which is precisely what a disabled control with
no sentence beside it would be. `paintNote` already had a precedence rule for
one warning ("too-small wins over everything"); it now has two, in the same
order:

1. **Too small** wins outright. A rectangle can be both too small and open at
   once (shrinking or growing a rectangle changes which edges are even in
   play), and the size is what has to be fixed first.
2. **Not enclosed**, only reachable once too-small does not apply, and only
   for a room type whose `enclosure` requirement is `'enclosed'` — a room
   type requiring `'outdoors'` or with no requirement is unaffected, because
   the question does not apply to it.
3. Otherwise, the existing arm/remove hint, unchanged.

Disabling and warning are both `RoomEdgeReader`-cheap and both already had a
precedent in this exact panel; the decision here is only that the precedent
extends rather than that a new mechanism was invented.

## Consequences

- **No new message kind, no new protocol version, no new worker request.**
  `tests/contract/*` and `docs/HUD_PROJECTIONS.md`'s gap inventory are
  unaffected.
- `src/simulation/rooms/enclosure.ts`'s `roomPerimeterEnclosure` now takes
  `RoomEdgeReader` rather than `SparseWorld`. The one existing simulation call
  site (`RoomZoningService.zone`) is unaffected, because `SparseWorld` already
  satisfies the new port structurally.
- `src/ui/room-tool.ts` gains one new cross-tree dependency,
  `src/simulation/rooms/enclosure` (value), recorded in
  `tests/unit/ui-orchestration-boundaries.test.ts`'s manifest with its reason.
  It builds no simulation runtime and submits no command; the two producers
  of a rectangle still leave the panel by an intent this module reports,
  never a `ZoneRoom` it composes.
- `hud.rooms.enclosure-open`/`-sealed` now render in two places rather than
  one. `src/ui/hud/messages.ts`'s doc comment says so, at the point it would
  otherwise mislead a reader into thinking the pre-confirm warning "cannot be
  built here" (its own prior sentence).
- The refusal sentence at `src/content/default-locale-en.ts:344` is
  unchanged. It remains exactly as unhelpful as it was, which is the
  consequence of decision 2 being partly deferred rather than a regression
  introduced by this document.

## Left undone, deliberately

- Naming which side is open, anywhere (pre-confirm note or refusal sentence).
  Decision 2 drafts the wording and reserves the approval to the owner.
- A live update to the note *during* the raw drag, before release. The
  panel's existing precedent (too-small) only warns once a rectangle is
  *pending*, and this decision follows that precedent rather than introducing
  a second timing rule for a sibling warning. The underlying signal
  (`classifyArea`) is already computed at render-frame cadence and would cost
  nothing further to surface earlier; doing so is a follow-up, not a defect
  in this one.
