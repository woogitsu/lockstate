# ADR 0101: What a zoning tint must deliver

> **The number was assigned centrally by the integrator, and this document
> pre-commits to renumbering.** `AGENTS.md`'s rule is that a number is not
> reserved until it appears in `docs/adr/README.md`, and a branch nobody has
> merged is invisible from that index — so if another branch turns up holding
> 0101, this file, its row and every citation of it get renumbered without
> argument, exactly as the ADRs `docs/adr/README.md`'s own chain lists did
> before it.
>
> **The sweep was performed rather than trusted**, on 2026-09-07 from this
> worktree, cut from `origin/main` at `712175fe` (v0.0.532):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**222 heads**, up from the 217 the
> chain in `docs/adr/README.md` last swept) with
> `git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
> **All 222 were readable; none failed.**
>
> - The highest four-digit prefix on any head is **0100**, on `origin/main`
>   and on the heads that carry it.
> - **0095 is still held**, on the same branch every prior sweep named —
>   `origin/measure/893-coverage-and-response-draw-from-one-pool` carries
>   `0095-what-the-guard-requirement-is-a-requirement-for.md` and still has no
>   row in `docs/adr/README.md`.
> - **Nothing at 0101 or above appears on any of the 222 heads.**
>
> So `max + 1` off **disk** is 0101, the index's own **Next free number** line
> already states 0101 (it moved there when ADR 0100's row landed), and
> `max + 1` over the **sweep** is also 0101. All three agree, and this
> document's row landing is what moves the index's line to 0102 —
> `tests/foundation/adr-numbering-contract.test.ts` states it as one past the
> highest number *on disk*, and 0095 is still not on disk.

## Status

**Proposed, 2026-09-07. Not self-approved.**

The question below is the owner's to settle: whether a zoning tint that blends
to *less* colour than the untinted floor it is painted on is a defect, or the
tint doing the small job an already-Accepted decision left it. What follows is
a requirement, four options that could discharge it, what each costs, and what
each does to the two Accepted documents this gap sits inside. Nothing here is
approved.

Filed against [#1061](https://github.com/woogitsu/lockstate/issues/1061),
which found the case by playing three rooms side by side, diagnosed the
mechanism and named the gap in an Accepted document as a decision rather than a
bug — quoted where it matters below rather than paraphrased, so a reader can
tell this document's own arithmetic from the issue's.

**No player-facing string is authored here.** `AGENTS.md` reservation 4's
2026-09-04 release makes the choice of words ours provided the sentence is
true of the code that renders it; nothing below proposes a new string, only a
number.

**This document does not edit** `docs/adr/0097-what-the-world-view-is-required-to-communicate.md`
or `docs/adr/0098-what-says-which-room-this-is.md`. Both are cited at
`file:line` and quoted where the quotation matters; every consequence for
either is priced as a cost of an option, never written into either document as
an amendment. `docs/AGENT_WORKFLOW.md` §3's rule — *"propose an ADR rather than
deciding architecture inside implementation code, and never self-approve
one"* — is exactly the rule the branch discussed in Context §1 broke, and this
document is the alternative to breaking it again.

## Claim tiers used below

- **MEASURED** — produced by a run of an instrument named below, with its
  inputs given, so the number can be reproduced.
- **VERIFIED, read** — a source file was opened at the cited `file:line`, and
  where the claim rests on the exact text, the text is quoted under
  `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form.
- **ARITHMETIC** — computed from constants or measurements that were opened,
  with a script named so the computation can be re-run.
- **REASONED** — derived from code that was opened, without a run behind it.

---

## Context

### 1. The finding, verified independently rather than taken on report

