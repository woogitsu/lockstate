# Room designation gesture — evidence for ADR 0022

Research round for the Lockstate repository owner. No code was written and no repository file
was changed.

---

## 0. How to read the confidence labels (read this first)

The network in this container blocks almost everything. Concretely, measured this session:

- **`WebFetch` is blocked for every game wiki tried.** `prisonarchitect.paradoxwikis.com`,
  `oxygennotincluded.wiki.gg`, `rimworldwiki.com` and `prison-architect.fandom.com` all returned
  `EGRESS_BLOCKED` from the proxy. **I could not open a single primary source page.**
- **`WebSearch` works.** It returns a real result list (titles + URLs) plus a machine-written
  summary synthesised from those pages' contents. That is genuine evidence, but it is weaker
  than reading the page: the summary can blend wiki text with Steam-forum folklore, and I cannot
  see which sentence came from which URL.

So there are **four** labels below, not three:

| Label | Means |
| --- | --- |
| **VERIFIED** | I read the actual thing. In practice this means **repository source files**, which I read directly. |
| **SEARCH-SUMMARY** | A search tool summarised real pages for me; I could not open them. Directionally reliable for "which of drag / paint / automatic", noticeably less reliable for exact numbers and edge cases. |
| **FROM MEMORY** | I believe it, I could not check it, I am telling you so. |
| **UNKNOWN** | I do not know and could not find out. |

The previous round's failure modes — a fabricated developer quote, and a keybinding credited to a
base game that only exists in a mod — are both avoided here by refusing to state anything at
VERIFIED without a file I actually read. One near-miss is worth flagging as a positive: while
checking RimWorld I hit a Steam Workshop item called **"Customize Room Role"**. That is a *mod*.
Its existence is evidence that vanilla RimWorld has **no** manual room-role assignment — but it
would have been very easy to describe the mod's feature as a base-game one. It is not.

---

## 1. How comparable games let a player designate a room

### 1.0 The distinction that actually matters

There are three architectures in this sample, not two, and the question ADR 0022 asks
("what gesture, and where does the control live") has a different answer in each.

| Architecture | Who picks the *area* | Who picks the *purpose* | Games |
| --- | --- | --- | --- |
| **A. Purpose-first painting** | The player, by dragging | The player, **before** dragging — the armed tool *is* the purpose | Prison Architect, Two Point Hospital |
| **B. Fully derived** | Nobody — walls decide | Nobody — contents decide | Oxygen Not Included, RimWorld |
| **C. Object-anchored** | The player, **after** picking a piece of furniture | The furniture | Dwarf Fortress |

**The single most important finding in this section:** none of these five games does the thing
the ADR question implicitly floats — *"drag out an area with no meaning, then come back later and
assign it a purpose."* Two-gesture separation exists, but never in that order. In A the purpose is
chosen first and the area second. In B there is no gesture at all. The nearest thing to
"designate now, label later" is ONI's Room Overlay, which *shows* you what a space could become —
and the player still never picks.

If Lockstate ships "drag a nameless rectangle, then label it", it would be doing something no
game in this sample does. That is not automatically wrong, but it should be a deliberate choice
rather than an assumed middle ground.

---

### 1.1 Prison Architect — purpose-first drag, with enclosure as a *separate, ongoing check*

This is the closest analogue to Lockstate and the most useful one.

- **Gesture: pick a room type from a dedicated Rooms menu, then left-click-and-drag over the
  floor to designate it. Right-click-and-drag removes the designation.** — SEARCH-SUMMARY.
  (This matches what ADR 0022 already claims, and I could not open the two Paradox wiki pages the
  ADR cites, so treat this as corroboration by a second route rather than as independent
  confirmation.)
- **Designation and purpose are one gesture.** There is no "assign purpose" step. — SEARCH-SUMMARY.
- **Enclosure is a completely separate fact, and it is checked continuously.** The zoned tiles must
  be surrounded by walls; a room that is not enclosed still exists as a designation but does not
  work. Player troubleshooting threads consistently describe "every square of interior must be
  coded with the room type", "the room needs to reach all the walls to be enclosed", and rooms
  failing because a single square was missed. — SEARCH-SUMMARY, **and the fine detail is
  conflicting**: sources disagree about whether the tile under the door should be zoned. I would
  not build anything on that sub-claim.
- **This is the crux for Lockstate.** Prison Architect proves that "the player drags the rectangle"
  and "the game knows whether it is walled in" are not competing designs. They are two halves of
  one design. The drag says *what this is for*; the wall topology says *whether it works*.

### 1.2 Two Point Hospital — purpose-first drag, then a validate-and-commit step

