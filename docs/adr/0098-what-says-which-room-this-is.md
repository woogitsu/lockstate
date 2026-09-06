# ADR 0098: What says which room this is

> **The number was assigned centrally by the integrator, and this document
> pre-commits to renumbering.** `AGENTS.md`'s rule is that a number is not
> reserved until it appears in `docs/adr/README.md`, and a branch nobody has
> merged is invisible from that index — so if another branch turns up holding
> 0098, this file, its row and every citation of it get renumbered without
> argument, exactly as 0031, 0034, 0035, 0037, 0048, 0049, 0074, 0075, 0076,
> 0083, 0096 and 0097 each pre-committed.
>
> **The sweep was performed rather than trusted**, on 2026-09-06 from a branch
> cut from `origin/main` at `02490b6e` (v0.0.505):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**200 heads**, up from the 193 ADR 0097
> swept a day earlier) with `git ls-tree --name-only <head> -- docs/adr/` read
> out of every one of them. **All 200 were readable; none failed.**
>
> - The highest four-digit prefix on any head is **0097**, on `origin/main` and
>   on the heads that carry it.
> - **0095 is still held**, on the same head ADR 0096 and ADR 0097 each named —
>   `origin/measure/893-coverage-and-response-draw-from-one-pool`
>   (`e576b056`) carries `0095-what-the-guard-requirement-is-a-requirement-for.md`
>   and still has no row in `docs/adr/README.md`. That is the third consecutive
>   sweep at which it has not moved, over 140, 193 and now 200 heads.
> - **Nothing at 0098 or above appears on any of the 200 heads.**
>
> So `max + 1` off **disk** is 0098, the index's stated **Next free number** line
> is 0098, and `max + 1` over the **sweep** is 0098. All three agree for the
> second document running, which the chain in `docs/adr/README.md` records as
> the lucky configuration rather than the normal one: the one held number sits
> *below* the ceiling instead of at it. The index's own next-free line moves to
> **0099** when this row lands, because
> `tests/foundation/adr-numbering-contract.test.ts` states it as one past the
> highest number *on disk*, and 0095 is still not on disk.

## Status

**Proposed, 2026-09-06. Not self-approved.**

The question is the owner's to settle. What this document offers below is a
*requirement* about room identity, together with five options that could
discharge it, what each costs, and what each forecloses.

One of those foreclosures reaches another document.
[ADR 0097](./0097-what-the-world-view-is-required-to-communicate.md) was
**Accepted by the owner on 2026-09-05, together with option A**, and its §7
named the collision with this issue while it was still hypothetical. It is not
hypothetical now, and Context §4 is written against that accepted decision
rather than against the draft.