[Issue #1061](https://github.com/woogitsu/lockstate/issues/1061) and its
[2026-09-07 comment](https://github.com/woogitsu/lockstate/issues/1061#issuecomment-5568524972)
found and diagnosed the case: a Holding Cell drew its name on the map
(`RoomLabelLayer`, `src/rendering/phaser/room-label-layer.ts`) but a plainly
grey floor under it, while Staff Room and Storage Room — same run, same
floor art — each carried an obvious purple cast. Three independent
checks in the comment rule out the write path, the snapshot and the draw
call as the cause: a room-type swap (the defect follows the assigned tint,
not position or the `openArea` flag); a Node-level run through
`RoomZoningService.zone` → `SparseWorld.setZoning` → `world.snapshot()` →
`WorldRenderView.fromSnapshot` → `zoningTint`, zero mismatches; and the real
draw call at `src/rendering/phaser/tile-layer.ts:358-366`, opened in this
worktree at `712175fe`, which reads exactly this:

`const tint = zoningTint(sample.zoning);
if (tint !== undefined) {
Weaker over art. The tint is what says *which* room this is, and
that has to survive; at its full strength it also washes the floor
out until the texture underneath stops reading as a floor.
const alpha = floors[localY * size + localX] === undefined ? ZONING_TINT_ALPHA : ZONING_TINT_ALPHA_OVER_ART;
graphics.fillStyle(tint, alpha);
graphics.fillRect(localX * TILE_SIZE_PX, localY * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
}`
(verbatim in `src/rendering/phaser/tile-layer.ts`), instrumented in a real
browser to print the right tint for every tile. **The pipeline is correct.**
What is wrong is the arithmetic at line 363 itself, for eight of eighteen
rooms.

**Re-derived rather than assumed, because a decoded pixel average is exactly
the kind of number this repository's method requires opening rather than
carrying forward** (`docs/AGENT_WORKFLOW.md` §3: never report a result you did
not obtain). This session wrote its own PNG decoder — zlib inflate plus the
five PNG filter types, no dependency, no reuse of anything in `src/` — and
ran it against `public/game-content/source-art/floor.linoleum.institutional.788e81d4e081.png`
after `git lfs pull --include=` fetched the real bytes (1,856,853 bytes,
1448×1086, colour type 6). Three numbers, all MEASURED this session:

| sample | mean RGB | lean (B−R) |
| --- | --- | --- |
| whole sheet, every opaque pixel (n = 861,051) | rgb(117.6, 128.6, 140.7) | 23.2 |
| `env.floor.institutional`'s own crop, `{x:732,y:711,w:304,h:304}` (n = 92,416) | rgb(116.4, 128.9, 142.9) | 26.5 |
| the crop box-averaged to 64×64 — one tile at zoom 1, `TILE_SIZE_PX` | rgb(116.4, 128.9, 142.9) | 26.5 |

`sourceRectPx: { x: 732, y: 711, width: 304, height: 304 }` is verbatim in
`src/rendering/assets/environment-sprites.ts:159`, the exact crop
`env.floor.institutional` names.

**Three independent decodes now agree on direction and are close on
magnitude, and it is worth carrying all three rather than picking one.** The
issue's own decoder (whole-sheet opaque average) reported rgb(119.3, 129.6,
140.9), lean ≈ 21.6 — close to this session's whole-sheet 23.2, not
identical, most likely because "opaque" was thresholded differently (this
decoder treats any non-zero alpha as opaque). The finding pass's tile-region
sampling reported rgb(116.4, 128.9, 142.9), lean 26.5 — and this session's
independent decode of the *same named crop* lands on rgb(116.4, 128.9, 142.9)
to one decimal place, which is as exact a reproduction as three separately
written decoders are likely to produce. **The tile-crop number is the one the
rest of this document uses**, both because it is the sample that actually
sits under a rendered tile and because it is the one three decoders agree on
most tightly.

**The blend, re-derived over all eighteen shipped room tints rather than
taken from the branch's eight.** `ZONING_TINT_BY_ROOM_ID`
(`src/rendering/world/appearance.ts:118-137`) and
`ZONING_TINT_ALPHA_OVER_ART = 0.14;` (`src/rendering/world/appearance.ts:151`)
were both opened directly. ARITHMETIC, blending each shipped hex over the
116.4/128.9/142.9 base at α = 0.14 and reporting each result's own
`max(r,g,b) − min(r,g,b)` — the same "how coloured does this read"
measure the untinted floor's own 26.5 is stated in:

| room | tint | blended | spread |
| --- | --- | --- | --- |
| `room.solitary-cell` | `0xd1a64f` | (129.4, 134.1, 134.0) | **4.7** |
| `room.holding-cell` | `0xd17b4f` | (129.4, 128.1, 134.0) | **5.9** |
| `room.reception` | `0xd1d14f` | (129.4, 140.1, 134.0) | **10.8** |
| `room.cell` | `0xd14f4f` | (129.4, 121.9, 134.0) | **12.0** |
| `room.kitchen` | `0xa6d14f` | (123.3, 140.1, 134.0) | **16.8** |
| `room.utility-room` | `0xd14f7b` | (129.4, 121.9, 140.1) | **18.2** |
| `room.canteen` | `0x7bd14f` | (117.3, 140.1, 134.0) | **22.8** |
| `room.garbage-room` | `0xd14fa6` | (129.4, 121.9, 146.1) | **24.2** |
| *(untinted floor itself)* | — | (116.4, 128.9, 142.9) | **26.5** |
| `room.shower-room` | `0x4fd14f` | (111.2, 140.1, 134.0) | 29.0 |
| `room.laundry` | `0x4fd17b` | (111.2, 140.1, 140.1) | 29.0 |
| `room.storage-room` | `0xa64fd1` | (123.3, 121.9, 152.2) | 30.2 |
| `room.delivery-bay` | `0xd14fd1` | (129.4, 121.9, 152.2) | 30.2 |
| `room.staff-room` | `0x7b4fd1` | (117.3, 121.9, 152.2) | 34.8 |
| `room.yard` | `0x4fd1a6` | (111.2, 140.1, 146.1) | 35.0 |
| `room.common-room`, `room.classroom`, `room.infirmary`, `room.security-office` | — | — | 41.0 (all four) |

**Eight rooms land below the untinted floor's own 26.5.** This is the exact
eight the issue's comment and the branch's commit both name, and this
session's independent re-derivation reproduces every one of the eight spread
values to one decimal place. The two worst — `room.solitary-cell` and
`room.holding-cell` — are the two the issue actually screenshotted; the other
six rest on the same arithmetic applied further from the failure point,
which the weakest-claim section returns to.

### 2. What ADR 0098 measured, and what it measured it against

[ADR 0098](./0098-what-says-which-room-this-is.md) Context §2 built the whole
case for keying the tint by room id on one identity:

> — so the base cancels and the difference between two tinted tiles is
> exactly `α × |t₁ − t₂|` per channel

(`docs/adr/0098-what-says-which-room-this-is.md:270-271`, itself quoting
`tile-layer.ts`'s alpha line) — and then measured, over the eleven category
tints then shipped, a worst pair of 4.06 effective units against a floor
texture whose own **pixel-to-pixel** spread at one tile is 25.4 (`per-channel
σ 9.92/8.40/6.65`, `luminance p5→p95 25.4`, `docs/adr/0098-what-says-which-room-this-is.md:315-319`).

**That is a different quantity from this document's 26.5, and the two must
not be read as the same number arriving twice.** ADR 0098's 25.4 is the
*noise* in one tile's pixels around their own mean — how much a floor's
speckle varies pixel to pixel, which is what a *difference between two tints*
has to be visible against. This document's 26.5 is the *mean* pixel's own
channel spread — how far that average colour already sits from grey, before
any tint at all. The two happen to be close in magnitude (25.4 against 26.5)
purely because this floor art's texture and its own tint happen to be of
similar scale; nothing connects them. **ADR 0098 measured a signal against
noise; this document measures a signal against a bias in the same channel the
signal is meant to move.** The base-cancels identity it built its table on is
exact for the first question and silent about the second — cancelling in a
*difference* is not the same claim as the base being *neutral*, and nothing in
ADR 0098's Context §2 asked whether one tint alone, blended with a non-neutral
base, still reads as tinted at all.

**ADR 0098's own honesty about this limit is on the record already**, in its
own weakest-claim section: *"a 4-unit shift across a 6×6-tile floor is a
different perceptual problem from a 4-unit shift on one tile against a
25-unit neighbour"* (`docs/adr/0098-what-says-which-room-this-is.md`, the
weakest-claim section). That sentence is about signal-versus-noise across an
area, not about direction, and it does not reach this document's question
either.

### 3. What the tint's job already is, settled twice by the owner, and what that leaves it owing

The tint's allocation did not start here. [ADR 0097](./0097-what-the-world-view-is-required-to-communicate.md)
decision 3 put condition on the room boundary and identity on the tint, and
`appearance.ts`'s own comment, at lines 147-149, states why the alpha is weak
at all rather than zero:

`It is not removed, because the tint is what says *which* room this is`
`and that is gameplay information, not decoration.`
(both verbatim in `src/rendering/world/appearance.ts`)

ADR 0098's own decisions, accepted by the owner on 2026-09-06 across two
separate rulings the same day, narrowed what "identity" means further. The
first ruling put identification itself on a new channel — the room's own
name, drawn on the floor — and the second, taken separately, kept the tint
keyed by room id anyway, *"not a belief that colour will name a room"*
(`docs/adr/0098-what-says-which-room-this-is.md`, the Status section's account
of ruling 2). ADR 0098 decision 3 measured the honest cost of that choice
before the owner made it: keying by id closes the seven pixel-identical pairs
but leaves the worst pair at 6.02 effective units against a 25.4-unit texture
— *"keying by id closes the seven collisions and leaves a palette whose
tightest pair is a quarter of the noise it is drawn on"*
(`docs/adr/0098-what-says-which-room-this-is.md:514-515`).

**So the tint was never asked to make a room type identifiable by hue alone,
and this document does not reopen that.** Both accepted decisions already
priced hue-based identification as failing and handed identification to the
name instead. That is the honest half of this document's spine question:
read as *"can a player tell Kitchen from Canteen by looking at the floor"*,
"less colourful than the floor" is not a new failure — the two rooms were
already indistinguishable by hue before this issue, at 16.8 and 22.8 spread
respectively, and the name is what already answers that question for every
one of the eighteen room types (`RoomLabelLayer`, present and working —
the issue's own screenshot shows "Holding Cell" rendered correctly over the
grey floor).

**But there is a second, narrower promise the codebase already wrote down,
and it is not the identification question.** The Rooms panel's catalogue
swatch reads the room's tint at full strength, with no floor blended in at
all, at `src/main.ts:1052`:

`tint: zoningTint(definition.numericId) ?? 0,`
(verbatim in `src/main.ts`), and the view-model field it fills states, in its
own words at `src/ui/hud/view-model.ts:1059-1060`, what that swatch is *for*:

`The colour the world tints this room's tiles, so the catalogue row and the designation on the map agree without the player having to learn a legend.`
(verbatim in `src/ui/hud/view-model.ts`)

That sentence is a promise about *agreement*, not about identification: the
panel's Holding Cell swatch is a saturated orange (`0xd17b4f` at full
strength), and the map's Holding Cell floor, at the shipped alpha, is
`rgb(129.4, 128.1, 134.0)` — a spread of 5.9, which reads to the eye as
neutral grey, exactly as the issue's screenshot shows. **The panel and the
map are not merely subtle about the same fact; for these eight rooms they
show two different facts**, and the sentence quoted above is the one already
in the tree that says they are supposed to show one.