- **Gesture: Rooms button → pick a room from the list → drag out a floorplan.** The minimum size
  for that room type is displayed at the top of the screen during placement. — SEARCH-SUMMARY.
- **Non-rectangular shapes are explicitly supported** via Add Blueprint / Remove Blueprint controls,
  clicking tiles to add or remove them from the blueprint. Right mouse button cycles cursor modes.
  — SEARCH-SUMMARY.
- **There is a hard commit gate**: "every room has minimum item requirements to validate the placing
  of the player's blueprint, and the room cannot be accepted until all required items are placed
  and accessible." Minimum sizes run roughly 2×3 to 4×5, up to 5×9 for some DLC rooms.
  — SEARCH-SUMMARY.
- **Rooms can be edited afterwards** — select the room, hit Edit, amend the blueprint; a room can
  also be picked up and moved. — SEARCH-SUMMARY.
- **What this contributes:** THH *does* split into two gestures, but the split is
  **area → validate → confirm**, not **area → assign purpose**. The confirm step exists because
  the game refuses to let you strand yourself with an unusable room. That safety property is
  relevant to Lockstate for a reason developed in §3 and §4: Lockstate currently has no way to
  undo or remove a zone.

### 1.3 RimWorld — rooms are never designated; *zones* are painted and are a different thing

- **A room is any space fully enclosed by impassable objects (walls, open or closed doors, vents,
  natural rock, coolers). It is detected automatically. Corners do not need to be filled.** Room
  stats — cleanliness, beauty, wealth, spaciousness — apply without any player designation.
  — SEARCH-SUMMARY.
- **Room *role* (bedroom, barracks, kitchen, hospital, …) is also automatic, derived from
  contents**: one piece of sleep furniture makes a bedroom, several make a barracks; a stove makes
  a kitchen. There is no vanilla manual assignment — see the mod note in §0. — SEARCH-SUMMARY.
