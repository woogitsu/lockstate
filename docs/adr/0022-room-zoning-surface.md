# ADR 0022: Where a player zones a room, and with what gesture

## Status

**Accepted, 2026-08-25 — as amended. Decision §1 and §3's *location* are
superseded in part by the amendment of 2026-08-25 below.**

**What was accepted is the amendment, not the *Decision* section.** The owner
delegated the choice of surface, exercised the reversal this document names, and
chose **alternative B, the Rooms tab** — which is what shipped in #312. The
approval covers that choice; §*Amendment — 2026-08-25* is the operative part of
this file, and §*Status of this amendment* at the foot of it records the state
the amendment was written in, before this approval, rather than the state it is
in now.

Everything from *Decision* down to *Consequences* is left exactly as it was
written, because an ADR is a historical record of a decision and not a
description of the current build. Read the amendment first: it is the only part
of this file that describes what shipped.

The thing a reviewer was asked to sign off on, and did not: **a room type is a
row in the Build catalogue, and a room is zoned by dragging a rectangle across
tiles on the world canvas** — rather than by a new "Rooms" tab beside Build, or
by a new always-visible block inside the Build panel. The gesture half of that
was kept; the catalogue-row half was not.

It went the other way, to the alternative named here for that purpose: the Rooms
tab (alternative B below), which is measured as costing the Build panel nothing
and is named as this ADR's intended successor rather than as a discarded idea.
The always-visible block (alternative C) did not survive the reversal either: it
is refused by measurement, not by preference.

### What the evidence rests on, stated because it bounds every figure below

Two kinds of claim appear here and they are not equally verifiable from this
branch.

**Structural claims** — what a type is, what a port carries, what a test
asserts — were re-verified against `origin/main` at v0.0.30 while writing this,
and every `file:line` below resolves there unless the text says otherwise.

**Browser measurements** were taken on a local merge of PR #282 (the #89 buy
surface) and PR #283 (the refusal-reporting route) on the assembled page, and have **not** been re-run
on `main`. They are quoted as measured on that tree and attributed as such
wherever a figure depends on either branch. Two consequences of that are worth
stating rather than leaving to be discovered:

- The pixel budget below is the budget *with* #282's buy surface in the Build
  panel. If #282 does not land in its current shape the budget is larger, and
  the argument against alternative C gets weaker by however much that is.
- `docs/adr/README.md`'s index row and this file are the whole of this change.
  It is docs-only and depends on neither PR.

## Context

### The consumer is finished, and nothing in the application can reach it

This is the fact that makes the question worth an ADR rather than a panel
sketch.

`RoomZoningService.zone` (`src/simulation/rooms/zoning.ts:203`) is complete. It
validates the room type against `defaultRoomContentRegistry`, bounds both
dimensions at `MAX_ZONE_DIMENSION_TILES` (`:101`), checks every tile for bounds,
ownership and overlap *before* writing any tile (`:225-241`), paints the world's
zoning plane with the room catalog's own `numericId` (`:243-251`), registers a
`RoomInstance` and returns `{ kind: 'zoned', instance }` (`:252-263`). Refusals
are typed — six reasons at `:140-146` — and kept in a bounded window because a
command handler returns `void`.

`src/simulation/runtime/session-commands.ts:46-72` already routes the command to
it, and records why the schema's field is named `roomId` while the service's
parameter is `roomCatalogId`: the field was named before instances existed, and
renaming a field a queued command in an existing save may already carry is a
save-compatibility change rather than a rename (`:47-51`).

What does not exist is a producer. `tests/foundation/unconsumed-command-contract.test.ts`
holds that as a gated fact — `ZoneRoom` is one of three commands in
`AWAITING_PRODUCER` (`:106-107`), and its entry says so in the terms this ADR
answers: *"Room zoning still has no interface at all: every member of
`HudIntent` is a tab, a panel, the clock, a build order, the build tool or the
undo pair, and none is about a room."* That was true of `main` when this
document was written, at v0.0.30: `HudIntent` declared seven members and none of
them was a room.

**Both halves of that sentence have since been overtaken, and the anchor it
carried is now actively misleading.** It cited `src/ui/hud/hud.ts:153-195`.
`HudIntent` is now at `src/ui/hud/hud.ts:270-540` and declares **eighteen**
members, three of them room-related — `zone-room`, `unzone-room` and
`arm-room-tool`, which are this ADR's own decision having shipped. And
`hud.ts:154` now declares **`HudRoomGesture`**, the room gesture this document
introduced. So a reader following the old anchor to check *"none of them is a
room"* lands on a type that is about nothing else. **That replacement anchor
said `:153` until 2026-08-28**, and was off by one when it was written -- the
`export type HudRoomGesture` line is at `:154`, and `git show` at the previous
STATUS-QUEUE anchor puts it at `:154` there too, so this is not drift. A
correction that carries a wrong number is the failure it was written to fix,
one revision later, which is why the old number is recorded here rather than
quietly replaced. The count and the anchor are
corrected here rather than left as
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) recorded them, because that entry said
this belonged in a change of its own and this is that change; the historical
claim is kept, dated, because it is what the decision below was made against.

So the whole zoning vocabulary — the plane, the instance registry, the six
refusal reasons, `MAX_ZONE_DIMENSION_TILES` — is reachable only from a test.
This ADR decides the one missing piece.

### What a producer is, structurally

The HUD may not import the simulation at all. That is `AGENTS.md` boundary 1 in
its strongest form for `src/ui/hud/**` and `src/ui/primitives/**`, and
`tests/unit/ui-hud-messages.test.ts:196-200` asserts it by scanning for the
import. So the HUD cannot build a command; it emits a `HudIntent` and
`src/main.ts` turns it into one, in the `onIntent` switch at `:458-459`. The
build gesture already takes that route: `case 'place-build-order'` at `:511`.