**This is the requirement Context §4 below states precisely, and it is
narrower than "make the tint legible."** It does not ask the tint to carry
identification — that job left the tint by the owner's own ruling. It asks
that a tint painted at all be recognisable as *some* application of its own
assigned colour, in the direction that colour actually points, rather than
cancelling to a value indistinguishable from having painted nothing.

### 4. The shape of the gap: a fixed arc, invariant to which rooms sit in it

This is new arithmetic, not carried from the issue or the branch, and it
changes what "move the palette" would have to mean as an option.

**The floor's own hue is `211.7°`; its complement is `31.7°`.** ARITHMETIC,
converting the tile-crop mean (116.4, 128.9, 142.9) to HSV. At the shipped
`s = 0.62, v = 0.82` and `α = 0.14`, sweeping every hue in one-degree steps and
testing which ones blend to a spread below the floor's own 26.5: **exactly
160° of the 360° wheel fails — 44.4%, one contiguous arc from 313° to
112°** (through 0°), centred on the complement to within half a degree.

**That fraction is not a coincidence of which eighteen hues were chosen.**
Testing all twenty possible phase offsets of an evenly-spaced eighteen-hue
wheel against this same 160°-wide arc — every rotation the palette could be
given while keeping eighteen hues 20° apart — **every single offset puts
exactly eight of the eighteen hues inside the arc.** Rotating the palette
does not change how many room types fail; it only chooses which eight room
*identities* are assigned to the eight slots that always fail. "Move the
palette off the floor's complement" is, read literally, not an operation this
wheel can perform.