- **RimWorld nevertheless has a prominent drag-painted area gesture** — stockpile zones, growing
  zones, allowed areas, selected from the Architect menu's Zone tab and painted by click-drag over
  the area. — SEARCH-SUMMARY (this matches ADR 0022's existing claim).
- **This is the sharpest available demonstration of the split.** RimWorld contains *both*
  mechanisms simultaneously and they are unrelated: rooms are derived from geometry and never
  designated; zones are designated by dragging and are not rooms. Anyone arguing "RimWorld uses a
  drag, therefore Lockstate should" is conflating the two. Anyone arguing "RimWorld derives rooms
  from walls, therefore Lockstate should" is ignoring that RimWorld also derives the *purpose*
  from contents — which Lockstate cannot do (§2).

### 1.4 Oxygen Not Included — the purest derived model, and the cheapest UI in the sample

- **No designation gesture exists.** Rooms are created by completely surrounding an area with
  tiles and at least one door. The engine designates them when the criteria are met.
  — SEARCH-SUMMARY.
- **Purpose is derived from contents.** A space that satisfies several room types at once, or none,
  becomes a **"Miscellaneous"** room with no bonus until it is specialised down to a single type.
  — SEARCH-SUMMARY.
- **Sizes are per-type ranges measured in tile area** (e.g. Barracks minimum 12, maximum 64).
  — SEARCH-SUMMARY.
- **The entire room UI is a toggleable overlay** (Room Overlay, default F11) that shows which rooms
  are recognised, their requirements, and what each Miscellaneous room could become. — SEARCH-SUMMARY.
- **Relevance to the screen-space constraint:** ONI's room feature costs *zero* permanent screen
  furniture. That is a real and attractive precedent for a game with 12.2px of budget — but it
  only works because the player never has to *tell* the game anything. See §2 for why Lockstate
  cannot borrow it.

### 1.5 The Sims — weak analogue, one useful warning

- **The Sims 4 has a Room tool**: click and drag to lay out a square or rectangular room, and the
  game adds walls, floor and ceiling. Drawing an enclosed space with the Wall tool also produces a
  room automatically. — SEARCH-SUMMARY.
- **This is a construction shortcut, not a designation.** Room "type" in the Prison
  Architect / ONI sense is not a Sims mechanic; a room does not have a *purpose* the simulation
  gates on.
- **Whether The Sims 4 lets you name a room** — UNKNOWN. Search returned nothing; I have a vague
  recollection of room naming existing somewhere in build mode, but I could not verify it and it
  would not change any conclusion here. FROM MEMORY at best, and not load-bearing.
- **The useful warning:** The Sims proves that a corner-to-corner drag on a tile grid can plausibly
  mean *a third* thing — "build the walls of a rectangle". Lockstate would then have one motion
  meaning "lay a wall run" (armed: wall), "designate a room" (armed: room), and *not* meaning
  "build a rectangle of walls" — even though that is the most literal reading of dragging a box
  in a game where you also build walls. Worth naming in §4.

### 1.6 Dwarf Fortress — the outlier already in the ADR

Rooms are defined *from a piece of furniture*: place a bed, query it, make a bedroom of it, then
set the size. The room is a property of an object rather than of an area. — FROM MEMORY, and
also asserted by ADR 0022 with citations I could not open. I found no new evidence either way.
Included only because it is the one model in which the "purpose" gesture is attached to a thing
rather than to an area, which is a genuinely different third option — and one Lockstate cannot use
today, because object placement does not exist (§2).

---

## 2. Does "walls make a room automatically, then the player labels it" beat "drag and validate"?

**Short answer: no, not for this game, and the reasons are structural rather than aesthetic.**
Five of them, in descending order of how hard they are to argue with.

### 2.1 The derived model needs contents to decide purpose, and Lockstate has no contents — VERIFIED

Both games that derive rooms (ONI, RimWorld) derive the *purpose* from what is inside the space.
That is what makes the model cost zero UI: the player never has to answer a question, so there is
no control to put anywhere.

Lockstate cannot do this. Object placement does not exist. `RoomZoningService.zone` registers every
new room with `capacity: 0` and `objectCapabilities: []`
(`/workspace/lockstate/src/simulation/rooms/zoning.ts`, the instance literal at the end of
`zone()`), and `room-projection.ts` documents that `minQuantity` "is likewise uncheckable — object
*placement* does not exist, only capability tags."

So a derived Lockstate room would be a detected rectangle of floor with nothing in it, and the game
would have no basis whatsoever for guessing whether it is a cell or a canteen. The player would
have to be asked — which means a selection surface plus an 18-item type picker, i.e. exactly ADR
0022's alternative C, which measured 178.4px and overflowed at all five viewports.
**The derived model is not cheaper on screen here. It is more expensive.**

### 2.2 "Enclosure detection is built" is optimistic — what is built is *region* detection — VERIFIED

I read `/workspace/lockstate/src/simulation/rooms/topology.ts` (229 lines). `TopologyManager`
flood-fills each chunk across non-blocking edges, assigns local region ids, and stitches them into
global topology ids across chunk boundaries. It is deterministic and is guarded by
`tests/determinism/iteration-order.test.ts` and `tests/unit/topology.test.ts`.

What it does **not** do:

- It does not answer "is this region enclosed?" The class's own comment says the global map
  "would be used later to query if a global room is enclosed, etc." — that query is not there.
- It does not distinguish a sealed room from the great outdoors. A flood fill over an open map
  produces one enormous region.
- It produces no bounds, no rectangle, no anchor and no name.

And it is genuinely unwired: `TopologyManager` is constructed at
`/workspace/lockstate/src/simulation/runtime/new-session.ts:196` and exposed on the runtime at
`:392`, but it is **not** in the `kernel.registerSystem` block at `:371-381`, and `update()` has no
caller anywhere in `src/` — grepping `topology.` finds only the class's own internals plus tests.

**Consequence for the decision:** the phrase "we already have enclosure detection, so let walls make
the rooms" overstates the asset by a wide margin. Turning region detection into room derivation is
a substantial piece of new simulation work (enclosure predicate, region→room-instance identity,
merge/split handling, a stable id across geometry changes). Turning it into an *enclosure check on
an already-zoned rectangle* is much smaller: you have the rectangle, you ask whether all its tiles
share one region and whether that region is bounded.

### 2.3 The content model already commits to the Prison Architect architecture — VERIFIED

This is the finding I would put in front of the owner first, because it means the choice was
partly made already, in content, by someone earlier.

`/workspace/lockstate/src/simulation/rooms/definition.ts` declares
`RoomRequirement.type: 'minimum-size' | 'enclosed' | 'object' | 'outdoors'`.

`/workspace/lockstate/src/content/room-catalog.ts` uses it. Every one of the 18 rooms carries
requirements, e.g.:

```
{ id: 'room.cell',    requirements: [ {enclosed}, {minimum-size 2x3, 6 tiles},  {object.bed x1}, {object.toilet x1} ] }
{ id: 'room.canteen', requirements: [ {enclosed}, {minimum-size 6x6, 36 tiles}, {object.dining-table x2}, {object.bench x4} ] }
{ id: 'room.yard',    requirements: [ {outdoors}, {minimum-size 8x8, 64 tiles} ] }
```

Read that carefully. **`enclosed` is modelled as a *requirement a room can fail*, not as the thing
that creates the room.** And `room.yard` opts out of it in favour of `outdoors` — which is exactly
Prison Architect's yard, a room that legitimately has no walls of its own.

If walls made rooms automatically, `{type: 'enclosed'}` becomes tautological (every derived room is
enclosed by construction) and `{type: 'outdoors'}` becomes unrepresentable (an outdoor space is not
an enclosed region). You would be deleting a concept the catalogue already ships in 18 places.

`room-projection.ts` completes the picture: `RoomRequirementStatus` reports `enclosed`, `outdoors`
and `minimum-size` as `'not-evaluated'`, and explains why — "a `RoomInstance` carries an anchor tile
and nothing else: no bounds, no tile set, no wall topology, so there is nothing truthful to project."
Registering topology is precisely what turns two of those three into real answers.

### 2.4 Derived rooms break the instance-id scheme — VERIFIED

`zone()` computes `roomInstanceIdFor(definition.id, anchor)` — the id is derived from the catalogue
id plus the anchor tile, which is the rectangle's top-left corner. `zoning.ts`'s header (per ADR
0022) states that if a future feature moves or resizes a room, ADR 0012 (derived identifier
reproducibility) must be settled first.

A derived room has no stable anchor. Knock out a wall and the region's extent changes; its
top-left tile may move; the room's identity moves with it. Everything hanging off that id —
occupancy, assignment, the `RoomInstanceRegistry`, whatever ADR 0023 decides about occupancy
authority — churns every time a wall changes. A player-drawn rectangle has a fixed anchor by
construction.

### 2.5 The failure behaviour of derived rooms is worse, not better — reasoned, see §3

Under derivation, deleting one wall **destroys a room instance** (two spaces merge into one, or a
sealed space opens onto the map). Under designate-and-validate, deleting one wall leaves the zone
exactly where it was and flips a requirement to unsatisfied. The first silently takes occupancy and
assignments with it; the second shows a warning. For a prison management game where prisoners are
assigned to cells, the second failure mode is far kinder. RimWorld's own community reports the
first as a real annoyance — "when a hole is put in a wall separating two rooms, both rooms can
become 'outside'." — SEARCH-SUMMARY.

### 2.6 The honest counter-position, stated fairly

Derivation is genuinely better on three axes and I do not want to bury them:

- **Arbitrary shapes are free.** An L-shaped cellblock is one room, automatically.
- **Overlap is structurally impossible.** A tile belongs to exactly one region; the entire
  `overlaps-existing-room` refusal disappears as a category.
- **The world can never disagree with the designation.** There is no such thing as a room drawn in
  an empty field, because there is no drawing.

Those are real. They are outweighed here by §2.1 alone — Lockstate has nothing inside a room, so
the derived model cannot answer the one question the player must answer.

### 2.7 What I actually recommend on this axis

**Not either/or.** Take Prison Architect's shape: the drag designates (cheap, one catalogue row,
zero always-visible pixels), and the topology manager — once registered — *evaluates* the
`enclosed` / `outdoors` requirement against the zoned tiles. The unwired asset gets used, in the
smaller of its two possible roles, and the catalogue's existing requirement vocabulary starts
telling the truth.