Filed against [#1021](https://github.com/woogitsu/lockstate/issues/1021), one of
the four candidates the owner selected out of the play-test in
[#1018](https://github.com/woogitsu/lockstate/pull/1018).

**No player-facing string is authored here.** `AGENTS.md` reservation 4's
2026-09-04 release makes the choice of words ours provided the sentence is true
of the code that renders it. Every option below is a mark rather than a
sentence, and option C below names the one string a legend would need
rather than inventing it here.

**Nothing in this document changes another document's `Status` line.** ADR 0097
is Accepted and that is not this document's to touch; where Context §4
disagrees with it, it says so as a consequence to be priced, not as an
amendment.

## Claim tiers used below

- **MEASURED** — produced by a run of an instrument, with the instrument named
  and its inputs given, so the number can be reproduced.
- **VERIFIED, read** — a source file was opened, and where the claim rests on
  the exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form so that it
  cannot drift silently.
- **ARITHMETIC** — computed from constants that were opened, with no run behind
  it beyond the computation itself.
- **REASONED** — derived from code that was opened, without a run.

---

## Context

### 1. What #1021 established, and the one number in it that is wrong

VERIFIED, read. The mechanism is exactly as the issue states it. `zoningTint`
resolves the room and then throws the room away:

`return ZONING_TINT_BY_CATEGORY[room.category];`
(verbatim in `src/rendering/world/appearance.ts`)

`ZONING_TINT_BY_CATEGORY` is at `src/rendering/world/appearance.ts:86`, and it
is keyed by `RoomCategory` rather than by room id. The floor underneath cannot
make up the difference, because there is one floor:

`return 'env.floor.institutional';`
(verbatim in `src/rendering/world/environment-art.ts`)

`zonedFloorSprite` branches on nothing but whether the zoning id names a known
room, and its docblock says so in the sentence that also anticipates option D
below: `One floor for every category today. This returns per zoning id rather than per category so a later split -- concrete for utility and logistics, linoleum for the rest -- is a change in this function and nowhere else.`
(verbatim in `src/rendering/world/environment-art.ts`)

**The one correction, and it is in the issue's favour.** MEASURED, by parsing
`src/content/room-catalog.ts` and grouping its rows: **18 rooms, 11 categories,
six of which hold more than one room, and *thirteen* rooms — not twelve — sit
in those six groups.**

| category | rooms sharing it |
| --- | --- |
| `housing` | Cell, Holding Cell |
| `security` | Solitary Cell, Security Office |
| `food` | Kitchen, Canteen |
| `hygiene` | Shower Room, Laundry |
| `recreation` | Yard, Common Room |
| `logistics` | Storage Room, Delivery Bay, Garbage Room |

`2 + 2 + 2 + 2 + 2 + 3 = 13`, and `13 − 6 = 7` rooms are therefore drawn
identically to another room. **Seven is the number in the issue's own title and
it is right; "twelve room types collapse onto six tints" in its body is one
short, and the brief that commissioned this document inherited the shorter
number.** Nothing else in the issue moves: the collapse, the pairs and the
`Kitchen` / `Canteen` example are all confirmed.

The catalogue's `numericId` is bounded at `min(1).max(255)`
(verbatim in `src/content/room-catalog.ts`), and eighteen rooms use 1 to 18. That
bound matters to option A's costing: **the painter is already handed the room
id.** `zoningTint(sample.zoning)` receives the room's own numeric id and
resolves the definition from it, so keying the table by id instead of category
changes a table and a lookup and touches no storage, no protocol and no save
format.

### 2. What the tint channel can carry at all, measured rather than argued

This is the part #1018 and #1021 could not reach from a screenshot pair, and it
decides whether the issue's cheapest option is a fix or a rearrangement.

**The composite is exact.** ARITHMETIC. Both tints are painted over the same
floor art at the same alpha —

`const alpha = floors[localY * size + localX] === undefined ? ZONING_TINT_ALPHA : ZONING_TINT_ALPHA_OVER_ART;`
(verbatim in `src/rendering/phaser/tile-layer.ts`)

— so the base cancels and the difference between two tinted tiles is exactly
`α × |t₁ − t₂|` per channel, with
`export const ZONING_TINT_ALPHA_OVER_ART = 0.14;`
(verbatim in `src/rendering/world/appearance.ts`). That is the identity #1021
used to reproduce #1018's 5.8 from the constants, and everything below is the
same identity applied to all 55 pairs instead of one.

**MEASURED, over all 55 pairs of the eleven shipped tints:**

| pair | rooms | raw Euclidean | effective, after 0.14 |
| --- | --- | --- | --- |
| `operations` / `food` | Reception vs Kitchen | 29.0 | **4.06** |
| `security` / `food` | Solitary Cell vs Kitchen | 43.0 | 6.02 |
| `operations` / `logistics` | Reception vs Storage Room | 46.5 | 6.51 |
| `hygiene` / `utility` | Shower Room vs Utility Room | 48.7 | 6.82 |
| *median of the 55* — `security` / `administration` | Solitary Cell vs Staff Room | 122.5 | 17.15 |
| `security` / `hygiene` | Solitary Cell vs Shower Room | 209.0 | 29.26 |

**The tightest pair on screen today is not the pair anybody measured.**
Reception against Kitchen is **4.06** effective units — closer than the 6.02
`security`/`food` pair whose 5.8 #1018 measured and #1021 reproduced. So the
palette has a spacing defect that is independent of the keying defect, and
fixing the keying without respacing the hues would leave the worst pair exactly
where it is.

**Why: the palette spends one dimension and leaves two unspent.** VERIFIED,
read, converting each row of `ZONING_TINT_BY_CATEGORY` to HSV: ten of the eleven
sit at **exactly** `s = 0.62, v = 0.82`, and only `administration` (`0x8f97a3`)
departs, at `s = 0.12, v = 0.64`. The whole discriminating dimension is **hue**,
and `operations` at 39° against `food` at 25° is a 14° gap on a wheel whose mean
gap is 36°.

**And the ceiling.** ARITHMETIC: the largest separation a full 8-bit channel can
produce through a 0.14 wash is `255 × 0.14 = 35.7` units. That is the whole
budget of this channel, before any question of how many marks have to share it.

**What that budget is spent against.** MEASURED, by decoding
`public/game-content/source-art/floor.linoleum.institutional.788e81d4e081.png`
and taking `env.floor.institutional`'s own crop —
`sourceRectPx: { x: 732, y: 711, width: 304, height: 304 }`
(verbatim in `src/rendering/assets/environment-sprites.ts`) — then box-averaging
it down to the 64×64 pixels one tile occupies at zoom 1, which is
`export const TILE_SIZE_PX = 64;`
(verbatim in `src/rendering/tile-metrics.ts`):

| crop, at | per-channel σ (R/G/B) | luminance σ | luminance p5→p95 |
| --- | --- | --- | --- |
| 304×304, as shipped | 12.73 / 11.68 / 9.47 | 11.68 | 36.1 |
| 128×128, the packed frame | 11.36 / 9.98 / 8.13 | 10.08 | 30.3 |
| **64×64, one tile at zoom 1** | **9.92 / 8.40 / 6.65** | **8.55** | **25.4** |

**So the mark that distinguishes a Reception from a Kitchen is 4.06 units,
painted onto a texture whose own pixel-to-pixel spread across one tile is 25.4
units.** The speckle in the linoleum is roughly six times the signal. Even the
palette's *widest* pair, at 29.26, is only a little above the floor's own
spread, and the channel's absolute ceiling of 35.7 is 1.4 times it.

**What this does and does not establish, said separately** (`docs/AGENT_WORKFLOW.md`
§3: a measurement is not a diagnosis). It establishes the ratio of signal to
texture at one tile. It does **not** establish what a player sees, because the
eye integrates a mean shift over a whole room while uncorrelated speckle
averages away — a 4-unit shift across a 6×6-tile floor is a different perceptual
problem from a 4-unit shift on one tile against a 25-unit neighbour. The
weakest-claim section below names that rather than burying it here.

### 3. The question #1021 left open, settled by reading

#1021 named its own weakest claim honestly: *"I have **not** confirmed by
playing that no other on-screen cue distinguishes two rooms of one category — a
hover label, a selection panel or the Rooms readout may name the room."*

VERIFIED, read. **There is no such cue on the map, and the panel names a room
instance only while it is broken or full.** What a player is given, each
finding openable:

1. **Nothing on the map carries text.** `grep` for `add.text`,
   `Phaser.GameObjects.Text` and `BitmapText` over the whole of `src/rendering/`
   returns nothing. There is no label, no name plate and no legend in the world.

2. **Nothing on the map answers a pointer.** `WorldScene`'s `pointerdown` and
   `pointermove` handlers (`src/rendering/scene/world-scene.ts:519`, `:548`)
   dispatch to `beginBuild` / `beginObject` / `beginArea` when a tool is armed
   and to camera pan otherwise; the `wheel` handler zooms. **No branch reads a
   tile in order to show anything.** There is no hover read, no tooltip, no
   click-to-inspect and no room selection.

3. **The minimap draws nothing.** `src/ui/hud/hud.ts:1614` states that minimap
   *rendering*
   belongs to the renderer and does not exist yet, and the two strings it ships
   say so to the player:
   `'hud.minimap.placeholder': 'Minimap is not available yet',`
   `'hud.minimap.navigable': 'No map is drawn here yet — click to jump the camera there',`
   (both verbatim in `src/content/default-locale-en.ts`).

4. **The Rooms panel names an instance in exactly two conditional blocks, and a
   healthy room is in neither.** `RoomListRowViewModel` carries `roomNameKey` and
   `anchorTile` per instance (`src/simulation/presentation/room-projection.ts:408-475`),
   and `src/ui/simulation-room-needs.ts` spends them on two sentences:
   `'hud.rooms.needs-room': '{room} at {x}, {y} is missing',`
   `'hud.rooms.at-capacity-room': '{room} at {x}, {y} is full',`
   (both verbatim in `src/content/default-locale-en.ts`). The first describes
   **one** room at a time — `export const ROOM_NEEDS_ROOMS_LIMIT = 1;`
   (verbatim in `src/ui/hud/rooms-panel.ts`) — and its own docblock says why:
   *"there is no surface in this application that audits everything"*. The
   status strip carries a room **count** (`rooms: roomCount`, in
   `src/simulation/presentation/status-strip-projection.ts`) and no breakdown.

**So the answer to #1021's open question is stronger than the issue's own
claim.** A finished, not-full Kitchen and a finished, not-full Canteen are the
same pixels on the map, and **no surface in the application names either of them
at all** while they are working. The one moment a room type is spoken aloud is
the transient alert at designation —

`'hud.alert.event.rooms.zoned': '{room} designated.',`
(verbatim in `src/content/default-locale-en.ts`)

— which is gone by the time the player is looking at a prison with two food
rooms in it.

**And one more, which is the finding nobody was looking for: the legend has the
same defect as the map.** The Rooms panel's catalogue swatch is the *same* function —
`tint: zoningTint(definition.numericId) ?? 0,` (verbatim in `src/main.ts`) — and
its view model states the purpose in its own words:
`The colour the world tints this room's tiles, so the catalogue row and the designation on the map agree without the player having to learn a legend.`
(verbatim in `src/ui/hud/view-model.ts`). The catalogue is sorted by category
and then by id (`src/main.ts:964-969`), so **Kitchen and Canteen appear as
adjacent rows carrying the same swatch.** The panel rescues the player only
because it *also* prints the room's name; the map has no such second column.
That sentence is true and stays true under every option below — what changes is
whether it is worth anything.

### 4. What ADR 0097 has already spent, and what it left

ADR 0097 was **Accepted by the owner on 2026-09-05, together with option A**: a
per-room-instance condition ordinal published on the `simulation/delta` channel
and drawn by a new renderer module. Its decision 3 resolved the collision with
this issue in advance, and this document is the other side of it:

> *"Recommended. For §7's reason: the tint is #1021's channel, it is the only
> thing distinguishing 18 room types today, and it is already at a deliberately
> weakened alpha. A condition cue that modulates it forecloses #1021's cheapest
> option and both marks get worse."*

and it put condition at the room's boundary instead, naming the code that
already draws one — `src/rendering/phaser/tile-layer.ts:373-385` (re-anchored;
`:374-386` was already the tile-grid block below it, not this one, before this
window opened), the owned-land
outline, **which still stands at those lines on `02490b6e`** and is the
`if (!world.isTileOwned(tileX, tileY - 1)) graphics.lineBetween(left, top + inset, right, top + inset);`
(verbatim in `src/rendering/phaser/tile-layer.ts`) block and its three siblings.

**This document accepts that allocation.** Decision 2 below says so and gives
the reasons, which are not merely deference: Context §2's measurement is an
argument *for* 0097's decision 3 that 0097 did not have.

**But acceptance is not free, and 0097's §7 said the arithmetic would change.**
It did, twice, in the day after it was accepted:

- **The boundary is now spoken for.** Before 0097, "outline each room in its own
  colour" was the obvious second mark for identity — a line is a different
  visual channel from a wash, and the painter already draws one. That option is
  now 0097's, and option C below has to find a mark that is neither the boundary
  nor the wash.
- **Furniture became a channel.** [#1028](https://github.com/woogitsu/lockstate/pull/1028)
  (`977129a8`, merged at `01fef637`) drew the first catalogued object from the
  atlas, and the play-test merged at `a714bdf8` MEASURED a furnished cell against
  the same cell unfurnished at **20.91% of pixels, of which 16.93% is four
  beds** — against the 4.11% that a working cell differs from a sealed one by.
  Option E below prices that as a legibility channel, which it is, and finds it
  is not the one it looks like.

---

## Decision

Proposed, not approved. Four parts.

### 1. The map is required to distinguish room *types*, not room categories

**Proposed.** ADR 0097 decision 1 obligation 1 — *"What is here … what kind of
room a patch of ground is"* — is not met while seven of eighteen room types are
drawn identically to another, and the reading that makes it acceptable is a
reading nothing on screen supports: Context §3 establishes that a player given
two food rooms has **no** surface anywhere that tells them which is which.

The requirement is deliberately about *types* and not about *instances*. Two
Cells side by side may look the same; that is a different question, it is not
what #1021 raised, and the render view could not answer it anyway — the tile
layer is handed the room catalogue id and no instance identity at all, and the
constructor for a tile sample enumerates its whole vocabulary in one line:

`return { loaded: false, terrainNumericId: 0, topEdge: 0, leftEdge: 0, zoning: 0, owned: false };`
(verbatim in `src/rendering/world/world-view.ts`)

### 2. The tint channel is accepted as identity's, on ADR 0097's decision 3

**Proposed, and this is the answer to the question the brief asked.** ADR 0097's
allocation stands: condition goes to the boundary, the tint stays with identity.
Three reasons, of which only the first is 0097's own:

1. A wash and a line are different channels, and a mark that means "this room is
   in trouble" must not be readable as "this is a different kind of room".
2. **Context §2's measurement is a new argument for it.** The tint's whole
   ceiling is 35.7 effective units and the floor it is painted on has a
   25.4-unit spread of its own. A channel that thin cannot carry two facts;
   asking it to would not be a compromise, it would be a second illegible mark
   on top of a first.
3. Condition changes while the prison runs and identity does not. ADR 0097 §5
   establishes that anything drawn by `TileLayer` inherits the 30-second
   geometry-snapshot bound. Identity is exactly the kind of fact that bound is
   harmless for, which is a reason to leave identity on the cheap channel and
   move condition off it — the split 0097 chose.

**What accepting costs, recorded rather than glossed:** the room boundary is no
longer available to this decision, and Context §2 establishes that the tint
alone is at its ceiling. That is the substance of decision 3.

### 3. Keying by room id is necessary and is not sufficient

**Proposed, and it is the part that most changes what #1021 asked for.** The
issue's option 1 — key the tint by room id — removes the *collision*. MEASURED,
it does not remove the *illegibility*:

- Today's worst pair is **4.06** effective units.
- Eighteen hues spaced evenly at the palette's own `s = 0.62, v = 0.82` give a
  worst pair of **6.02** — better than today, because the shipped eleven are
  badly spaced rather than crowded.
- Keeping the category as a hue *family* and separating its members by value —
  which spends a dimension the palette leaves entirely unspent — gives
  within-family separations of **7.11 to 20.64**, and still leaves the worst
  pair overall at **4.36**, because `operations` and `food` are 14° apart and
  that is untouched by any of it.

So the honest statement is: **keying by id closes the seven collisions and
leaves a palette whose tightest pair is a quarter of the noise it is drawn on.**
Any option chosen here should be paired with a respacing of the hues, which
costs nothing and is not otherwise anybody's job.

**Therefore identity needs a second channel, and the two that remain are the
floor and the furniture.** The boundary is gone (decision 2), the tint's alpha
was already argued down from 0.28 for a stated reason —

`and that is gameplay information, not decoration.`
(verbatim in `src/rendering/world/appearance.ts`)

— the whole sentence being that the tint is not removed *because* it is what
says which room this is, which the same comment then explains is keyed by the
room's category. Raising the alpha again undoes the decision that made the floor
art worth drawing.

### 4. What is *not* required

**Proposed, and it is what keeps this bounded.** The map owes the player enough
to tell one room type from another **at the zoom they are building at**. It does
not owe:

- a distinct look at every zoom. #1026's control ranges from 0.2 to 3.0 and at
  0.2 a tile is 12.75 CSS pixels (MEASURED in the play-test merged at
  `a714bdf8`); a decision that a 12-pixel tile must carry a legible room type
  would foreclose most of the options below for no stated benefit.
- room *instance* identity (decision 1).
- anything about how a room is doing. That is ADR 0097's, accepted, and this
  document must not quietly take a second bite at the same pixels.

---

## Options, with their real costs

### Option A — key the tint by room id, 18 rows instead of 11

**What it is.** `ZONING_TINT_BY_ROOM_ID` keyed by `RoomCatalogDefinition['id']`,
resolved by the `zoningTint` that already holds the definition.

**Cost.** VERIFIED, read: one table and one return statement in
`src/rendering/world/appearance.ts`. **No storage change** — zoning is already
the room's own numeric id, bounded at 255 with 18 used. **No protocol change, no
save-schema bump, no painter change, and no art.** The Rooms panel's catalogue
swatch follows for free, because it calls the same function —
`tint: zoningTint(definition.numericId) ?? 0,`
(verbatim in `src/main.ts`).
This is the cheapest thing in this document by an order of magnitude and it is
half a day.

**What it does not buy.** Legibility (decision 3): worst pair 6.02 at best,
against a floor spread of 25.4.

**What it forecloses.** The **category** as a thing the map shows. Today a
player can in principle see that Kitchen and Canteen are the same family;
eighteen independent hues throw that away. Option B is option A with that
property kept, at the same price.

### Option B — eleven hue families, members separated by value

**What it is.** Option A's keying, with the palette derived rather than
enumerated: the category fixes the hue, the room's position within its category
fixes the value (and, for `administration`'s already-desaturated row, the
saturation).

**Cost.** The same as option A — one table, one function — plus the palette
work, which is the part that needs an eye rather than a compiler. ARITHMETIC
above: 7.11–20.64 effective units within a family, so the two food rooms would
read as two shades of the same orange rather than as an orange and a yellow.

**What it buys that A does not.** The category survives as a readable grouping,
and the palette gains a second dimension it currently does not use at all, which
is headroom for the nineteenth room.

**What it forecloses.** Value as a channel for anything else on the floor — a
future "this room is disabled" or "this room is selected" wash cannot be a
lightness step without colliding.

**Both A and B leave the worst pair at 4.06–4.36 unless the hues are respaced**,
and neither is worth doing without that.

### Option C — a second mark inside the room

**What it is.** A glyph, floor decal or hatch pattern per room type, drawn over
the floor and under the objects, so identity has a shape channel as well as a
hue channel.

**Cost, and the boundary is not available.** ADR 0097 decision 2 put a per-room
mark in a new renderer module keyed by room *instance*; this one cannot reuse
it, because the tile layer has no instance identity (decision 1) and the room
rectangle is on the simulation side (`RoomInstance.anchorTile`, `width`,
`height`, `src/simulation/prisoners/room-instance-registry.ts:75-82`). Two
shapes, both real:

- **Per tile.** The painter has the zoning id per tile and could stamp a small
  glyph on every tile, or on a deterministic subset. Cheap in transport, ugly in
  a large room, and it fights the objects standing on the floor.
- **Per merged run.** `mergeFloorRects` already collapses a zoned room into
  greedy rectangles — *"a zoned room is one sprite, not one per tile"*
  (`src/rendering/phaser/tile-layer.ts:64-66`) — so a glyph per run is nearly
  free to place. Rooms crossing a chunk boundary get more than one glyph, which
  is a visible artefact and not a subtle one.

**Art.** Eighteen glyphs, and they are the first thing in this repository that
would need a *legend* — a player has to learn that a fork means Canteen. That is
one player-facing surface this document does not design. The string it would
need is the room type's own name, which the catalogue already carries as
`labelKey`, so nothing new would be authored — but the *pairing* of glyph to
room would be the first thing a player had to learn, and that is the owner's
call rather than this document's.

**What it forecloses.** The floor's remaining visual budget, and the option of
ever drawing anything else over a room's interior.

### Option D — split the floor sheets

**What it is.** The split `zonedFloorSprite`'s own docblock names: concrete for
utility and logistics, linoleum for the rest.

**Cost, MEASURED rather than taken from the comment.** The 23 shipped sheets
under `public/game-content/source-art/` total **37,584,736 bytes**, between
1,164,201 and 2,324,434 each. The comment's own estimate is
`each additional sheet is a whole ~1.5 MB download`
(verbatim in `src/rendering/world/environment-art.ts`) and it is right.

- **The cheap version is one sheet and 2,324,434 bytes.**
  `floor.concrete.variants` already ships in the catalogue and is named by **no**
  `EnvironmentSpriteId`, so nothing downloads it today; declaring it costs that
  file and one rectangle. `TERRAIN_ON_COLOUR_FALLBACK`'s comment already
  identifies it as the sheet that would fit, and says the blocker is that no
  code path produces a concrete *terrain* — which is exactly why hanging it on
  *zoning* instead is the move the docblock anticipates.
- **The expensive version is eighteen floors** and does not exist: only two
  floor sheets are in the batch, so sixteen would have to be commissioned, at
  roughly 1.5 MB each on first load.

**What it buys.** A texture channel, which is orthogonal to hue and survives the
14% wash because it is not competing with it — the floor *is* the base the wash
is measured against. Two floors × eighteen hues is strictly more legible than
eighteen hues.

**What it does not buy.** It is a category-level split at best: all three
logistics rooms would be concrete and still share a floor, so it never closes a
collision on its own.

**What it forecloses.** ADR 0097's option B — per-condition floor art — which
that document already declined and already recorded as foreclosed in the other
direction. Taking D makes 0097's B unaffordable rather than merely unchosen: it
would become identity × condition in sheets.

### Option E — rely on furniture, and let the tint stay wrong

**What it is.** Draw the objects a room requires, and let a Kitchen with a stove
read as a Kitchen. #1028 landed the mechanism and the play-test measured that
one object is worth 16.93% of a cell's pixels.

**It is a real channel and it is not this one. MEASURED, by cross-tabulating
`src/content/room-catalog.ts`'s object requirements against
`OBJECTS_ON_COLOUR_FALLBACK`:**

- **Every one of the six colliding categories has pairwise disjoint required
  objects.** In principle furniture separates all seven collisions.
- **At least three of the six have a member that cannot be drawn.**
  `room.security-office` requires only `object.security-console` and
  `room.laundry` only `object.washing-machine`, and both objects are in the seven
  the module names as having no source art at all:
  `Seven of the twenty have no sheet at all -- there is no stove, fridge, bookshelf, washing machine, medical bed, medicine cabinet or security console anywhere in the batch.`
  (verbatim in `src/rendering/world/environment-art.ts`). **`room.yard` requires
  no objects whatever**, so there is nothing to draw at all: an empty Yard and an
  empty Common Room are identical under this option and under every other one
  that reads contents.
- **"At least" is doing work, and the reason is a discrepancy this document
  cannot settle.** REASONED, from the 23 `assetId`s in
  `public/game-content/source-art.v1.json`: **no sheet in the batch obviously
  depicts a shower head or a waste bin** — the nearest names are
  `fixture.cell.toilet_sink` and `storage.container.variants` — so
  `room.shower-room` and `room.garbage-room` may be blocked too, which would make
  it five of the six. **Which sheet stands for which catalogued object is a
  judgement the module makes and nothing mechanical checks**, so the count of
  seven is the module's and this is an observation against its sheet names, not
  a correction to it. Somebody who opens the 23 sheets can settle it in an hour;
  this document did not.
- **The Kitchen is the worst case and it is the brief's own example.** Kitchen
  requires `object.stove`, `object.fridge` and `object.prep-counter`, and two of
  those three are in the no-sheet seven.
- **Furniture opens three collisions the tint currently closes.** Rooms with
  identical required-object sets, in *different* categories, so the tint tells
  them apart today and furniture never will: **Cell ≡ Solitary Cell**
  (`object.bed`, `object.toilet`), **Holding Cell ≡ Common Room**
  (`object.bench`), **Reception ≡ Staff Room** (`object.chair`, `object.desk`).

**So furniture and the tint partition the eighteen rooms differently and neither
partition refines the other.** Option E closes seven collisions and opens three.
That is the sentence this document would keep if it kept one.

**Two further reasons it cannot be the answer on its own**, both REASONED from
the catalogue: a requirement is a *minimum*, not an inventory — nothing stops a
player standing a bench in a Kitchen — and an **unfinished** room has none of
its furniture by definition, which is precisely the room a player most needs to
identify.

**The art bill, priced.** MEASURED: one object is drawn today —
`'object.bed': 'env.object.bed',`
(verbatim in `src/rendering/world/environment-art.ts`)
— and nineteen are on the colour fallback. Discriminating the thirteen colliding
rooms needs **nine** more mapped objects — bench, security console, prep counter,
dining table, shower head, washing machine, storage rack, loading-dock door,
waste bin — of which two certainly have no sheet and two more probably do not.
MEASURED, summing the five sheets that plausibly carry the rest
(`furniture.corridor.bench.variants`, `furniture.cell.table_stool`,
`furniture.reception.counter.variants`, `storage.container.variants`,
`perimeter.vehicle_gate.sliding.variants`): **8,732,637 bytes of first-load
download**, before any commissioned art and before whatever the Yard is supposed
to look like.

**One correction to the brief that commissioned this document, with the
measurement behind it.** The brief priced this option as blocked because *"the
toilet sheet is a combined toilet+sink column with no transparent gap to cut
at"*. Half of that is right and the half that matters for the *option* is wrong.
MEASURED, by running the 8-connected `alpha >= 16` component scan that
`src/rendering/assets/environment-sprites.ts` describes over
`fixture.cell.toilet_sink.18b4c51aa610.png`: the sheet holds **ten components,
eight of them larger than 500 px, each a cleanly separated view** — it is
cuttable exactly as `furniture.cell.bed.single.variants` was, and the play-test
merged at `a714bdf8` says the same in prose, calling the toilet *"one row in
`SPRITE_BY_OBJECT_ID` … plus one rectangle in `environment-sprites.ts`"*. **What has no gap to cut at is
inside a view:** across the largest component's 324×507 bounding box there are
**0 fully transparent rows and 0 fully transparent columns**, so the pan and the
basin are one silhouette — and `object.toilet` and `object.sink` are two
separate 1×1 objects in `src/content/object-catalog.ts`. The blocker is
therefore that *one fixture would have to serve two catalogue ids*, not that the
sheet resists cutting. It does not block the toilet; it blocks the sink.

---

## What each option forecloses, gathered

| option | forecloses |
| --- | --- |
| A — key by id | the category as anything the map shows |
| B — hue families | value as a floor channel for any later mark |
| C — a second mark | the room interior as a drawing surface; requires the project's first legend |
| D — split floors | **ADR 0097 option B outright** — per-condition floor art becomes identity × condition in sheets |
| E — furniture | nothing in the renderer, but it *opens* three collisions and cannot close the Yard |

**Common to C, D and E, and it is ADR 0097's consequence read back.** Each of
them adds a second channel, so the tint stops being the only thing that says
which room this is — and 0097's decision 3, which reserved the tint for
identity, becomes a smaller promise than it sounded. A and B do not have that
property, which is the whole reason Context §2's measurement matters: they leave
identity on one exhausted channel. **None of this is an argument against 0097;
it is the price of Context §2's measurement being true.** If the owner would
rather spend the boundary on identity and put condition on the floor after all,
0097's own status section
anticipates it (*"if the owner prefers condition on the floor then #1021 must be
told before it chooses"*) and this document's option C becomes the cheap one
instead of the expensive one.

**The recommendation, in one sentence, so that it can be rejected cleanly:**
take **B** (which is A with the category kept, at A's price), respace the hues
while the table is open, and take **D's cheap half** — declare
`floor.concrete.variants` and hang it on zoning — as the second channel, which
is 2.32 MB and one rectangle; treat **E** as work that improves the world for
its own reasons and never as the answer to this issue.

---

## Open questions

1. **What separation a player actually needs.** Everything in Context §2 is a
   ratio between a signal and a texture. Nobody has put two candidate palettes in
   front of a person. **The cheap measurement:** render one prison twice with
   two palettes and ask someone to name the rooms.
2. **Whether the 0.14 alpha is still the right number** now that it is being
   asked to carry eighteen marks instead of eleven. Raising it undoes the reason
   the floor art was drawn; the docblock argues that at 0.28 the floor *"stops
   reading as a floor"*. Nothing has re-measured it since the art landed.
3. **What the Yard is.** It requires `outdoors` and is drawn with institutional
   linoleum like every other room, requires no objects, and is the one room no
   option in this document can touch. It may want terrain rather than zoning.
4. **Whether the nineteenth room breaks whatever is chosen.** A palette of
   eighteen hues has no headroom; a palette of eleven families with value steps
   has some. That asymmetry is the strongest structural argument for B and it is
   about a room nobody has authored.
5. **Whether option C's glyphs would need to survive the zoom range** #1026
   shipped. Decision 4 says no; nobody has looked at a glyph at 12.75 px.

---

## The weakest claim in this document, named

**That the 4.06-against-25.4 comparison in Context §2 means what it sounds like
it means.** It is the number this document leans on hardest, and it sets a
*mean shift* against a *per-pixel spread*, which are not the same kind of
quantity. Human vision integrates a uniform shift over an area and suppresses
uncorrelated noise, so a 4-unit difference across two large adjacent floors may
well be visible even though 4 units is a quarter of the speckle on any one tile.
The arithmetic is exact; the inference from it to "a player cannot tell" is not
established here and is not established anywhere in this repository. **If it is
wrong, option A is the whole answer, decision 3 is over-stated, and options C
and D are waste.** The falsification is cheap and is open question 1.

**Second weakest: option E's art bill assumes a room is identified by the
objects it *requires*.** A Kitchen might be identified perfectly well by a
prep-counter alone, in which case two of the three sheets it appears to need are
not needed. The cross-tabulation is exact about requirements and says nothing
about what a picture of a room needs to contain to read as that room.

**Third: the sweep in the preamble is a fact about 200 heads at one moment.**
ADR 0097's swept 193 the day before and ADR 0096's swept 140 the day before
that. Nothing prevents an unpushed 0098 existing in a container right now, which
is why this document pre-commits to renumbering rather than claiming the number.

---

## What would change my mind

- **Somebody naming rooms off a screenshot.** Open question 1. If a player can
  read the current eleven-tint map, this issue is a tidiness complaint and
  option A closes it.
- **The owner preferring condition on the floor.** Decision 2 is an acceptance
  of ADR 0097's allocation, and 0097 itself flags that decision as the one least
  supported by anything but taste. If it reverses, option C is the answer here
  and its cost falls sharply.
- **A sheet turning up for a stove, a washing machine or a security console.**
  Three of option E's four blockers are art that does not exist; a batch that
  contained them would move E from "opens three collisions" to "closes seven and
  opens three", which is a different trade.
- **Evidence that the category grouping is worth nothing to a player.** Option B
  exists only to preserve it. If nobody ever reads the map for families, B is
  ceremony and A is the same thing without it.