**Raising the alpha shrinks the arc but does not close it, and closing it
needs more than the flat wash already declined.** Sweeping α from 0.14 to
0.28 at the same hue set:

| α | worst single-hue spread | fraction of the wheel still below 26.5 |
| --- | --- | --- |
| 0.14 (shipped) | 4.65 | 44.4% |
| 0.20 | 9.30 | 37.2% |
| 0.28 (`ZONING_TINT_ALPHA`, the no-art wash) | 17.21 | 24.2% |
| 0.3396 (binary-searched) | 26.51 | 0% — the point every hue clears the floor |

**Guaranteeing every hue clears the floor needs α ≈ 0.34 — a stronger wash
than `ZONING_TINT_ALPHA` itself**, the alpha used where there is *no* floor
art to protect at all. Even fully undoing the 0.28 → 0.14 reduction this
issue's comment flags as the thing that "would undo" a recorded decision does
not close the gap: at 0.28, the worst hue still lands at 17.21 against 26.5,
and 24.2% of the wheel — four to five room types — would still read as less
coloured than the bare floor.

**Escaping the arc by clustering the palette away from it costs the
respacing ADR 0098 decision 3 bought.** If the eighteen hues are pushed
entirely into the 201°-wide safe arc instead of spread over the full 360°
(evenly, at the palette's own `s = 0.62, v = 0.82`), the worst pairwise
distance among them drops to **2.40 effective units** — worse than the 4.06
ADR 0098 set out to fix, and well under half of the 6.02 that respacing over
the full wheel bought. Scripts for all four numbers in this section are kept
alongside this ADR's evidence and reproduce from the constants named above;
none of them required running the application.

---

## Decision

Proposed, not approved. Three parts.

### 1. The requirement: a painted tint must be recognisable as its own colour, not merely present in a lookup table

**Proposed.** A zoning tint discharges what it is for when a tile it is
painted on reads, to the eye, as carrying *some* visible application of the
room's assigned hue — not when the value merely exists correctly in
`ZONING_TINT_BY_ROOM_ID` and is correctly looked up, correctly composited and
correctly drawn. Context §1 establishes that the pipeline already does all
three of those things correctly for Holding Cell; the requirement this
decision states is about the fourth thing, which nothing upstream of the
pixel can guarantee: that the composite does not cancel toward the floor's
own bias.

**This is deliberately not a requirement that the tint make a room type
identifiable on its own.** Context §3 established that both accepted
documents already settled that question the other way: ADR 0098 keeps the
tint keyed by id *"not a belief that colour will name a room"*, and hands
identification to the drawn name instead. A tint at 16.8 or 22.8 spread was
never going to let a player tell Kitchen from Canteen by hue, and nothing in
this document asks it to. What it asks is narrower and is already written
down elsewhere in the tree: that the panel swatch and the map tile **agree**,
in direction, about which colour this room is (`src/ui/hud/view-model.ts:1059-1060`,
quoted in Context §3) — and that a tinted tile not be visually
indistinguishable from an untinted one.

### 2. This is a gap in what an Accepted document measured, not a new requirement invented here

**Proposed.** Context §2 establishes precisely what ADR 0098 Context §2
measured and what it left unmeasured: the pairwise distance between tints,
never a tint's own direction against the substrate it is painted on. Nothing
about that gap requires either accepted document's decisions 1 through 4, or
ADR 0097's decision 3, to have been wrong when they were made — the
pairwise-distance table is exact for the question it answered, and the
allocation of the tint to identity and the boundary to condition stands on
its own three reasons independent of this gap. What moved is that a fifth
question — does one tint, alone, still read as a tint at all — went
unasked, and Context §1's re-derivation shows it resolves differently for
eight of eighteen rooms today.

### 3. What is not required

**Proposed, and it is what keeps this bounded**, mirroring ADR 0098 decision
4's own shape:

- **Identification of a room type by hue.** That is the name's job
  (Context §3), and no option below reopens it.
- **A remedy that survives a second floor sheet unexamined.** Context §5
  states why: every number in Context §4 is derived from one measured base
  colour, and a second floor art would need its own.
- **An amendment to ADR 0097 or ADR 0098.** Every consequence named below is
  priced as a cost an option would carry, not written into either document.

---

## Options, with their real costs

### Option 1 — a per-room alpha computed from the measured substrate

**What it is.** The mechanism on `fix/1061-holding-cell-tint` (`e154dcf6`),
read as evidence of cost rather than adopted: at module load, compute the
smallest alpha at or above `ZONING_TINT_ALPHA_OVER_ART` (capped at 0.4) that
clears the untinted floor's own spread, per room, and use it in place of the
flat constant only where a room needs it. VERIFIED, read (not merged, not
extended): `INSTITUTIONAL_FLOOR_ART_BASE` on that branch is
`[116.396, 128.916, 142.908]` — this session's independent tile-crop decode
lands on `116.4, 128.9, 142.9`, agreeing to three decimal places despite
being produced by a different decoder written for this document.

**Cost, as the branch itself reports it — not independently rerun here,
because rerunning would mean building on the branch this document is
explicitly told not to extend.** Its own commit message states: `tsc -b`
clean on both configs; the gated test — a new
`appearance-zoning-tint-legibility.test.ts` under `tests/unit/`, present only
on that branch and not merged, twenty-two cases — red at 9 of 22 with the fix
mutated back to a flat 0.14, green at 22 of 22
restored; full `vitest` run `2 failed | 4844 passed | 2 skipped`. That total
is consistent with this document's own baseline of 4822 passed plus the
branch's 22 new cases (4822 + 22 = 4844), which is offered as a sanity check
on the branch's arithmetic rather than as this document having rerun it.

**What it forecloses, priced rather than asserted.** ADR 0098 Context §2's
whole pairwise table rests on one identity — *"the base cancels and the
difference between two tinted tiles is exactly `α × |t₁ − t₂|`"*
(`docs/adr/0098-what-says-which-room-this-is.md:270-271`) — which holds only
when both tints in a pair share one alpha. Under Option 1 that stops being
true for any pair naming one of the eight raised rooms. ARITHMETIC: of the
`C(18,2) = 153` pairs among today's eighteen room-id tints, `C(10,2) = 45`
sit entirely among the ten rooms Option 1 leaves untouched — so **108 of 153
pairs (70.6%) would need their effective distance re-derived rather than read
off the existing table**, not merely the eight named rows. This is a count of
which pairs the *method* stops covering, not a claim that any pair's number
becomes qualitatively wrong.

ADR 0097's own characterisation of the paint step also stops being literally
true: *"one of two alphas depending only on whether art is under it"*
(`docs/adr/0097-what-the-world-view-is-required-to-communicate.md:165-166`)
would become one of up to ten — the no-art `ZONING_TINT_ALPHA`, the shared
`ZONING_TINT_ALPHA_OVER_ART` default, and up to eight further per-room
values. ADR 0097's decision 3 allocation (tint to identity, boundary to
condition) is untouched by this; only its own Context's plain-English count
of alphas would need restating.