---

## 3. What goes wrong in each approach

Lockstate's current behaviour below is VERIFIED — I read `zone()` in
`/workspace/lockstate/src/simulation/rooms/zoning.ts`. Comparison-game behaviour is SEARCH-SUMMARY
unless marked otherwise.

### 3.1 Overlapping rooms

| | Behaviour |
| --- | --- |
| **Lockstate today** | `zone()` walks the whole rectangle in canonical order and refuses `overlaps-existing-room` on the **first** tile whose zoning value is non-zero, **before writing anything**. All-or-nothing; no partial zone. — VERIFIED |
| **Prison Architect** | Overwriting is *allowed* — select a different room type and drag over an existing designation to replace it. — SEARCH-SUMMARY |
| **Two Point Hospital** | Rooms cannot overlap; you edit a blueprint instead. — SEARCH-SUMMARY |
| **ONI / RimWorld** | Cannot arise; rooms partition space. |
| **Derived approach for Lockstate** | Cannot arise. |

**The gap:** Lockstate is *stricter than the genre norm* and has no escape hatch. A Prison Architect
player's instinct — "just drag the new type over the old one" — produces a refusal. Combined with
§3.6 this is the sharpest usability risk in the whole feature.

### 3.2 Rooms that are not rectangles

| | Behaviour |
| --- | --- |
| **Lockstate today** | Impossible. `zone()` takes `width`/`height` and refuses `invalid-area` outside 1..64 per side. One command is one axis-aligned rectangle. — VERIFIED |
| **Prison Architect** | Contiguous like-typed tiles form one room; multiple drags accumulate. Supported by the reported behaviour that two same-type areas need "a 1 tile gap separating the rooms otherwise it will consider it to be one room." — SEARCH-SUMMARY |
| **Two Point Hospital** | Explicit Add/Remove Blueprint tile controls; "a room can be any shape or size". — SEARCH-SUMMARY |
| **ONI / RimWorld** | Any shape, for free. |