Text never crosses either ([ADR 0011](./0011-localization-architecture.md)):
every rendered string is a message key, and a stable content id may never reach
the player. The room catalog is unusually well placed for that — all 18 room
definitions carry a real `nameKey` (`src/content/room-catalog.ts:66-159`) and
all 18 `room.*.name` keys ship in the default catalog
(`src/content/default-locale-en.ts:26-43`).

### The height budget, which is the number the decision turns on

The Build panel's body headroom is **not** the budget, and treating it as one
would have made alternative C look merely tight instead of impossible.
`.hud__side` is `flex: 0 1 auto` with `min-height: 0` (`src/ui/hud/hud.css:385-393`)
and `.hud__aside` is `flex: 1 1 0` with a `min-height: 25%` floor (`:367-372`),
so the Build panel grows into the aside's slack before it overflows anything.

Always-visible pixels actually available, measured on the #282+#283 merge by
injecting blocks of known height into the assembled page and reading the
resulting overflow — four independent probes (a 44px button, a 45px collapsed
header, a 63.2px choice group, a 71.2px coordinates row) agreeing to within
0.2px — and **re-measured after #174's second half corrected the catalogue's
floor**, by growing a spacer above the panel's last section until that
section's bottom edge crosses the panel's fold:

| Viewport | Then | Now |
| --- | --- | --- |
| 1440×900 | 173.3 | 165 |
| 375×812 | 79.1 | 74 |
| 1024×768 | 74.3 | 66 |
| 1280×720 | 38.2 | 30.2 |
| 900×600 | 12.2 | 7.8 |

`--tap-target` is 44px (`src/ui/tokens.css:150`). So **a single always-visible
control fits at three of the five viewports and at neither 1280×720 nor
900×600** — and the desktop 1280×720 is the second-tightest of the five,
tighter than the phone. That inversion is why the number had to be measured
rather than reasoned about from viewport size. Every figure moved down and none
moved across that 44px line, so **this section's conclusion is unchanged and
the decision below stands**; it is simply tighter than it was written.