**What it buys.** Every one of the eight rooms clears the untinted floor's
own spread by construction, at a cost capped well below the no-art
`ZONING_TINT_ALPHA` — the branch's own docblock states the ceiling
deliberately, *"well short of `ZONING_TINT_ALPHA`'s no-art wash"* (0.28). The
ten rooms that already cleared the floor are untouched.

### Option 2 — move the palette off the floor's complement

**What "move" can and cannot mean, priced by the arithmetic in Context §4.**
Rotating the eighteen-hue wheel — reassigning which room id gets which of
the eighteen fixed hues, or shifting the whole wheel by a constant offset —
**cannot reduce the count of affected rooms**: Context §4 tested all twenty
possible phase offsets of the evenly-spaced wheel against the fixed
160°-wide danger arc and found exactly eight hues inside it every time. A
rotation is a free choice of *which* eight room types keep the defect, not
whether eight room types have it.

**Escaping the arc at all means abandoning even spacing, and that costs
exactly what ADR 0098 decision 3 bought.** ARITHMETIC: compressing all
eighteen hues into the 201°-wide arc the danger zone leaves free (still at
the palette's own `s = 0.62, v = 0.82`) drops the worst pairwise distance to
**2.40 effective units** — below the pre-#1047 baseline of 4.06 that ADR
0098 was written to fix, and well under half of the 6.02 the current even
spacing delivers. Any softer compression (leaving some rooms in the arc to
buy other rooms more spacing) is a continuous trade between these same two
numbers; this document does not chart the whole curve, only its two ends.

**What it forecloses.** ADR 0098 decision 3's own arithmetic — *"raises the
worst pair from 4.06 to 6.02"* (`src/rendering/world/appearance.ts:111`,
paraphrased from the docblock's own account) — directly, for any point on
that curve that meaningfully shrinks the arc. This is the option this
document can recommend least: it does not merely cost something elsewhere,
its cheapest form (full compression) undoes more of decision 3's own gain
than the eight rooms it would rescue are worth by the same measure.

**What it buys, at the compression end.** All eighteen rooms clear the
untinted floor's own spread, because none of them sit near the complement
any more. Nothing at any intermediate point on the curve buys this without
also giving back some of decision 3's respacing.

### Option 3 — raise the flat alpha for everyone

**What it is.** Move `ZONING_TINT_ALPHA_OVER_ART` itself, uniformly, rather
than computing anything per room.

**What it costs, and it is worse than it looks.** Context §4's sweep already
prices this precisely: even raising the over-art alpha all the way to
`ZONING_TINT_ALPHA` (0.28) — fully undoing the reduction `appearance.ts`'s
own comment argues for — leaves the worst single hue at a spread of 17.21,
still short of the floor's own 26.5, and 24.2% of the wheel (four to five
room types) still failing. **Fully closing the gap for every hue needs
α ≈ 0.34, a stronger wash than the no-art alpha itself was ever asked to be.**
At that alpha the floor art is not merely weakened for the eight rooms this
issue names — the comment's own stated reason for choosing 0.14 in the first
place, at lines 144-147, applies to all eighteen:

`at 0.28 the wash is strong enough that a photographed linoleum floor stops reading as a floor and becomes a coloured rectangle again, which would have thrown away the whole point of drawing it`
(verbatim in `src/rendering/world/appearance.ts`) — and 0.34 is stronger than
the number that sentence is already about.

**What it forecloses.** The floor-legibility argument that justified moving
the over-art alpha down from 0.28 to 0.14 at all. Raising it back — or past
it — for every room to fix eight is the opposite of what Option 1 does: it
spends the whole channel's remaining headroom to rescue rooms that did not
need rescuing, and by Context §4's own numbers it still does not rescue
every room that did.

**What it buys.** Pairwise legibility, incidentally: ADR 0098's worst pair
scales with alpha, so 0.28 would raise today's 6.02 to roughly 12.0. That is
not this option's problem — legibility was already handed to the name — and
it does not offset what raising the alpha costs the floor art for every
room, not just the eight this document is about.

### Option 4 — do nothing, and rely on the name

**This is argued seriously, because ADR 0098 already leans this way and a
strawman would misstate that.** Ruling 2's own words, recorded in ADR 0098's
Status section, kept the tint keyed by id *"not a belief that colour will
name a room"* — the owner already accepted, in the same breath as keying the
tint by id, that the tint would not by itself make a room identifiable. The
name (`RoomLabelLayer`) is what discharges that requirement today, and it is
already merged and already working — the issue's own screenshot shows
"Holding Cell" rendered correctly over the grey floor it is complaining
about. **Nothing about identification is missing today. Nothing in Options 1
through 3 would have added identification either**, because ADR 0098 Context
§2 already showed 6.02 effective units is not a legible signal against a
25.4-unit texture, and none of the options above claim otherwise.