**The gap, and it is not small:** two adjacent same-type rectangles in Lockstate are **two separate
`RoomInstance`s**, with two anchors, two ids and two capacities — not one L-shaped room. An
L-shaped cellblock is two cellblocks. Whether that matters depends on what capacity and occupancy
end up meaning (ADR 0023), but it is a product consequence of the rectangle-only gesture and I did
not see it stated anywhere in ADR 0022.

### 3.3 A room whose wall is later deleted

| | Behaviour |
| --- | --- |
| **Lockstate today** | **Nothing happens.** The zoning plane is a per-tile numeric id and the instance sits in a registry; neither reacts to geometry. Construction bumps `geometryRevision` and `system.ts` mentions a `TopologyManager` recompute, but nothing recomputes zoning, and `enclosed` is `'not-evaluated'` anyway. — VERIFIED (by absence: no code path links wall deletion to zoning or to a room instance) |
| **Prison Architect** | Designation survives; the room shows a warning and stops functioning. — SEARCH-SUMMARY |
| **ONI** | Enclosure breaks, the room ceases to be recognised or falls back to Miscellaneous. — SEARCH-SUMMARY |
| **RimWorld** | Rooms merge; the merged space may be classified as "outside". — SEARCH-SUMMARY |

**Designate-and-validate lands on Prison Architect's behaviour almost for free** once topology is
registered: the zone stays, the requirement flips, the HUD reports it. **Derivation lands on ONI's**:
the room instance is destroyed, along with its id, capacity and any assigned prisoners. For this
game the first is clearly preferable.

### 3.4 A room dragged in open ground with no walls at all

| | Behaviour |
| --- | --- |
| **Lockstate today** | **It succeeds.** `zone()` checks room type, dimensions ≤ 64, chunk existence, land ownership (`canBuildAt` / `unowned-land`) and zoning-plane overlap. It never asks about walls. You get a fully registered `RoomInstance` for a canteen in an empty field, and because `enclosed` is `'not-evaluated'`, nothing will ever complain. — VERIFIED |
| **Prison Architect** | Allowed, and flagged. The room exists but does not work until enclosed. Some rooms legitimately need no walls of their own — a Yard is satisfied by the prison's outer wall and a locked door. — SEARCH-SUMMARY |
| **ONI / RimWorld** | Inexpressible. |

**This is the single most player-visible defect of shipping the drag without registering topology.**
The game will accept an obviously wrong thing and give no feedback ever. Note that the catalogue
has *already anticipated* the nuance: `room.yard` carries `{outdoors}` rather than `{enclosed}`,
which is precisely Prison Architect's yard rule. The data is ready for a checker that does not exist.

### 3.5 A room too small to be useful

| | Behaviour |
| --- | --- |
| **Lockstate today** | A **1×1 canteen is zonable** and registers as a real room instance. `zone()`'s only size check is 1..64 per side. `minimum-size` is authored in the catalogue (cell 2×3/6, canteen 6×6/36, yard 8×8/64) and evaluated nowhere. — VERIFIED |
| **Two Point Hospital** | Hard block — the minimum is displayed during placement and the room cannot be confirmed below it (nor without its required items placed and accessible). — SEARCH-SUMMARY |
| **Prison Architect** | Soft — a warning symbol on the room, with mouse-over text naming what is missing. — SEARCH-SUMMARY |
| **ONI** | Structural — below the type's minimum area it simply is not that room type. — SEARCH-SUMMARY |

**An open question ADR 0022 does not address.** Hard refusal (THH) or soft warning (PA)? They cost
different things here:

- **Hard refusal** needs a seventh member of `ZoneRoomRefusalReason` (currently
  `unknown-room-type`, `invalid-area`, `out-of-bounds`, `unowned-land`, `overlaps-existing-room`,
  `duplicate-instance-id` — VERIFIED) and a seventh `hud.alert.refusal.zone.*` key. Cheap, and it
  reuses the refusal route that already landed.
- **Soft warning** needs somewhere on screen to show a per-room status — which is the thing the
  12.2px budget does not have.

Ironically, the constrained screen budget argues for the **stricter** THH behaviour, because a
refusal has a home and a warning does not.

### 3.6 The failure mode nobody has listed: a mis-drag is permanent — VERIFIED, and I think this is the most important thing in this report

Three facts, each read from source:

1. **There is no un-zone.** The protocol declares exactly six commands —
   `PlaceBuildOrder`, `CancelBuildOrder`, `ZoneRoom`, `PurchaseMaterials`, `Undo`, `Redo`
   (`/workspace/lockstate/src/simulation/protocol/commands.ts`). None removes a zone.
2. **Undo does not reach zoning.** `Undo` dispatches to `constructionSystem.undo()`
   (`/workspace/lockstate/src/simulation/construction/handler.ts:68-69`). Zoning writes no
   construction order, so there is nothing for undo to reverse. ADR 0022 itself leaves "whether a
   zone should be undoable at all" open.
3. **Re-zoning over it is refused.** `overlaps-existing-room` fires on any tile whose zoning value
   is non-zero.

Therefore: **one accidental drag creates a room that cannot be undone, cannot be removed, and
cannot be overwritten, for the rest of the session.** Up to 64×64 = 4,096 tiles of the map,
permanently.

Now add the input constraint. Undo is reported to the composition root only from the keyboard —
`world-scene.ts` handles `edit.undo` / `edit.redo` in its keyboard action switch, and the code
comment there says so explicitly. There is no on-screen undo control. **So on a touch device there
is no undo at all**, and the above dead end is reachable by one stray finger drag with no recovery
whatsoever.

Prison Architect's right-drag-to-remove and Two Point Hospital's confirm-before-commit both exist
to prevent exactly this. Lockstate would ship the drag with neither.

---

## 4. Can room designation reuse the existing drag gesture?

### 4.1 The case FOR reuse

- **The expensive, fiddly parts are already built and are shape-agnostic.** Modal arming, the
  pointerdown/move/release cycle, Escape-to-cancel, second-finger abandon, two-finger pan/pinch
  co-existence, `worldPointOf`/`screenToWorld` proven against a real camera, and
  `worldToTile` / `TileRange` / `TileBounds` / `tileRangeArea` — a rectangle in tiles is already a
  type this codebase has. Reusing that is most of the work. — VERIFIED (ports and types read;
  ADR 0022 enumerates the line references)
- **Modal arming makes the overload unambiguous by construction.** `docs/INPUT.md` records the
  reasoning: "Laying a wall run *is* a drag, so no travel threshold can tell it apart from a pan
  without guessing… The HUD arms the tool explicitly; while it is off every gesture keeps its
  previous meaning." There is never an instant when one drag could mean two things — what it means
  is whatever is armed, and the panel shows that.
- **It matches the genre.** Prison Architect's Rooms menu is a sibling of its build menus and uses
  the same drag. Two Point Hospital's Rooms button is a sibling of its other build controls.
  Players arriving from either will try the drag first. — SEARCH-SUMMARY
- **It is the only option the pixel budget permits.** A distinct gesture (rubber-band select, then
  a confirm) needs a confirm control, and there is nowhere to put one at 900×600 or 1280×720.

### 4.2 The case AGAINST reuse

- **The two drags produce different geometry from the same motion, and the code proves it.**
  `edgeRunFromDrag` commits the drag to *one axis* and walks a one-dimensional run;
  `DRAG_AXIS_THRESHOLD_PX` exists solely to decide which axis you meant. A room drag is a
  two-dimensional filled box. A player who has learned "my drag snaps to a straight line" will
  drag diagonally and get a rectangle. Same motion, different mental model. — VERIFIED
- **Walls live on tile *edges*; rooms live on tile *interiors*.** `EdgeTarget` is
  `{tileX, tileY, edge}` and only north and west edges are stored, which is why the picking layer
  needs `pickEdgeAtWorld` / `pickEdgeOnAxis` at all. Corner-to-corner therefore means "the edges
  along this line" for one armed tool and "the tiles inside this box" for the other. The preview
  must look categorically different or players will mis-predict. — VERIFIED
- **The port cannot currently express the difference.** `BuildToolPort` is
  `isArmed(): boolean` + `place(segments: readonly EdgeTarget[])` — the arm signal carries no shape,
  so the scene cannot tell an edge tool from an area tool. Either the port gains a mode or it gains
  a sibling (the precedent is `EditHistoryPort`, whose own comment argues for the second-port shape
  "because the two answer different questions"). So "same gesture" is not free in code either.
  — VERIFIED
- **The consequences are wildly different and the reversibility is asymmetric.** A wall drag costs
  money and queues construction over time, and is undoable via `ConstructionSystem.undo()`. A zone
  drag is instant, free, and — per §3.6 — permanent. Two visually similar gestures where one is
  reversible and one is not is a bad pairing, and it is worst on touch, where undo does not exist
  at all. **This is the strongest anti-reuse argument and it is not really about the gesture; it is
  about the missing un-zone.**