**Why the numbers dropped, since it is not space that was lost.** The `Then`
column counted 8px the catalogue could not really give. Its floor did not
include the gutter under its own list, so "donating" that 8px meant laying the
gutter over the hairline the map block draws rather than freeing anything
(issue #174, second half). Correcting the floor removes the 8px from every
viewport — hence the uniform −8.3, −5.1, −8.3 and −8.0 above — except 900×600,
which loses only 4.4 because half of its 8px had already been spent as that
overlap and was therefore never available twice. The `Now` column for 1280×720
and 900×600 is measured to 0.05px (30.22 and 7.81); the other three rows are to
the whole pixel. The 375×812 pair is the one that does not reconcile cleanly —
79.1 → 74 rather than → 71.1 — and the residual is method, not layout: the two
columns were measured by different probes on different trees, and the same
probe reads 82 → 74 across this change at that viewport.

At 900×600 the 7.8px is body slack and nothing else: `.hud__aside` is pinned at
its floor there and the catalogue now sits exactly on its own, so nothing in
the panel has anything left to donate. The panel's floor is derived rather than
tuned and accounts for every pixel: `hud.css` sets it out as 140 catalogue
(two rows + its 44px header + its gutter) + 94.2 map + 45 collapsed section,
resolving to 275.2px against a 275.2px content box at 900×600.

Relaxing `.hud__aside`'s floor is not the lever, and that is already recorded
rather than newly argued: `hud.css:719-722` measured it — with `min-height: 0`
the aside drops to 53.1px and the Build panel fits perfectly, and the save panel
becomes a 41.1px box over 240px of content.

## Decision

### 1. A room type is a row in the existing Build catalogue

Grouped into its own section of the catalogue list rather than appended to the
buildables. The catalogue is `.hud-build__list`, which is `overflow-y: auto`
with an 88px two-row floor (`hud.css:605-611`, floor from
`--hud-build-catalogue-floor` = `2 * --tap-target`, `tokens.css:175`).

**This costs nothing, at every viewport, and that is measured.** On the
#282+#283 merge, injecting 18 extra catalogue rows (20 total) left body
overflow at 0, headroom at 7.9, no panel scroll and rail overflow 0 at all five
viewports. Two rows are already inside the list's own floor, so at today's
catalogue size the list donates nothing and a longer list is absorbed by the
list rather than by the panel.

That mechanism is not new and is already guarded:
`tests/browser/ui-shell.spec.ts:949` ("keeps the last section on screen however
long the catalogue gets") drives a twelve-entry catalogue at the same five
viewports (`CATALOGUE_VIEWPORTS`, `:941-947`) and asserts the last section
header stays inside the panel's unscrolled box. One caveat, stated because the
test itself states it (`:992-996`): that harness leaves the aside slot empty, so
the Build panel gets the whole rail and there is no rail contention. Rail
contention is only on the assembled page, which is where the 20-row measurement
above was taken and where `tests/browser/app-shell.spec.ts` measures issue #174.

A readout of the dragged area costs nothing either. `.hud-build__target` is
pinned at `min-height: var(--space-5)` — 20px (`hud.css:653-658`,
`tokens.css:115`) — and measured 20.0px unchanged with 22-character and
42-character readouts on the merged tree.

### 2. The gesture is a rectangle drag across tiles on the world canvas

Select the room type, arm the tool, press on a tile, drag to the opposite
corner, release. One command per gesture.

This is what the simulation accepts and nothing else is: `zone` refuses
`invalid-area` for any `width` or `height` below 1 or above 64
(`zoning.ts:209-213`), so the shape a player may express is exactly an
axis-aligned rectangle of at most 64 tiles per side.

### 3. The producer is one new `HudIntent` variant and one branch in `src/main.ts`

The intent carries ids and numbers only:

```
{ kind: 'zone-room'; roomId: string; x: number; y: number; width: number; height: number }
```

Verified against both ends. `zoneRoomSchema`
(`src/simulation/protocol/commands.ts`, declared `export const zoneRoomSchema = z.object({`
at `:67` as of `83d9616`; this cited `:37-45`, which had drifted onto the
doc comment above `placeBuildOrderSchema`) is
`{ type: 'ZoneRoom', roomId: string, x: int, y: int, width: int, height: int,
transactionId?: string }`, `.strict()`; `RoomZoningService.zone` takes
`ZoneRoomRequest`, declared `export interface ZoneRoomRequest {` with
`readonly roomCatalogId: string;` as its first field (`zoning.ts:164-165`), and
is fed from `simCommand.roomId`, written `roomCatalogId: simCommand.roomId,` in
`session-commands.ts` (`:113`). Both line numbers are as of `83d9616`; this
sentence cited `zoning.ts:112-121` and `session-commands.ts:62`, which #444
found had drifted onto two unrelated comments. So `roomId` is
the right name for the intent field — it is the field name the wire format and
every queued command in an existing save already use, and it holds a room
*catalog* id (`room.cell`), never an instance id.

`transactionId` is optional in the schema and this ADR does not decide whether a
zone gesture should carry one. Zoning writes no construction order, so there is
nothing for `ConstructionSystem.registerTransactionOrder` to group; whether a
zone should be undoable at all is left open in §*What this does not settle*.

### 4. What the renderer already does, and what it does not

**An accepted zone is visible with no renderer work at all.** The zoning plane
is already projected, decoded and painted per tile with a per-category tint:
`src/simulation/presentation/world-projection.ts:16,44` carries `zoning` in the
chunk projection → `src/rendering/world/world-view.ts:117` decodes the RLE and
`:180` reads it per tile → `src/rendering/phaser/tile-layer.ts:358-366` fills the
tile with `zoningTint` (`src/rendering/world/appearance.ts:114`) at
`ZONING_TINT_ALPHA` (`:99`). This is true of all three alternatives and is not
an argument for any one of them; it is recorded because it is the largest piece
of work that does *not* have to be done.

**Five of those six anchors were re-aimed on 2026-09-05, and the split between
them is worth more than the new numbers.** The chain read `world-view.ts:116`,
`:179`, `tile-layer.ts:189-197`, `appearance.ts:96` and `:93`. **Every one of
the five was already wrong at `c57f5fa8`**, the previous status-queue anchor,
so no window found them and no delta pass could have:
`tile-layer.ts:189-197` was the graphics-pool `acquire` helper there and had
nothing to do with zoning; the two `world-view.ts` numbers were each one short,
landing on the `leftEdge` line above the `zoning` one; `zoningTint` stood at
`appearance.ts:113` against the `:96` cited, and `ZONING_TINT_ALPHA` at `:98`
against `:93`. #1028's object-painter work then moved the last two by one
apiece, which is the whole of what this window did to a sentence that had been
carrying five false coordinates before it opened. Only
`world-projection.ts:16,44` held. The claim the sentence makes — that an
accepted zone is painted per tile with a per-category tint with no renderer
work — was re-derived and is true; it was the coordinates that had rotted, in
the direction this corpus records over and over.

**A rectangle drag is a second gesture, not an edit to the wall drag**, and
this is the honest cost of the decision. The build picking layer is edge-typed
end to end, and its whole reason for existing is a question a rectangle never
asks:

- `EdgeTarget` is `{tileX, tileY, edge}` (`src/rendering/build/edge-picking.ts:26`).
- `edgeRunFromDrag` (`:162`) commits the drag to one axis, and `edgeRunBetween`
  (`:183`) walks a one-dimensional run.
- `pickEdgeAtWorld` (`:96`), `pickEdgeOnAxis` (`:136`) and
  `DRAG_AXIS_THRESHOLD_PX` (`:125`) exist to answer "which of the two stored
  edges did you mean" — a wall lives on a tile edge and only north and west are
  stored, so all four sides are pickable and resolve onto two.
- `BuildToolPort` (`:210-217`) is edge-typed: `place(segments: readonly EdgeTarget[])`.
  Its arm signal is `isArmed(): boolean` and carries no shape, so the scene
  cannot tell an edge tool from an area tool. That needs either a mode on the
  port or a second port beside it — and `EditHistoryPort` (`:238-243`) is the
  precedent, its own comment arguing for the second-port shape because "the two
  answer different questions".
- `BuildTool` (`src/ui/build-tool.ts:62`), `HudBuildOrder`
  (`src/ui/hud/hud.ts:96-99`, `readonly edges`) and the private dedupe keyed on
  the three edge fields (`build-tool.ts:219`) are edge-typed too.

**No area preview or selection rectangle exists anywhere in the tree.**
`BuildOverlay` (`src/rendering/phaser/build-overlay.ts:30`) is one
`Phaser.GameObjects.Graphics` whose `update(segments)` (`:39`) draws a thin
`fillRect`/`strokeRect` per edge at wall thickness. Its lifecycle — one graphics
object, a fixed preview depth, cleared on cancel — is reusable; its signature is
not.

What *is* reusable unchanged is the part that took the most care to get right:

- The pointer gesture and its modal arbitration —
  `src/rendering/scene/world-scene.ts:260` (pointerdown), `:277` (pointermove),
  `:324` (release), `beginBuild` `:534`, `extendBuild` `:546`, `commitBuild`
  `:554`, `cancelBuild` `:582`, `previewHover` `:591`, `paintBuildPreview`
  `:599`, `isBuildArmed()` `:496`.
- The camera keeping every gesture it had: wheel zoom `:246`, middle-drag
  `:273-275`, two-finger pan/pinch `:288-309`, second-finger abandon `:293`,
  `Escape` cancel `:431`. `docs/INPUT.md` records why arbitration is modal
  rather than threshold-based, and the reason applies unchanged to an area drag:
  a drag that designates an area is still a drag.
- `worldPointOf`/`screenToWorld` (`:530`), proven against a real camera by
  `tests/browser/camera-coordinates.spec.ts`.
- `worldToTile` and the `TileRange`/`TileBounds` shapes with `tileRangeArea`
  (`src/rendering/tile-metrics.ts:61,34,41,101`) — a rectangle in tiles is
  already a type this tree has.

One pleasing agreement, noted because it is a constraint neither side chose for
the other: the renderer's `MAX_RUN_SEGMENTS = 64` (`edge-picking.ts:46`) is the
same number as the simulation's `MAX_ZONE_DIMENSION_TILES = 64`
(`zoning.ts:101`), and the second is the room catalog's own ceiling.

## Alternatives considered

### A — catalogue row plus a rectangle drag on the world. **Chosen.**

Recorded above. Its cost is §4's second gesture; its benefits are §1's zero
pixels and §4's free rendering.

### B — a new "Rooms" tab beside Build. **Rejected, and named as the successor.**

B is not the weaker design for the Rooms surface itself, and pretending
otherwise would misrepresent the decision. Measured on the #282+#283 merge, a
fifth tab injected into the tab bar left the Build panel's layout
byte-identical at all five viewports: B costs the Build panel **nothing**. And a
Rooms panel would inherit the whole aside box — 338.1px with a 291.2px body at
900×600 — instead of sharing the 7.8px of §*The height budget*. That is a 37×
larger budget for the surface that needs it, and the multiplier grew rather
than shrank when that section's figures were corrected.

Most of the pieces exist. The `rooms` icon is already declared
(`src/ui/primitives/icon.ts:16`). A room catalogue projection would be
*simpler* than `buildCatalogue()` (`src/main.ts:332-357`), because rooms carry
real `nameKey`s and need no id→key mapping table: `BUILDABLE_LABEL_KEY`
(`src/main.ts:269-272`) exists only because `BUILDABLE_REGISTRY` carries a
hard-coded English `name` and no key (`docs/HUD_PROJECTIONS.md` gap 32), and
rooms have no such gap.

It is rejected on scope and on one hard measured constraint.

**The constraint.** `HUD_TAB_IDS` has four members
(`src/ui/hud/hud-state.ts:14`). Measured on the merged tree with a fifth tab
injected, `.hud-tabs__inner` spans x = 1.8 … 373.2 at 375×812 — 1.8px of margin
per side. So "Rooms" is the only viable label: a nine-character "Logistics"
puts the bar at x = −9.5, which fails the assertions at
`tests/browser/ui-shell.spec.ts:745-746` (`tabs.x >= 0`, `tabs.right <= 375`) in
the test at `:736`. And a **sixth tab is foreclosed** at that viewport.

**The scope argument.** Spending the last tab slot on the first room feature,
before rooms have a lifecycle to manage, is premature. A tab is a place to
*list and manage* things; today there is one create gesture and nothing to
list. B also widens the #88 tab sweep
(`tests/browser/app-shell.spec.ts:790`, four-tab loop at `:833`), which
`test.slow()` gives a tripled budget of 180s (`tests/browser/playwright.config.ts:65`).
That test's own comment records 14–28s on `main` (`app-shell.spec.ts:792-798`);
on the #282+#283 merge it measured 44.0s, and a fifth tab would take it to
roughly 55s. An estimate, not a measurement.

**The revisit trigger, recorded explicitly.** B becomes the right answer when
rooms need listing and lifecycle — occupancy, capacity, per-room state — rather
than one create gesture. At that point this ADR should be **superseded** rather
than argued with: nothing in A forecloses B, and the intent in §3 is unchanged
by which surface emits it.

### C — a new always-visible room block inside the Build panel. **Rejected outright.**

A minimal room surface — a type chooser, an area row and a submit control —
measures 178.4px on the #282+#283 merge, and overflows at **all five**
viewports: by 166.6px at 900×600 against a 291px body, and by 5.1px even at the
roomiest, 1440×900. Against the table in §*The height budget* there is no
viewport where it fits, and the two tightest are a desktop size and the phone.

Two nearby variants *do* hold at 0px of overflow and 5 of 5 viewports, and both
are recorded because they show where the line is — and because neither is
option C any more:

- a **catalogue row**, which is decision §1;
- a control folded **inside the existing coordinates section**, which is already
  collapsed by default and therefore not always-visible.

The #89 two-button trick does not rescue C either, and this is the one place
where a `main` reader will look for something that is not there. #282 puts the
arm button and a "Buy" disclosure side by side in a flex row
(`.hud-build__actions`, which exists on #282's branch and nowhere else), and its own
comment records why that is affordable: the two controls and their gap come to
about 170px of the 238px the block has. Measured on the merged tree, a **third**
button in that row keeps its height at 44.0px and overflows the panel
**horizontally by 37.9px**, clipped with no scrollbar — `.ui-panel` sets
`overflow: hidden` (`src/ui/primitives/primitives.css:294,301`) and
`.ui-panel.hud-build` overrides it on the y axis only (`hud.css:449,458-459`).
It fits only at 375×812, where the panel is full width (`hud.css:804`). The
238px is derivable on `main` and not only on the branch: 264px panel
(`tokens.css:166`) less two hairlines (`:121`) less the body's 8px padding
either side (`primitives.css:332`) less the section body's 4px
(`primitives.css:360`).

## The genre evidence, and where Lockstate differs

Recorded because it makes the gesture a matter of convention rather than of
taste, and because a player arriving from any of these games will try the drag
first. `AGENTS.md` is explicit that research may inform mechanics while
Lockstate must have its own implementation and identity; nothing here is a
layout to copy.

The closest analogues converge on "pick a room type from a list, then drag out
an area", and **none of them uses coordinate entry**:

- **Prison Architect** — a separate Rooms menu; select the room, then left click
  and drag over the area to designate it, and right click and drag to remove a
  designation.
- **Two Point Hospital** — a Rooms button, pick from the list, then drag out a
  floorplan of at least the room's minimum size.
- **RimWorld** — zone designators live in the Architect menu's Zone tab; the
  designator is selected and then the area is drawn by clicking and dragging,
  painting the whole rectangle.
- **Dwarf Fortress** is the outlier, and the useful one: a room exists only when
  defined *from a piece of furniture* — you place a bed, query it, make a
  bedroom of it and then set the size. The room is a property of an object
  rather than of an area.

Sources:

- https://prisonarchitect.paradoxwikis.com/Room
- https://prisonarchitect.paradoxwikis.com/Controls
- https://twopointhospital-archive.fandom.com/wiki/How_to_play_guide_for_Two_Point_Hospital
- https://rimworldwiki.com/wiki/Stockpile_zone
- https://rimworldwiki.com/wiki/Zone/Area
- https://dwarffortresswiki.org/index.php/DF2014:Room
- https://dwarffortresswiki.org/index.php/DF2014:Bedroom

**Where Lockstate differs, and why the difference helps.** Two of the three
let a room end up as something other than one rectangle: Two Point Hospital
through its Add Blueprint / Remove Blueprint controls, and RimWorld by dragging
over an existing zone to expand it. `RoomZoningService.zone` does not: it takes
a `width` and a `height` and refuses `invalid-area` for anything else
(`zoning.ts:209-213`), and it checks every tile of the rectangle before writing
any of them (`:225-241`). So a single filled-rectangle drag is simultaneously
the genre norm *and* the only shape the finished consumer accepts. The decision
is not asking the player to learn a restriction; it is asking the gesture to
express exactly what the service already takes.

## What this decision does not settle

Left open deliberately. None of these has an answer in the tree, and inventing
one here would be the invented-consequence defect this repository spends the
most effort on.

1. **Whether a room can be re-zoned or un-zoned.** Prison Architect's
   right-drag has no analogue here: no command expresses removal, `zone` refuses
   `overlaps-existing-room` for a tile whose zoning value is non-zero
   (`zoning.ts:239`), and nothing moves or resizes an instance. The instance id
   scheme depends on that — `zoning.ts`'s header states that if a future feature
   moves or resizes a room, [ADR 0012](./0012-derived-identifier-reproducibility.md)
   has to be settled first.
2. **Whether the room type list is grouped under a heading or interleaved with
   the buildables.** §1 assumes a grouped section; the measurement that makes §1
   free — 18 injected rows costing 0px — does not distinguish the two, and the
   ordering rule `buildCatalogue()` uses (`src/main.ts:275,334-337`) is a
   composition-root decision either way.
3. **Whether a zone drag should snap to an enclosing wall run.** A convenience
   of that kind is common in the genre, and it is not free here: `zone` takes a
   rectangle, nothing derives one from wall topology, the zoning plane stores a
   room *type* per tile rather than an instance id (`zoning.ts`'s header says
   so), and a `RoomInstance` carries an anchor tile rather than bounds
   (`docs/HUD_PROJECTIONS.md` gap 11). A snap is a feature to build, not a
   default to inherit.
4. **How a room type with unmet prerequisites should read in the list.** Room
   definitions carry `requirements`, and `requirementStatus` in
   `src/simulation/presentation/room-projection.ts` is the only evaluator —
   which, with no object placement (`docs/HUD_PROJECTIONS.md` gaps 13 and 14),
   answers `'missing-capability'` or `'not-evaluated'` for most of them. Greying
   a row on that basis would be showing the player a judgement the simulation
   cannot yet make.

## Consequences

- **The Build panel is unchanged in layout.** §1 adds rows to a list that
  already scrolls, and §*Alternative C* is the measurement that says nothing
  always-visible may be added instead.
- **A second gesture arrives in the renderer**, and with it the first area
  preview: either a mode on `BuildToolPort` or a second port beside it, an
  overlay that draws a rectangle rather than a run of edges, and a `BuildTool`
  path that is not keyed on `EdgeTarget`. §4 lists what is reused unchanged, and
  it is most of the pointer and camera arbitration.
- **`tests/foundation/unconsumed-command-contract.test.ts` must lose its
  `ZoneRoom` entry in the same change as the producer.** The file fails in both
  directions — an entry for a command that has gained a producer is as much a
  failure as a producer-less command with no entry — so this is owed by the
  implementation, not optional. Two of six declared commands would then remain
  without producers (`CancelBuildOrder`, `PurchaseMaterials`), or one if #282
  lands first.
- **`tests/foundation/unconsumed-content-contract.test.ts` is affected only to
  the extent the implementation names room ids, and the honest statement is
  narrower than "zoning gives the rooms a consumer".** That gate counts a
  reference to an id *as a single-quoted literal* in any `.ts` file under `src/`
  or `tests/`, excluding `src/content/` (`:33-38`). A producer that projects the
  catalog generically names no room id, so it moves nothing by itself; a test
  that zones a particular room type moves that one id. Nine room ids sit in
  `AWAITING_CONSUMER` today (`:83-91`) and two more are in
  `PROTECTED_BY_DECISION` (`room.delivery-bay`, `room.storage-room`, `:63-64`).
  Whichever of the nine gain a literal reference must have their entries deleted
  in the same change — the "holds no entry for an id that has since gained a
  consumer" case (`:251-266`) fails otherwise — and the exact-count assertion
  `{ declared: 62, unconsumedBySrcAndTests: 34, unconsumedBySrcOnly: 53 }`
  (`:198-202`) must be updated to match. **This ADR changes neither file.**
- **This unblocks step 3 of audit issue #261** — the step `zoning.ts`'s own
  header names — and it is the structural precondition for step 4, admitting a
  prisoner. `IntakeSystem` marks an arrival `'failed'` when
  `allByRoomCatalogId(target.roomCatalogId)` is empty
  (`src/simulation/prisoners/intake-system.ts:124-130`), and with nothing able
  to register an instance that is every arrival.
- **Zoning alone does not complete an admission, and this ADR claims no more
  than it can.** A zoned room is registered with `capacity: 0` and
  `objectCapabilities: []`, which `zoning.ts:252-262` records as measured rather
  than chosen — an empty rectangle accommodates nobody. The default
  accommodation target asks for `room.cell` with the `'sleep-surface'`
  capability (`intake-system.ts:30-32`), and `findAvailable`
  (`src/simulation/prisoners/room-instance-registry.ts:81-87`) rejects an
  instance at capacity or missing the capability. So zoning a cell converts a
  structural `'failed'` into a retry-able wait counted in
  `accommodationBacklogTicks` (`intake-system.ts:133-135`). Object placement, or
  an authored occupancy figure per room definition, is what closes step 4 — a
  product decision recorded on #261, per `zoning.ts`'s header.
- **A refusal has somewhere to go, and it did not when this ADR was written.**
  The route a producer needs was on #283's branch and on no other, so this
  bullet was a precondition; #283 has since landed and it is now a description
  of `main`. All six `hud.alert.refusal.zone.*` strings are in
  `src/content/default-locale-en.ts:173-178`, their mapping is in
  `src/ui/simulation-alerts.ts:43-48`, and `ZONE_REFUSAL_REASONS`
  (`src/simulation/refusals/refusal-log.ts:135`) is recorded from the handler at
  `src/simulation/runtime/session-commands.ts:70`. Two of those files did not
  exist on `main` when this was written.
  Without that route a zone gesture the simulation refuses tells the player nothing —
  which is the defect #225 removed from the build drag, and it should not be
  reintroduced by a new gesture.
- **The status strip starts moving.** `RoomZoningService` is the first thing in
  `src/` that registers a room instance, so `Rooms` stops being permanently
  zero while `roomCapacity` stays `0`. `docs/HUD_PROJECTIONS.md` gap 13 already
  records both as the room's true state rather than a projection defect.
- **Nothing here is enforced by a test.** This is a decision about a surface,
  and no gate can assert that a room type is a catalogue row rather than a tab.
  What the implementation owes is listed above; the choice itself is held by
  this document and by the index row that reports its status.

---

## Amendment — 2026-08-25: the owner chose alternative B, the Rooms tab

**Everything above this line is unchanged and stays unchanged.** The *Decision*
section still records what was chosen under the delegation, and the reasoning
for it was sound at the time it was written. This section records that the owner
reviewed it and chose the alternative, and why — which is the case an ADR's
history is for.

### What changed

The surface is **alternative B**: a fifth tab in `HUD_TAB_IDS`, holding a
`Rooms` panel of its own. Decisions §1 (a room type is a row in the Build
catalogue) and §3's *location* are superseded. Decision §2 — the gesture is an
axis-aligned rectangle drag on the world canvas — is **unchanged and
implemented**, and so is the shape of §3's intent, which was written to be
independent of which surface emits it and turned out to be.

### The owner's reasoning, and why the measurement strengthened it

The owner's argument was the vertical budget: a dedicated tab gives the surface
roughly **24×** the space, which is enough for a confirm step, a removal
control, a too-small-room warning and an enclosure readout — four things that do
not fit in the Build panel under any arrangement.

Since that decision was taken the panel geometry was re-measured (issue #174's
second half, landed in #300) and the case got **stronger, not weaker**:

| | Build panel's always-visible budget at 900×600 | Rooms panel body at 900×600 | Multiplier |
| --- | --- | --- | --- |
| As the owner decided | 11.8–12.2px | 291.2px | ~24× |
| After the re-measurement | **7.81px** | 291.2px | **~37×** |

**The pre-correction figure is recorded as a range because the repository does
not agree with itself about it, and that is worth saying rather than resolving
by picking one.** §*The height budget*'s table above says `12.2`;
`src/ui/hud/build-panel.ts`'s comment on `buyToggle` says `11.8`. They were
measured on the same tree by different probes and neither was re-derived when the
other was written. The multiplier is ~24× either way — 291.2 ÷ 11.8 is 24.7 and
÷ 12.2 is 23.9 — so nothing in the owner's reasoning turns on which is right,
which is exactly why it has survived unnoticed. Reconciling the two is a
docs-truth task of its own and is not done here; this amendment adds no third
figure.

Of that budget, **4px was never space at all**: it was the catalogue laying the
gutter under its own list over the hairline the map block draws, so "donating" it
moved a boundary rather than freeing a pixel. The correction removes it and
about 4.4px of real slack besides. So the four controls the owner wanted were
being weighed against a budget roughly a third larger than the one that actually
exists, and the tab's advantage is half again what they were told. The `Now`
column is the one figure here measured to 0.05px, and §*The height budget* says
so. Nothing in this file's §*The height budget* changes as a result — its own
`Then`/`Now` table already carries the corrected figures and states that its
conclusion is unchanged — and the decision this amendment records is the one
that gets better.

### What the implementation found that this ADR did not predict

Recorded because the ADR's own §*What this decision does not settle* is where
three of these were left open, and because two of them are things the ADR
asserted and the implementation had to correct.

1. **Removal was a blocker, not a nicety.** §*What this does not settle* item 1
   left "whether a room can be re-zoned or un-zoned" open. It could not stay
   open: `zone` refuses `overlaps-existing-room` for any painted tile, zoning
   writes no construction order so `Undo` reaches nothing, and undo is a
   keyboard chord — so one stray drag could put up to 4,096 tiles beyond use for
   the life of the session, with **no recovery of any kind on a touch device**.
   Shipping a producer without removal would have shipped that. `UnzoneRoom` is
   a new command, and the panel's confirm step is the second half of the answer.

   It does **not** need [ADR 0012](./0012-derived-identifier-reproducibility.md)
   settled first, which is what `zoning.ts`'s header warned about: removal
   neither moves nor resizes an instance, so no id is re-derived. That warning
   stands for a future move or resize.

2. **`TopologyManager` is further from an enclosure query than "would be used
   later" suggests.** This ADR did not mention enclosure at all. Evaluating the
   `enclosed`/`outdoors` requirement — carried by all 18 room definitions and
   read by nothing — turned out to have two obstacles rather than one:
   `TopologyManager` does region detection and exposes no enclosure query, *and*
   `TopologyManager.update()` has no caller anywhere in `src/`, so
   `getTopologyId` answers `0` for every tile in a running session. A region id
   would not be enough on its own either: a region that reaches the edge of the
   materialised world is indistinguishable from one bounded by walls there.

   So what shipped is the narrower predicate that can be stated honestly —
   whether the *rectangle's own perimeter* is walled — and it **refuses
   nothing**. Two facts make a refusal wrong: the check is narrower than
   enclosure, so a room inside a larger sealed building reads `open` while being
   indoors; and `edgeNumericIdFor` writes `0` for the `'object'`-category
   `door-wooden`, so a completed door order changes nothing in the world and
   refusing every unsealed `enclosed` room would make 17 of the 18 room types
   designatable only as a box with no way in. The answer is *reported* on a new
   `zoning` field of `simulation/status-counts` and read out in the panel.

3. **The authored minimum size was enforceable immediately, and was not
   enforced.** Not mentioned in this ADR either. All 18 definitions carry a
   `minimum-size` requirement — a cell 2×3, a canteen 6×6, a yard 8×8 — and
   nothing read one, so a 1×1 canteen was a legal room. It is now a seventh
   zoning refusal reason, checked ahead of every per-tile check because the size
   is a fact about what the player asked for while ownership is a fact about
   where, and the size is the one they can fix by dragging again.

4. **§*Alternative B*'s scope argument was answered by the removal command, not
   waived.** B was rejected on scope — "spending the last tab slot on the first
   room feature, before rooms have a lifecycle to manage, is premature… today
   there is one create gesture and nothing to list". That was true when it was
   written and is not true of what shipped: there are two gestures, one of them
   destructive and one of them the recovery from it, plus a rule to read before
   drawing and an answer to read after. That is a lifecycle to manage, and it is
   what the confirm step and the removal control are for.

5. **B's tab-bar constraint held exactly as measured, and the bar is now full.**
   `HUD_TAB_IDS` has five members. `hud-state.ts` and
   `src/content/default-locale-en.ts` both carry the measurement forward: a
   sixth tab is foreclosed at 375×812, and `Rooms` is short enough where a
   nine-character label would not be.

6. **The `test.slow()` estimate was in the right place.** B was also charged
   with widening the #88 tab sweep, estimated at "roughly 55s" for a fifth tab
   against a tripled 180s budget. Measured on this branch, with the sweep also
   driving a real rectangle drag per viewport: 32.1s. The estimate was
   pessimistic and the budget was never in question.

### On reusing an existing tab instead of spending the last slot

Three of the four existing tabs render no panel, so the obvious question is
whether one of them was free. It was not, and the reason is worth stating
because "renders no panel" and "unclaimed" are different facts:

- `overview` is the landing tab (`INITIAL_HUD_SHELL_STATE.activeTab`).
- `security` is where the Staff panel lands — `claude/guard-hiring-surface`
  (PR #302) adds it on that tab, so it is claimed by work in flight.
- `regime` is the schedule.

Each already carries its own label message key naming its own planned feature,
so reusing one would have put a Rooms panel behind a tab whose label says
something else — an ADR 0011 problem, not a layout one. A fifth tab was
measured as free for the Build panel and is what B always proposed.

### Open questions this amendment does not answer

Left open deliberately, and none of them decided in code.

1. **The Rooms panel has no keyboard or numeric route, and the Build panel
   does.** `AGENTS.md` boundary 10 is not satisfied by "it works with a mouse",
   and the Build panel's folded coordinates section exists for exactly that
   reason — its own comment calls deleting the numeric fields "the easy half of
   this change and the wrong half". The Rooms panel shipped without an
   equivalent, so a rectangle can only be expressed by dragging. **Still open.**

   The *phone* half of this question is closed, and closing it did not need a
   numeric route. It is recorded here in full because the answer is a different
   one from the one this item expected.

   As measured when this amendment was written: on the assembled page at
   **375×812** on the Rooms tab, with the save panel above and the Rooms panel
   below, there is no square of bare world of any usable size — the two panels
   are full-width at y 96–252 and y 268–719, the strip takes 88px and the tab bar
   starts at y 743, so the gaps between them are 8, 16 and 24 pixels and the
   largest square of bare canvas anywhere on the page is **16px**, a quarter of
   one tile. This item said a player "must collapse a panel before they can draw,
   and the panel is collapsible so they can". **The second half of that was
   false.** `createPanel` collapses a panel by setting `hidden` on its body, and
   `hud.css` gives `.hud-build > .ui-panel__body` and
   `.hud-rooms > .ui-panel__body` a flex `display` of their own — which outranks
   the user agent's `[hidden] { display: none }`. Pressing "Collapse" on either
   panel flipped `data-collapsed`, announced `aria-expanded="false"` and left the
   whole body on screen: measured at 375×812, a 451.1px panel with a 404.1px body
   and the same 16px of bare world. So there was no escape hatch, and the feature
   was unusable on a phone rather than merely awkward.

   Both halves are fixed. `.ui-panel > .ui-panel__body[hidden]` in
   `primitives.css` makes the fold real (the selector carries `.ui-panel >`
   because a bare `.ui-panel__body[hidden]` ties `.hud-rooms > .ui-panel__body`
   on specificity and loses on source order), and the Rooms panel now uses that
   fold on the player's behalf: **arming folds it to its header, and a finished
   rectangle brings it back.** Measured in the drawing state at 375×812, same
   page, same prison: the panel is 47px at y 672, the save panel takes 227px of
   the slack it left, and the band between them is 348.8px tall and the full
   375px wide — a 336px square of bare world, which was the measuring scan's own
   cap. Arrival geometry is unchanged at 1280×720, 900×600 and 375×812, so no
   desktop viewport paid for it. The two controls a pending rectangle reveals are
   now hit-tested at 44px in both axes at all three, and
   `tests/browser/app-shell.spec.ts` asserts that geometry numerically where it
   used to record the controls as unreachable.

   What is *not* answered is the part this item leads with: there is still no
   keyboard or numeric route to a rectangle. A fallback mirroring the Build
   panel's was weighed and rejected for now on a measurement — the Rooms panel's
   always-visible budget at 900×600 is **7.9px**, the distance from the status
   block's bottom edge to the panel's own fold, and a collapsed section of its own
   is 45px; the actions row cannot host the disclosure toggle either, since at the
   rail's 264px that row is already over-subscribed (the arm button renders 98.7px
   wide for 104px of content). So a numeric route needs somewhere to live that
   costs no always-visible height, and finding one is a design decision that is
   still not made here.

   **Now answered, by [ADR 0039](./0039-a-keyboard-route-to-room-zoning.md)
   (#411), and the figure above needs a footnote rather than a correction.**
   7.9px is right and it is the *fold gap*; what the decision needed was how much
   a new block can take before something moves, measured per host. Grown a pixel
   at a time against the panel's height, its fold gap and the three boxes that
   carry it: the panel body affords 32px at 1280×720 and 0px at 900×600, the
   catalogue section's own body 41px and 4px, and `.hud-rooms__list` at least
   400px at both. A collapsed section header is 44px, so this item's conclusion
   holds twice over — and the answer is that the route lives *inside the
   scroller*, which is decision 1's own principle for the Build catalogue ("a
   longer list is absorbed by the list rather than by the panel") pointed at the
   box that actually absorbs. Measured with the real form, folded and open, this
   panel's arrival geometry is unchanged at all six viewports.

2. **Two adjacent same-type rectangles are still two `RoomInstance`s, and
   removal treats them as one region.** Unchanged in the first direction and
   newly visible in the second: `unzone` grows each covered tile into its
   connected same-type run, so clipping one corner of one of two touching cells
   removes both. Both ends need the zoning plane to carry an *instance id* per
   tile rather than a room type, which is a persistence-format decision
   (`docs/HUD_PROJECTIONS.md` gap 11). `tests/unit/rooms-zoning.test.ts` pins
   both directions so that changing either is a visible decision.

   **The second direction is no longer true, and the reason it was thought
   unfixable is the part that was wrong.** `dea529c` (#337, 2026-08-26 22:01
   UTC, on `main`) narrowed removal to the instance: `collectRemovableRegion`
   (`src/simulation/rooms/zoning.ts:808`) resolves each covered tile through
   `roomInstanceContaining` (`src/simulation/rooms/zoning.ts:811`;
   `src/simulation/objects/room-capacity.ts:83`) and clears *that instance's*
   rectangle, so clipping one corner of one of two touching cells removes one
   cell. The same-type fill survives only for paint no rectangle claims — a
   restored V4 row records no `width`/`height` — and it now stops at any tile an
   instance owns.

   So **neither end needs an instance id per tile**, and this paragraph's claim
   that both do was the load-bearing error: a `RoomInstance` has carried its
   rectangle since ADR 0028 phase 1, which is a *derivation* of the same fact,
   and ADR 0028 decision 6 removed the last persisted derived value from a room
   instance rather than adding one. `SAVE_SCHEMA_VERSION` did not move and no
   field changed (`docs/PERSISTENCE.md`, "**#337 changed nothing in this format:
   no field, no section, no version bump**"). The first direction — two adjacent
   same-type rectangles are two `RoomInstance`s — is unchanged and was always
   right.

   The pinning sentence still holds, with more behind it:
   `tests/unit/rooms-zoning.test.ts`'s *"two adjacent rectangles of one type are
   two rooms at both ends (#337)"* and
   `tests/integration/room-zoning-loop.test.ts`'s *"un-zoning one of two
   adjacent same-type rooms (#337)"* pin the instance-bounded behaviour through
   the real command path and across a save round trip.

3. **Whether a zone gesture should carry a `transactionId`** — still open, and
   the implementation sends none. The reasoning in §3 is unchanged: zoning
   writes no construction order, so `registerTransactionOrder` has nothing to
   group, and sending an id nothing groups by would be inventing a grouping to
   explain. Removal is the reversal instead.

4. **Whether a room type with unmet prerequisites should read differently in
   the list** — §*What this does not settle* item 4, still open. The panel shows
   every room type identically and states each one's *rule* (its minimum size
   and its enclosure requirement) rather than a judgement about whether the
   prison can currently satisfy it, because `requirementStatus` answers
   `'missing-capability'` or `'not-evaluated'` for most rooms while no object
   placement exists (`docs/HUD_PROJECTIONS.md` gaps 13 and 14).

5. **Whether the enclosure readout should ever become a refusal.** It cannot
   honestly be one today, for the two reasons in item 2 above. The day something
   *gates* on enclosure — an occupancy rule, an intake requirement — the region
   query is the thing to build first, and this decision should be revisited then.

### Status of this amendment

**Proposed.** Setting an ADR to Accepted is the owner's, and this amendment does
not do it. What it records is that the owner chose alternative B under the same
delegation the original decision was made under, that the implementation on
`claude/rooms-tab-zoning` follows it, and that the re-measured geometry supports
it more strongly than the figures the choice was made against.