**What doing nothing costs, precisely — and it is not identification.**
Context §3 names it: the Rooms panel swatch and the map tile are supposed to
agree (`src/ui/hud/view-model.ts:1059-1060`), and for eight rooms they do not
— one shows a saturated colour at full strength, the other shows a value a
player reads as no colour at all. That is a narrower, and real, cost: a
prison that is correct by every test and reads as duller or as subtly broken
in exactly the two rooms a player has already found by playing has not
succeeded, per `AGENTS.md`'s own standing mandate that playability counts as
correctness. Doing nothing leaves that specific, already-observed defect
standing.

**What it costs the two Accepted documents.** Nothing. No table, no line, no
status in either document is touched, because no code changes. This is the
only option of the four with that property.

**What it buys.** Zero further risk to ADR 0097's decision 3 allocation or
ADR 0098's pairwise arithmetic, and zero further engineering. It is the
cheapest option in this document by construction, and the honest case for it
is that the requirement Context §3 states — panel-and-map agreement — may
simply not be worth the price any of Options 1 through 3 carries, if the
owner judges the name's legibility sufficient and the eight rooms' greyness a
cosmetic footnote rather than a defect. That judgement is the owner's, not
this document's.

---

## What each option would do to ADR 0097 and ADR 0098, gathered

| option | ADR 0097 | ADR 0098 |
| --- | --- | --- |
| 1 — per-room alpha | Context's "one of two alphas" becomes up to ten; decision 3's allocation (tint = identity, boundary = condition) untouched | Context §2's base-cancels identity stops covering 108 of 153 pairs (70.6%); decision 3's headline numbers (4.06 → 6.02) untouched for the 45 pairs it still covers |
| 2 — move the palette | untouched | decision 3's respacing gain is directly undone at the end of the curve that actually closes the arc (worst pair 6.02 → 2.40) |
| 3 — raise flat alpha | untouched | pairwise numbers scale up (better), but the floor-legibility argument the 0.28 → 0.14 reduction itself carries is undone for all eighteen rooms, not priced by 0098 at all |
| 4 — do nothing | untouched | untouched |

None of the four touches ADR 0097's decision 2 or decision 3 allocation
itself — the boundary stays condition's and the tint stays identity's in
every case. What differs is only how expensive identity's own channel gets to
keep, and what each option spends to make it cheaper.

---

## 5. The floor is one sheet today

**REASONED, and it bounds every number in Context §4.** `zonedFloorSprite`
returns one literal for every zoned tile, at
`src/rendering/world/environment-art.ts:157-161`:

`export function zonedFloorSprite(zoningNumericId: number): EnvironmentSpriteId | undefined {
  if (zoningNumericId === 0) return undefined;
  const room = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
  if (room === undefined) return undefined;
  return 'env.floor.institutional';
}`
(verbatim in `src/rendering/world/environment-art.ts`), and its own docblock,
at lines 153-155, already anticipates a split:

`One floor for every category today. This returns per zoning id rather than per category so a later split -- concrete for utility and logistics, linoleum for the rest -- is a change in this function and nowhere else.`
(verbatim in `src/rendering/world/environment-art.ts`)

ADR 0098's own open question 3 names the same seam from a different angle,
without needing this document to touch that file: the Yard requires no
objects and is drawn with institutional linoleum like every other room, and
that document states plainly that it may want terrain rather than zoning
(`docs/adr/0098-what-says-which-room-this-is.md`, open question 3).

**Every number in Context §4 — the 211.7° hue, the 160°-wide arc, the
17.21-at-0.28, the 0.34 closing alpha — is derived from one measured base
colour, `rgb(116.4, 128.9, 142.9)`.** A second floor sheet would have its own
mean colour and its own complement, and nothing here would transfer: the
danger arc could sit at a different angle, catch a different eight rooms, or
catch a different count entirely if the second floor's own chroma differs
from this one's. Whichever option is chosen, adopting a second floor sheet
means re-running Context §1's decode and Context §4's sweep against it,
not reusing this document's numbers.

---

## Open questions

1. **Whether the requirement in Decision 1 is worth its price at all**,
   which is the question Option 4 puts honestly: is panel-and-map agreement,
   for eight room types whose hue was never going to identify them anyway,
   worth an engineering cost that — at its cheapest (Option 1) — still
   touches 70.6% of an Accepted document's pairwise table's method. Nobody
   has put the grey Holding Cell floor and its orange panel swatch in front
   of a player and asked whether the mismatch reads as a defect or is never
   noticed.
2. **Whether a softer point on Option 2's compression curve is worth
   charting.** This document priced only the two ends — no compression, and
   full compression into the safe arc. A partial compression that clears
   four or six of the eight rooms while giving back less of decision 3's
   6.02 has not been computed.
3. **What the second floor sheet's own base colour would do**, if and when
   `floor.concrete.variants` (named but never downloaded per ADR 0098 option
   D) is ever wired to zoning. Context §5 states why this document's numbers
   do not answer it.

---

## The weakest claim in this document, named

**Only two of the eight rooms this document calls "reads as no tint at all"
have been confirmed by an actual screenshot.** `room.holding-cell` and
`room.solitary-cell` — the two nearest the floor's complement and the two
with the lowest computed spread — are the pair the issue's own play-test
photographed and the pair a human looked at and called neutral grey. The
other six (`room.reception`, `room.cell`, `room.kitchen`,
`room.utility-room`, `room.canteen`, `room.garbage-room`) rest on exactly the
same arithmetic metric — `max(r,g,b) − min(r,g,b)` of the blended mean,
compared against the same metric applied to the untinted floor — applied
further from the point that metric was validated against a person's eye.
ADR 0098 named the identical shape of weakness about its own mean-shift
argument, and it applies here with equal force: **the arithmetic is exact;
whether a spread of 22.8 (Canteen) reads as visibly less colourful than an
untinted floor, to an actual player, in an actual running build, is not
established here and is not established anywhere in this repository.** If it
is wrong — if six of the eight in fact read as merely subdued rather than
flat — then the requirement in Decision 1 still holds for the two
photographed rooms, but the count "eight of eighteen" this document leans on
throughout Context §4 and the options' costings is too high, and Option 1's
per-room fix is doing real work for fewer rooms than it appears to.

**The falsification is cheap and is Open question 1's twin**: screenshot the
other six rooms built at the same zoom the issue used, the way the issue
itself screenshotted the first two.

---

## What would change my mind

- **A screenshot of the other six rooms**, confirming or refuting that they
  read as visibly less coloured than bare floor rather than merely subdued.
  This is the weakest claim above, and it is the single cheapest measurement
  that would move this document.
- **The owner judging Option 4's cost acceptable.** Decision 1's requirement
  is a choice to spend something on an already-Accepted allocation's leftover
  channel; if panel-and-map agreement is worth less than any option's price,
  Option 4 is the whole answer and this document's job was to say so
  precisely, which Context §3 and Option 4 already do.
- **A partial point on Option 2's curve turning out cheap.** Open question 2
  is uncharted; if a small rotation plus a small, targeted compression turns
  out to rescue most of the eight rooms for less than half of decision 3's
  6.02, that would be a fifth option this document did not price.
- **A second floor sheet landing.** Context §5 says every number above is
  specific to `env.floor.institutional`'s measured base colour; a second
  sheet reopens Context §4 rather than merely extending it.