- **A third plausible meaning exists.** The Sims 4's Room tool makes "drag a box" mean *build the
  walls of a rectangle*. In a game that also builds walls, that is the most literal reading of
  dragging a box, and Lockstate would be assigning it a different meaning. — SEARCH-SUMMARY

### 4.3 Where I land on this question

**Reuse the gesture; do not reuse the affordance silently; and do not ship it without a way back.**

Concretely: same pointer machinery, same modal arming, a *visually distinct* armed state and a
*visually distinct* preview (filled translucent box vs. thin edge run), and an un-zone before or
alongside the zone. The overload is safe when the armed tool is obvious and the mistake is cheap.
Today the mistake is not cheap; it is unrecoverable.

---

## 5. Recommendation

**Adopt ADR 0022 essentially as proposed — room types as rows in the existing Build catalogue, a
rectangle drag on the world canvas — with two additions the ADR does not currently carry:**

1. **Register `TopologyManager` with the kernel and use it to evaluate the `enclosed` / `outdoors`
   requirement on the zoned rectangle.** Not to derive rooms — just to answer the question the
   catalogue has been asking in 18 places since it was written. Without this, the first thing the
   feature ships is a canteen in an empty field that the game calls fine (§3.4). This is also the
   *smaller* of the two possible uses of the unwired asset (§2.2), so it is cheap.
2. **Ship a way to remove a zone in the same change as the way to create one.** Prison Architect's
   right-drag is the genre answer and the ADR notes it has no analogue here. With no un-zone, no
   undo coverage, and `overlaps-existing-room` blocking re-zoning, one stray drag is permanent —
   and on touch there is no undo at all (§3.6). I would treat this as a blocker rather than a
   follow-up.

Optionally, and cheaply: add a `too-small` refusal reason so `minimum-size` stops being decorative
(§3.5). The refusal route already exists; a warning surface does not.

### The strongest argument AGAINST my own recommendation

**It builds the room surface twice, and the measurement it rests on is provisional.**

ADR 0022's entire case for the catalogue row over a Rooms tab is a pixel budget — 12.2px at
900×600 — and the ADR states plainly that this was measured on an unmerged local tree carrying
PR #282's buy surface, never re-run on `main`. It also says, in its own words, that if #282 does
not land in its current shape "the budget is larger, and the argument against alternative C gets
weaker."

Meanwhile the rejected alternative B — a Rooms tab — was measured to cost the Build panel
**nothing**, and would give the room surface the whole aside box: 291px of body at 900×600 against
the 12.2px the chosen option shares. That is roughly 24× the budget. And the ADR names its own
revisit trigger: B becomes right "when rooms need listing and lifecycle — occupancy, capacity,
per-room state." That is not far off. ADR 0023 is already about room occupancy authority, and
issue #261 step 4 is about admitting a prisoner into a room. A tab may be needed within a couple of
milestones.

So a reasonable owner could say: the last tab slot is going to be spent on rooms eventually; the
listing surface is coming anyway; spending it now costs one migration and buys a place to put the
confirm step, the removal control, the minimum-size warning and the enclosure status — all four of
which are things I have just argued the feature needs and the 12.2px budget cannot hold. Choosing
A means those four either go somewhere awkward or wait.

My recommendation survives that, narrowly, on two grounds: the tab is genuinely the *last* one at
375px width (a fifth tab leaves 1.8px of margin per side; a sixth is foreclosed), and a tab is a
place to *manage* things, of which there are currently zero. But it is a close call and I would not
want it presented as an obvious one.

**Second-strongest counter, distinct from the first:** the safest designs in this sample all put a
brake between the drag and the commit — Two Point Hospital will not accept a room until it is legal,
Prison Architect lets you right-drag it away. A brake needs a control. A control needs pixels.
If the owner weighs "a touch player cannot possibly strand themselves" above "the Build panel does
not change", the tab wins on that ground alone.

---

## OPTIONS FOR THE OWNER

Whichever you pick: today a mis-drawn room cannot be undone, deleted, or drawn over, and on a
phone there is no undo key. Worth fixing in the same change as whatever you choose.

**Option 1 — Ship it as written.**
Room types become extra rows in the Build list you already have, and you drag a box on the map to
place one.
*Costs:* a new box-drag mode and a box preview in the renderer. *Forecloses:* nothing permanently,
but the game will happily accept a canteen in an open field with no walls and never mention it, and
you will likely build a proper Rooms screen later anyway — so the surface gets built twice.

**Option 2 — Ship the same drag, but switch on the wall-detection first. (Recommended.)**
Same box-drag, except the game first learns to check whether the area you drew is actually walled
in, so it can tell you when it isn't.
*Costs:* one extra piece of simulation work before the feature ships — the wall-region code exists
but has never been switched on, and it currently finds connected spaces rather than answering
"is this sealed". *Forecloses:* shipping this month; buys you a feature that tells the truth on
day one.

**Option 3 — Spend the last tab on a Rooms screen now.**
Rooms get their own top-level section with room for a preview, a remove button, and "this room is
too small" warnings.
*Costs:* the fifth and final tab slot at phone width, plus a slower browser test suite.
*Forecloses:* ever adding a sixth top-level section without redesigning the tab bar — but it is the
only option with enough space to warn the player about anything.

**Option 4 — Do nothing yet; let walls create rooms by themselves later.**
Skip the drag entirely and wait until enclosing a space with walls just produces a room.
*Costs:* nothing now. *Forecloses:* the feature, for now — because nothing can be placed inside a
room yet, the game has no way to work out whether a detected space is a cell or a kitchen, so it
would still have to ask you, and asking needs the screen space Option 1 was designed to avoid.

---

## Sources

Reachable only via search summaries — none of these pages could be opened directly from this
container.

Prison Architect:
- [Room — Prison Architect Wiki](https://prisonarchitect.paradoxwikis.com/Room)
- [Controls — Prison Architect Wiki](https://prisonarchitect.paradoxwikis.com/Controls)
- [Yard — Prison Architect Wiki](https://prisonarchitect.paradoxwikis.com/Yard)
- [Planning | Prison Architect Wiki (Fandom)](https://prison-architect.fandom.com/wiki/Planning)
- [Help needed removing room designation — Steam Community](https://steamcommunity.com/app/233450/discussions/0/627456487034672140/)
- [Game always says that jail cell isn't enclosed when it is — Paradox Forums](https://forum.paradoxplaza.com/forum/threads/game-always-says-that-jail-cell-isnt-enclosed-when-it-is.1481250/)

RimWorld:
- [Rooms — RimWorld Wiki](https://rimworldwiki.com/wiki/Rooms)
- [Wall — RimWorld Wiki](https://rimworldwiki.com/wiki/Wall)
- [Roof — RimWorld Wiki](https://rimworldwiki.com/wiki/Roof)
- [Zone/Area — RimWorld Wiki](https://rimworldwiki.com/wiki/Zone/Area)
- [Steam Workshop::Customize Room Role](https://steamcommunity.com/sharedfiles/filedetails/?id=3596244156) — a **mod**, cited as evidence that vanilla has no manual room-role assignment

Oxygen Not Included:
- [Room Overlay — Oxygen Not Included Wiki](https://oxygennotincluded.wiki.gg/wiki/Room_Overlay)
- [Rooms — Oxygen Not Included Wikia](https://oxygennotincluded-archive.fandom.com/wiki/Rooms)
- [Miscellaneous Room has size requirement now? — Klei Forums](https://kleiforums.com/forums/topic/88429-miscellaneous-room-has-size-requirement-now/)

Two Point Hospital:
- [Rooms — Two Point Hospital Wiki (Fandom)](https://two-point-hospital.fandom.com/wiki/Rooms)
- [How to Build a Room — SuperCheats](https://www.supercheats.com/two-point-hospital-walkthrough-guide/how-to-build-a-room)
- [Rooms — Two Point Hospital Guide, GameFAQs](https://gamefaqs.gamespot.com/pc/230622-two-point-hospital/faqs/76595/rooms)

The Sims:
- [Build mode — The Sims Wiki (Fandom)](https://sims.fandom.com/wiki/Build_mode)
- [The Sims 4: Build Mode Tool Tips for Beginners — Sims Community](https://simscommunity.info/2016/06/16/the-sims-4-build-mode-tool-tips/)

Repository files read directly (VERIFIED):
`/workspace/lockstate/docs/adr/0022-room-zoning-surface.md`,
`/workspace/lockstate/docs/INPUT.md`,
`/workspace/lockstate/src/simulation/rooms/topology.ts`,
`/workspace/lockstate/src/simulation/rooms/zoning.ts`,
`/workspace/lockstate/src/simulation/rooms/definition.ts`,
`/workspace/lockstate/src/content/room-catalog.ts`,
`/workspace/lockstate/src/simulation/presentation/room-projection.ts`,
`/workspace/lockstate/src/simulation/protocol/commands.ts`,
`/workspace/lockstate/src/simulation/construction/handler.ts`,
`/workspace/lockstate/src/simulation/runtime/new-session.ts`,
`/workspace/lockstate/src/rendering/build/edge-picking.ts`,
`/workspace/lockstate/src/rendering/scene/world-scene.ts`,
`/workspace/lockstate/src/ui/hud/hud.ts`,
`/workspace/lockstate/src/ui/hud/hud-state.ts`,
`/workspace/lockstate/src/ui/primitives/icon.ts`.
